import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

export const usersRouter = Router();

// GET /api/users — list users with their session counts.
usersRouter.get("/", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        _count: { select: { sessions: true, vehicles: true } },
      },
    });
    res.json({ success: true, data: users });
  } catch (e) {
    next(e);
  }
});

const statusSchema = z.object({ status: z.enum(["ACTIVE", "BLOCKED"]) });

// PATCH /api/users/:id/status — block/unblock a user.
usersRouter.patch("/:id/status", async (req, res, next) => {
  try {
    const { status } = statusSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    res.json({ success: true, data: user });
  } catch (e) {
    next(e);
  }
});
