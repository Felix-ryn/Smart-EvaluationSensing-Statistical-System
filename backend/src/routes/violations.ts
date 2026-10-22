import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { upload, detectFile, type Detection } from "../lib/ai.js";

export const violationsRouter = Router();

const HIGH_CONF = Number(process.env.VIOLATION_HIGH_CONF ?? 0.7);
const REVIEW_CONF = Number(process.env.VIOLATION_REVIEW_CONF ?? 0.35);

// Pilih deteksi parking_violation dengan confidence tertinggi.
function pickViolation(dets: Detection[]): Detection | null {
  const violations = dets.filter((d) => d.class === "parking_violation");
  if (!violations.length) return null;
  return violations.reduce((a, b) => (b.confidence > a.confidence ? b : a));
}

// POST /api/violations — user/jukir/admin upload foto/video; jalankan deteksi. (auth optional untuk public)
violationsRouter.post("/", upload.single("photo"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Foto wajib diunggah", code: "NO_FILE" });
    }
    const areaId = typeof req.body.areaId === "string" && req.body.areaId ? req.body.areaId : null;
    const source = (["USER", "JUKIR", "CCTV"] as const).includes(req.body.source)
      ? (req.body.source as "USER" | "JUKIR" | "CCTV")
      : "USER";
    const note = typeof req.body.note === "string" && req.body.note.trim() ? req.body.note.trim() : null;

    const result = await detectFile(req.file.path, req.file.mimetype);
    const violationDet = pickViolation(result.detections);

    let violationType: "parking_violation" | "review" | "none" = "none";
    if (violationDet) {
      if (violationDet.confidence >= HIGH_CONF) violationType = "parking_violation";
      else if (violationDet.confidence >= REVIEW_CONF) violationType = "review";
      else violationType = "none";
    }

    const violation = await prisma.violation.create({
      data: {
        photoPath: `/uploads/${req.file.filename}`,
        areaId,
        violationType,
        confidence: violationDet?.confidence ?? null,
        source,
        note,
        reportedById: req.user?.id ?? null,
        reporterRole: req.user?.role ?? "USER",
        detections: result as object,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        violation,
        summary: result.summary,
        decision: violationType,
        violationDetected: violationType === "parking_violation",
        needsReview: violationType === "review",
        thresholds: { high: HIGH_CONF, review: REVIEW_CONF },
      },
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/violations/mine — laporan milik reporter.
violationsRouter.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const data = await prisma.violation.findMany({
      where: { reportedById: req.user!.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// GET /api/violations — admin melihat semua laporan.
violationsRouter.get("/", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const data = await prisma.violation.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        area: { select: { name: true } },
        reportedBy: { select: { name: true, email: true } },
      },
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

const statusSchema = z.object({
  status: z.enum(["PENDING", "VALID", "REJECTED"]),
  adminNote: z.string().optional(),
});

// PATCH /api/violations/:id/status — admin atau jukir verifikasi (valid/rejected).
violationsRouter.patch("/:id/status", requireAuth, async (req, res, next) => {
  try {
    const { status, adminNote } = statusSchema.parse(req.body);
    const violationId = req.params.id;
    
    // Check: hanya Admin atau Jukir yang buat laporan bisa validasi
    const violation = await prisma.violation.findUnique({ where: { id: violationId } });
    if (!violation) {
      return res.status(404).json({ success: false, message: "Laporan tidak ditemukan" });
    }
    
    const isAdmin = req.user!.role === "ADMIN";
    const isReporter = req.user!.id === violation.reportedById;
    const isJukirReporter = req.user!.role === "JUKIR" && isReporter;
    
    if (!isAdmin && !isJukirReporter) {
      return res.status(403).json({ success: false, message: "Tidak punya akses" });
    }
    
    const data = await prisma.violation.update({
      where: { id: violationId },
      data: { status, adminNote },
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});
