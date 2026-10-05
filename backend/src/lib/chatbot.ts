import { prisma } from "../prisma.js";
import { calculateParkingFee, type ParkingRules } from "./fee.js";
import { getActiveMou, mouToParkingRules } from "./business.js";

export type Intent = "hitung-tarif" | "tarif" | "violations" | "areas" | "help" | "unknown";

export interface ChatMessage {
  type: "user" | "bot";
  content: string;
  data?: Record<string, unknown>;
}

interface ChatResponse {
  message: string;
  intent: Intent;
  data?: Record<string, unknown>;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/** Parse duration: "3 jam", "2 jam 30 menit", "3h 30m" → { hours, minutes } */
function parseDuration(input: string): { hours: number; minutes: number } {
  const hourMatch = input.match(/(\d+)\s*(?:jam|j|h|hour|hrs?)/i);
  const minMatch = input.match(/(\d+)\s*(?:menit|min|m)(?!\s*jam)/i);

  const hours = hourMatch ? parseInt(hourMatch[1], 10) : 1;
  const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;

  return { hours: Math.max(1, hours), minutes: Math.max(0, minutes) };
}

/** Parse vehicle type: "mobil", "motor", "car", "motorcycle" */
function parseVehicleType(input: string): "motorcycle" | "car" {
  const lower = input.toLowerCase();
  if (lower.includes("mobil") || lower.includes("car")) return "car";
  return "motorcycle";
}

/** Check user transaction history */
async function checkUserTransactionHistory(userId: string): Promise<{
  hasHistory: boolean;
  totalTransactions: number;
  totalAmount: number;
  avgFee: number;
}> {
  const transactions = await prisma.transaction.findMany({
    where: { userId, status: "COMPLETED" },
    select: { amount: true },
  });

  const totalAmount = transactions.reduce((sum, t) => sum + (t.amount ?? 0), 0);

  return {
    hasHistory: transactions.length > 0,
    totalTransactions: transactions.length,
    totalAmount,
    avgFee: transactions.length > 0 ? Math.round(totalAmount / transactions.length) : 0,
  };
}

/** Format time for display: HH:mm */
function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

// ============================================
// INTENT DETECTION
// ============================================

function detectIntent(input: string): Intent {
  const lower = input.toLowerCase();

  // Priority 1: Hitung Tarif - must have duration + fare keywords
  const hasDuration = /\d+\s*(?:jam|j|h|menit|m)/i.test(lower);
  const hasFareKeyword = /berapa|harga|bayar|tarif|biaya|fee|estimasi|kira.kira/i.test(lower);

  if (hasDuration && hasFareKeyword) {
    return "hitung-tarif";
  }

  // Priority 2: General tarif query (history)
  if (
    lower.includes("tarif") ||
    lower.includes("bayar") ||
    lower.includes("biaya") ||
    lower.includes("harga") ||
    lower.includes("fee") ||
    lower.includes("rp")
  ) {
    return "tarif";
  }

  // Priority 3: Violations
  if (
    lower.includes("pelanggaran") ||
    lower.includes("violation") ||
    lower.includes("illegal") ||
    lower.includes("melanggar") ||
    lower.includes("denda")
  ) {
    return "violations";
  }

  // Priority 4: Areas
  if (
    lower.includes("area") ||
    lower.includes("lokasi") ||
    lower.includes("tempat parkir") ||
    lower.includes("kapasitas") ||
    lower.includes("dimana") ||
    lower.includes("lokasi mana") ||
    lower.includes("parkir dimana")
  ) {
    return "areas";
  }

  // Priority 5: Help
  if (
    lower.includes("bantuan") ||
    lower.includes("help") ||
    lower.includes("apa saja") ||
    lower.includes("bisa tanya apa")
  ) {
    return "help";
  }

  return "unknown";
}

// ============================================
// RESPONSE FORMATTERS
// ============================================

function formatEstimateFirstTime(
  vehicleType: string,
  hours: number,
  minutes: number,
  feeResult: { durationMinutes: number; durationLabel: string; baseFee: number; totalFee: number },
  rules: ParkingRules,
): string {
  const durationText = hours > 0 ? `${hours} jam${minutes > 0 ? ` ${minutes} menit` : ""}` : `${minutes} menit`;
  const vehicleLabel = vehicleType === "car" ? "mobil" : "motor";

  let ratesBreakdown = `• Jam 1: Rp ${rules.firstHour.toLocaleString("id-ID")} (tarif dasar)`;
  if (hours > 1) {
    ratesBreakdown += `\n• Jam 2-${hours}: Rp ${rules.nextHour.toLocaleString("id-ID")}/jam`;
  }
  if (minutes > 0 && hours === 0) {
    ratesBreakdown = `• ${minutes} menit: Rp ${rules.firstHour.toLocaleString("id-ID")} (dibulatkan 1 jam)`;
  }

  return `Anda belum pernah parkir sebelumnya, jadi ini adalah estimasi tarif.

Untuk parkir ${durationText} ${vehicleLabel}:
**Tarif Estimasi: Rp ${feeResult.totalFee.toLocaleString("id-ID")}**

Breakdown:
${ratesBreakdown}
Total: Rp ${feeResult.totalFee.toLocaleString("id-ID")} (max Rp ${rules.maximumDaily.toLocaleString("id-ID")}/hari)

Siap untuk mulai parkir? Kunjungi halaman 'Cari Parkir' untuk memilih area parkir!`;
}

function formatEstimateWithHistory(
  vehicleType: string,
  hours: number,
  minutes: number,
  feeResult: { durationMinutes: number; durationLabel: string; baseFee: number; totalFee: number },
  history: { totalTransactions: number; totalAmount: number; avgFee: number },
  rules: ParkingRules,
): string {
  const durationText = hours > 0 ? `${hours} jam${minutes > 0 ? ` ${minutes} menit` : ""}` : `${minutes} menit`;
  const vehicleLabel = vehicleType === "car" ? "mobil" : "motor";

  let ratesBreakdown = `• Jam 1: Rp ${rules.firstHour.toLocaleString("id-ID")} (tarif dasar)`;
  if (hours > 1) {
    ratesBreakdown += `\n• Jam 2-${hours}: Rp ${rules.nextHour.toLocaleString("id-ID")}/jam`;
  }

  return `Berdasarkan riwayat parkir Anda, untuk parkir ${durationText} ${vehicleLabel}:
**Tarif Estimasi: Rp ${feeResult.totalFee.toLocaleString("id-ID")}**

Breakdown Tarif:
${ratesBreakdown}
Total: Rp ${feeResult.totalFee.toLocaleString("id-ID")}

Riwayat Parkir Anda:
• Total pembayaran: Rp ${history.totalAmount.toLocaleString("id-ID")}
• Rata-rata tarif: Rp ${history.avgFee.toLocaleString("id-ID")}
• Total transaksi: ${history.totalTransactions}

Siap lanjutkan parkir?`;
}

// ============================================
// QUERY HANDLERS
// ============================================

async function handleTarifEstimateQuery(input: string, userId: string): Promise<ChatResponse> {
  const { hours, minutes } = parseDuration(input);
  const vehicleType = parseVehicleType(input);

  // Fetch active MouRule with tarif
  const mou = await getActiveMou();
  const rules = mouToParkingRules(mou, vehicleType);

  // Calculate fee
  const checkInTime = new Date();
  const checkOutTime = new Date(checkInTime.getTime() + hours * 60 * 60 * 1000 + minutes * 60 * 1000);
  const feeResult = calculateParkingFee(checkInTime, checkOutTime, rules);

  // Check user history
  const history = await checkUserTransactionHistory(userId);

  // Format adaptive response
  const message = history.hasHistory
    ? formatEstimateWithHistory(vehicleType, hours, minutes, feeResult, history, rules)
    : formatEstimateFirstTime(vehicleType, hours, minutes, feeResult, rules);

  return {
    message,
    intent: "hitung-tarif",
    data: {
      feeResult,
      history: history.hasHistory ? history : undefined,
      rules,
      vehicleType,
      duration: { hours, minutes },
    },
  };
}

async function handleTarifQuery(input: string, userId: string): Promise<ChatResponse> {
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      status: "COMPLETED",
    },
    include: { area: { select: { name: true } } },
    orderBy: { paidAt: "desc" },
  });

  const totalAmount = transactions.reduce((sum, t) => sum + (t.amount ?? 0), 0);
  const avgFee = transactions.length > 0 ? Math.round(totalAmount / transactions.length) : 0;

  // Group by area for breakdown
  const areaBreakdown: Record<string, { count: number; total: number }> = {};
  for (const tx of transactions) {
    const areaName = tx.area?.name || "Area Unknown";
    if (!areaBreakdown[areaName]) {
      areaBreakdown[areaName] = { count: 0, total: 0 };
    }
    areaBreakdown[areaName].count++;
    areaBreakdown[areaName].total += tx.amount ?? 0;
  }

  const message =
    transactions.length === 0
      ? `Belum ada riwayat pembayaran parkir Anda.`
      : `Anda telah membayar **Rp ${totalAmount.toLocaleString("id-ID")}** untuk ${transactions.length} transaksi parkir. Rata-rata tarif: Rp ${avgFee.toLocaleString("id-ID")}.`;

  return {
    message,
    intent: "tarif",
    data: {
      totalAmount,
      transactionCount: transactions.length,
      avgFee,
      areaBreakdown,
      transactions: transactions.slice(0, 5), // latest 5
    },
  };
}

async function handleViolationsQuery(input: string, userId: string): Promise<ChatResponse> {
  const violations = await prisma.violation.findMany({
    where: { reportedById: userId },
    include: { area: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const validCount = violations.filter((v) => v.status === "VALID").length;
  const pendingCount = violations.filter((v) => v.status === "PENDING").length;
  const rejectedCount = violations.filter((v) => v.status === "REJECTED").length;

  // Group by type
  const typeBreakdown: Record<string, number> = {};
  for (const v of violations) {
    typeBreakdown[v.violationType] = (typeBreakdown[v.violationType] ?? 0) + 1;
  }

  // Group by area
  const areaBreakdown: Record<string, number> = {};
  for (const v of violations) {
    const areaName = v.area?.name || "Area Unknown";
    areaBreakdown[areaName] = (areaBreakdown[areaName] ?? 0) + 1;
  }

  let message =
    violations.length === 0
      ? "Selamat! Tidak ada laporan pelanggaran parkir dari Anda."
      : `Anda telah melaporkan **${violations.length}** pelanggaran parkir.`;

  if (violations.length > 0) {
    message += ` Status: ${validCount} valid, ${pendingCount} menunggu verifikasi, ${rejectedCount} ditolak.`;
  }

  return {
    message,
    intent: "violations",
    data: {
      totalViolations: violations.length,
      validCount,
      pendingCount,
      rejectedCount,
      typeBreakdown,
      areaBreakdown,
      violations: violations.slice(0, 5), // latest 5
    },
  };
}

async function handleAreasQuery(_input: string): Promise<ChatResponse> {
  const areas = await prisma.parkingArea.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  const message =
    areas.length === 0
      ? "Belum ada area parkir yang tersedia."
      : `Ada **${areas.length}** area parkir yang tersedia:\n\n` +
        areas
          .map((a) => `• **${a.name}** (${a.location}) - Kapasitas: ${a.capacity} kendaraan`)
          .join("\n");

  return {
    message,
    intent: "areas",
    data: {
      totalAreas: areas.length,
      areas: areas.map((a) => ({
        id: a.id,
        name: a.name,
        location: a.location,
        capacity: a.capacity,
        vehicleType: a.vehicleType,
      })),
    },
  };
}

// ============================================
// MAIN HANDLER
// ============================================

export async function handleChatQuery(userMessage: string, userId: string): Promise<ChatResponse> {
  const intent = detectIntent(userMessage);

  switch (intent) {
    case "hitung-tarif":
      return handleTarifEstimateQuery(userMessage, userId);
    case "tarif":
      return handleTarifQuery(userMessage, userId);
    case "violations":
      return handleViolationsQuery(userMessage, userId);
    case "areas":
      return handleAreasQuery(userMessage);
    case "help":
      return {
        message:
          "Saya dapat membantu Anda dengan:\n\n" +
          "• **Hitung Tarif Parkir** - Tanya estimasi tarif untuk durasi tertentu (misal: 3 jam motor bayar berapa?)\n" +
          "• **Riwayat Tarif Parkir** - Lihat total pembayaran dan breakdown per area\n" +
          "• **Pelanggaran Parkir** - Lihat riwayat pelanggaran yang Anda laporkan\n" +
          "• **Lokasi Parkir** - Tanya area parkir mana saja yang tersedia\n\n" +
          "Contoh pertanyaan: 'Berapa tarif 2 jam mobil?', 'Riwayat parkir saya?', 'Area parkir mana saja?'",
        intent: "help",
      };
    default:
      return {
        message:
          "Maaf, saya tidak memahami pertanyaan Anda. Ketik 'bantuan' untuk melihat pertanyaan yang bisa saya jawab.",
        intent: "unknown",
      };
  }
}
