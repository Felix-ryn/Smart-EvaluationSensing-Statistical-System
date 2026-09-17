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
// Accessible by ADMIN and JUkir only
transactionsRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const { areaId, jukirId } = checkInSchema.parse(req.body);
    const area = await prisma.parkingArea.findUnique({ where: { id: areaId } });
    if (!area) {
      return res.status(404).json({ success: false, message: "Area tidak ditemukan", code: "NOT_FOUND" });
    }
    
    // If not admin, ensure user is assigned to this area
    if (req.user?.role === "JUKIR" && req.user.areaId !== areaId) {
      return res.status(403).json({ 
        success: false, 
        message: "You can only create transactions for your assigned area", 
        code: "FORBIDDEN_AREA" 
      });
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
// Different views based on role
transactionsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const { areaId, status } = req.query as { areaId?: string; status?: string };
    
    let whereClause = {};
    
    // Filter by role: Jukir hanya bisa lihat transaksi di area mereka
    if (req.user?.role === "JUKIR" && req.user.areaId) {
      whereClause = { ...whereClause, areaId: req.user.areaId };
    } else if (areaId) {
      whereClause = { ...whereClause, areaId };
    }
    
    if (status) {
      whereClause = { ...whereClause, status: status as "ACTIVE" | "COMPLETED" | "CANCELLED" };
    }
    
    const data = await prisma.transaction.findMany({
      where: whereClause,
      include: { 
        area: { select: { name: true } }, 
        jukir: { select: { name: true, email: true } } 
      },
      orderBy: { checkIn: "desc" },
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// POST /api/transactions/:id/checkout — kendaraan keluar + hitung tarif.
// Accessible by ADMIN and Jukir
transactionsRouter.post("/:id/checkout", requireAuth, async (req, res, next) => {
  try {
    const tx = await prisma.transaction.findUnique({ 
      where: { id: req.params.id },
      include: { jukir: true }
    });
    if (!tx) {
      return res.status(404).json({ success: false, message: "Transaksi tidak ditemukan", code: "NOT_FOUND" });
    }
    if (tx.status !== "ACTIVE") {
      return res.status(400).json({ success: false, message: "Transaksi sudah ditutup", code: "ALREADY_CLOSED" });
    }
    
    // If not admin, ensure the transaction belongs to user's area
    if (req.user?.role === "JUKIR" && req.user.areaId !== tx.areaId) {
      return res.status(403).json({ 
        success: false, 
        message: "You can only checkout transactions in your assigned area", 
        code: "FORBIDDEN_AREA" 
      });
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
// Accessible by ADMIN, Jukir, or User (only own transactions)
transactionsRouter.post("/:id/pay", requireAuth, async (req, res, next) => {
  try {
    const { paymentMethod } = paySchema.parse(req.body);
    const tx = await prisma.transaction.findUnique({ 
      where: { id: req.params.id },
      include: { area: true }
    });
    if (!tx) {
      return res.status(404).json({ success: false, message: "Transaksi tidak ditemukan", code: "NOT_FOUND" });
    }
    if (tx.amount == null) {
      return res.status(400).json({ success: false, message: "Checkout dulu sebelum bayar", code: "NO_AMOUNT" });
    }
    
    // Users can only pay their own transactions
    if (req.user?.role === "USER" && (!tx.userId || tx.userId !== req.user.id)) {
      return res.status(403).json({ 
        success: false, 
        message: "You can only pay your own transactions", 
        code: "FORBIDDEN" 
      });
    }
    
    // If not admin, ensure the transaction belongs to user's area
    if (req.user?.role === "JUKIR" && req.user.areaId !== tx.areaId) {
      return res.status(403).json({ 
        success: false, 
        message: "You can only process payments for your assigned area", 
        code: "FORBIDDEN_AREA" 
      });
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
