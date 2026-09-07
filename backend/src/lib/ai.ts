import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import { env } from "../env.js";

export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
// 25MB cap covers phone photos and short clips.
export const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

export interface Detection {
  class: "space-empty" | "space-occupied" | "illegal-parking";
  confidence: number;
  box: [number, number, number, number]; // x, y, w, h
}
export interface DetectResult {
  detections: Detection[];
  summary: { empty: number; occupied: number; illegal: number };
}

/** Send an uploaded file to the Python AI service and return its detections. */
export async function detectFile(filePath: string, mimetype: string): Promise<DetectResult> {
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: mimetype,
  });
  const { data } = await axios.post(`${env.aiServiceUrl}/detect`, form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 120_000,
  });
  return data as DetectResult;
}
