import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

export interface AuthUser {
  id: string;
  role: "ADMIN" | "JUKIR" | "USER";
  areaId?: string; // Only for Jukir role
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
    return res.status(403).json({ success: false, message: "Forbidden - Admin access required", code: "FORBIDDEN" });
  }
  next();
}

// Guard untuk Jukir atau Admin
export function requireJukirOrAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !["ADMIN", "JUKIR"].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: "Forbidden - Jukir or Admin access required", code: "FORBIDDEN" });
  }
  
  // Pastikan Jurik yang login punya area assignment
  if (req.user.role === "JUKIR" && !req.user.areaId) {
    return res.status(403).json({ 
      success: false, 
      message: "Jurik must be assigned an area first", 
      code: "AREA_REQUIRED" 
    });
  }
  
  next();
}

// Guard khusus untuk Jurik saja
export function requireJukir(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "JUKIR") {
    return res.status(403).json({ success: false, message: "Forbidden - Jukir access only", code: "FORBIDDEN" });
  }
  
  if (!req.user.areaId) {
    return res.status(403).json({ 
      success: false, 
      message: "Jukir must be assigned an area first", 
      code: "AREA_REQUIRED" 
    });
  }
  
  next();
}
