import { Router } from "express";
import { prisma } from "../prisma.js";
import { jukirSettlement, reconciliation } from "../lib/business.js";

export const reportsRouter = Router();

// GET /api/reports/summary — headline revenue & transaksi.
reportsRouter.get("/summary", async (_req, res, next) => {
  try {
    const [totalRevenue, totalTransactions, activeTransactions, cashRevenue, qrisRevenue] = await Promise.all([
      prisma.transaction.aggregate({ _sum: { amount: true }, where: { status: "COMPLETED" } }),
      prisma.transaction.count(),
      prisma.transaction.count({ where: { status: "ACTIVE" } }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { status: "COMPLETED", paymentMethod: "CASH" },
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { status: "COMPLETED", paymentMethod: "QRIS" },
      }),
    ]);
    res.json({
      success: true,
      data: {
        totalRevenue: totalRevenue._sum.amount ?? 0,
        totalTransactions,
        activeTransactions,
        cashRevenue: cashRevenue._sum.amount ?? 0,
        qrisRevenue: qrisRevenue._sum.amount ?? 0,
      },
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/reports/revenue?days=7 — pendapatan harian (CASH & QRIS) untuk N hari terakhir.
reportsRouter.get("/revenue", async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const txs = await prisma.transaction.findMany({
      where: { status: "COMPLETED", paidAt: { gte: start } },
      select: { amount: true, paidAt: true, paymentMethod: true },
    });

    // Bucket per hari, pisah cash & qris.
    const buckets = new Map<string, { cash: number; qris: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      buckets.set(d.toISOString().slice(0, 10), { cash: 0, qris: 0 });
    }
    for (const t of txs) {
      if (!t.paidAt) continue;
      const key = t.paidAt.toISOString().slice(0, 10);
      const b = buckets.get(key);
      if (b) {
        if (t.paymentMethod === "QRIS") b.qris += t.amount ?? 0;
        else b.cash += t.amount ?? 0;
      }
    }

    const data = [...buckets.entries()].map(([date, v]) => ({
      date,
      cash: v.cash,
      qris: v.qris,
      total: v.cash + v.qris,
    }));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// GET /api/reports/jukir-settlement — perhitungan setoran jukir.
reportsRouter.get("/jukir-settlement", async (_req, res, next) => {
  try {
    const data = await jukirSettlement();
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// GET /api/reports/reconciliation — bandingkan transaksi aktif vs deteksi CV.
reportsRouter.get("/reconciliation", async (_req, res, next) => {
  try {
    const data = await reconciliation();
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});
