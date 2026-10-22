import { Router } from "express";
import { prisma } from "../prisma.js";
import { jukirSettlement, reconciliation } from "../lib/business.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

export const reportsRouter = Router();

// GET /api/reports/cash-qris — pendapatan CASH vs QRIS per hari, filter area & jukir.
reportsRouter.get("/cash-qris", requireAuth, async (req, res, next) => {
  try {
    const role = req.user?.role;
    if (role !== "ADMIN" && role !== "JUKIR") {
      return res.status(403).json({ success: false, message: "Forbidden", code: "FORBIDDEN" });
    }

    const dateRaw = String(req.query.date ?? new Date().toISOString().slice(0, 10));
    const startDate = new Date(`${dateRaw}T00:00:00.000Z`);
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 1);

    const areaId = (req.query.areaId as string | undefined) ?? undefined;
    const jukirId = (req.query.jukirId as string | undefined) ?? undefined;

    const where: any = {
      status: "COMPLETED",
      amount: { not: null },
      paidAt: { gte: startDate, lt: endDate },
    };

    if (role === "JUKIR") {
      if (!req.user?.areaId) {
        return res.status(400).json({ success: false, message: "Jukir belum punya area", code: "AREA_REQUIRED" });
      }
      where.areaId = req.user.areaId;
      where.jukirId = req.user.id;
    } else {
      if (areaId) where.areaId = areaId;
      if (jukirId) where.jukirId = jukirId;
    }

    const txs = await prisma.transaction.findMany({
      where,
      select: { amount: true, paymentMethod: true },
    });

    const cash = txs.filter((t) => t.paymentMethod === "CASH").reduce((s, t) => s + (t.amount ?? 0), 0);
    const qris = txs.filter((t) => t.paymentMethod === "QRIS").reduce((s, t) => s + (t.amount ?? 0), 0);

    res.json({
      success: true,
      data: {
        date: dateRaw,
        cash,
        qris,
        total: cash + qris,
        transactions: txs.length,
      },
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/reports/summary — headline revenue & transaksi.
reportsRouter.get("/summary", requireAdmin, async (_req, res, next) => {
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
reportsRouter.get("/revenue", requireAdmin, async (req, res, next) => {
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
reportsRouter.get("/jukir-settlement", requireAdmin, async (_req, res, next) => {
  try {
    const data = await jukirSettlement();
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// GET /api/reports/reconciliation — bandingkan transaksi aktif vs deteksi CV.
reportsRouter.get("/reconciliation", requireAdmin, async (_req, res, next) => {
  try {
    const data = await reconciliation();
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});
