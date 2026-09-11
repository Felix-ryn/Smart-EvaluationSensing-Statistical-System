import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { calculateParkingFee, type ParkingRules } from "../lib/fee.js";
import { getActiveMou } from "../lib/business.js";

export const transactionsRouter = Router();

// Aturan tarif default (bisa diganti nanti lewat config/MOU bila perlu).
const DEFAULT_RULES: ParkingRules = { firstHour: 2000, nextHour: 1000, maximumDaily: 10000 };

const checkInSchema = z.object({
  areaId: z.string().min(1),
  jukirId: z.string().optional(),
});

const paySchema = z.object({
  paymentMethod: z.enum(["CASH", "QRIS"]),
});

// Helper: generate Transaction ID unik "PARK-XXXXX".
async function nextCode(): Promise<string> {
  const last = await prisma.transaction.findFirst({
    orderBy: { transactionCode: "desc" },
    select: { transactionCode: true },
  });
  const num = last ? parseInt(last.transactionCode.replace(/\D/g, ""), 10) || 0 : 0;
  return `PARK-${String(num + 1).padStart(5, "0")}`;
}

// POST /api/transactions — kendaraan masuk (buat transaksi aktif).
transactionsRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const { areaId, jukirId } = checkInSchema.parse(req.body);
    const area = await prisma.parkingArea.findUnique({ where: { id: areaId } });
    if (!area) {
      return res.status(404).json({ success: false, message: "Area tidak ditemukan", code: "NOT_FOUND" });
    }
    const transactionCode = await nextCode();
    const tx = await prisma.transaction.create({
      data: { transactionCode, areaId, jukirId: jukirId ?? null },
    });
    res.status(201).json({ success: true, data: tx });
  } catch (e) {
    next(e);
  }
});

// GET /api/transactions/:code — cari transaksi via Transaction ID (untuk QR).
transactionsRouter.get("/:code", async (req, res, next) => {
  try {
    const tx = await prisma.transaction.findUnique({
      where: { transactionCode: req.params.code },
      include: { area: { select: { name: true } }, jukir: { select: { name: true } } },
    });
    if (!tx) {
      return res.status(404).json({ success: false, message: "Transaksi tidak ditemukan", code: "NOT_FOUND" });
    }
    res.json({ success: true, data: tx });
  } catch (e) {
    next(e);
  }
});

// GET /api/transactions — list transaksi (filter area/status opsional).
transactionsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const { areaId, status } = req.query as { areaId?: string; status?: string };
    const data = await prisma.transaction.findMany({
      where: {
        ...(areaId ? { areaId } : {}),
        ...(status ? { status: status as "ACTIVE" | "COMPLETED" | "CANCELLED" } : {}),
      },
      include: { area: { select: { name: true } }, jukir: { select: { name: true } } },
      orderBy: { checkIn: "desc" },
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// POST /api/transactions/:id/checkout — kendaraan keluar + hitung tarif.
transactionsRouter.post("/:id/checkout", requireAuth, async (req, res, next) => {
  try {
    const tx = await prisma.transaction.findUnique({ where: { id: req.params.id } });
    if (!tx) {
      return res.status(404).json({ success: false, message: "Transaksi tidak ditemukan", code: "NOT_FOUND" });
    }
    if (tx.status !== "ACTIVE") {
      return res.status(400).json({ success: false, message: "Transaksi sudah ditutup", code: "ALREADY_CLOSED" });
    }
    const checkOut = new Date();
    const fee = calculateParkingFee(tx.checkIn, checkOut, DEFAULT_RULES);
    const updated = await prisma.transaction.update({
      where: { id: tx.id },
      data: { checkOut, durationMinutes: fee.durationMinutes, amount: fee.totalFee },
    });
    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
});

// POST /api/transactions/:id/pay — bayar (CASH / QRIS).
transactionsRouter.post("/:id/pay", requireAuth, async (req, res, next) => {
  try {
    const { paymentMethod } = paySchema.parse(req.body);
    const tx = await prisma.transaction.findUnique({ where: { id: req.params.id } });
    if (!tx) {
      return res.status(404).json({ success: false, message: "Transaksi tidak ditemukan", code: "NOT_FOUND" });
    }
    if (tx.amount == null) {
      return res.status(400).json({ success: false, message: "Checkout dulu sebelum bayar", code: "NO_AMOUNT" });
    }
    const updated = await prisma.transaction.update({
      where: { id: tx.id },
      data: { paymentMethod, paidAt: new Date(), status: "COMPLETED" },
    });
    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
});
