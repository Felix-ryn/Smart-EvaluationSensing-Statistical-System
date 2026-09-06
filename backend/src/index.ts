import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { authRouter } from "./routes/auth.js";
import { stubRouter } from "./routes/stub.js";
import { requireAuth, requireAdmin } from "./middleware/auth.js";
import { notFound, errorHandler } from "./middleware/error.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ success: true, data: { status: "ok" } }));

app.use("/api/auth", authRouter);

// Stubbed domains (Phase 5+). Authorization wired now so it's real once handlers land.
app.use("/api/parking", requireAuth, stubRouter("parking"));
app.use("/api/slots", requireAuth, stubRouter("slots"));
app.use("/api/users", requireAuth, requireAdmin, stubRouter("users"));
app.use("/api/reports", requireAuth, requireAdmin, stubRouter("reports"));
app.use("/api/payments", requireAuth, stubRouter("payments"));
app.use("/api/history", requireAuth, stubRouter("history"));
app.use("/api/notifications", requireAuth, stubRouter("notifications"));
app.use("/api/detections", requireAuth, stubRouter("detections")); // AI/YOLO — stubbed

app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => console.log(`API listening on http://localhost:${env.port}`));
