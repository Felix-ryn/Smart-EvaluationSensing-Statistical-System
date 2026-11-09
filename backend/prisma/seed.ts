import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { calculateParkingFee, type ParkingRules } from "../src/lib/fee.js";

const prisma = new PrismaClient();

// Aturan tarif + MOU untuk seed (bisa diubah lewat UI nanti).
const RULES: ParkingRules = { firstHour: 2000, nextHour: 1000, maximumDaily: 10000 };
const TAX_PERCENT = 10; // % pajak / bagian pengelola
const JUKIR_SHARE_PERCENT = 15; // % bagian juru parkir dari revenue
const MOU_VALID_FROM = new Date("2026-09-12T00:00:00.000Z");

// Helper tanggal deterministik agar re-seed stabil.
const now = new Date();
const daysAgo = (d: number, hour = 9, minute = 0) => {
  const dt = new Date(now);
  dt.setDate(dt.getDate() - d);
  dt.setHours(hour, minute, 0, 0);
  return dt;
};

// ---- Master data: Parking Areas ----
const areaSpecs = [
  { id: "area-a", name: "Area A", location: "Jl. Merdeka No. 1", vehicleType: "motorcycle", capacity: 80, latitude: -7.2516, longitude: 112.7553 },
  { id: "area-b", name: "Area B", location: "Jl. Sudirman No. 88", vehicleType: "motorcycle", capacity: 70, latitude: -7.2512, longitude: 112.7561 },
  { id: "area-c", name: "Area C", location: "Jl. Gatot Subroto No. 10", vehicleType: "car", capacity: 45, latitude: -7.2508, longitude: 112.7548 },
  { id: "area-d", name: "Area D", location: "Jl. Veteran No. 2", vehicleType: "motorcycle", capacity: 75, latitude: -7.2499, longitude: 112.757 },
  { id: "area-e", name: "Area E", location: "Jl. Pahlawan No. 14", vehicleType: "car", capacity: 40, latitude: -7.2525, longitude: 112.7539 },
  { id: "area-f", name: "Area F", location: "Jl. Dharmawangsa No. 7", vehicleType: "motorcycle", capacity: 65, latitude: -7.253, longitude: 112.7568 },
  { id: "area-g", name: "Area G", location: "Jl. Diponegoro No. 23", vehicleType: "car", capacity: 38, latitude: -7.2504, longitude: 112.7529 },
  { id: "area-h", name: "Area H", location: "Jl. Ahmad Yani No. 50", vehicleType: "motorcycle", capacity: 72, latitude: -7.2489, longitude: 112.7584 },
  { id: "89522d52-1697-4d9d-af0e-c7c4c448ab42", name: "area barat", location: "jalan barat jaya", vehicleType: "motorcycle", capacity: 50, latitude: null, longitude: null },
];

// ---- Master data: Jukir accounts (email + password: password123) ----
const jukirSpecs = [
  { name: "Budi Santoso", email: "jukir.budi@sess.local", areaId: "area-a" },
  { name: "Siti Rahayu", email: "jukir.siti@sess.local", areaId: "area-a" },
  { name: "Agus Wijaya", email: "jukir.agus@sess.local", areaId: "area-b" },
  { name: "Dewi Lestari", email: "jukir.dewi@sess.local", areaId: "area-c" },
  { name: "Hendra Gunawan", email: "jukir.hendra@sess.local", areaId: "area-e" },
  { name: "Rizki Ramadhan", email: "jukir.rizki@sess.local", areaId: "area-f" },
  { name: "Dian Puspita", email: "jukir.dian@sess.local", areaId: "area-g" },
  { name: "Bayu Setiawan", email: "jukir.bayu@sess.local", areaId: "area-h" },
  { name: "Putri Anggraini", email: "jukir.putri@sess.local", areaId: "area-a" },
  { name: "Eko Prasetyo", email: "jukir.eko@sess.local", areaId: "area-b" },
  { name: "Wulan Sari", email: "jukir.wulan@sess.local", areaId: "area-c" },
  { name: "Hendro Wibowo", email: "jukir.hendro@sess.local", areaId: "area-d" },
  { name: "Ayu Permata", email: "jukir.ayu@sess.local", areaId: "area-e" },
  { name: "Dedi Kurniawan", email: "jukir.dedi@sess.local", areaId: "area-f" },
  { name: "Sri Wahyuni", email: "jukir.sri@sess.local", areaId: "area-g" },
  { name: "Joko Susilo", email: "jukir.joko@sess.local", areaId: "area-h" },
  { name: "Rina Marlina", email: "jukir.rina@sess.local", areaId: "area-a" },
  { name: "Arif Budiman", email: "jukir.arif@sess.local", areaId: "area-b" },
  { name: "Sari Dewi", email: "jukir.sari@sess.local", areaId: "area-c" },
  { name: "Teguh Santoso", email: "jukir.teguh@sess.local", areaId: "area-d" },
  { name: "Indah Permatasari", email: "jukir.indah@sess.local", areaId: "area-e" },
  { name: "Wahyu Hidayat", email: "jukir.wahyu@sess.local", areaId: "area-f" },
  { name: "Nia Ramadhani", email: "jukir.nia@sess.local", areaId: "area-g" },
  { name: "Dimas Saputra", email: "jukir.dimas@sess.local", areaId: "area-h" },
  { name: "Fitri Handayani", email: "jukir.fitri@sess.local", areaId: "area-a" },
  { name: "Galih Maulana", email: "jukir.galih@sess.local", areaId: "area-b" },
  { name: "Yulianti", email: "jukir.yulianti@sess.local", areaId: "area-c" },
  { name: "Reza Fahlevi", email: "jukir.reza@sess.local", areaId: "area-d" },
  { name: "Mila Kartika", email: "jukir.mila@sess.local", areaId: "area-e" },
  { name: "Fauzan Akbar", email: "jukir.fauzan@sess.local", areaId: "area-f" },
  { name: "Citra Kirana", email: "jukir.citra@sess.local", areaId: "area-g" },
  { name: "Bagus Permana", email: "jukir.bagus@sess.local", areaId: "area-h" },
];

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  // ---- Parking Areas (kapasitas, bukan slot) ----
  for (const a of areaSpecs) {
    const fields = {
      name: a.name,
      location: a.location,
      vehicleType: a.vehicleType,
      capacity: a.capacity,
      latitude: a.latitude,
      longitude: a.longitude,
    };
    await prisma.parkingArea.upsert({
      where: { id: a.id },
      update: fields,
      create: { id: a.id, ...fields },
    });
  }

  // ---- MOU rule ----
  await prisma.mouRule.deleteMany();
  await prisma.mouRule.create({
    data: {
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

  // ---- Users: Admin & Customer ----
  const admin = await prisma.user.upsert({
    where: { email: "admin@sess.local" },
    update: { name: "Admin System", role: "ADMIN", status: "ACTIVE", passwordHash },
    create: { name: "Admin System", email: "admin@sess.local", passwordHash, role: "ADMIN" },
  });

  const customer = await prisma.user.upsert({
    where: { email: "user@sess.local" },
    update: { name: "Customer User", role: "USER", status: "ACTIVE", passwordHash },
    create: { name: "Customer User", email: "user@sess.local", passwordHash, role: "USER" },
  });

  // ---- Users: Jukir ----
  const jukirIdByEmail = new Map<string, string>();
  for (const j of jukirSpecs) {
    const jukir = await prisma.user.upsert({
      where: { email: j.email },
      update: { name: j.name, role: "JUKIR", status: "ACTIVE", areaId: j.areaId, passwordHash },
      create: {
        name: j.name,
        email: j.email,
        passwordHash,
        role: "JUKIR",
        status: "ACTIVE",
        areaId: j.areaId,
      },
    });
    jukirIdByEmail.set(j.email, jukir.id);
  }

  // ---- Sample transaksi selesai (mendorong revenue chart + cash vs QRIS) ----
  const completedSpecs = [
    { areaId: "area-a", jukirEmail: "jukir.budi@sess.local", day: 6, hour: 8, minutes: 120, method: "CASH" as const },
    { areaId: "area-a", jukirEmail: "jukir.siti@sess.local", day: 5, hour: 10, minutes: 180, method: "QRIS" as const },
    { areaId: "area-b", jukirEmail: "jukir.agus@sess.local", day: 4, hour: 9, minutes: 60, method: "CASH" as const },
    { areaId: "area-a", jukirEmail: "jukir.budi@sess.local", day: 3, hour: 14, minutes: 300, method: "QRIS" as const },
    { areaId: "area-c", jukirEmail: "jukir.dewi@sess.local", day: 2, hour: 11, minutes: 120, method: "CASH" as const },
    { areaId: "area-b", jukirEmail: "jukir.agus@sess.local", day: 1, hour: 13, minutes: 240, method: "QRIS" as const },
    { areaId: "area-a", jukirEmail: "jukir.siti@sess.local", day: 1, hour: 16, minutes: 90, method: "CASH" as const },
  ];

  let counter = 1;
  for (const s of completedSpecs) {
    const checkIn = daysAgo(s.day, s.hour);
    const checkOut = new Date(checkIn.getTime() + s.minutes * 60 * 1000);
    const fee = calculateParkingFee(checkIn, checkOut, RULES);
    const transactionCode = `PARK-${String(counter).padStart(5, "0")}`;
    const data = {
      areaId: s.areaId,
      jukirId: jukirIdByEmail.get(s.jukirEmail) ?? null,
      checkIn,
      checkOut,
      durationMinutes: fee.durationMinutes,
      amount: fee.totalFee,
      paymentMethod: s.method,
      paidAt: checkOut,
      status: "COMPLETED" as const,
    };
    await prisma.transaction.upsert({
      where: { transactionCode },
      update: {},
      create: { transactionCode, ...data },
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
    await prisma.transaction.upsert({
      where: { transactionCode },
      update: {},
      create: {
        transactionCode,
        areaId: s.areaId,
        jukirId: jukirIdByEmail.get(s.jukirEmail) ?? null,
        checkIn: daysAgo(0, s.hour),
        status: "ACTIVE",
      },
    });
    counter++;
  }

  // ---- CvDetection contoh (hanya jika masih kosong) ----
  if ((await prisma.cvDetection.count()) === 0) {
    await prisma.cvDetection.createMany({
      data: [
        { areaId: "area-a", normalCount: 37, violationCount: 0, source: "cctv" },
        { areaId: "area-b", normalCount: 5, violationCount: 1, source: "cctv" },
        { areaId: "area-c", normalCount: 5, violationCount: 0, source: "cctv" },
      ],
    });
  }

  // ---- Sample Setoran Entries (auto-calculated) ----
  const budiId = jukirIdByEmail.get("jukir.budi@sess.local");
  const agusId = jukirIdByEmail.get("jukir.agus@sess.local");
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (budiId) {
    const existing = await prisma.setoranEntry.findFirst({ where: { jukirId: budiId, date: today } });
    if (!existing) {
      await prisma.setoranEntry.create({
        data: {
          jukirId: budiId,
          areaId: "area-a",
          date: today,
          totalTransactions: 25,
          grossAmount: 150000,
          taxPercent: TAX_PERCENT,
          taxAmount: 15000,
          jukirSharePercent: JUKIR_SHARE_PERCENT,
          jukirShareAmount: 22500,
          status: "APPROVED",
          approvedAt: new Date(),
          approvedBy: admin.id,
        },
      });
    }
  }

  if (agusId) {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const existing = await prisma.setoranEntry.findFirst({ where: { jukirId: agusId, date: yesterday } });
    if (!existing) {
      await prisma.setoranEntry.create({
        data: {
          jukirId: agusId,
          areaId: "area-b",
          date: yesterday,
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
  }

  console.log(
    `Seeded successfully!

    Users: ${admin.id} (ADMIN), ${customer.id} (USER), ${jukirSpecs.length} JUKIR
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
