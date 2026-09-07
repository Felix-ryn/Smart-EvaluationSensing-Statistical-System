import { Router } from "express";
import { prisma } from "../prisma.js";

export const notificationsRouter = Router();

// GET /api/notifications — admin sees all notifications, newest first.
notificationsRouter.get("/", async (_req, res, next) => {
  try {
    const data = await prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/notifications/:id/read — mark one as read.
notificationsRouter.patch("/:id/read", async (req, res, next) => {
  try {
    const data = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});
