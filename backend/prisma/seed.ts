import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { calculateParkingFee } from "../src/lib/fee.js";

const prisma = new PrismaClient();

// Fee rules used to compute dummy completed-session totals.
const RULES = { firstHour: 5000, nextHour: 3000, maximumDaily: 30000 };

// Deterministic date helpers so re-seeding gives stable, chart-friendly spread.
const now = new Date();
const daysAgo = (d: number, hour = 9) => {
  const dt = new Date(now);
  dt.setDate(dt.getDate() - d);
  dt.setHours(hour, 0, 0, 0);
  return dt;
};

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@sess.local" },
    update: {},
    create: { name: "Admin", email: "admin@sess.local", passwordHash, role: "ADMIN" },
  });
  const primaryUser = await prisma.user.upsert({
    where: { email: "user@sess.local" },
    update: {},
    create: { name: "User", email: "user@sess.local", passwordHash, role: "USER" },
  });

  // Extra dummy users; two BLOCKED to demo block/unblock action.
  const dummyUsers = [
    { name: "Budi Santoso", email: "budi@sess.local", status: "ACTIVE" as const },
    { name: "Siti Rahayu", email: "siti@sess.local", status: "ACTIVE" as const },
    { name: "Agus Wijaya", email: "agus@sess.local", status: "ACTIVE" as const },
    { name: "Dewi Lestari", email: "dewi@sess.local", status: "BLOCKED" as const },
    { name: "Eko Prasetyo", email: "eko@sess.local", status: "ACTIVE" as const },
    { name: "Rina Marlina", email: "rina@sess.local", status: "BLOCKED" as const },
  ];
  const users = [primaryUser];
  for (const u of dummyUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { name: u.name, email: u.email, passwordHash, role: "USER", status: u.status },
    });
    users.push(user);
  }

  // Vehicles for the first few users.
  const vehicleSpecs = [
    { userIdx: 0, plateNumber: "B 1234 ABC", vehicleType: "car", brand: "Toyota", model: "Avanza" },
    { userIdx: 1, plateNumber: "B 5678 DEF", vehicleType: "car", brand: "Honda", model: "Brio" },
    { userIdx: 2, plateNumber: "B 9012 GHI", vehicleType: "motorcycle", brand: "Yamaha", model: "NMAX" },
    { userIdx: 3, plateNumber: "B 3456 JKL", vehicleType: "car", brand: "Suzuki", model: "Ertiga" },
  ];
  const vehicles: { id: string; userId: string }[] = [];
  for (const v of vehicleSpecs) {
    const user = users[v.userIdx];
    // Idempotent-ish: skip if this user already has this plate.
    const existing = await prisma.vehicle.findFirst({
      where: { userId: user.id, plateNumber: v.plateNumber },
    });
    const vehicle =
      existing ??
      (await prisma.vehicle.create({
        data: {
          userId: user.id,
          plateNumber: v.plateNumber,
          vehicleType: v.vehicleType,
          brand: v.brand,
          model: v.model,
        },
      }));
    vehicles.push({ id: vehicle.id, userId: user.id });
  }

  // Location 1 (existing) + slots.
  const loc1 = await prisma.parkingLocation.upsert({
    where: { id: "seed-loc-1" },
    update: {},
    create: {
      id: "seed-loc-1",
      name: "Parkir Pusat Kota",
      address: "Jl. Merdeka No. 1",
      latitude: -6.2,
      longitude: 106.8166,
      operatingStart: "06:00",
      operatingEnd: "22:00",
    },
  });
  for (let i = 1; i <= 6; i++) {
    await prisma.parkingSlot.upsert({
      where: { locationId_slotCode: { locationId: loc1.id, slotCode: `A${i}` } },
      update: {},
      create: {
        locationId: loc1.id,
        slotCode: `A${i}`,
        status: i % 3 === 0 ? "OCCUPIED" : "AVAILABLE",
      },
    });
  }

  // Location 2 (new) + 8 slots with mixed statuses.
  const loc2 = await prisma.parkingLocation.upsert({
    where: { id: "seed-loc-2" },
    update: {},
    create: {
      id: "seed-loc-2",
      name: "Parkir Mall Selatan",
      address: "Jl. Sudirman No. 88",
      latitude: -6.2245,
      longitude: 106.8412,
      operatingStart: "08:00",
      operatingEnd: "23:00",
    },
  });
  const loc2Statuses = ["AVAILABLE", "OCCUPIED", "OCCUPIED", "MAINTENANCE", "AVAILABLE", "AVAILABLE", "OCCUPIED", "AVAILABLE"] as const;
  for (let i = 0; i < 8; i++) {
    await prisma.parkingSlot.upsert({
      where: { locationId_slotCode: { locationId: loc2.id, slotCode: `B${i + 1}` } },
      update: {},
      create: { locationId: loc2.id, slotCode: `B${i + 1}`, status: loc2Statuses[i] },
    });
  }

  // Sessions + payments. Wipe prior seeded sessions to keep re-seeds clean
  // (sessions have no natural unique key to upsert on).
  await prisma.payment.deleteMany({ where: { session: { location: { id: { in: [loc1.id, loc2.id] } } } } });
  await prisma.parkingSession.deleteMany({ where: { locationId: { in: [loc1.id, loc2.id] } } });

  const slotsL1 = await prisma.parkingSlot.findMany({ where: { locationId: loc1.id }, orderBy: { slotCode: "asc" } });

  // 6 completed sessions spread across last 7 days (drives revenue chart) + 2 active.
  const completedSpecs = [
    { userIdx: 0, day: 6, checkInHour: 8, hours: 2 },
    { userIdx: 1, day: 5, checkInHour: 10, hours: 3 },
    { userIdx: 2, day: 4, checkInHour: 9, hours: 1 },
    { userIdx: 0, day: 3, checkInHour: 14, hours: 5 },
    { userIdx: 4, day: 2, checkInHour: 11, hours: 2 },
    { userIdx: 1, day: 1, checkInHour: 13, hours: 4 },
  ];
  for (let i = 0; i < completedSpecs.length; i++) {
    const s = completedSpecs[i];
    const user = users[s.userIdx];
    const checkIn = daysAgo(s.day, s.checkInHour);
    const checkOut = new Date(checkIn.getTime() + s.hours * 60 * 60 * 1000);
    const fee = calculateParkingFee(checkIn, checkOut, RULES);
    const session = await prisma.parkingSession.create({
      data: {
        userId: user.id,
        vehicleId: vehicles[i % vehicles.length]?.id ?? null,
        locationId: loc1.id,
        slotId: slotsL1[i % slotsL1.length]?.id ?? null,
        checkIn,
        checkOut,
        durationMinutes: fee.durationMinutes,
        totalFee: fee.totalFee,
        status: "COMPLETED",
      },
    });
    await prisma.payment.create({
      data: {
        sessionId: session.id,
        userId: user.id,
        amount: fee.totalFee,
        paymentMethod: i % 2 === 0 ? "qris" : "e-wallet",
        transactionId: `TRX-${1000 + i}`,
        status: "PAID",
        paidAt: checkOut,
      },
    });
  }

  // 2 active sessions (no checkout).
  for (let i = 0; i < 2; i++) {
    const user = users[i];
    await prisma.parkingSession.create({
      data: {
        userId: user.id,
        vehicleId: vehicles[i]?.id ?? null,
        locationId: loc1.id,
        slotId: slotsL1[i]?.id ?? null,
        checkIn: daysAgo(0, 8 + i),
        status: "ACTIVE",
      },
    });
  }

  // A couple pending/failed payments (unpaid completed sessions) for report variety.
  const extraSession = await prisma.parkingSession.create({
    data: {
      userId: users[3].id,
      locationId: loc2.id,
      checkIn: daysAgo(1, 15),
      checkOut: daysAgo(1, 17),
      durationMinutes: 120,
      totalFee: 11000,
      status: "COMPLETED",
    },
  });
  await prisma.payment.create({
    data: { sessionId: extraSession.id, userId: users[3].id, amount: 11000, paymentMethod: "qris", status: "PENDING" },
  });

  // Notifications (mixed read/unread).
  await prisma.notification.deleteMany({ where: { title: { startsWith: "[seed]" } } });
  const notifs = [
    { userId: admin.id, type: "system", title: "[seed] Sistem aktif", message: "Backend & database berjalan normal.", isRead: true },
    { userId: null, type: "info", title: "[seed] Lokasi baru", message: "Parkir Mall Selatan telah ditambahkan.", isRead: false },
    { userId: users[0].id, type: "payment", title: "[seed] Pembayaran berhasil", message: "Transaksi TRX-1000 lunas.", isRead: false },
    { userId: admin.id, type: "alert", title: "[seed] Slot maintenance", message: "Slot B4 dalam perbaikan.", isRead: false },
    { userId: users[1].id, type: "info", title: "[seed] Selamat datang", message: "Terima kasih telah bergabung.", isRead: true },
  ];
  for (const n of notifs) {
    await prisma.notification.create({ data: n });
  }

  console.log(
    "Seeded: 8 users (password: password123), 4 vehicles, 2 locations, 14 slots, 9 sessions, 7 payments, 5 notifications",
  );
}

main().finally(() => prisma.$disconnect());
