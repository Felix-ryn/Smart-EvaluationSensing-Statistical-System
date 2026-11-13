import { useEffect, useRef, useState } from "react";
import { Camera, X, AlertCircle, CheckCircle2 } from "lucide-react";

interface PlateDetectionModalProps {
  vehicleType: "motorcycle" | "car";
  onPlateDetected: (plate: string, confidence: number) => void;
  onClose: () => void;
  aiServiceUrl: string;
}

const PLATE_CONFIDENCE_THRESHOLD = 0.6; // Min detection confidence to accept a plate
const FRAME_INTERVAL_MS = 600; // ~1.6 FPS, one request at a time
const MAX_FRAME_WIDTH = 640;

// Indonesian plate: 1-2 region letters + 1-4 digits + 0-3 letters.
// Mirrors the backend `_valid_plate_format`; used as a local gate so the
// frontend still accepts plates if the backend `valid` flag is absent.
const PLATE_FORMAT_RE = /^[A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{0,3}$/;

function isValidPlate(plate: string): boolean {
  return PLATE_FORMAT_RE.test(plate);
}

export function PlateDetectionModal({
  onPlateDetected,
  onClose,
  aiServiceUrl,
}: PlateDetectionModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inFlightRef = useRef(false);
  const stoppedRef = useRef(false);
  const loopTimerRef = useRef<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [previewFrame, setPreviewFrame] = useState<string | null>(null);
  const [detectedPlate, setDetectedPlate] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Memindai...");

  const stopCamera = () => {
    stoppedRef.current = true;
    if (loopTimerRef.current) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // Start camera automatically on mount.
  useEffect(() => {
    let cancelled = false;
    // StrictMode runs mount -> cleanup -> mount in dev; stopCamera() sets
    // stoppedRef=true in cleanup, so reset here or the loop never runs again.
    stoppedRef.current = false;
    inFlightRef.current = false;
    console.log("[PlateDetection] mount, aiServiceUrl =", aiServiceUrl);

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setReady(true);
      } catch (err: any) {
        setError(
          err.name === "NotAllowedError"
            ? "Izin kamera ditolak. Berikan akses kamera atau isi plat secara manual."
            : "Kamera tidak tersedia: " + (err.message || String(err))
        );
      }
    };

    start();

    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live detection loop: capture a frame, run detect + OCR, one request at a time.
  useEffect(() => {
    if (!ready || detectedPlate) return;

    let timer: number | null = null;

    const fetchWithTimeout = (url: string, init: RequestInit, ms: number): Promise<Response> => {
      const controller = new AbortController();
      const t = window.setTimeout(() => controller.abort(), ms);
      return fetch(url, { ...init, signal: controller.signal }).finally(() =>
        clearTimeout(t)
      );
    };

    // Crop the plate box out of the downscaled canvas and return a JPEG blob
    // (upscaled so its width is >= 400px). Roboflow predictions are center
    // based: x/y = center, width/height = size, in the uploaded frame pixels.
    const cropPlate = (canvas: HTMLCanvasElement, p: any): Promise<Blob | null> => {
      const cw = canvas.width;
      const ch = canvas.height;
      const w = p.width || 0;
      const h = p.height || 0;
      const cx = p.x || 0;
      const cy = p.y || 0;
      const pad = 0.08;
      let bw = w * (1 + pad * 2);
      let bh = h * (1 + pad * 2);
      let bx = cx - bw / 2;
      let by = cy - bh / 2;
      // Clamp to frame bounds.
      bx = Math.max(0, Math.min(bx, cw - bw));
      by = Math.max(0, Math.min(by, ch - bh));
      bx = Math.max(0, bx);
      by = Math.max(0, by);
      bw = Math.min(bw, cw);
      bh = Math.min(bh, ch);
      if (bw <= 0 || bh <= 0) return Promise.resolve(null);

      const out = document.createElement("canvas");
      const scaleUp = Math.max(1, 400 / bw);
      out.width = Math.round(bw * scaleUp);
      out.height = Math.round(bh * scaleUp);
      const octx = out.getContext("2d");
      if (!octx) return Promise.resolve(null);
      octx.drawImage(canvas, bx, by, bw, bh, 0, 0, out.width, out.height);
      return new Promise((resolve) => out.toBlob(resolve, "image/jpeg", 0.9));
    };

    const captureAndDetect = async () => {
      if (stoppedRef.current || detectedPlate) {
        return;
      }
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) {
        // Video not ready yet; keep polling until it is.
        if (!stoppedRef.current && !detectedPlate) {
          timer = window.setTimeout(captureAndDetect, FRAME_INTERVAL_MS);
        }
        return;
      }

      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        // Downscale frame to max 640px before upload.
        const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.8)
        );
        if (!blob) return;

        setStatus("Memindai...");

        // Step 1: plate detection (Roboflow) -> box + confidence.
        const detForm = new FormData();
        detForm.append("file", blob, "frame.jpg");
        const detStart = performance.now();
        const detRes = await fetchWithTimeout(
          `${aiServiceUrl}/license-plate/webcam/detect`,
          { method: "POST", body: detForm },
          10000
        );
        console.log("[PlateDetection] detect request:", Math.round(performance.now() - detStart), "ms");
        if (!detRes.ok) {
          throw new Error(detRes.status === 503 ? "AI service tidak tersedia." : `Deteksi gagal (${detRes.status}).`);
        }
        const detData = await detRes.json();
        if (!detData.success) {
          throw new Error("Respon AI service tidak valid.");
        }
        if (detData.frame) {
          setPreviewFrame(detData.frame);
        }

        const predictions = detData.predictions || [];
        console.log("[PlateDetection] detect predictions:", predictions.length);
        if (predictions.length === 0) {
          setError(null); // no plate yet, keep scanning silently
          setStatus("Plat belum terdeteksi");
          return;
        }

        const best = predictions.reduce((a: any, b: any) =>
          (b.confidence || 0) > (a.confidence || 0) ? b : a
        );

        setStatus("Membaca teks plat...");

        // Step 2: OCR the cropped plate region only.
        const cropBlob = await cropPlate(canvas, best);
        if (!cropBlob) return;

        const ocrForm = new FormData();
        ocrForm.append("file", cropBlob, "plate.jpg");
        const ocrStart = performance.now();
        const ocrRes = await fetchWithTimeout(
          `${aiServiceUrl}/license-plate/ocr`,
          { method: "POST", body: ocrForm },
          20000
        );
        console.log("[PlateDetection] ocr request:", Math.round(performance.now() - ocrStart), "ms");
        if (!ocrRes.ok) {
          throw new Error(ocrRes.status === 503 ? "AI service tidak tersedia." : `OCR gagal (${ocrRes.status}).`);
        }
        const ocrData = await ocrRes.json();
        if (!ocrData.success) {
          throw new Error("Respon OCR tidak valid.");
        }

        const plate = (ocrData.text || "").trim().toUpperCase();
        console.log("[PlateDetection] ocr:", {
          text: plate,
          boxes: ocrData.boxes,
          valid: ocrData.valid,
          confidence: best.confidence,
        });

        // Accept only the first valid reading (format + detection confidence).
        const plateConfidence = best.confidence || 0;
        const formatValid = ocrData.valid ?? isValidPlate(plate);
        if (plate && formatValid && plateConfidence >= PLATE_CONFIDENCE_THRESHOLD) {
          setDetectedPlate(plate);
          setPreviewFrame(detData.frame || null);
          stopCamera();
          onPlateDetected(plate, plateConfidence);
        } else {
          setStatus(`Bacaan tidak valid: ${plate || "(kosong)"}`);
        }
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!stoppedRef.current) {
          setError(msg);
          setStatus(msg);
        }
      } finally {
        inFlightRef.current = false;
        // Ensure status is not stuck mid-stage; loop continues unless stopped.
        if (!stoppedRef.current && !detectedPlate) {
          timer = window.setTimeout(captureAndDetect, FRAME_INTERVAL_MS);
        }
      }
    };

    timer = window.setTimeout(captureAndDetect, 200);
    loopTimerRef.current = timer;

    return () => {
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, detectedPlate]);

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleClose}>
      <div
        className="modal-card plate-detection-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>
            <Camera size={18} strokeWidth={1.8} aria-hidden="true" /> Deteksi Plat Nomor
          </h2>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleClose}
            aria-label="Tutup"
          >
            <X size={15} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        <div className="plate-detection-content">
          <div className="webcam-container">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: "100%", height: "auto", borderRadius: "8px" }}
            />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {!ready && !error && (
              <div className="loading-overlay">
                <p>Menyalakan kamera...</p>
              </div>
            )}
            {detectedPlate && (
              <div className="plate-read-overlay">
                <CheckCircle2 size={40} aria-hidden="true" />
                <strong>Plat terbaca</strong>
              </div>
            )}
          </div>

          {previewFrame && !detectedPlate && (
            <div className="preview-container mt-3">
              <img src={previewFrame} alt="Plate detection preview" style={{ width: "100%", borderRadius: "8px" }} />
            </div>
          )}

          <p className="text-muted text-sm mt-3" role="status" aria-live="polite">
            {status}
          </p>

          {error && (
            <div className="alert alert-error mt-3">
              <AlertCircle size={16} aria-hidden="true" /> {error}
            </div>
          )}

          <p className="text-muted text-sm mt-3">
            Arahkan kamera ke plat nomor. Deteksi berjalan otomatis.
          </p>

          <div className="actions mt-3">
            <button type="button" className="btn btn-outline" onClick={handleClose}>
              Kembali
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .plate-detection-modal {
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .plate-detection-content {
          padding: 20px;
        }

        .webcam-container {
          position: relative;
          width: 100%;
          border-radius: 8px;
          overflow: hidden;
          background: #000;
          min-height: 300px;
        }

        .loading-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 14px;
          border-radius: 8px;
        }

        .plate-read-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(34, 197, 94, 0.9);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          color: white;
          font-size: 18px;
          border-radius: 8px;
        }

        .preview-container {
          border-radius: 8px;
          overflow: hidden;
        }

        .actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }

        .actions button {
          min-width: 120px;
        }
      `}</style>
    </div>
  );
}
