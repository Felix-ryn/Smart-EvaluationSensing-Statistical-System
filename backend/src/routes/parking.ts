import { Router } from "express";
import { prisma } from "../prisma.js";

export const parkingRouter = Router();

// GET /api/parking — list active locations with slot availability counts.
parkingRouter.get("/", async (_req, res, next) => {
  try {
    const locations = await prisma.parkingLocation.findMany({
      where: { status: "ACTIVE" },
      include: { slots: { select: { status: true } } },
      orderBy: { name: "asc" },
    });
    const data = locations.map(({ slots, ...loc }) => ({
      ...loc,
      totalSlots: slots.length,
      availableSlots: slots.filter((s) => s.status === "AVAILABLE").length,
    }));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// GET /api/parking/:id — one location with its slots.
parkingRouter.get("/:id", async (req, res, next) => {
  try {
    const location = await prisma.parkingLocation.findUnique({
      where: { id: req.params.id },
      include: { slots: { orderBy: { slotCode: "asc" } } },
    });
    if (!location) {
      return res.status(404).json({ success: false, message: "Location not found", code: "NOT_FOUND" });
    }
    res.json({ success: true, data: location });
  } catch (e) {
    next(e);
  }
});

// ponytail: only reads implemented. add create/update/check-in when Phase 5 lands.
