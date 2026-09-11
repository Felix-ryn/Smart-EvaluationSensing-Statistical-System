// Logika bisnis inti Smart Parking (Area/Zone based):
// kapasitas tersedia, perhitungan setoran jukir, dan rekonsiliasi.

import { prisma } from "../prisma.js";

export interface MouSummary {
  taxPercent: number;
  operatorPercent: number;
}

/** Ambil aturan MOU yang sedang berlaku (validFrom <= now <= validTo). */
export async function getActiveMou(): Promise<MouSummary> {
  const rule = await prisma.mouRule.findFirst({
    where: {
      validFrom: { lte: new Date() },
      OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
    },
    orderBy: { validFrom: "desc" },
  });
  return {
    taxPercent: rule?.taxPercent ?? 10,
    operatorPercent: rule?.operatorPercent ?? 0,
  };
}

/** Kapasitas tersedia sebuah area = capacity - jumlah transaksi aktif. */
export async function availableCapacity(areaId: string): Promise<number> {
  const area = await prisma.parkingArea.findUnique({ where: { id: areaId } });
  if (!area) return 0;
  const active = await prisma.transaction.count({ where: { areaId, status: "ACTIVE" } });
  return Math.max(0, area.capacity - active);
}

/** Hitung total pendapatan area (hanya transaksi COMPLETED yang sudah dibayar). */
export async function areaRevenue(areaId?: string): Promise<number> {
  const agg = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: { status: "COMPLETED", amount: { not: null }, ...(areaId ? { areaId } : {}) },
  });
  return agg._sum.amount ?? 0;
}

/**
 * Setoran jukir (default MOU: pajak % dari revenue, sisa cash disetor).
 * kewajiban = taxPercent% x total revenue
 * setoranJukir = kewajiban - total yang sudah tercatat dari QRIS
 * (sisa yang harus diselesaikan/disetorkan dari transaksi cash)
 */
export async function jukirSettlement() {
  const mou = await getActiveMou();
  const totals = await prisma.transaction.groupBy({
    by: ["paymentMethod"],
    where: { status: "COMPLETED", amount: { not: null } },
    _sum: { amount: true },
  });

  const cash = totals.find((t) => t.paymentMethod === "CASH")?._sum.amount ?? 0;
  const qris = totals.find((t) => t.paymentMethod === "QRIS")?._sum.amount ?? 0;
  const totalRevenue = cash + qris;

  const taxAmount = Math.round((mou.taxPercent / 100) * totalRevenue);
  // Sisa yang harus disetor dari cash setelah dikurangi QRIS tercatat.
  const settlementFromCash = Math.max(0, taxAmount - qris);

  return {
    mou,
    totalRevenue,
    cash,
    qris,
    taxAmount,
    settlementFromCash,
  };
}

/** Rekonsiliasi: bandingkan transaksi aktif vs hasil deteksi CV per area. */
export async function reconciliation() {
  const areas = await prisma.parkingArea.findMany({
    include: {
      _count: { select: { transactions: true } },
      transactions: { where: { status: "ACTIVE" }, select: { id: true } },
      detections: { orderBy: { detectedAt: "desc" }, take: 1 },
    },
  });

  return areas.map((area) => {
    const active = area.transactions.length;
    const lastDetection = area.detections[0];
    const cvOccupied = lastDetection?.occupiedCount ?? 0;
    const difference = cvOccupied - active;
    return {
      areaId: area.id,
      name: area.name,
      capacity: area.capacity,
      activeTransactions: active,
      cvDetected: cvOccupied,
      difference,
      // Tidak langsung menuduh; hanya early warning untuk pemeriksaan.
      needsReview: difference !== 0,
      lastDetectedAt: lastDetection?.detectedAt ?? null,
    };
  });
}
