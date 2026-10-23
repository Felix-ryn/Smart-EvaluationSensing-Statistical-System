import { useEffect, useRef, useState } from "react";
import { Camera, Tv, X, RotateCw, AlertCircle, CheckCircle2 } from "lucide-react";

interface PlateDetectionModalProps {
  vehicleType: "motorcycle" | "car";
  onPlateDetected: (plate: string, confidence: number) => void;
  onClose: () => void;
  aiServiceUrl: string;
}

interface DetectionResult {
  plate: string;
  confidence: number;
  source: "webcam" | "cctv";
}

const OCR_CONFIDENCE_THRESHOLD = 0.85; // User-editable threshold (line 14)

export function PlateDetectionModal({
  vehicleType,
  onPlateDetected,
  onClose,
  aiServiceUrl,
}: PlateDetectionModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [source, setSource] = useState<"webcam" | "cctv" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webcamActive, setWebcamActive] = useState(false);
  const [cctvActive, setCCTVActive] = useState(false);
  const [cctvStatus, setCCTVStatus] = useState<string>("stopped");
  const [cctvStatusMessage, setCCTVStatusMessage] = useState<string>("");
  const [previewFrame, setPreviewFrame] = useState<string | null>(null);

  const [detectionResult, setDetectionResult] = useState<DetectionResult | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [editedPlate, setEditedPlate] = useState("");
  const [rtspUrl, setRtspUrl] = useState("");
  const [showRtspInput, setShowRtspInput] = useState(false);

  const cctvPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start webcam
  const startWebcam = async () => {
    setError(null);
    setLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setWebcamActive(true);
      }
    } catch (err: any) {
      const message = err.name === "NotAllowedError" 
        ? "Izin kamera ditolak. Gunakan input manual."
        : "Gagal mengakses kamera: " + err.message;
      setError(message);
      setWebcamActive(false);
    } finally {
      setLoading(false);
    }
  };

  // Stop webcam
  const stopWebcam = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
    }
    setWebcamActive(false);
    setPreviewFrame(null);
  };

  // Capture frame from webcam and detect
  const captureWebcamFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setError(null);
    setLoading(true);

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d")!;
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      ctx.drawImage(videoRef.current, 0, 0);

      // Convert to blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setError("Gagal menangkap frame dari kamera");
          setLoading(false);
          return;
        }

        try {
          // Step 1: Detect plate bounding box (Roboflow)
          const formData = new FormData();
          formData.append("file", blob, "frame.jpg");

          const detRes = await fetch(`${aiServiceUrl}/license-plate/webcam/detect`, {
            method: "POST",
            body: formData,
          });

          if (!detRes.ok) {
            throw new Error(await detRes.text());
          }

          const detData = await detRes.json();
          if (!detData.success || detData.predictions.length === 0) {
            setError("Tidak ada plat nomor terdeteksi. Coba lagi atau input manual.");
            setLoading(false);
            return;
          }

          // Show preview with detections
          if (detData.frame) {
            setPreviewFrame(detData.frame);
          }

          // Step 2: Extract plate text using OCR from detected region
          // For simplicity, send the whole frame to OCR
          // (In production, could crop the detected region first)
          const ocrFormData = new FormData();
          ocrFormData.append("file", blob, "frame.jpg");

          const ocrRes = await fetch(`${aiServiceUrl}/license-plate/ocr`, {
            method: "POST",
            body: ocrFormData,
          });

          if (!ocrRes.ok) {
            throw new Error(await ocrRes.text());
          }

          const ocrData = await ocrRes.json();
          if (!ocrData.success || !ocrData.text) {
            setError("OCR gagal membaca plat. Coba lagi atau input manual.");
            setLoading(false);
            return;
          }

          // Step 3: Decide based on confidence threshold
          const result: DetectionResult = {
            plate: ocrData.text.trim().toUpperCase(),
            confidence: ocrData.confidence,
            source: "webcam",
          };

          setDetectionResult(result);
          setEditedPlate(result.plate);

          if (result.confidence >= OCR_CONFIDENCE_THRESHOLD) {
            // Auto-fill: confidence is high enough
            onPlateDetected(result.plate, result.confidence);
          } else {
            // Ask for confirmation: confidence is lower
            setShowConfirmation(true);
          }
        
        } catch (err: any) {
          console.error("OCR request gagal:", err);
          setError(
            "Error OCR: " +
              (err instanceof Error ? err.message : String(err))
          );
        } finally {
          setLoading(false);
        }

      });
    } catch (err: any) {
      setError("Error capturing frame: " + err.message);
      setLoading(false);
    }
  };

  // Start CCTV polling
  const startCCTV = async (url?: string) => {
    setError(null);
    setLoading(true);

    try {
      const body: Record<string, string> = {};
      if (url) {
        body.rtspUrl = url;
      }

      const startRes = await fetch(`${aiServiceUrl}/license-plate/camera/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      });

      if (!startRes.ok) {
        throw new Error(await startRes.text());
      }

      setCCTVActive(true);
      setCCTVStatus("starting");
      setCCTVStatusMessage("Menghubungkan ke CCTV...");

      // Poll status every 500ms
      if (cctvPollIntervalRef.current) {
        clearInterval(cctvPollIntervalRef.current);
      }

      cctvPollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${aiServiceUrl}/license-plate/camera/status`);
          const statusData = await statusRes.json();

          if (statusData.success && statusData.data) {
            const state = statusData.data;
            setCCTVStatus(state.status);
            setCCTVStatusMessage(state.message || "");
            if (state.frame) {
              setPreviewFrame(state.frame);
            }

            // If plate detected with high confidence, auto-fill
            if (state.predictions && state.predictions.length > 0) {
              const pred = state.predictions[0];
              if (pred.confidence >= OCR_CONFIDENCE_THRESHOLD) {
                // Detected plate with high confidence
                // Note: Roboflow only gives bounding box, not text
                // We would need to extract and OCR the region
                // For now, just show detection
              }
            }
          }
        } catch (err) {
          // Silent fail on polling error
        }
      }, 500);
    } catch (err: any) {
      setError("Gagal memulai CCTV: " + (err.message || "Unknown error"));
      setCCTVActive(false);
    } finally {
      setLoading(false);
    }
  };

  // Stop CCTV
  const stopCCTV = async () => {
    if (cctvPollIntervalRef.current) {
      clearInterval(cctvPollIntervalRef.current);
    }

    try {
      await fetch(`${aiServiceUrl}/license-plate/camera/stop`, {
        method: "POST",
      });
    } catch (err) {
      // Silent fail
    }

    setCCTVActive(false);
    setCCTVStatus("stopped");
    setCCTVStatusMessage("CCTV dihentikan");
    setPreviewFrame(null);
  };

  // Handle confirmation
  const handleConfirm = () => {
    if (editedPlate.trim()) {
      if (detectionResult) {
        onPlateDetected(editedPlate.toUpperCase(), detectionResult.confidence);
      }
    }
  };

  // Auto-start webcam when source is selected
  useEffect(() => {
    if (source === "webcam" && !webcamActive && !error) {
      startWebcam();
    }
  }, [source]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWebcam();
      if (cctvActive) {
        stopCCTV();
      }
    };
  }, []);

  // Close modal
  const handleClose = () => {
    stopWebcam();
    if (cctvActive) {
      stopCCTV();
    }
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
            disabled={loading}
            aria-label="Tutup"
          >
            <X size={15} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>

        {/* Step 1: Choose Source */}
        {source === null && !detectionResult && (
          <div className="plate-detection-content">
            <p className="text-muted mb-3">Pilih sumber kamera untuk mendeteksi plat nomor:</p>

            <div className="plate-source-buttons">
              <button
                type="button"
                className="btn btn-secondary plate-source-btn"
                onClick={() => setSource("webcam")}
                disabled={loading}
              >
                <Camera size={20} strokeWidth={1.8} aria-hidden="true" /> Webcam
              </button>
              <button
                type="button"
                className="btn btn-secondary plate-source-btn"
                onClick={() => setSource("cctv")}
                disabled={loading}
              >
                <Tv size={20} strokeWidth={1.8} aria-hidden="true" /> CCTV
              </button>
            </div>

            <p className="text-muted text-sm mt-3">
              Confidence threshold: {(OCR_CONFIDENCE_THRESHOLD * 100).toFixed(0)}% (auto-fill)
            </p>
          </div>
        )}

        {/* Step 2: Webcam Detection */}
        {source === "webcam" && !showConfirmation && (
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
              {loading && !webcamActive && (
                <div className="loading-overlay">
                  <p>Meminta izin kamera...</p>
                </div>
              )}
            </div>

            {previewFrame && (
              <div className="preview-container mt-3">
                <img src={previewFrame} alt="Plate detection preview" style={{ width: "100%", borderRadius: "8px" }} />
              </div>
            )}

            {error && (
              <div className="alert alert-error mt-3">
                <AlertCircle size={16} aria-hidden="true" /> {error}
              </div>
            )}

            <div className="actions mt-3">
              <button
                type="button"
                className="btn btn-primary"
                onClick={captureWebcamFrame}
                disabled={loading || !webcamActive}
              >
                {loading ? "Processing..." : "Ambil Foto & Deteksi"}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  stopWebcam();
                  setSource(null);
                  setPreviewFrame(null);
                  setError(null);
                }}
                disabled={loading}
              >
                Kembali
              </button>
            </div>
          </div>
        )}

        {/* Step 2a: CCTV URL Input (before connecting) */}
        {source === "cctv" && !cctvActive && !showConfirmation && (
          <div className="plate-detection-content">
            <div className="cctv-setup-form">
              <h3>Konfigurasi CCTV</h3>
              <p className="text-muted text-sm mb-3">Masukkan URL RTSP kamera untuk deteksi plat nomor.</p>
              
              <div className="form-group">
                <label htmlFor="rtspUrl">RTSP URL</label>
                <input
                  id="rtspUrl"
                  type="text"
                  className="input"
                  value={rtspUrl}
                  onChange={(e) => setRtspUrl(e.target.value)}
                  placeholder="Contoh: rtsp://192.168.1.100:554/stream"
                  disabled={loading}
                  autoComplete="off"
                />
                <p className="text-muted text-xs mt-2">
                  Format: rtsp://[IP]:[port]/[path]
                </p>
              </div>

              {error && (
                <div className="alert alert-error mt-3">
                  <AlertCircle size={16} aria-hidden="true" /> {error}
                </div>
              )}

              <div className="actions mt-4">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    if (!rtspUrl.trim()) {
                      setError("RTSP URL tidak boleh kosong");
                      return;
                    }
                    startCCTV(rtspUrl.trim());
                  }}
                  disabled={loading || !rtspUrl.trim()}
                >
                  {loading ? "Menghubungkan..." : "Mulai CCTV"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setSource(null);
                    setRtspUrl("");
                    setError(null);
                  }}
                  disabled={loading}
                >
                  Kembali
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2b: CCTV Detection */}
        {source === "cctv" && cctvActive && !showConfirmation && (
          <div className="plate-detection-content">
            {previewFrame && (
              <div className="preview-container">
                <img src={previewFrame} alt="CCTV live preview" style={{ width: "100%", borderRadius: "8px" }} />
              </div>
            )}

            <div className="cctv-status mt-3">
              <div className={`status-badge status-${cctvStatus}`}>
                {cctvStatus === "running" && <CheckCircle2 size={16} aria-hidden="true" />}
                {cctvStatus === "reconnecting" && <RotateCw size={16} aria-hidden="true" />}
                {cctvStatus === "error" && <AlertCircle size={16} aria-hidden="true" />}
                <span>{cctvStatusMessage}</span>
              </div>
            </div>

            {error && (
              <div className="alert alert-error mt-3">
                <AlertCircle size={16} aria-hidden="true" /> {error}
              </div>
            )}

            <div className="actions mt-3">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  stopCCTV();
                  setSource(null);
                  setPreviewFrame(null);
                  setError(null);
                }}
              >
                Hentikan CCTV
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirmation (if confidence < 85%) */}
        {showConfirmation && detectionResult && (
          <div className="plate-detection-content">
            <div className="confirmation-container">
              <h3>Hasil Deteksi</h3>

              {previewFrame && (
                <img src={previewFrame} alt="Detected plate" style={{ width: "100%", borderRadius: "8px", marginTop: "12px" }} />
              )}

              <div className="result-info mt-3">
                <div className="info-row">
                  <span className="label">Plat Terdeteksi:</span>
                  <strong className="value">{detectionResult.plate}</strong>
                </div>
                <div className="info-row">
                  <span className="label">Confidence:</span>
                  <strong className={`value ${detectionResult.confidence >= 0.85 ? "text-success" : "text-warning"}`}>
                    {(detectionResult.confidence * 100).toFixed(1)}%
                  </strong>
                </div>
              </div>

              <p className="text-muted text-sm mt-3">
                Confidence di bawah threshold. Periksa dan edit jika diperlukan:
              </p>

              <div className="form-group mt-3">
                <label htmlFor="editedPlate">Plat Nomor</label>
                <input
                  id="editedPlate"
                  type="text"
                  className="input"
                  value={editedPlate}
                  onChange={(e) => setEditedPlate(e.target.value.toUpperCase())}
                  maxLength={15}
                  placeholder="Edit plat nomor..."
                />
              </div>

              <div className="actions mt-3">
                <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={!editedPlate.trim()}>
                  Simpan & Lanjutkan
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setShowConfirmation(false);
                    setDetectionResult(null);
                    setEditedPlate("");
                    setPreviewFrame(null);
                    setError(null);
                    if (source === "webcam") {
                      startWebcam();
                    }
                  }}
                >
                  Ulangi Deteksi
                </button>
              </div>
            </div>
          </div>
        )}
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

        .plate-source-buttons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin: 16px 0;
        }

        .plate-source-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 24px 16px;
          min-height: 100px;
          font-size: 14px;
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

        .preview-container {
          border-radius: 8px;
          overflow: hidden;
        }

        .cctv-status {
          display: flex;
          justify-content: center;
        }

        .status-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
        }

        .status-running {
          background-color: rgba(34, 197, 94, 0.1);
          color: #22c55e;
        }

        .status-reconnecting {
          background-color: rgba(245, 158, 11, 0.1);
          color: #f59e0b;
        }

        .status-error {
          background-color: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }

        .status-stopped {
          background-color: rgba(107, 114, 128, 0.1);
          color: #6b7280;
        }

        .confirmation-container {
          border-top: 1px solid #e5e7eb;
          padding-top: 20px;
        }

        .confirmation-container h3 {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 600;
        }

        .result-info {
          background: #f9fafb;
          padding: 12px 16px;
          border-radius: 6px;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 8px 0;
        }

        .info-row .label {
          font-size: 13px;
          color: #6b7280;
        }

        .info-row .value {
          font-size: 14px;
        }

        .text-success {
          color: #22c55e;
        }

        .text-warning {
          color: #f59e0b;
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
