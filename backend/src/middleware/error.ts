import type { Request, Response, NextFunction } from "express";
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
  console.error(err);
  res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
}
