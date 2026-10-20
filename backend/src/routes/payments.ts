import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { parseXenditWebhook, verifyXenditCallbackToken } from "../services/xendit.js";

export const paymentsRouter = Router();

// POST /api/payments/webhooks/xendit/qris
paymentsRouter.post("/webhooks/xendit/qris", async (req, res, next) => {
  try {
    const isAllowed = verifyXenditCallbackToken(req.headers["x-callback-token"]);
    if (!isAllowed) {
      return res.status(401).json({ success: false, message: "Invalid callback token", code: "INVALID_CALLBACK_TOKEN" });
    }

    const parsed = parseXenditWebhook(req.body);
    if (!parsed) {
      return res.status(400).json({ success: false, message: "Invalid webhook payload", code: "INVALID_WEBHOOK_PAYLOAD" });
    }

    const payment = await prisma.qrisPayment.findUnique({
      where: { externalId: parsed.externalId },
      include: { transaction: true },
    });

    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment reference not found", code: "PAYMENT_NOT_FOUND" });
    }

    // Idempotent handling: jika sudah PAID dan webhook datang lagi, cukup ACK.
    if (payment.status === "PAID" && parsed.status === "PAID") {
      return res.json({ success: true, data: { acknowledged: true, alreadyProcessed: true } });
    }

    await prisma.qrisPayment.update({
      where: { id: payment.id },
      data: {
        status: parsed.status,
        providerPaymentId: parsed.providerPaymentId ?? payment.providerPaymentId,
        paidAt: parsed.status === "PAID" ? parsed.paidAt ?? new Date() : payment.paidAt,
        rawPayload: parsed.rawPayload as Prisma.InputJsonValue,
      },
    });

    if (parsed.status === "PAID") {
      await prisma.transaction.update({
        where: { id: payment.transactionId },
        data: {
          status: "COMPLETED",
          paymentMethod: "QRIS",
          paidAt: parsed.paidAt ?? new Date(),
          ...(payment.jukirId && !payment.transaction.jukirId ? { jukirId: payment.jukirId } : {}),
        },
      });
    }

    res.json({ success: true, data: { acknowledged: true } });
  } catch (e) {
    next(e);
  }
});
