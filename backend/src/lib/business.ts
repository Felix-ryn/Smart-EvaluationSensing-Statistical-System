// Logika bisnis inti Smart Parking (Area/Zone based):
// kapasitas tersedia, perhitungan setoran jukir, dan rekonsiliasi.

import { prisma } from "../prisma.js";
import type { ParkingRules } from "./fee.js";

export interface MouSummary {
  taxPercent: number;
  operatorPercent: number;
  jukirSharePercent: number;
  // Parking rates by vehicle type
  rates: {
    motorcycle: ParkingRules;
    car: ParkingRules;
  };
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
    jukirSharePercent: rule?.jukirSharePercent ?? 15,
    rates: {
      motorcycle: {
        firstHour: rule?.firstHour_motorcycle ?? 2000,
        nextHour: rule?.nextHour_motorcycle ?? 1000,
        maximumDaily: rule?.maximumDaily_motorcycle ?? 10000,
      },
      car: {
        firstHour: rule?.firstHour_car ?? 3000,
        nextHour: rule?.nextHour_car ?? 1500,
        maximumDaily: rule?.maximumDaily_car ?? 15000,
      },
    },
  };
}

/** Convert MouSummary rates to ParkingRules berdasarkan vehicle type */
export function mouToParkingRules(mou: MouSummary, vehicleType: "motorcycle" | "car"): ParkingRules {
  return mou.rates[vehicleType];
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
    const cvNormal = lastDetection?.normalCount ?? 0;
    const cvViolation = lastDetection?.violationCount ?? 0;
    const difference = cvNormal - active;
    return {
      areaId: area.id,
      name: area.name,
      capacity: area.capacity,
      activeTransactions: active,
      cvDetected: cvNormal,
      cvViolation,
      difference,
      needsReview: difference !== 0,
      lastDetectedAt: lastDetection?.detectedAt ?? null,
    };
  });
}

/** Ringkasan monitoring: data availability, scan status per area. */
export async function reconciliationSummary() {
  const [
    totalAreas,
    areasWithScan,
    totalActiveTransactions,
    txWithoutPlate,
    recentScans,
  ] = await Promise.all([
    prisma.parkingArea.count(),
    prisma.parkingArea.count({
      where: { detections: { some: {} } },
    }),
    prisma.transaction.count({ where: { status: "ACTIVE" } }),
    prisma.transaction.count({
      where: { status: "ACTIVE", plateNumber: null },
    }),
    prisma.cvDetection.findMany({
      distinct: ["areaId"],
      orderBy: { detectedAt: "desc" },
      take: 100,
      select: { areaId: true, detectedAt: true },
    }),
  ]);

  const areasScanStatus = await prisma.parkingArea.findMany({
    select: {
      id: true,
      name: true,
      detections: {
        orderBy: { detectedAt: "desc" },
        take: 1,
        select: { detectedAt: true },
      },
    },
  });

  return {
    totalAreas,
    areasWithCvScan: areasWithScan,
    areasWithoutScan: totalAreas - areasWithScan,
    totalActiveTransactions,
    transactionsWithoutPlate: txWithoutPlate,
    areasCvStatus: areasScanStatus.map((a) => ({
      areaId: a.id,
      areaName: a.name,
      lastScanAt: a.detections[0]?.detectedAt ?? null,
      hasBeenScanned: a.detections.length > 0,
    })),
  };
}

/** Detail transaksi aktif per area untuk monitoring. */
export async function activeTransactionsByArea(areaId?: string) {
  const where = areaId ? { status: "ACTIVE" as const, areaId } : { status: "ACTIVE" as const };
  
  const transactions = await prisma.transaction.findMany({
    where,
    select: {
      id: true,
      transactionCode: true,
      areaId: true,
      area: { select: { name: true } },
      jukir: { select: { name: true } },
      vehicleType: true,
      plateNumber: true,
      checkIn: true,
      createdAt: true,
    },
    orderBy: { checkIn: "desc" },
  });

  return transactions.map((tx) => ({
    id: tx.id,
    transactionCode: tx.transactionCode,
    areaId: tx.areaId,
    areaName: tx.area.name,
    jukirName: tx.jukir?.name ?? "—",
    vehicleType: tx.vehicleType,
    plateNumber: tx.plateNumber ?? null,
    checkInTime: tx.checkIn,
    createdAt: tx.createdAt,
    hasPlateData: !!tx.plateNumber,
  }));
}
