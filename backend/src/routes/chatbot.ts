import { Router } from "express";
import { z } from "zod";
import { handleChatQuery } from "../lib/chatbot.js";

export const chatbotRouter = Router();

const chatQuerySchema = z.object({
  message: z.string().min(1).max(500),
});

// POST /api/chat/query — public chatbot untuk tarif, area, dan jenis kendaraan.
chatbotRouter.post("/query", async (req, res, next) => {
  try {
    const { message } = chatQuerySchema.parse(req.body);
    const response = await handleChatQuery(message);
    res.json({ success: true, data: response });
  } catch (e) {
    next(e);
  }
});

// GET /api/chat/examples — show example questions user bisa tanya
chatbotRouter.get("/examples", (_req, res) => {
  res.json({
    success: true,
    data: {
      examples: [
        "Saya ingin parkir 3 jam, kira-kira tarifnya berapa?",
        "Tarif parkir motor 3 jam berapa?",
        "Area parkir mana saja yang tersedia?",
        "Jenis kendaraan apa saja yang bisa parkir?",
        "Berapa kapasitas area parkir?",
        "Bantuan",
      ],
    },
  });
});
