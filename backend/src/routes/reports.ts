import { Router } from "express";
import { prisma } from "../prisma.js";
import { jukirSettlement, reconciliation, reconciliationSummary, activeTransactionsByArea } from "../lib/business.js";
import { parseReportFilters, ReportFilterError } from "../lib/reportFilters.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

function areaWhere(areaIds: string[]) {
  return areaIds.length ? { areaId: { in: areaIds } } : {};
}

function paidAtWhere(from?: Date, to?: Date) {
  return from || to
    ? { paidAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
    : {};
}

function checkInWhere(from?: Date, to?: Date) {
  return from || to
    ? { checkIn: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
    : {};
}

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

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
reportsRouter.get("/summary", requireAdmin, async (req, res, next) => {
  try {
    const { from, to, areaIds } = parseReportFilters(req.query);
    const completedWhere = {
      status: "COMPLETED" as const,
      ...areaWhere(areaIds),
      ...paidAtWhere(from, to),
    };
    const activeWhere = {
      status: "ACTIVE" as const,
      ...areaWhere(areaIds),
      ...checkInWhere(from, to),
    };

    const [totalRevenue, totalTransactions, activeTransactions, cashRevenue, qrisRevenue] = await Promise.all([
      prisma.transaction.aggregate({ _sum: { amount: true }, where: completedWhere }),
      prisma.transaction.count({ where: completedWhere }),
      prisma.transaction.count({ where: activeWhere }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { ...completedWhere, paymentMethod: "CASH" },
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { ...completedWhere, paymentMethod: "QRIS" },
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
    if (e instanceof ReportFilterError) {
      return res.status(400).json({ success: false, message: e.message, code: "INVALID_DATE_RANGE" });
    }
    next(e);
  }
});

// GET /api/reports/revenue?days=7 — pendapatan harian (CASH & QRIS).
// Mendukung filter area & rentang tanggal (fromDate/toDate) untuk mengganti "days".
reportsRouter.get("/revenue", requireAdmin, async (req, res, next) => {
  try {
    const { from, to, areaIds } = parseReportFilters(req.query);

    let start: Date;
    let end: Date;
    if (from || to) {
      start = from ?? startOfDay(new Date());
      end = to ?? addDays(start, 1);
    } else {
      const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
      start = startOfDay(new Date());
      start.setDate(start.getDate() - (days - 1));
      end = addDays(startOfDay(new Date()), 1);
    }

    const txs = await prisma.transaction.findMany({
      where: {
        status: "COMPLETED",
        paidAt: { gte: start, lt: end },
        ...areaWhere(areaIds),
      },
      select: { amount: true, paidAt: true, paymentMethod: true },
    });

    // Bucket per hari, pisah cash & qris.
    const buckets = new Map<string, { cash: number; qris: number }>();
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      buckets.set(localDayKey(d), { cash: 0, qris: 0 });
    }
    for (const t of txs) {
      if (!t.paidAt) continue;
      const key = localDayKey(t.paidAt);
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
    if (e instanceof ReportFilterError) {
      return res.status(400).json({ success: false, message: e.message, code: "INVALID_DATE_RANGE" });
    }
    next(e);
  }
});

// GET /api/reports/jukir-settlement — perhitungan setoran jukir.
reportsRouter.get("/jukir-settlement", requireAdmin, async (req, res, next) => {
  try {
    const { from, to, areaIds } = parseReportFilters(req.query);
    const data = await jukirSettlement({ from, to, areaIds });
    res.json({ success: true, data });
  } catch (e) {
    if (e instanceof ReportFilterError) {
      return res.status(400).json({ success: false, message: e.message, code: "INVALID_DATE_RANGE" });
    }
    next(e);
  }
});

// GET /api/reports/reconciliation — bandingkan transaksi aktif vs deteksi CV per area.
reportsRouter.get("/reconciliation", requireAdmin, async (_req, res, next) => {
  try {
    const data = await reconciliation();
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// GET /api/reports/reconciliation/summary — ringkasan monitoring: data availability, scan status.
reportsRouter.get("/reconciliation/summary", requireAdmin, async (_req, res, next) => {
  try {
    const data = await reconciliationSummary();
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// GET /api/reports/reconciliation/active-transactions?areaId=xyz — detail transaksi aktif per area.
reportsRouter.get("/reconciliation/active-transactions", requireAdmin, async (req, res, next) => {
  try {
    const areaId = (req.query.areaId as string) || undefined;
    const data = await activeTransactionsByArea(areaId);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});
