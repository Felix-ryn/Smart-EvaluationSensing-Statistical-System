import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { upload, detectFile, type Detection } from "../lib/ai.js";

export const violationsRouter = Router();

// Pick the most-confident illegal-parking detection to headline the report.
function pickIllegal(dets: Detection[]): Detection | null {
  const illegal = dets.filter((d) => d.class === "illegal-parking");
  if (!illegal.length) return null;
  return illegal.reduce((a, b) => (b.confidence > a.confidence ? b : a));
}

// POST /api/violations — user or admin uploads a photo/video; runs detection.
violationsRouter.post("/", requireAuth, upload.single("photo"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Foto wajib diunggah", code: "NO_FILE" });
    }
    const locationId = typeof req.body.locationId === "string" && req.body.locationId ? req.body.locationId : null;
    const slotCode = typeof req.body.slotCode === "string" && req.body.slotCode ? req.body.slotCode : null;

    const result = await detectFile(req.file.path, req.file.mimetype);
    const illegal = pickIllegal(result.detections);

    const violation = await prisma.violation.create({
      data: {
        photoPath: `/uploads/${req.file.filename}`,
        locationId,
        slotCode,
        violationType: illegal ? "illegal-parking" : "none",
        confidence: illegal?.confidence ?? null,
        reportedById: req.user!.id,
        reporterRole: req.user!.role,
        detections: result as object,
      },
    });

    res.status(201).json({
      success: true,
      data: { violation, summary: result.summary, illegalDetected: !!illegal },
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/violations/mine — reporter's own submissions.
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

// GET /api/violations — admin sees all reports.
violationsRouter.get("/", requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const data = await prisma.violation.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        location: { select: { name: true } },
        reportedBy: { select: { name: true, email: true } },
      },
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

const statusSchema = z.object({
  status: z.enum(["PENDING", "REVIEWED", "DISMISSED"]),
  adminNote: z.string().optional(),
});

// PATCH /api/violations/:id/status — admin review action.
violationsRouter.patch("/:id/status", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { status, adminNote } = statusSchema.parse(req.body);
    const data = await prisma.violation.update({
      where: { id: req.params.id },
      data: { status, adminNote },
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});
