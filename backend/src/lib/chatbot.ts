import { prisma } from "../prisma.js";
import { calculateParkingFee, type ParkingRules } from "./fee.js";
import { getActiveMou, mouToParkingRules } from "./business.js";

export type Intent = "hitung-tarif" | "areas" | "vehicle-types" | "private-feature" | "help" | "unknown";

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

const FALLBACK_RULES: Record<"motorcycle" | "car", ParkingRules> = {
  motorcycle: { firstHour: 2000, nextHour: 1000, maximumDaily: 10000 },
  car: { firstHour: 3000, nextHour: 1500, maximumDaily: 15000 },
};

function parseDuration(input: string): { hours: number; minutes: number } {
  const hourMatch = input.match(/(\d+)\s*(?:jam|j|h|hour|hrs?)/i);
  const minMatch = input.match(/(\d+)\s*(?:menit|min|m)(?!\s*jam)/i);

  const hours = hourMatch ? parseInt(hourMatch[1], 10) : 1;
  const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;

  return { hours: Math.max(1, hours), minutes: Math.max(0, minutes) };
}

function parseVehicleType(input: string): "motorcycle" | "car" {
  const lower = input.toLowerCase();
  if (lower.includes("mobil") || lower.includes("car")) return "car";
  return "motorcycle";
}

function normalizeVehicleType(value: string): "motorcycle" | "car" {
  const lower = value.toLowerCase();
  if (lower.includes("car") || lower.includes("mobil")) return "car";
  return "motorcycle";
}

function vehicleTypeLabel(value: string): string {
  return normalizeVehicleType(value) === "car" ? "Mobil" : "Motor";
}

function detectIntent(input: string): Intent {
  const lower = input.toLowerCase();

  const privateFeatureKeywords =
    lower.includes("riwayat") ||
    lower.includes("transaksi saya") ||
    lower.includes("pelanggaran saya") ||
    lower.includes("laporan saya") ||
    lower.includes("minggu lalu") ||
    lower.includes("bulan ini");
  if (privateFeatureKeywords) return "private-feature";

  const hasFareKeyword = /berapa|harga|bayar|tarif|biaya|fee|estimasi|kira.kira/i.test(lower);
  if (hasFareKeyword) return "hitung-tarif";

  if (
    lower.includes("jenis kendaraan") ||
    lower.includes("kendaraan apa") ||
    lower.includes("tipe kendaraan") ||
    lower.includes("kendaraan yang bisa") ||
    lower.includes("bisa parkir kendaraan") ||
    lower.includes("motor atau mobil")
  ) {
    return "vehicle-types";
  }

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

function formatTarifEstimate(
  vehicleType: "motorcycle" | "car",
  hours: number,
  minutes: number,
  feeResult: { totalFee: number },
  rules: ParkingRules,
): string {
  const durationText = `${hours} jam${minutes > 0 ? ` ${minutes} menit` : ""}`;
  const vehicleLabel = vehicleType === "car" ? "mobil" : "motor";
  let ratesBreakdown = `• Jam 1: Rp ${rules.firstHour.toLocaleString("id-ID")} (tarif dasar)`;
  if (hours > 1) {
    ratesBreakdown += `\n• Jam 2-${hours}: Rp ${rules.nextHour.toLocaleString("id-ID")}/jam`;
  }

  return `Estimasi tarif parkir ${vehicleLabel} untuk ${durationText}:
**Rp ${feeResult.totalFee.toLocaleString("id-ID")}**

Breakdown:
${ratesBreakdown}
Total maksimal per hari: Rp ${rules.maximumDaily.toLocaleString("id-ID")}.`;
}

async function handleTarifEstimateQuery(input: string): Promise<ChatResponse> {
  const { hours, minutes } = parseDuration(input);
  const vehicleType = parseVehicleType(input);

  let rules = FALLBACK_RULES[vehicleType];
  let fallbackNotice = "";
  try {
    const mou = await getActiveMou();
    rules = mouToParkingRules(mou, vehicleType);
  } catch {
    fallbackNotice = "\n\n⚠️ Saat ini sistem memakai tarif default karena data tarif utama belum tersedia.";
  }

  const checkInTime = new Date();
  const checkOutTime = new Date(checkInTime.getTime() + hours * 60 * 60 * 1000 + minutes * 60 * 1000);
  const feeResult = calculateParkingFee(checkInTime, checkOutTime, rules);
  const message = formatTarifEstimate(vehicleType, hours, minutes, feeResult, rules);

  return {
    message: `${message}${fallbackNotice}`,
    intent: "hitung-tarif",
    data: {
      feeResult,
      rules,
      vehicleType,
      duration: { hours, minutes },
      usedFallbackRules: fallbackNotice.length > 0,
    },
  };
}

async function handleAreasQuery(): Promise<ChatResponse> {
  try {
    const areas = await prisma.parkingArea.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
    });

    const supportedVehicleTypes = Array.from(new Set(areas.map((a) => normalizeVehicleType(a.vehicleType))));
    const vehicleTypesText =
      supportedVehicleTypes.length > 0
        ? supportedVehicleTypes.map((v) => vehicleTypeLabel(v)).join(", ")
        : "Motor, Mobil";

    const message =
      areas.length === 0
        ? "Belum ada area parkir yang tersedia."
        : `Ada **${areas.length}** area parkir yang tersedia.\nJenis kendaraan yang didukung: **${vehicleTypesText}**.\n\n` +
          areas
            .map((a) => `• **${a.name}** (${a.location}) - Kapasitas: ${a.capacity} kendaraan - ${vehicleTypeLabel(a.vehicleType)}`)
            .join("\n");

    return {
      message,
      intent: "areas",
      data: {
        totalAreas: areas.length,
        supportedVehicleTypes,
        areas: areas.map((a) => ({
          id: a.id,
          name: a.name,
          location: a.location,
          capacity: a.capacity,
          vehicleType: normalizeVehicleType(a.vehicleType),
        })),
      },
    };
  } catch {
    return {
      message:
        "Data lokasi parkir sedang tidak tersedia. Jenis kendaraan yang umumnya didukung: **Motor** dan **Mobil**.",
      intent: "areas",
      data: {
        totalAreas: 0,
        supportedVehicleTypes: ["motorcycle", "car"],
      },
    };
  }
}

async function handleVehicleTypesQuery(): Promise<ChatResponse> {
  try {
    const areas = await prisma.parkingArea.findMany({
      where: { status: "ACTIVE" },
      select: { vehicleType: true, name: true, location: true },
      orderBy: { name: "asc" },
    });

    const supportedVehicleTypes = Array.from(new Set(areas.map((a) => normalizeVehicleType(a.vehicleType))));
    const vehicleTypeText =
      supportedVehicleTypes.length > 0
        ? supportedVehicleTypes.map((v) => `• ${vehicleTypeLabel(v)}`).join("\n")
        : "• Motor\n• Mobil";

    const areaExamples = areas
      .slice(0, 5)
      .map((a) => `• ${a.name} (${a.location}) - ${vehicleTypeLabel(a.vehicleType)}`)
      .join("\n");

    return {
      message:
        `Jenis kendaraan yang saat ini bisa parkir:\n${vehicleTypeText}` +
        (areaExamples ? `\n\nContoh area:\n${areaExamples}` : ""),
      intent: "vehicle-types",
      data: {
        supportedVehicleTypes,
      },
    };
  } catch {
    return {
      message: "Saat ini jenis kendaraan yang didukung adalah **Motor** dan **Mobil**.",
      intent: "vehicle-types",
      data: {
        supportedVehicleTypes: ["motorcycle", "car"],
      },
    };
  }
}

export async function handleChatQuery(userMessage: string): Promise<ChatResponse> {
  const intent = detectIntent(userMessage);

  switch (intent) {
    case "hitung-tarif":
      return handleTarifEstimateQuery(userMessage);
    case "areas":
      return handleAreasQuery();
    case "vehicle-types":
      return handleVehicleTypesQuery();
    case "private-feature":
      return {
        message:
          "Maaf, fitur riwayat parkir/pelanggaran tidak tersedia di chatbot public. Saya hanya bisa bantu tarif parkir, area parkir, dan jenis kendaraan.",
        intent: "private-feature",
      };
    case "help":
      return {
        message:
          "Saya bisa bantu Anda dengan:\n\n" +
          "• **Hitung Tarif Parkir** (contoh: tarif motor 3 jam berapa?)\n" +
          "• **Lokasi/Area Parkir** (contoh: area parkir mana saja yang tersedia?)\n" +
          "• **Jenis Kendaraan** (contoh: jenis kendaraan apa saja yang bisa parkir?)",
        intent: "help",
      };
    default:
      return {
        message:
          "Maaf, saya tidak memahami pertanyaan Anda. Silakan tanya tentang tarif parkir, area parkir, atau jenis kendaraan.",
        intent: "unknown",
      };
  }
}
