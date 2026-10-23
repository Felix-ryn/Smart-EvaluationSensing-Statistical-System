import { Router } from "express";
import axios from "axios";

export const ipcamRouter = Router();

const ALLOWED_PROTOCOLS = ["http:", "https:"];

// GET /api/ipcam/snapshot?url=... — proxy snapshot IP Webcam server-side
// untuk menghindari batasan CORS browser saat mengambil frame dari kamera HP.
ipcamRouter.get("/snapshot", async (req, res) => {
  try {
    const rawUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
    if (!rawUrl) {
      return res.status(400).json({ success: false, message: "Parameter url wajib diisi" });
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ success: false, message: "URL kamera tidak valid" });
    }
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return res.status(400).json({ success: false, message: "Protokol URL kamera tidak didukung" });
    }

    const response = await axios.get(parsed.toString(), {
      responseType: "arraybuffer",
      timeout: 8000,
      maxRedirects: 5,
      headers: { Accept: "image/*" },
    });

    const contentType = String(response.headers["content-type"] || "image/jpeg");
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");
    res.send(Buffer.from(response.data));
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message = error.code === "ECONNABORTED"
        ? "Kamera tidak merespons (timeout)"
        : "Tidak dapat menjangkau kamera";
      return res.status(502).json({ success: false, message });
    }
    return res.status(502).json({ success: false, message: "Gagal mengambil snapshot kamera" });
  }
});
