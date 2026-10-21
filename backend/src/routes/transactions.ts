import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { calculateParkingFee } from "../lib/fee.js";
import { getActiveMou, mouToParkingRules } from "../lib/business.js";
import { isXenditEnabled } from "../services/xendit.js";

export const transactionsRouter = Router();

const checkInSchema = z.object({
  areaId: z.string().min(1).optional(),
  jukirId: z.string().optional(),
  vehicleType: z.enum(["motorcycle", "car"]).default("motorcycle"),
  plateNumber: z.string().trim().min(1).max(15).optional(),
});

const paySchema = z.object({
  paymentMethod: z.enum(["CASH", "QRIS"]),
});

// Helper: generate Transaction ID unik "PARK-XXXXX".
// NOTE: jangan pakai orderBy string desc karena saat kode > 5 digit bisa salah urut lexical.
async function nextCode(): Promise<string> {
  const allCodes = await prisma.transaction.findMany({
    select: { transactionCode: true },
  });

  const maxNumber = allCodes.reduce((max, row) => {
    const parsed = Number.parseInt(row.transactionCode.replace(/\D/g, ""), 10);
    if (Number.isNaN(parsed)) return max;
    return parsed > max ? parsed : max;
  }, 0);

  return `PARK-${String(maxNumber + 1).padStart(5, "0")}`;
}

async function createTransactionWithRetry(data: {
  areaId: string;
  jukirId: string | null;
  vehicleType: "motorcycle" | "car";
  plateNumber: string | null;
}) {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const transactionCode = await nextCode();

    try {
      return await prisma.transaction.create({
        data: {
          transactionCode,
          areaId: data.areaId,
          jukirId: data.jukirId,
          vehicleType: data.vehicleType,
          plateNumber: data.plateNumber,
        },
        include: {
          area: { select: { name: true } },
          jukir: { select: { name: true, email: true } },
        },
      });
    } catch (error: any) {
      const target = error?.meta?.target;
      const targetHasTransactionCode = Array.isArray(target)
        ? target.includes("transactionCode")
        : typeof target === "string"
          ? target.includes("transactionCode")
          : false;

      const isUniqueCodeCollision = error?.code === "P2002" && targetHasTransactionCode;

      if (!isUniqueCodeCollision || attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw new Error("Failed to generate unique transaction code");
}

// POST /api/transactions — kendaraan masuk (buat transaksi aktif).
// Accessible by ADMIN and JUkir only
transactionsRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const { areaId, jukirId, vehicleType, plateNumber } = checkInSchema.parse(req.body);

    const effectiveAreaId =
      req.user?.role === "JUKIR"
        ? req.user.areaId
        : areaId;

    const effectiveJukirId =
      req.user?.role === "JUKIR"
        ? req.user.id
        : (jukirId ?? null);

    if (!effectiveAreaId) {
      return res.status(400).json({
        success: false,
        message: "Area wajib diisi",
        code: "AREA_REQUIRED",
      });
    }

    const area = await prisma.parkingArea.findUnique({ where: { id: effectiveAreaId } });
    if (!area) {
      return res.status(404).json({ success: false, message: "Area tidak ditemukan", code: "NOT_FOUND" });
    }
    
    // If not admin, ensure user is assigned to this area
    if (req.user?.role === "JUKIR" && req.user.areaId !== effectiveAreaId) {
      return res.status(403).json({ 
        success: false, 
        message: "You can only create transactions for your assigned area", 
        code: "FORBIDDEN_AREA" 
      });
    }
    
    const tx = await createTransactionWithRetry({
      areaId: effectiveAreaId,
      jukirId: effectiveJukirId,
      vehicleType,
      plateNumber: plateNumber ? plateNumber.toUpperCase() : null,
    });
    res.status(201).json({ success: true, data: tx });
  } catch (e) {
    next(e);
  }
});

// GET /api/transactions/:code — cari transaksi via Transaction ID (untuk QR).
transactionsRouter.get("/:code", requireAuth, async (req, res, next) => {
  try {
    const tx = await prisma.transaction.findUnique({
      where: { transactionCode: req.params.code },
      include: { area: { select: { name: true } }, jukir: { select: { name: true } } },
    });
    if (!tx) {
      return res.status(404).json({ success: false, message: "Transaksi tidak ditemukan", code: "NOT_FOUND" });
    }

    // Jukir only allowed to access transaction in assigned area
    if (req.user?.role === "JUKIR") {
      if (!req.user.areaId) {
        return res.status(403).json({
          success: false,
          message: "Jukir must be assigned an area first",
          code: "AREA_REQUIRED",
        });
      }

      if (tx.areaId !== req.user.areaId) {
        return res.status(403).json({
          success: false,
          message: "You can only access transactions in your assigned area",
          code: "FORBIDDEN_AREA",
        });
      }
    }

    // Regular user only allowed to access own transaction
    if (req.user?.role === "USER" && tx.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only access your own transactions",
        code: "FORBIDDEN",
      });
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
    
    // Filter by role: Jukir WAJIB area assignment dan hanya bisa lihat area sendiri
    if (req.user?.role === "JUKIR") {
      if (!req.user.areaId) {
        return res.status(403).json({
          success: false,
          message: "Jukir must be assigned an area first",
          code: "AREA_REQUIRED",
        });
      }
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
    
    // NEW: Fetch active MouRule (includes tarif by vehicle type)
    const mou = await getActiveMou();
    const vehicleType = (tx.vehicleType as "motorcycle" | "car") || "motorcycle";
    const rules = mouToParkingRules(mou, vehicleType);
    
    const checkOut = new Date();
    const fee = calculateParkingFee(tx.checkIn, checkOut, rules);
    const updated = await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        checkOut,
        durationMinutes: fee.durationMinutes,
        amount: fee.totalFee,
        ...(req.user?.role === "JUKIR" && !tx.jukirId ? { jukirId: req.user.id } : {}),
      },
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

    if (paymentMethod === "QRIS" && isXenditEnabled()) {
      const latestQrisPayment = await prisma.qrisPayment.findFirst({
        where: { transactionId: tx.id },
        orderBy: { createdAt: "desc" },
        select: { status: true },
      });

      if (!latestQrisPayment || latestQrisPayment.status !== "PAID") {
        return res.status(400).json({
          success: false,
          message: "Pembayaran QRIS belum diterima gateway. Tunggu webhook/payment status PAID.",
          code: "QRIS_NOT_PAID",
        });
      }
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
      data: {
        paymentMethod,
        paidAt: new Date(),
        status: "COMPLETED",
        ...(req.user?.role === "JUKIR" && !tx.jukirId ? { jukirId: req.user.id } : {}),
      },
    });
    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
});
