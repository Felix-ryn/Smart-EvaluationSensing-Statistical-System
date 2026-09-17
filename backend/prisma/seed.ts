import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { calculateParkingFee, type ParkingRules } from "../src/lib/fee.js";

const prisma = new PrismaClient();

// Aturan tarif + MOU untuk seed (bisa diubah lewat UI nanti).
const RULES: ParkingRules = { firstHour: 2000, nextHour: 1000, maximumDaily: 10000 };
const TAX_PERCENT = 10; // % pajak / bagian pengelola
const JUKIR_SHARE_PERCENT = 15; // % bagian juru parkir dari revenue

// Helper tanggal deterministik agar re-seed stabil.
const now = new Date();
const daysAgo = (d: number, hour = 9, minute = 0) => {
  const dt = new Date(now);
  dt.setDate(dt.getDate() - d);
  dt.setHours(hour, minute, 0, 0);
  return dt;
};

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  // ---- Users (Admin, Jukir, User) ----
  
  // Admin user
  const admin = await prisma.user.upsert({
    where: { email: "admin@sess.local" },
    update: {},
    create: { name: "Admin System", email: "admin@sess.local", passwordHash, role: "ADMIN" },
  });
  
  // Customer/User pelanggan
  const customer = await prisma.user.upsert({
    where: { email: "user@sess.local" },
    update: {},
    create: { name: "Customer User", email: "user@sess.local", passwordHash, role: "USER" },
  });
  
  // Jukir users (changed from separate Jukir model)
  const jukirSpecs = [
    { name: "Budi Santoso", areaId: "area-a", email: "jukir.budi@sess.local" },
    { name: "Siti Rahayu", areaId: "area-a", email: "jukir.siti@sess.local" },
    { name: "Agus Wijaya", areaId: "area-b", email: "jukir.agus@sess.local" },
    { name: "Dewi Lestari", areaId: "area-c", email: "jukir.dewi@sess.local" },
  ];
  
  const jukirs: { id: string; name: string; areaId: string }[] = [];
  for (const j of jukirSpecs) {
    const jukir = await prisma.user.upsert({
      where: { email: j.email },
      update: { areaId: j.areaId, role: "JUKIR" },
      create: { 
        name: j.name, 
        email: j.email, 
        passwordHash, 
        role: "JUKIR", 
        areaId: j.areaId,
        status: "ACTIVE"
      },
    });
    jukirs.push({ id: jukir.id, name: jukir.name, areaId: jukir.areaId! });
  }

  // ---- MOU rule ----
  await prisma.mouRule.deleteMany();
  await prisma.mouRule.create({
    data: {
      name: "MOU Prototype 2026",
      taxPercent: TAX_PERCENT,
      operatorPercent: 0,
      jukirSharePercent: JUKIR_SHARE_PERCENT, // New field
      validFrom: daysAgo(30),
      validTo: null,
    },
  });

  // ---- Parking Areas (kapasitas, bukan slot) ----
  const areaSpecs = [
    { id: "area-a", name: "Area A", location: "Jl. Merdeka No. 1", vehicleType: "motorcycle", capacity: 50 },
    { id: "area-b", name: "Area B", location: "Jl. Sudirman No. 88", vehicleType: "motorcycle", capacity: 30 },
    { id: "area-c", name: "Area C", location: "Jl. Gatot Subroto No. 10", vehicleType: "car", capacity: 20 },
  ];
  for (const a of areaSpecs) {
    await prisma.parkingArea.upsert({
      where: { id: a.id },
      update: { name: a.name, location: a.location, vehicleType: a.vehicleType, capacity: a.capacity },
      create: { id: a.id, name: a.name, location: a.location, vehicleType: a.vehicleType, capacity: a.capacity },
    });
  }

  // ---- Reset transaksi & detection agar re-seed bersih ----
  await prisma.transaction.deleteMany();
  await prisma.cvDetection.deleteMany();
  await prisma.setoranEntry.deleteMany(); // New table

  // ---- Transaksi selesai (mendorong revenue chart + cash vs QRIS) ----
  const completedSpecs = [
    { areaId: "area-a", jukirIdx: 0, day: 6, hour: 8, minutes: 120, method: "CASH" as const },
    { areaId: "area-a", jukirIdx: 1, day: 5, hour: 10, minutes: 180, method: "QRIS" as const },
    { areaId: "area-b", jukirIdx: 2, day: 4, hour: 9, minutes: 60, method: "CASH" as const },
    { areaId: "area-a", jukirIdx: 0, day: 3, hour: 14, minutes: 300, method: "QRIS" as const },
    { areaId: "area-c", jukirIdx: 3, day: 2, hour: 11, minutes: 120, method: "CASH" as const },
    { areaId: "area-b", jukirIdx: 2, day: 1, hour: 13, minutes: 240, method: "QRIS" as const },
    { areaId: "area-a", jukirIdx: 1, day: 1, hour: 16, minutes: 90, method: "CASH" as const },
  ];
  let counter = 1;
  for (const s of completedSpecs) {
    const checkIn = daysAgo(s.day, s.hour);
    const checkOut = new Date(checkIn.getTime() + s.minutes * 60 * 1000);
    const fee = calculateParkingFee(checkIn, checkOut, RULES);
    await prisma.transaction.create({
      data: {
        transactionCode: `PARK-${String(counter).padStart(5, "0")}`,
        areaId: s.areaId,
        jukirId: jukirs[s.jukirIdx]?.id ?? null,
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

  // ---- Transaksi aktif (belum checkout) ----
  const activeSpecs = [
    { areaId: "area-a", jukirIdx: 0, hour: 8 },
    { areaId: "area-a", jukirIdx: 1, hour: 9 },
    { areaId: "area-b", jukirIdx: 2, hour: 8 },
  ];
  for (const s of activeSpecs) {
    await prisma.transaction.create({
      data: {
        transactionCode: `PARK-${String(counter).padStart(5, "0")}`,
        areaId: s.areaId,
        jukirId: jukirs[s.jukirIdx]?.id ?? null,
        checkIn: daysAgo(0, s.hour),
        status: "ACTIVE",
      },
    });
    counter++;
  }

  // ---- CvDetection (hasil scan AI terbaru, untuk rekonsiliasi) ----
  await prisma.cvDetection.createMany({
    data: [
      { areaId: "area-a", emptyCount: 13, occupiedCount: 37, illegalCount: 0, source: "cctv" },
      { areaId: "area-b", emptyCount: 25, occupiedCount: 5, illegalCount: 1, source: "cctv" },
      { areaId: "area-c", emptyCount: 15, occupiedCount: 5, illegalCount: 0, source: "cctv" },
    ],
  });
  
  // ---- Sample Setoran Entries (auto-calculated) ----
  await prisma.setoranEntry.create({
    data: {
      jukirId: jukirs[0].id,
      areaId: "area-a",
      date: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
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
  
  await prisma.setoranEntry.create({
    data: {
      jukirId: jukirs[2].id,
      areaId: "area-b",
      date: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
      totalTransactions: 18,
      grossAmount: 95000,
      taxPercent: TAX_PERCENT,
      taxAmount: 9500,
      jukirSharePercent: JUKIR_SHARE_PERCENT,
      jukirShareAmount: 14250,
      status: "PENDING",
    },
  });

  console.log(
    `Seeded successfully!
    
    Users: ${admin.id} (ADMIN), ${customer.id} (USER), ${jukirs.length} JUKIR
    - Admin: admin@sess.local | password: password123
    - User: user@sess.local | password: password123
    - Jukir accounts created with email: jukir.xxx@sess.local | password: password123
    
    Parking Areas: 3
    Jurik Assigned: ${jukirs.length}
    MOU Rule: Tax ${TAX_PERCENT}%, Jukir Share ${JUKIR_SHARE_PERCENT}%
    
    Transactions: ${counter - 1} total (completed + active)
    CV Detections: 3 records
    Sample Setoran: 2 entries
    
    Login credentials:
    - Admin: admin@sess.local / password123
    - Jukir Budi: jukir.budi@sess.local / password123 (Area A)
    - Jukir Siti: jukir.siti@sess.local / password123 (Area A)
    - Jukir Agus: jukir.agus@sess.local / password123 (Area B)
    - Jukir Dewi: jukir.dewi@sess.local / password123 (Area C)
    - Customer: user@sess.local / password123`,
  );
}

main().finally(() => prisma.$disconnect());
