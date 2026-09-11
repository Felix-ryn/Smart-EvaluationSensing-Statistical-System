import { Router } from "express";
import { prisma } from "../prisma.js";

export const dashboardRouter = Router();

// GET /api/dashboard — ringkasan kartu dashboard admin.
dashboardRouter.get("/", async (_req, res, next) => {
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
      prisma.jukir.count(),
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
