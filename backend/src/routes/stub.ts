import { Router } from "express";

/** Build a router whose every listed path returns a 501 stub with consistent shape.
 * ponytail: real handlers land in Phase 5+ (parking/users/payments/reports). */
export function stubRouter(name: string): Router {
  const r = Router();
  r.all("*", (req, res) => {
    res.status(501).json({
      success: false,
      message: `${name} endpoint not implemented yet`,
      code: "NOT_IMPLEMENTED",
      hint: `${req.method} ${req.baseUrl}${req.path}`,
    });
  });
  return r;
}
