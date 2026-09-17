import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth, requireJukirOrAdmin, requireAdmin, requireJukir } from "../middleware/auth.js";
import { getActiveMou } from "../lib/business.js";

export const jukirRouter = Router();

// GET /api/jukir/stats/dashboard - Statistik cepat untuk dashboard Jurik
jukirRouter.get("/stats/dashboard", requireJukirOrAdmin, async (req, res, next) => {
  try {
    let whereClause: any = {};
    
    // Jukir hanya bisa lihat stats area mereka
    if (req.user?.role === "JUKIR" && req.user.areaId) {
      whereClause.areaId = req.user.areaId;
    } else if (req.query.areaId) {
      whereClause.areaId = req.query.areaId as string;
    }
    
    // Hitung hari ini
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    
    // Total transactions periode tertentu
    const [todayTransactions, allTodayTransactions] = await Promise.all([
      prisma.transaction.count({
        where: {
          ...whereClause,
          createdAt: { gte: todayStart, lt: todayEnd },
        }
      }),
      // Semua transaksi hari ini (untuk admin)
      prisma.transaction.count({
        where: {
          createdAt: { gte: todayStart, lt: todayEnd },
        }
      })
    ]);
    
    // Transaksi aktif
    const activeCount = await prisma.transaction.count({
      where: {
        ...whereClause,
        status: "ACTIVE",
      }
    });
    
    // Pendapatan hari ini (COMPLETED transactions)
    const completedToday = await prisma.transaction.findMany({
      where: {
        ...whereClause,
        status: "COMPLETED",
        paidAt: { gte: todayStart },
      },
      select: { amount: true },
    });
    
    const totalRevenue = completedToday.reduce((sum, t) => sum + (t.amount || 0), 0);
    
    res.json({
      success: true,
      data: {
        todayTransactions: todayTransactions,
        activeTransactions: activeCount,
        totalRevenue: totalRevenue,
        ...(req.user?.role === "ADMIN" ? {
          allAreaTodayTransactions: allTodayTransactions,
        } : {}),
      },
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/jukir/setoran/daily - Setoran harian auto-calculated
jukirRouter.get("/setoran/daily", requireJukirOrAdmin, async (req, res, next) => {
  try {
    const { date = new Date().toISOString().split("T")[0] } = req.query;
    const targetDate = new Date(date as string);
    const startDate = new Date(targetDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    
    let whereClause: any = {
      date: { gte: startDate, lt: endDate },
    };
    
    // Filter by jurik if accessing their own data
    if (req.user?.role === "JUKIR" && req.user.areaId) {
      whereClause.jukirId = req.user.id;
      whereClause.areaId = req.user.areaId;
    } else if (req.query.jukirId) {
      whereClause.jukirId = req.query.jukirId as string;
    }
    
    // Get or create daily setoran entry
    let setoran = await prisma.setoranEntry.findFirst({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });
    
    if (!setoran) {
      // Auto-calculate from today's transactions
      const dayTransactions = await prisma.transaction.findMany({
        where: {
          areaId: whereClause.areaId,
          status: "COMPLETED",
          paidAt: { gte: startDate, lt: endDate },
        },
        select: { amount: true, paymentMethod: true },
      });
      
      const grossAmount = dayTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
      const totalTransactions = dayTransactions.length;
      
      const mouRules = await getActiveMou();
      const taxPercent = mouRules.taxPercent || 10;
      const jukirSharePercent = mouRules.jukirSharePercent || 15;
      
      const taxAmount = Math.floor(grossAmount * (taxPercent / 100));
      const jukirShareAmount = Math.floor(grossAmount * (jukirSharePercent / 100));
      
      // Create new setoran entry
      setoran = await prisma.setoranEntry.create({
        data: {
          jukirId: whereClause.jukirId || "",
          areaId: whereClause.areaId || "",
          date: startDate,
          totalTransactions,
          grossAmount,
          taxPercent,
          taxAmount,
          jukirSharePercent,
          jukirShareAmount,
          status: "PENDING",
        },
      });
    }
    
    // Get breakdown by vehicle type if needed
    const breakdown = await prisma.transaction.groupBy({
      by: ["areaId"],
      where: {
        areaId: whereClause.areaId,
        status: "COMPLETED",
        paidAt: { gte: startDate, lt: endDate },
      },
      _count: { id: true },
      _sum: { amount: true },
    });
    
    res.json({
      success: true,
      data: {
        ...setoran,
        breakdown,
      },
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/jukir/setoran/submit - Submit setoran (confirmation step)
jukirRouter.post("/setoran/submit", requireJukir, async (req, res, next) => {
  try {
    const { date } = req.body;
    const todayStart = new Date(date || new Date());
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    
    // Get pending setoran for today
    const setoran = await prisma.setoranEntry.findFirst({
      where: {
        jukirId: req.user!.id,
        areaId: req.user!.areaId!,
        date: { gte: todayStart, lt: todayEnd },
        status: "PENDING",
      },
    });
    
    if (!setoran) {
      return res.status(404).json({ 
        success: false, 
        message: "Belum ada setoran yang perlu disubmit", 
        code: "NO_PENDING_SETORAN" 
      });
    }
    
    res.json({
      success: true,
      data: {
        message: "Setoran berhasil disubmit untuk approval admin",
        setoranId: setoran.id,
        confirmedAmount: setoran.jukirShareAmount,
      },
    });
  } catch (e) {
    next(e);
  }
});

// PUT /api/jukir/setoran/:id/approve - Approve/reject setoran (Admin only)
jukirRouter.put("/setoran/:id/approve", requireAdmin, async (req, res, next) => {
  try {
    const { status, note } = req.body;
    
    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: "Status harus APPROVED atau REJECTED", 
        code: "INVALID_STATUS" 
      });
    }
    
    const setoran = await prisma.setoranEntry.update({
      where: { id: req.params.id },
      data: {
        status,
        approvedAt: new Date(),
        approvedBy: req.user!.id,
        adminNote: note || null,
      },
    });
    
    res.json({
      success: true,
      data: setoran,
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/jukir/setoran/history - Riwayat setoran
jukirRouter.get("/setoran/history", requireJukirOrAdmin, async (req, res, next) => {
  try {
    let whereClause: any = {};
    
    if (req.user?.role === "JUKIR" && req.user.areaId) {
      whereClause.jukirId = req.user.id;
      whereClause.areaId = req.user.areaId;
    } else if (req.query.jukirId) {
      whereClause.jukirId = req.query.jukirId as string;
    }
    
    const { limit = 20, offset = 0 } = req.query as { limit?: number; offset?: number };
    
    const [entries, total] = await Promise.all([
      prisma.setoranEntry.findMany({
        where: whereClause,
        skip: Number(offset),
        take: Number(limit),
        include: {
          jukir: { select: { name: true, email: true } },
          area: { select: { name: true } },
          approvedByUser: { select: { name: true } },
        },
        orderBy: { date: "desc" },
      }),
      prisma.setoranEntry.count({ where: whereClause }),
    ]);
    
    res.json({
      success: true,
      data: entries,
      pagination: { total, limit: Number(limit), offset: Number(offset) },
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/jukir/live-traffic - Live traffic per area
jukirRouter.get("/live-traffic/:areaId", requireJukirOrAdmin, async (req, res, next) => {
  try {
    const areaId = req.params.areaId;
    
    // Ensure Jurik can only access their assigned area
    if (req.user?.role === "JUKIR" && req.user.areaId !== areaId) {
      return res.status(403).json({ 
        success: false, 
        message: "You can only view traffic for your assigned area", 
        code: "FORBIDDEN_AREA" 
      });
    }
    
    const area = await prisma.parkingArea.findUnique({
      where: { id: areaId },
      include: {
        transactions: {
          where: { status: "ACTIVE" },
          select: { checkIn: true },
        },
      },
    });
    
    if (!area) {
      return res.status(404).json({ success: false, message: "Area tidak ditemukan", code: "NOT_FOUND" });
    }
    
    const currentOccupancy = area.transactions.length;
    const emptySlots = Math.max(0, area.capacity - currentOccupancy);
    const occupancyRate = Math.round((currentOccupancy / area.capacity) * 100);
    
    // Get recent activity (last 10 transactions)
    const recentActivity = await prisma.transaction.findMany({
      where: { areaId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        transactionCode: true,
        checkIn: true,
        checkOut: true,
        status: true,
        amount: true,
        createdAt: true,
      },
    });
    
    res.json({
      success: true,
      data: {
        areaId: area.id,
        areaName: area.name,
        location: area.location,
        capacity: area.capacity,
        currentOccupancy,
        emptySlots,
        occupancyRate,
        vehicleType: area.vehicleType,
        recentActivity,
        lastUpdated: new Date(),
      },
    });
  } catch (e) {
    next(e);
  }
});

// POST /api/jukir/qris/generate - Generate QR code untuk transaksi
jukirRouter.post("/qris/generate", requireJukirOrAdmin, async (req, res, next) => {
  try {
    const { transactionId } = req.body;
    
    // Check if not admin, ensure transaction belongs to user's area
    if (req.user?.role === "JUKIR") {
      const tx = await prisma.transaction.findUnique({
        where: { id: transactionId },
        select: { areaId: true },
      });
      
      if (!tx || tx.areaId !== req.user.areaId) {
        return res.status(403).json({ 
          success: false, 
          message: "You can only generate QR for your assigned area", 
          code: "FORBIDDEN_AREA" 
        });
      }
    }
    
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { area: { select: { name: true } } },
    });
    
    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaksi tidak ditemukan", code: "NOT_FOUND" });
    }
    
    if (!transaction.amount || transaction.status !== "ACTIVE") {
      return res.status(400).json({ 
        success: false, 
        message: "Checkout dulu sebelum generate QRIS", 
        code: "NO_AMOUNT" 
      });
    }
    
    // TODO: Integrate dengan payment gateway QRIS provider
    // For now, return mock QR data
    const qrData = {
      transactionId,
      transactionCode: transaction.transactionCode,
      amount: transaction.amount,
      merchantId: "SMARTPARKING001",
      qrCodeUrl: `/api/qris/mock/${transaction.id}`, // Placeholder
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 menit
    };
    
    res.json({
      success: true,
      data: qrData,
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/jukir/qris/status/:transactionId - Cek status pembayaran
jukirRouter.get("/qris/status/:transactionId", requireJukirOrAdmin, async (req, res, next) => {
  try {
    const tx = await prisma.transaction.findUnique({
      where: { id: req.params.transactionId },
      select: {
        id: true,
        transactionCode: true,
        status: true,
        paymentMethod: true,
        paidAt: true,
        amount: true,
        updatedAt: true,
      },
    });
    
    if (!tx) {
      return res.status(404).json({ success: false, message: "Transaksi tidak ditemukan", code: "NOT_FOUND" });
    }
    
    res.json({
      success: true,
      data: {
        ...tx,
        isPaid: tx.status === "COMPLETED" && tx.paidAt !== null,
        paymentTime: tx.paidAt ? new Date(tx.paidAt) : null,
      },
    });
  } catch (e) {
    next(e);
  }
});
