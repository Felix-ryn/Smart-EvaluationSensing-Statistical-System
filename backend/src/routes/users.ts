import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

export const usersRouter = Router();

// GET /api/users — list users (Admin only)
usersRouter.get("/", requireAuth, async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        areaId: true,
        createdAt: true,
        areaJurik: { select: { name: true } },
      },
    });
    res.json({ success: true, data: users });
  } catch (e) {
    next(e);
  }
});

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "JUKIR", "USER"]),
  areaId: z.string().optional(), // Only required for Jukir
});

const statusSchema = z.object({ status: z.enum(["ACTIVE", "BLOCKED"]) });

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(["ADMIN", "JUKIR", "USER"]).optional(),
  status: z.enum(["ACTIVE", "BLOCKED"]).optional(),
  areaId: z.string().nullable().optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(6),
});

// POST /api/users — Create new user (Admin only)
usersRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const { name, email, password, role, areaId } = createUserSchema.parse(req.body);
    
    // Verify admin is creating the user
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ 
        success: false, 
        message: "Only admins can create new users", 
        code: "FORBIDDEN" 
      });
    }
    
    // For Jukir, area assignment is required
    if (role === "JUKIR" && !areaId) {
      return res.status(400).json({ 
        success: false, 
        message: "Area ID required for Jukir account", 
        code: "AREA_REQUIRED" 
      });
    }
    
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        message: "Email sudah terdaftar", 
        code: "DUPLICATE_EMAIL" 
      });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role,
        status: "ACTIVE",
        areaId: role === "JUKIR" ? areaId : null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        areaId: true,
        areaJurik: { select: { name: true } },
      },
    });
    
    res.status(201).json({
      success: true,
      data: user,
      message: `User ${role} berhasil dibuat`,
    });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/users/:id/status — block/unblock a user (Admin only)
usersRouter.patch("/:id/status", requireAuth, async (req, res, next) => {
  try {
    const { status } = statusSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status },
      select: { 
        id: true, 
        name: true, 
        email: true, 
        role: true, 
        status: true,
        areaId: true,
        areaJurik: { select: { name: true } },
      },
    });
    res.json({ success: true, data: user });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/users/:id — Update user profile/role/access status (Admin only)
usersRouter.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Only admins can update users",
        code: "FORBIDDEN",
      });
    }

    const payload = updateUserSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "User tidak ditemukan", code: "NOT_FOUND" });
    }

    const nextRole = payload.role ?? existing.role;
    let nextAreaId = existing.areaId;

    if (payload.areaId !== undefined) {
      nextAreaId = payload.areaId;
    }

    if (nextRole === "JUKIR" && !nextAreaId) {
      return res.status(400).json({
        success: false,
        message: "Area wajib diisi untuk role JUKIR",
        code: "AREA_REQUIRED",
      });
    }

    if (nextRole !== "JUKIR") {
      nextAreaId = null;
    }

    if (payload.email && payload.email !== existing.email) {
      const duplicate = await prisma.user.findUnique({ where: { email: payload.email } });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "Email sudah terdaftar",
          code: "DUPLICATE_EMAIL",
        });
      }
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(payload.name ? { name: payload.name } : {}),
        ...(payload.email ? { email: payload.email } : {}),
        ...(payload.role ? { role: payload.role } : {}),
        ...(payload.status ? { status: payload.status } : {}),
        areaId: nextAreaId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        areaId: true,
        areaJurik: { select: { name: true } },
      },
    });

    res.json({ success: true, data: user, message: "User berhasil diperbarui" });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/users/:id/reset-password — reset password user (Admin only)
usersRouter.patch("/:id/reset-password", requireAuth, async (req, res, next) => {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Only admins can reset password",
        code: "FORBIDDEN",
      });
    }

    const { password } = resetPasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });

    if (!user) {
      return res.status(404).json({ success: false, message: "User tidak ditemukan", code: "NOT_FOUND" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash } });

    res.json({ success: true, message: "Password berhasil direset" });
  } catch (e) {
    next(e);
  }
});

// PATCH /api/users/:id/area — Update area assignment for Jurik (Admin only)
usersRouter.patch("/:id/area", requireAuth, async (req, res, next) => {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ 
        success: false, 
        message: "Only admins can assign areas", 
        code: "FORBIDDEN" 
      });
    }
    
    const { areaId } = req.body;
    if (!areaId) {
      return res.status(400).json({ 
        success: false, 
        message: "Area ID is required", 
        code: "AREA_REQUIRED" 
      });
    }
    
    // Verify area exists
    const area = await prisma.parkingArea.findUnique({ where: { id: areaId } });
    if (!area) {
      return res.status(404).json({ success: false, message: "Area tidak ditemukan", code: "NOT_FOUND" });
    }
    
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { areaId },
      select: { 
        id: true, 
        name: true, 
        email: true, 
        role: true, 
        status: true,
        areaId: true,
        areaJurik: { select: { name: true } },
      },
    });
    
    res.json({ success: true, data: user });
  } catch (e) {
    next(e);
  }
});

// GET /api/users/me — Get current user profile
usersRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        areaId: true,
        createdAt: true,
        areaJurik: { select: { name: true, location: true, vehicleType: true } },
      },
    });
    
    res.json({ success: true, data: user });
  } catch (e) {
    next(e);
  }
});
