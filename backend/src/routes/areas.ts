import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { availableCapacity } from "../lib/business.js";

export const areasRouter = Router();

const createSchema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  vehicleType: z.string().default("motorcycle"),
  capacity: z.number().int().positive(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  vehicleType: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]).optional(),
});

// GET /api/areas — list area + kapasitas + available (capacity - transaksi aktif).
areasRouter.get("/", async (_req, res, next) => {
  try {
    const areas = await prisma.parkingArea.findMany({ orderBy: { name: "asc" } });
    const data = await Promise.all(
      areas.map(async (area) => {
        const active = await prisma.transaction.count({
          where: { areaId: area.id, status: "ACTIVE" },
        });
        return {
          ...area,
          activeVehicles: active,
          available: Math.max(0, area.capacity - active),
        };
      }),
    );
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// POST /api/areas — admin membuat area baru + kapasitas.
areasRouter.post("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const area = await prisma.parkingArea.create({ data });
    res.status(201).json({ success: true, data: area });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/areas/:id — admin ubah kapasitas/status area.
areasRouter.patch("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const data = updateSchema.parse(req.body);
    const area = await prisma.parkingArea.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: area });
  } catch (e) {
    next(e);
  }
});

// GET /api/areas/:id — detail satu area + available.
areasRouter.get("/:id", async (req, res, next) => {
  try {
    const area = await prisma.parkingArea.findUnique({ where: { id: req.params.id } });
    if (!area) {
      return res.status(404).json({ success: false, message: "Area tidak ditemukan", code: "NOT_FOUND" });
    }
    const available = await availableCapacity(area.id);
    const active = await prisma.transaction.count({ where: { areaId: area.id, status: "ACTIVE" } });
    res.json({ success: true, data: { ...area, activeVehicles: active, available } });
  } catch (e) {
    next(e);
  }
});
