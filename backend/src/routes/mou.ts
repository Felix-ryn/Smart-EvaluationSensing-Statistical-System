import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

export const mouRouter = Router();

const createSchema = z.object({
  name: z.string().min(1),
  taxPercent: z.number().min(0).max(100),
  operatorPercent: z.number().min(0).max(100).default(0),
  jukirSharePercent: z.number().min(0).max(100).default(15),
  // Motorcycle rates
  firstHour_motorcycle: z.number().positive().default(2000),
  nextHour_motorcycle: z.number().positive().default(1000),
  maximumDaily_motorcycle: z.number().positive().default(10000),
  // Car rates
  firstHour_car: z.number().positive().default(3000),
  nextHour_car: z.number().positive().default(1500),
  maximumDaily_car: z.number().positive().default(15000),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date().optional().nullable(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  operatorPercent: z.number().min(0).max(100).optional(),
  jukirSharePercent: z.number().min(0).max(100).optional(),
  // Motorcycle rates
  firstHour_motorcycle: z.number().positive().optional(),
  nextHour_motorcycle: z.number().positive().optional(),
  maximumDaily_motorcycle: z.number().positive().optional(),
  // Car rates
  firstHour_car: z.number().positive().optional(),
  nextHour_car: z.number().positive().optional(),
  maximumDaily_car: z.number().positive().optional(),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional().nullable(),
});

// GET /api/mou — list semua aturan MOU.
mouRouter.get("/", requireAuth, async (_req, res, next) => {
  try {
    const data = await prisma.mouRule.findMany({ orderBy: { validFrom: "desc" } });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// POST /api/mou — admin tambah aturan MOU.
mouRouter.post("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const rule = await prisma.mouRule.create({ data });
    res.status(201).json({ success: true, data: rule });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/mou/:id — admin ubah aturan MOU.
mouRouter.patch("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const data = updateSchema.parse(req.body);
    const rule = await prisma.mouRule.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: rule });
  } catch (e) {
    next(e);
  }
});
