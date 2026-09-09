import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { env } from "../env.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function sign(user: { id: string; role: "ADMIN" | "USER" }) {
  return jwt.sign({ id: user.id, role: user.role }, env.jwtSecret, { expiresIn: "7d" });
}

authRouter.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = registerSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return res
        .status(409)
        .json({ success: false, message: "Email already registered", code: "EMAIL_TAKEN" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { name, email, passwordHash } });
    const token = sign(user);
    res.status(201).json({ success: true, data: { token, user: { id: user.id, name, email, role: user.role } } });
  } catch (e) {
    next(e);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials", code: "INVALID_CREDENTIALS" });
    }
    if (user.status === "BLOCKED") {
      return res.status(403).json({ success: false, message: "Account blocked", code: "BLOCKED" });
    }
    const token = sign(user);
    res.json({ success: true, data: { token, user: { id: user.id, name: user.name, email, role: user.role } } });
  } catch (e) {
    next(e);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    res.json({ success: true, data: user });
  } catch (e) {
    next(e);
  }
});

// ponytail: logout/refresh are stateless (client drops token). add when: using refresh-token rotation.
authRouter.post("/logout", (_req, res) => res.json({ success: true, data: null }));
