import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAdmin } from "../middleware/auth.js";

export const dashboardRouter = Router();

// GET /api/dashboard — ringkasan kartu dashboard admin.
dashboardRouter.get("/", requireAdmin, async (_req, res, next) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalAreas,
      totalJukir,
      activeVehicles,
      todayRevenue,
      cashRevenue,
      qrisRevenue,
      pendingViolations,
    ] = await Promise.all([
      prisma.parkingArea.count(),
      prisma.user.count({ where: { role: "JUKIR" } }),
      prisma.transaction.count({ where: { status: "ACTIVE" } }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { status: "COMPLETED", paidAt: { gte: startOfToday } },
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { status: "COMPLETED", paymentMethod: "CASH" },
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { status: "COMPLETED", paymentMethod: "QRIS" },
      }),
      prisma.violation.count({ where: { status: "PENDING" } }),
    ]);

    res.json({
      success: true,
      data: {
        totalAreas,
        totalJukir,
        activeVehicles,
        todayRevenue: todayRevenue._sum.amount ?? 0,
        cashRevenue: cashRevenue._sum.amount ?? 0,
        qrisRevenue: qrisRevenue._sum.amount ?? 0,
        pendingViolations,
      },
    });
  } catch (e) {
    next(e);
  }
});

// Label hari dalam bahasa Indonesia, indeks 0 = Minggu (sesuai DOW Postgres).
const DAY_LABELS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/**
 * GET /api/dashboard/trend — tren kendaraan & jam sibuk (rush hour).
 * Dipakai dashboard pengguna. Hanya data agregat (jumlah kendaraan),
 * tidak ada nominal pendapatan, jadi aman dibuka untuk semua role login.
 *
 * Query: ?days=30 (default 30, maksimum 180)
 */
dashboardRouter.get("/trend", async (req, res, next) => {
  try {
    const parsed = Number.parseInt(String(req.query.days ?? "30"), 10);
    const days = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 180) : 30;

    // EXTRACT tidak bisa diekspresikan lewat Prisma query builder, jadi pakai raw SQL.
    // Parameter di-bind ($1), bukan di-interpolasi, untuk mencegah SQL injection.
    const [hourly, daily, weekday] = await Promise.all([
      prisma.$queryRaw<{ hour: number; count: bigint }[]>`
        SELECT EXTRACT(HOUR FROM "checkIn")::int AS hour, COUNT(*)::bigint AS count
        FROM "transaction"
        WHERE "checkIn" >= NOW() - (${days} || ' days')::interval
        GROUP BY hour
        ORDER BY hour
      `,
      prisma.$queryRaw<{ date: Date; count: bigint }[]>`
        SELECT DATE("checkIn") AS date, COUNT(*)::bigint AS count
        FROM "transaction"
        WHERE "checkIn" >= NOW() - (${days} || ' days')::interval
        GROUP BY date
        ORDER BY date
      `,
      prisma.$queryRaw<{ dow: number; count: bigint }[]>`
        SELECT EXTRACT(DOW FROM "checkIn")::int AS dow, COUNT(*)::bigint AS count
        FROM "transaction"
        WHERE "checkIn" >= NOW() - (${days} || ' days')::interval
        GROUP BY dow
        ORDER BY dow
      `,
    ]);

    // Jam 0..23 selalu lengkap supaya grafik tidak bolong.
    const hourMap = new Map(hourly.map((r) => [r.hour, Number(r.count)]));
    const hourlyFull = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, "0")}:00`,
      count: hourMap.get(h) ?? 0,
    }));

    const dowMap = new Map(weekday.map((r) => [r.dow, Number(r.count)]));
    // Urutan tampil Senin..Minggu (lebih lazim dibaca) walau DOW Postgres mulai Minggu.
    const weekdayFull = [1, 2, 3, 4, 5, 6, 0].map((d) => ({
      dow: d,
      label: DAY_LABELS[d],
      count: dowMap.get(d) ?? 0,
    }));

    const totalVehicles = hourlyFull.reduce((s, r) => s + r.count, 0);
    const peak = hourlyFull.reduce((a, b) => (b.count > a.count ? b : a), hourlyFull[0]);

    res.json({
      success: true,
      data: {
        rangeDays: days,
        totalVehicles,
        peakHour: totalVehicles > 0 ? peak.label : null,
        peakHourCount: totalVehicles > 0 ? peak.count : 0,
        hourly: hourlyFull,
        weekday: weekdayFull,
        daily: daily.map((r) => ({
          date: new Date(r.date).toISOString().slice(0, 10),
          count: Number(r.count),
        })),
      },
    });
  } catch (e) {
    next(e);
  }
});
