import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { upload, detectFile, type Detection } from "../lib/ai.js";

export const detectionsRouter = Router();

// POST /api/detections/scan — admin uploads a photo/video of a location;
// model counts empty/occupied slots and we map them to that location's slots.
//
// ponytail: mapping is by reading order (top→bottom, left→right) of detection
//   boxes onto slotCode-sorted slots — fragile if camera angle/slot count differ.
//   Upgrade path: calibrate box centroids against ParkingSlot.latitude/longitude
//   (already in schema) for a real spatial match.
detectionsRouter.post("/scan", requireAuth, requireAdmin, upload.single("photo"), async (req, res, next) => {
  try {
    const locationId = req.body.locationId as string | undefined;
    if (!req.file) return res.status(400).json({ success: false, message: "File wajib diunggah", code: "NO_FILE" });
    if (!locationId) return res.status(400).json({ success: false, message: "locationId wajib", code: "NO_LOCATION" });

    const location = await prisma.parkingLocation.findUnique({
      where: { id: locationId },
      include: { slots: { orderBy: { slotCode: "asc" } } },
    });
    if (!location) return res.status(404).json({ success: false, message: "Lokasi tidak ditemukan", code: "NOT_FOUND" });

    const result = await detectFile(req.file.path, req.file.mimetype);

    // Only slot-occupancy detections drive status; sort by reading order.
    const slotDets = result.detections
      .filter((d: Detection) => d.class === "space-empty" || d.class === "space-occupied")
      .sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);

    // Never touch MAINTENANCE slots — those are set manually by admins.
    const updatable = location.slots.filter((s) => s.status !== "MAINTENANCE");
    const updates: { slotCode: string; status: "AVAILABLE" | "OCCUPIED" }[] = [];

    for (let i = 0; i < Math.min(slotDets.length, updatable.length); i++) {
      const status = slotDets[i].class === "space-empty" ? "AVAILABLE" : "OCCUPIED";
      const slot = updatable[i];
      updates.push({ slotCode: slot.slotCode, status });
      await prisma.parkingSlot.update({ where: { id: slot.id }, data: { status } });
      await prisma.parkingEvent.create({
        data: {
          slotId: slot.id,
          eventType: status === "AVAILABLE" ? "VACATED" : "OCCUPIED",
          source: "ai-scan",
          confidence: slotDets[i].confidence,
        },
      });
    }

    res.json({
      success: true,
      data: {
        photoPath: `/uploads/${req.file.filename}`,
        summary: result.summary,
        detectionCount: slotDets.length,
        slotsUpdated: updates.length,
        updates,
      },
    });
  } catch (e) {
    next(e);
  }
});
