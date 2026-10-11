import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { handleChatQuery } from "../lib/chatbot.js";

export const chatbotRouter = Router();

const chatQuerySchema = z.object({
  message: z.string().min(1).max(500),
});

// POST /api/chat/query — user ask question tentang tarif, violations, atau areas
chatbotRouter.post("/query", requireAuth, async (req, res, next) => {
  try {
    const { message } = chatQuerySchema.parse(req.body);
    const response = await handleChatQuery(message, req.user!.id);
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
        "Berapa total tarif parkir saya bulan ini?",
        "Berapa tarif parkir saya minggu lalu?",
        "Lihat riwayat pelanggaran saya",
        "Area parkir mana saja yang tersedia?",
        "Berapa kapasitas area parkir?",
        "Bantuan",
      ],
    },
  });
});
