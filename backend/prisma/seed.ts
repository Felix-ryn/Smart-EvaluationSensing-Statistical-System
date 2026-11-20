import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { calculateParkingFee, type ParkingRules } from "../src/lib/fee.js";

const prisma = new PrismaClient();

// ============================================================================
// SEED DETERMINISTIK
// Semua ID, tanggal, dan hash di-pin (hardcoded) agar hasil seed IDENTIK di
// mesin mana pun dan kapan pun dijalankan. Re-run aman (deleteMany dulu).
// ============================================================================

// Salt tetap → hash password identik di semua mesin (login tetap "password123").
const SALT = "$2a$10$9O6CevGRuYd9/D9BnNVdpO";
const passwordHash = bcrypt.hashSync("password123", SALT);

// Anchor tanggal tetap (bukan new Date()) agar data transaksi/setoran stabil.
const ANCHOR = new Date("2026-11-20T00:00:00.000Z");

const daysAgo = (d: number, hour = 9, minute = 0) => {
  const dt = new Date(ANCHOR);
  dt.setUTCDate(dt.getUTCDate() - d);
  dt.setUTCHours(hour, minute, 0, 0);
  return dt;
};

// Aturan tarif + MOU (sama dengan database).
const RULES: ParkingRules = { firstHour: 2000, nextHour: 1000, maximumDaily: 10000 };
const TAX_PERCENT = 10;
const JUKIR_SHARE_PERCENT = 15;
const MOU_VALID_FROM = new Date("2026-09-12T00:00:00.000Z");

// ---- Master data: Parking Areas (ID + kapasitas persis dari database) ----
const areaSpecs = [
  { id: "7bce97b2-394e-4432-aa69-7853caf054d8", name: "pens josjis", location: "jl. sdt jos", vehicleType: "motorcycle", capacity: 100, latitude: -7.276804, longitude: 112.793124 },
  { id: "9e631865-c18c-4195-9100-0e5966fd9a6a", name: "area parkir I", location: "jl Ngaglik", vehicleType: "motorcycle", capacity: 50, latitude: -7.249152, longitude: 112.753928 },
  { id: "aed84cc9-cfc5-4307-bb05-5cb426a56cc0", name: "parkir rumah gw", location: "jalan merdeka", vehicleType: "motorcycle", capacity: 50, latitude: null, longitude: null },
  { id: "area-a", name: "Area A", location: "Jl. Merdeka No. 1", vehicleType: "motorcycle", capacity: 85, latitude: -7.2516, longitude: 112.7553 },
  { id: "area-b", name: "Area B", location: "Jl. Sudirman No. 88", vehicleType: "motorcycle", capacity: 70, latitude: -7.2512, longitude: 112.7561 },
  { id: "area-c", name: "Area C", location: "Jl. Gatot Subroto No. 10", vehicleType: "car", capacity: 45, latitude: -7.2508, longitude: 112.7548 },
  { id: "area-d", name: "Area D", location: "Jl. Veteran No. 2", vehicleType: "motorcycle", capacity: 75, latitude: -7.2499, longitude: 112.757 },
  { id: "area-e", name: "Area E", location: "Jl. Pahlawan No. 14", vehicleType: "car", capacity: 40, latitude: -7.2525, longitude: 112.7539 },
  { id: "area-f", name: "Area F", location: "Jl. Dharmawangsa No. 7", vehicleType: "motorcycle", capacity: 65, latitude: -7.253, longitude: 112.7568 },
  { id: "area-g", name: "Area G", location: "Jl. Diponegoro No. 23", vehicleType: "car", capacity: 45, latitude: -7.2504, longitude: 112.7529 },
  { id: "area-h", name: "Area H", location: "Jl. Ahmad Yani No. 50", vehicleType: "motorcycle", capacity: 72, latitude: -7.2489, longitude: 112.7584 },
];

// ---- Master data: Users (ID persis dari database) ----
type UserSpec = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "USER" | "JUKIR";
  status: "ACTIVE" | "BLOCKED";
  areaId?: string | null;
};

const userSpecs: UserSpec[] = [
  { id: "ec144274-22c7-426a-adfd-641a79a55306", name: "pet", email: "admin@pet.local", role: "ADMIN", status: "ACTIVE" },
  { id: "216f6f80-92a8-4612-a369-44405970c3bc", name: "Admin System", email: "admin@sess.local", role: "ADMIN", status: "ACTIVE" },
  { id: "668a1e5b-c8ad-46d9-9d7f-2cf111f0b22c", name: "Customer User", email: "user@sess.local", role: "USER", status: "ACTIVE" },
  { id: "82ac0dcf-c643-4828-bec1-3d32e438abf7", name: "Agus Wijaya", email: "jukir.agus@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-b" },
  { id: "6072e678-2e17-4221-b8a6-590e26a232b8", name: "Arif Budiman", email: "jukir.arif@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-b" },
  { id: "9e096b27-68cd-4ad0-aa13-82b7e4ab2e06", name: "Ayu Permata", email: "jukir.ayu@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-e" },
  { id: "410b07c9-0b11-4510-907a-878d94bb627a", name: "Bagus Permana", email: "jukir.bagus@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-h" },
  { id: "a9577327-fd5d-42ed-964a-ae159e3b8b08", name: "Bayu Setiawan", email: "jukir.bayu@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-h" },
  { id: "cfae89a3-dd64-41b7-943b-2d29b02456df", name: "Budi Santoso", email: "jukir.budi@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-a" },
  { id: "cc8abdc3-21da-464e-aaa6-bb49702b41d9", name: "Citra Kirana", email: "jukir.citra@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-g" },
  { id: "30560c05-fa99-4729-b28e-d7b54a7825ea", name: "Dedi Kurniawan", email: "jukir.dedi@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-f" },
  { id: "117d891b-d59c-4850-a9b3-7838243601a5", name: "Dewi Lestari", email: "jukir.dewi@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-c" },
  { id: "cb537acf-1db1-4d88-9538-8bfa60f639cb", name: "Dian Puspita", email: "jukir.dian@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-g" },
  { id: "0b1d1bd6-4ab7-4968-b38e-23ec25c5ed7b", name: "Dimas Saputra", email: "jukir.dimas@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-h" },
  { id: "f57fd8bb-d450-44d4-96a9-f2c3b8b5e413", name: "Eko Prasetyo", email: "jukir.eko@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-b" },
  { id: "59c27fb7-1d10-4eb6-be13-848d7c207766", name: "Fauzan Akbar", email: "jukir.fauzan@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-f" },
  { id: "48d03e25-43d6-467b-bb7f-acf94e25d595", name: "Fitri Handayani", email: "jukir.fitri@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-a" },
  { id: "938d75df-1fec-4ada-aeb2-2df006e1a814", name: "Galih Maulana", email: "jukir.galih@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-b" },
  { id: "33ca2237-039a-429b-81ba-3a4501840fa2", name: "Hendra Gunawan", email: "jukir.hendra@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-e" },
  { id: "c7bd3c18-e820-4892-8c58-6998a3e52091", name: "Hendro Wibowo", email: "jukir.hendro@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-d" },
  { id: "141297d4-11aa-491f-bbbf-f4624bfab765", name: "Indah Permatasari", email: "jukir.indah@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-e" },
  { id: "00a2518d-f5a8-4f88-80c4-b1d0cad79eea", name: "Joko Susilo", email: "jukir.joko@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-h" },
  { id: "918b0941-ec78-44f1-8f6d-92e947b1bd62", name: "Mila Kartika", email: "jukir.mila@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-e" },
  { id: "078949a3-c0db-447d-b81b-f6375a772574", name: "Nia Ramadhani", email: "jukir.nia@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-g" },
  { id: "70ae99f2-3376-42b7-a14d-5d9c8bf03357", name: "Putri Anggraini", email: "jukir.putri@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-a" },
  { id: "2a04ab52-9b9f-4d55-815f-4ce6f0c73ece", name: "Reza Fahlevi", email: "jukir.reza@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-d" },
  { id: "db2162bf-23a2-49fe-9d21-08f4f3a242bd", name: "Rina Marlina", email: "jukir.rina@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-a" },
  { id: "f73163fb-d4f1-4231-8bdb-88994653e89c", name: "Rizki Ramadhan", email: "jukir.rizki@sess.local", role: "JUKIR", status: "BLOCKED", areaId: "area-f" },
  { id: "205ebdd6-d27c-46f0-9f70-94b72f5c5af8", name: "Sari Dewi", email: "jukir.sari@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-c" },
  { id: "2e279025-bed0-428d-b0dc-3fcdddb45de8", name: "Siti Rahayu", email: "jukir.siti@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-a" },
  { id: "f191e958-f1f1-4e2b-9c39-6fcc705e1beb", name: "Sri Wahyuni", email: "jukir.sri@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-g" },
  { id: "f6b26872-f57f-4be5-a0ea-1b1e2e0fb382", name: "susisess", email: "jukir.susisess@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-a" },
  { id: "06bff02f-e909-4603-8ba8-29e6ae600373", name: "Teguh Santoso", email: "jukir.teguh@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-d" },
  { id: "fc67f2a7-6132-49e4-b7bf-1a78ccf1c475", name: "Wahyu Hidayat", email: "jukir.wahyu@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-f" },
  { id: "55562e09-bed7-4c45-acb7-6b568af35ccc", name: "Wulan Sari", email: "jukir.wulan@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-c" },
  { id: "c5acb0a5-9cfb-4d6b-87cc-1a2b158df11e", name: "Yulianti", email: "jukir.yulianti@sess.local", role: "JUKIR", status: "ACTIVE", areaId: "area-c" },
];

async function main() {
  // ---- Bersihkan dulu (anak → induk) agar re-run aman & idempoten ----
  await prisma.qrisPayment.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.setoranEntry.deleteMany();
  await prisma.cvDetection.deleteMany();
  await prisma.violation.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.jukirCluster.deleteMany();
  await prisma.forecastValidation.deleteMany();
  await prisma.user.deleteMany();
  await prisma.parkingArea.deleteMany();
  await prisma.mouRule.deleteMany();

  // ---- Parking Areas ----
  for (const a of areaSpecs) {
    await prisma.parkingArea.create({
      data: {
        id: a.id,
        name: a.name,
        location: a.location,
        vehicleType: a.vehicleType,
        capacity: a.capacity,
        latitude: a.latitude,
        longitude: a.longitude,
      },
    });
  }

  // ---- MOU rule ----
  await prisma.mouRule.create({
    data: {
      id: "4ecec4d1-8514-429f-b014-ef3ff797e47e",
      name: "MOU Prototype 2026",
      taxPercent: TAX_PERCENT,
      operatorPercent: 0,
      jukirSharePercent: JUKIR_SHARE_PERCENT,
      firstHour_motorcycle: 2000,
      nextHour_motorcycle: 1000,
      maximumDaily_motorcycle: 10000,
      firstHour_car: 3000,
      nextHour_car: 1500,
      maximumDaily_car: 15000,
      validFrom: MOU_VALID_FROM,
      validTo: null,
    },
  });

  // ---- Users ----
  const jukirIdByEmail = new Map<string, string>();
  for (const u of userSpecs) {
    await prisma.user.create({
      data: {
        id: u.id,
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role,
        status: u.status,
        areaId: u.areaId ?? null,
      },
    });
    if (u.role === "JUKIR") jukirIdByEmail.set(u.email, u.id);
  }

  // ---- CvDetection contoh ----
  await prisma.cvDetection.createMany({
    data: [
      { id: "c1af06a2-a3ff-4be4-afb6-1981416a0673", areaId: "area-a", normalCount: 37, violationCount: 0, source: "cctv", detectedAt: new Date("2026-10-12T10:02:40.828Z") },
      { id: "ee0da1e8-fd37-442d-a2b1-a0bff4117d69", areaId: "area-b", normalCount: 5, violationCount: 1, source: "cctv", detectedAt: new Date("2026-10-12T10:02:40.828Z") },
      { id: "042d4f6b-89ce-45b9-b63e-7aad12f8c08a", areaId: "area-c", normalCount: 5, violationCount: 0, source: "cctv", detectedAt: new Date("2026-10-12T10:02:40.828Z") },
    ],
  });

  // ---- Sample transaksi selesai (tanggal tetap, cukup untuk demo chart) ----
  const completedSpecs = [
    { areaId: "area-a", jukirEmail: "jukir.budi@sess.local", day: 45, hour: 1, minutes: 120, method: "CASH" as const },
    { areaId: "area-a", jukirEmail: "jukir.siti@sess.local", day: 44, hour: 3, minutes: 180, method: "QRIS" as const },
    { areaId: "area-b", jukirEmail: "jukir.agus@sess.local", day: 43, hour: 2, minutes: 60, method: "CASH" as const },
    { areaId: "area-a", jukirEmail: "jukir.budi@sess.local", day: 42, hour: 7, minutes: 300, method: "QRIS" as const },
    { areaId: "area-c", jukirEmail: "jukir.dewi@sess.local", day: 41, hour: 4, minutes: 120, method: "CASH" as const },
    { areaId: "area-b", jukirEmail: "jukir.agus@sess.local", day: 40, hour: 6, minutes: 240, method: "QRIS" as const },
    { areaId: "area-a", jukirEmail: "jukir.siti@sess.local", day: 40, hour: 9, minutes: 90, method: "CASH" as const },
  ];

  let counter = 1;
  for (const s of completedSpecs) {
    const checkIn = daysAgo(s.day, s.hour);
    const checkOut = new Date(checkIn.getTime() + s.minutes * 60 * 1000);
    const fee = calculateParkingFee(checkIn, checkOut, RULES);
    const transactionCode = `PARK-${String(counter).padStart(5, "0")}`;
    await prisma.transaction.create({
      data: {
        transactionCode,
        areaId: s.areaId,
        jukirId: jukirIdByEmail.get(s.jukirEmail) ?? null,
        checkIn,
        checkOut,
        durationMinutes: fee.durationMinutes,
        amount: fee.totalFee,
        paymentMethod: s.method,
        paidAt: checkOut,
        status: "COMPLETED",
      },
    });
    counter++;
  }

  // ---- Sample transaksi aktif (belum checkout) ----
  const activeSpecs = [
    { areaId: "area-a", jukirEmail: "jukir.budi@sess.local", hour: 8 },
    { areaId: "area-a", jukirEmail: "jukir.siti@sess.local", hour: 9 },
    { areaId: "area-b", jukirEmail: "jukir.agus@sess.local", hour: 8 },
  ];
  for (const s of activeSpecs) {
    const transactionCode = `PARK-${String(counter).padStart(5, "0")}`;
    await prisma.transaction.create({
      data: {
        transactionCode,
        areaId: s.areaId,
        jukirId: jukirIdByEmail.get(s.jukirEmail) ?? null,
        checkIn: daysAgo(0, s.hour),
        status: "ACTIVE",
      },
    });
    counter++;
  }

  // ---- Sample Setoran Entries ----
  const budiId = jukirIdByEmail.get("jukir.budi@sess.local");
  const agusId = jukirIdByEmail.get("jukir.agus@sess.local");
  const adminId = "216f6f80-92a8-4612-a369-44405970c3bc";

  if (budiId) {
    await prisma.setoranEntry.create({
      data: {
        jukirId: budiId,
        areaId: "area-a",
        date: daysAgo(1, 0),
        totalTransactions: 25,
        grossAmount: 150000,
        taxPercent: TAX_PERCENT,
        taxAmount: 15000,
        jukirSharePercent: JUKIR_SHARE_PERCENT,
        jukirShareAmount: 22500,
        status: "APPROVED",
        approvedAt: daysAgo(1, 12),
        approvedBy: adminId,
      },
    });
  }

  if (agusId) {
    await prisma.setoranEntry.create({
      data: {
        jukirId: agusId,
        areaId: "area-b",
        date: daysAgo(0, 0),
        totalTransactions: 18,
        grossAmount: 95000,
        taxPercent: TAX_PERCENT,
        taxAmount: 9500,
        jukirSharePercent: JUKIR_SHARE_PERCENT,
        jukirShareAmount: 14250,
        status: "PENDING",
      },
    });
  }

  console.log(
    `Seeded successfully!

    Users: ${userSpecs.length} (ADMIN/USER/JUKIR)
    Parking Areas: ${areaSpecs.length}
    MOU Rule: Tax ${TAX_PERCENT}%, Jukir Share ${JUKIR_SHARE_PERCENT}%
    Transactions (sample): ${counter - 1} records

    Login credentials (semua password: password123)
    - Admin    : admin@sess.local
    - Customer : user@sess.local
    - Jukir    : jukir.<nama>@sess.local (contoh: jukir.budi@sess.local)`,
  );
}

main().finally(() => prisma.$disconnect());
