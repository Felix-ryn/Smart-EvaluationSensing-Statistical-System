import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ success: false, message: "Not found", code: "NOT_FOUND" });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      code: "VALIDATION_ERROR",
      details: err.flatten(),
    });
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return res.status(503).json({
      success: false,
      message: "Database belum siap atau tidak dapat diakses",
      code: "DB_UNAVAILABLE",
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P1001") {
    return res.status(503).json({
      success: false,
      message: "Koneksi database gagal. Pastikan PostgreSQL aktif.",
      code: "DB_CONNECTION_FAILED",
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2023") {
    return res.status(400).json({
      success: false,
      message: "Format ID transaksi tidak valid",
      code: "INVALID_TRANSACTION_ID",
    });
  }

  console.error(err);
  res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
}
