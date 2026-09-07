import { Router } from "express";
import { prisma } from "../prisma.js";

export const reportsRouter = Router();

// GET /api/reports/summary — headline revenue & session metrics.
reportsRouter.get("/summary", async (_req, res, next) => {
  try {
    const [revenue, totalSessions, activeSessions, completed] = await Promise.all([
      prisma.payment.aggregate({ _sum: { amount: true }, where: { status: "PAID" } }),
      prisma.parkingSession.count(),
      prisma.parkingSession.count({ where: { status: "ACTIVE" } }),
      prisma.parkingSession.aggregate({
        _avg: { durationMinutes: true },
        where: { status: "COMPLETED" },
      }),
    ]);
    res.json({
      success: true,
      data: {
        totalRevenue: revenue._sum.amount ?? 0,
        totalSessions,
        activeSessions,
        avgDurationMinutes: Math.round(completed._avg.durationMinutes ?? 0),
      },
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/reports/revenue?days=7 — daily PAID revenue for the last N days.
reportsRouter.get("/revenue", async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const payments = await prisma.payment.findMany({
      where: { status: "PAID", paidAt: { gte: start } },
      select: { amount: true, paidAt: true },
    });

    // Bucket into per-day totals, filling empty days with 0 so the chart is continuous.
    const buckets = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const p of payments) {
      if (!p.paidAt) continue;
      const key = p.paidAt.toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, buckets.get(key)! + p.amount);
    }

    const data = [...buckets.entries()].map(([date, amount]) => ({ date, amount }));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});
