import { Router } from "express";
import axios from "axios";
import { env } from "../env.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

export const licensePlateRouter = Router();
licensePlateRouter.use(requireAuth, requireAdmin);

async function forwardCameraAction(path: string, method: "get" | "post") {
  try {
    const response = method === "get"
      ? await axios.get(`${env.aiServiceUrl}${path}`, { timeout: 10_000 })
      : await axios.post(`${env.aiServiceUrl}${path}`, {}, { timeout: 10_000 });
    return { status: response.status, data: response.data };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 502;
      const message = (error.response?.data as any)?.detail
        ?? (error.response?.data as any)?.message
        ?? (error.code === "ECONNABORTED" ? "AI service timeout" : "AI service tidak dapat dihubungi");
      return { status, data: { success: false, message } };
    }
    return { status: 502, data: { success: false, message: "Gagal menghubungi AI service" } };
  }
}

licensePlateRouter.post("/camera/start", async (_req, res) => {
  const result = await forwardCameraAction("/license-plate/camera/start", "post");
  res.status(result.status).json(result.data);
});

licensePlateRouter.post("/camera/stop", async (_req, res) => {
  const result = await forwardCameraAction("/license-plate/camera/stop", "post");
  res.status(result.status).json(result.data);
});

licensePlateRouter.get("/camera/status", async (_req, res) => {
  const result = await forwardCameraAction("/license-plate/camera/status", "get");
  res.status(result.status).json(result.data);
});
