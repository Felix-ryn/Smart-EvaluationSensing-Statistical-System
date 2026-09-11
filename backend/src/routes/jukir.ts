import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

export const jukirRouter = Router();

const createSchema = z.object({
  name: z.string().min(1),
  areaId: z.string().min(1),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  areaId: z.string().min(1).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

// GET /api/jukir — list jukir + area kerja.
jukirRouter.get("/", requireAuth, async (_req, res, next) => {
  try {
    const data = await prisma.jukir.findMany({
      include: { area: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// POST /api/jukir — admin tambah jukir.
jukirRouter.post("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const jukir = await prisma.jukir.create({ data });
    res.status(201).json({ success: true, data: jukir });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/jukir/:id — admin ubah jukir.
jukirRouter.patch("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const data = updateSchema.parse(req.body);
    const jukir = await prisma.jukir.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: jukir });
  } catch (e) {
    next(e);
  }
});
