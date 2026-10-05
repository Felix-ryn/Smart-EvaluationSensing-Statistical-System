import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { authRouter } from "./routes/auth.js";
import { areasRouter } from "./routes/areas.js";
import { transactionsRouter } from "./routes/transactions.js";
import { jukirRouter } from "./routes/jukir.js";
import { mouRouter } from "./routes/mou.js";
import { usersRouter } from "./routes/users.js";
import { reportsRouter } from "./routes/reports.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { violationsRouter } from "./routes/violations.js";
import { detectionsRouter } from "./routes/detections.js";
import { chatbotRouter } from "./routes/chatbot.js";
import { analyticsRouter } from "./routes/analytics.js";
import { initializeScheduler } from "./services/scheduler.js";
import { requireAuth, requireAdmin } from "./middleware/auth.js";
import { notFound, errorHandler } from "./middleware/error.js";
import { UPLOAD_DIR } from "./lib/ai.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOAD_DIR));

app.get("/health", (_req, res) => res.json({ success: true, data: { status: "ok" } }));

app.use("/api/auth", authRouter);

// Public read-only: pengguna anonim bisa melihat area tanpa login.
app.use("/api/areas", areasRouter);
app.use("/api/transactions", transactionsRouter);
// requireAdmin dipindah ke level route (GET /) agar /dashboard/trend
// tetap bisa diakses role USER & JUKIR. Trend hanya berisi jumlah kendaraan.
app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/jukir", jukirRouter);
app.use("/api/mou", mouRouter);
app.use("/api/users", requireAuth, requireAdmin, usersRouter);
app.use("/api/reports", requireAuth, requireAdmin, reportsRouter);
app.use("/api/violations", violationsRouter);
app.use("/api/detections", detectionsRouter); // AI area scan (admin) — auth di dalam router
app.use("/api/chat", chatbotRouter); // Chatbot untuk user
// requireAuth WAJIB di sini: requireAdmin/requireJukirOrAdmin membaca req.user,
// yang hanya diisi oleh requireAuth. Tanpa ini semua endpoint analytics balas 403.
app.use("/api/analytics", requireAuth, analyticsRouter); // Analytics: forecast & segmentation

app.use(notFound);
app.use(errorHandler);

// Initialize forecast scheduler (runs monthly on last day at 23:00)
try {
  initializeScheduler();
  console.log("✅ Forecast scheduler initialized");
} catch (err) {
  console.error("⚠️  Failed to initialize scheduler:", err);
}

app.listen(env.port, () => {
  console.log(`✅ API listening on http://localhost:${env.port}`);
  console.log(`✅ Forecast system ready (manual + scheduled)`);
});
