import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

export interface AuthUser {
  id: string;
  role: "ADMIN" | "USER";
}

declare global {
  // eslint-disable-next-line no-var
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, message: "Unauthorized", code: "UNAUTHORIZED" });
  }
  try {
    req.user = jwt.verify(token, env.jwtSecret) as AuthUser;
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token", code: "UNAUTHORIZED" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Forbidden", code: "FORBIDDEN" });
  }
  next();
}
