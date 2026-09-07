import express from "express";
import cors from "cors";
import { env } from "./env.js";
import { authRouter } from "./routes/auth.js";
import { parkingRouter } from "./routes/parking.js";
import { usersRouter } from "./routes/users.js";
import { reportsRouter } from "./routes/reports.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { notificationsRouter } from "./routes/notifications.js";
import { violationsRouter } from "./routes/violations.js";
import { detectionsRouter } from "./routes/detections.js";
import { stubRouter } from "./routes/stub.js";
import { requireAuth, requireAdmin } from "./middleware/auth.js";
import { notFound, errorHandler } from "./middleware/error.js";
import { UPLOAD_DIR } from "./lib/ai.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOAD_DIR));

app.get("/health", (_req, res) => res.json({ success: true, data: { status: "ok" } }));

app.use("/api/auth", authRouter);

// Public read-only: anonymous users can browse parking without login.
app.use("/api/parking", parkingRouter);
app.use("/api/slots", stubRouter("slots"));
app.use("/api/dashboard", requireAuth, requireAdmin, dashboardRouter);
app.use("/api/users", requireAuth, requireAdmin, usersRouter);
app.use("/api/reports", requireAuth, requireAdmin, reportsRouter);
app.use("/api/notifications", requireAuth, requireAdmin, notificationsRouter);
app.use("/api/violations", violationsRouter);
app.use("/api/detections", detectionsRouter); // AI slot scan (admin) — auth inside router
app.use("/api/payments", requireAuth, stubRouter("payments"));
app.use("/api/history", requireAuth, stubRouter("history"));

app.use(notFound);
app.use(errorHandler);

app.listen(env.port, () => console.log(`API listening on http://localhost:${env.port}`));
