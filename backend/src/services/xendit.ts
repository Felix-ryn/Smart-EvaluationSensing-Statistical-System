import axios, { AxiosError } from "axios";
import { env } from "../env.js";

export interface CreateQrisPaymentInput {
  externalId: string;
  amount: number;
  expiresAt: Date;
  metadata: Record<string, unknown>;
}

export interface CreateQrisPaymentResult {
  providerPaymentId: string;
  externalId: string;
  qrString: string;
  qrCodeUrl: string;
  expiresAt: Date;
  rawPayload: unknown;
}

export type NormalizedQrisStatus = "PENDING" | "PAID" | "EXPIRED" | "FAILED" | "CANCELLED";

export interface XenditWebhookPayload {
  externalId: string;
  providerPaymentId?: string;
  status: NormalizedQrisStatus;
  paidAt?: Date;
  rawPayload: unknown;
}

export function isXenditEnabled() {
  return Boolean(env.xenditSecretKey);
}

export async function createXenditQrisPayment(input: CreateQrisPaymentInput): Promise<CreateQrisPaymentResult> {
  if (!env.xenditSecretKey) {
    throw new Error("Xendit belum dikonfigurasi (XENDIT_SECRET_KEY kosong)");
  }
  if (!env.xenditQrisCallbackUrl) {
    throw new Error("Xendit belum dikonfigurasi (XENDIT_QRIS_CALLBACK_URL kosong)");
  }

  const basicAuth = Buffer.from(`${env.xenditSecretKey}:`).toString("base64");

  let response;
  try {
    response = await axios.post(
      `${env.xenditBaseUrl}/qr_codes`,
      {
        external_id: input.externalId,
        type: "DYNAMIC",
        currency: "IDR",
        amount: input.amount,
        expires_at: input.expiresAt.toISOString(),
        callback_url: env.xenditQrisCallbackUrl,
        metadata: input.metadata,
      },
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );
  } catch (error: any) {
    const axiosError = error as AxiosError<any>;
    const status = axiosError.response?.status;
    const body = axiosError.response?.data;
    const providerMessage =
      body?.message ||
      body?.error_message ||
      (Array.isArray(body?.errors) ? body.errors.map((e: any) => e?.message ?? JSON.stringify(e)).join("; ") : "") ||
      axiosError.message;

    const detail = body ? ` | detail: ${JSON.stringify(body)}` : "";
    throw new Error(`Xendit create QR gagal${status ? ` (${status})` : ""}: ${providerMessage}${detail}`);
  }

  const payload = response.data ?? {};
  const qrString = String(payload.qr_string ?? payload.qrString ?? "");
  if (!qrString) {
    throw new Error("Xendit tidak mengembalikan qr_string");
  }

  return {
    providerPaymentId: String(payload.id ?? ""),
    externalId: String(payload.external_id ?? payload.reference_id ?? input.externalId),
    qrString,
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrString)}`,
    expiresAt: new Date(payload.expires_at ?? input.expiresAt.toISOString()),
    rawPayload: payload,
  };
}

function normalizeStatus(raw: unknown): NormalizedQrisStatus {
  const status = String(raw ?? "").toUpperCase();
  if (["SUCCEEDED", "PAID", "COMPLETED", "SETTLED"].includes(status)) return "PAID";
  if (["EXPIRED"].includes(status)) return "EXPIRED";
  if (["FAILED"].includes(status)) return "FAILED";
  if (["CANCELLED", "CANCELED"].includes(status)) return "CANCELLED";
  return "PENDING";
}

export function verifyXenditCallbackToken(callbackTokenHeader?: string | string[]) {
  if (!env.xenditCallbackToken) return true;
  const provided = Array.isArray(callbackTokenHeader) ? callbackTokenHeader[0] : callbackTokenHeader;
  return provided === env.xenditCallbackToken;
}

export function parseXenditWebhook(payload: any): XenditWebhookPayload | null {
  const externalId = String(
    payload?.reference_id ??
      payload?.external_id ??
      payload?.data?.reference_id ??
      payload?.data?.external_id ??
      "",
  ).trim();

  if (!externalId) return null;

  const providerPaymentId = String(payload?.id ?? payload?.data?.id ?? "").trim() || undefined;
  const status = normalizeStatus(payload?.status ?? payload?.data?.status);
  const paidAtRaw = payload?.paid_at ?? payload?.data?.paid_at ?? payload?.updated ?? payload?.data?.updated;

  return {
    externalId,
    providerPaymentId,
    status,
    paidAt: status === "PAID" && paidAtRaw ? new Date(paidAtRaw) : status === "PAID" ? new Date() : undefined,
    rawPayload: payload,
  };
}
