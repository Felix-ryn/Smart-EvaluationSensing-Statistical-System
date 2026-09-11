import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { upload, detectFile, type Detection } from "../lib/ai.js";

export const detectionsRouter = Router();

// POST /api/detections/scan — admin upload foto/video area;
// model menghitung empty/occupied/illegal, disimpan sebagai CvDetection per area,
// lalu dibandingkan dengan jumlah transaksi aktif (selisih = early warning).
detectionsRouter.post("/scan", requireAuth, requireAdmin, upload.single("photo"), async (req, res, next) => {
  try {
    const areaId = req.body.areaId as string | undefined;
    const source = (req.body.source as string) || "cctv";
    if (!req.file) return res.status(400).json({ success: false, message: "File wajib diunggah", code: "NO_FILE" });
    if (!areaId) return res.status(400).json({ success: false, message: "areaId wajib", code: "NO_AREA" });

    const area = await prisma.parkingArea.findUnique({ where: { id: areaId } });
    if (!area) return res.status(404).json({ success: false, message: "Area tidak ditemukan", code: "NOT_FOUND" });

    const result = await detectFile(req.file.path, req.file.mimetype);

    const count = (cls: string) => result.detections.filter((d: Detection) => d.class === cls).length;
    const emptyCount = count("space-empty");
    const occupiedCount = count("space-occupied");
    const illegalCount = count("illegal-parking");

    const detection = await prisma.cvDetection.create({
      data: { areaId, emptyCount, occupiedCount, illegalCount, source },
    });

    // Bandingkan dengan transaksi aktif.
    const active = await prisma.transaction.count({ where: { areaId, status: "ACTIVE" } });
    const difference = occupiedCount - active;

    res.json({
      success: true,
      data: {
        photoPath: `/uploads/${req.file.filename}`,
        summary: result.summary,
        detection,
        activeTransactions: active,
        cvDetected: occupiedCount,
        difference,
        needsReview: difference !== 0,
      },
    });
  } catch (e) {
    next(e);
  }
});
