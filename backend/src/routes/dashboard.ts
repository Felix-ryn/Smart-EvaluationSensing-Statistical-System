import { Router } from "express";
import { prisma } from "../prisma.js";

export const dashboardRouter = Router();

// GET /api/dashboard — summary cards for the admin dashboard.
dashboardRouter.get("/", async (_req, res, next) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [totalUsers, totalLocations, slots, activeSessions, todayRevenue] = await Promise.all([
      prisma.user.count(),
      prisma.parkingLocation.count(),
      prisma.parkingSlot.groupBy({ by: ["status"], _count: true }),
      prisma.parkingSession.count({ where: { status: "ACTIVE" } }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: "PAID", paidAt: { gte: startOfToday } },
      }),
    ]);

    const totalSlots = slots.reduce((n, s) => n + s._count, 0);
    const availableSlots = slots.find((s) => s.status === "AVAILABLE")?._count ?? 0;

    res.json({
      success: true,
      data: {
        totalUsers,
        totalLocations,
        totalSlots,
        availableSlots,
        activeSessions,
        todayRevenue: todayRevenue._sum.amount ?? 0,
      },
    });
  } catch (e) {
    next(e);
  }
});
