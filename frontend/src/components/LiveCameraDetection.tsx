import { useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, Pause, Play, RotateCcw, Settings, Volume2 } from "lucide-react";
import { api } from "../api/client";

interface Area {
  id: string;
  name: string;
}

interface DetectionFrame {
  timestamp: number;
  isViolation: boolean;
  confidence: number;
}

interface Alert {
  id: string;
  timestamp: number;
  area: string;
  confidence: number;
  snapshot: string;
}

interface CameraProps {
  onViolationDetected?: (violation: Alert) => void;
  defaultSource?: "USER" | "JUKIR";
  showViolationsTable?: boolean; // Hanya tampil di Jukir
}

export function LiveCameraDetection({ onViolationDetected, defaultSource = "USER", showViolationsTable = false }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isDetecting, setIsDetecting] = useState(false);
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [areaNote, setAreaNote] = useState("");
  const threshold = 0.3; // Fixed: 30%
  const cooldown = 5; // Fixed: 5 seconds
  const [lastAlertTime, setLastAlertTime] = useState(0);
  const [frameHistory, setFrameHistory] = useState<DetectionFrame[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [supportsVibration] = useState(() => "vibrate" in navigator);
  const [lastDetectionResult, setLastDetectionResult] = useState<any>(null);
  const [violations, setViolations] = useState<any[]>([]);

  // Load areas & violations on mount
  useEffect(() => {
    api.get("/areas").then(({ data }) => {
      setAreas(data.data || []);
      if (data.data?.[0]) setSelectedAreaId(data.data[0].id);
    });
    loadViolations();
  }, []);

  function loadViolations() {
    api.get("/violations/mine").then(({ data }) => {
      setViolations(data.data || []);
    }).catch(err => console.error("Load violations error:", err));
  }

  async function handleValidate(violationId: string, status: "VALID" | "REJECTED") {
    try {
      await api.patch(`/violations/${violationId}/status`, { status });
      loadViolations(); // Refresh tabel
    } catch (err: any) {
      alert(err.response?.data?.message || "Gagal update status");
    }
  }

  async function startDetection() {
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsDetecting(true);
      startFrameProcessing();
    } catch (err: any) {
      setError(err.message || "Kamera tidak tersedia atau ditolak");
      setIsDetecting(false);
    }
  }

  function stopDetection() {
    setIsDetecting(false);
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setFrameHistory([]);
    setLastDetectionResult(null);
  }

  function startFrameProcessing() {
    let frameCount = 0;
    detectionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current) return;

      try {
        // Capture frame every 5 intervals (~2.5 FPS effective for detection)
        frameCount++;
        if (frameCount % 3 !== 0) return; // Sample every 3rd frame

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = 640;
        canvas.height = (videoRef.current.videoHeight * 640) / videoRef.current.videoWidth;
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

        // Convert to JPEG
        canvas.toBlob(
          async (blob) => {
            if (!blob) return;
            setLoading(true);
            try {
              const form = new FormData();
              form.append("photo", blob, "frame.jpg");
              if (selectedAreaId) form.append("areaId", selectedAreaId);
              form.append("source", defaultSource);
              if (areaNote.trim()) form.append("note", areaNote.trim());

              const { data } = await api.post("/violations", form);
              const violation = data.data?.violation;

              if (violation?.confidence != null) {
                const isViolation = violation.confidence >= threshold;

                // Only display FIRST detection result for user review
                // (don't auto-trigger alert like before)
                if (!lastDetectionResult) {
                  setLastDetectionResult({
                    violationType: violation.violationType,
                    confidence: violation.confidence,
                    summary: data.data?.summary,
                    decision: data.data?.decision,
                  });
                }
              }
            } catch (err) {
              console.error("Detection error:", err);
            } finally {
              setLoading(false);
            }
          },
          "image/jpeg",
          0.8
        );
      } catch (err) {
        console.error("Frame processing error:", err);
      }
    }, 500);
  }

  function triggerAlert(frame: DetectionFrame) {
    const now = Date.now();
    setLastAlertTime(now);

    // Sound
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    osc.frequency.value = 800;
    osc.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);

    // Vibration
    if (supportsVibration) {
      navigator.vibrate?.(200);
    }

    // Snapshot
    if (canvasRef.current) {
      const snapshot = canvasRef.current.toDataURL("image/jpeg");
      const area = areas.find((a) => a.id === selectedAreaId);

      const alert: Alert = {
        id: Math.random().toString(36).slice(2),
        timestamp: now,
        area: area?.name || "Unknown",
        confidence: frame.confidence,
        snapshot,
      };

      setAlerts((prev) => [alert, ...prev].slice(0, 5));
      onViolationDetected?.(alert);
    }
  }

  return (
    <div className="live-camera-container">
      {/* Form Section */}
      <div style={{ marginBottom: 20 }}>
        <div className="form-group">
          <label>Area Parkir</label>
          <select
            className="input"
            value={selectedAreaId}
            onChange={(e) => setSelectedAreaId(e.target.value)}
            disabled={isDetecting}
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Keterangan Tambahan (Opsional)</label>
          <textarea
            className="input"
            rows={3}
            placeholder="Contoh: area dekat pintu keluar"
            value={areaNote}
            onChange={(e) => setAreaNote(e.target.value)}
            disabled={isDetecting}
            style={{ resize: "vertical" }}
          />
        </div>

        <div className="camera-settings-info">
          <div className="setting-item">
            <strong>Threshold Confidence:</strong>
            <span>{(threshold * 100).toFixed(0)}%</span>
          </div>
          <div className="setting-item">
            <strong>Cooldown Alert:</strong>
            <span>{cooldown}s</span>
          </div>
        </div>
      </div>

      {/* Camera Preview & Controls */}
      <div className="camera-preview-container">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="camera-preview"
          style={{
            display: isDetecting ? "block" : "none",
            width: "100%",
            borderRadius: 8,
            backgroundColor: "#000",
          }}
        />
        {!isDetecting && (
          <div
            className="camera-placeholder"
            style={{
              width: "100%",
              height: 300,
              backgroundColor: "#f3f4f6",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#9ca3af",
            }}
          >
            <Camera size={48} strokeWidth={1.5} />
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>

      {/* Control Buttons */}
      <div className="camera-controls">
        <button
          className={`btn ${isDetecting ? "btn-danger" : "btn-primary"}`}
          onClick={isDetecting ? stopDetection : startDetection}
          disabled={loading || !selectedAreaId}
        >
          {isDetecting ? (
            <>
              <Pause size={16} /> Berhenti Deteksi
            </>
          ) : (
            <>
              <Play size={16} /> Mulai Deteksi
            </>
          )}
        </button>
        <button
          className="btn btn-outline"
          onClick={() => {
            setFrameHistory([]);
            setAlerts([]);
            setError("");
            setLastDetectionResult(null);
          }}
          disabled={isDetecting}
        >
          <RotateCcw size={16} /> Reset
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {/* Frame history visualization */}
      {frameHistory.length > 0 && (
        <div className="frame-history">
          <h4>Status Frame Terakhir ({frameHistory.length}/5)</h4>
          <div className="frame-history-grid">
            {frameHistory.map((f, i) => (
              <div key={i} className={`frame-item ${f.isViolation ? "violation" : "normal"}`}>
                <div className="frame-badge">{i + 1}</div>
                <div className="frame-conf">{(f.confidence * 100).toFixed(0)}%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detection Result Card with Action Button */}
      {lastDetectionResult && (
        <div className="detection-result-card card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h4 style={{ margin: 0 }}>Hasil Deteksi Terakhir</h4>
            <span className="badge badge-warning">PERLU REVIEW ADMIN/JUKIR</span>
          </div>

          <table className="result-table" style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
            <tbody>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={{ padding: "8px", fontWeight: 600, width: "30%", color: "#6b7280" }}>Jenis</td>
                <td style={{ padding: "8px" }}>
                  {lastDetectionResult.decision === "parking_violation" ? (
                    <span className="badge badge-danger">ILLEGAL</span>
                  ) : lastDetectionResult.decision === "review" ? (
                    <span className="badge badge-warning">REVIEW</span>
                  ) : (
                    <span className="badge badge-success">CLEAR</span>
                  )}
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={{ padding: "8px", fontWeight: 600, color: "#6b7280" }}>Area</td>
                <td style={{ padding: "8px" }}>{areas.find(a => a.id === selectedAreaId)?.name || "—"}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={{ padding: "8px", fontWeight: 600, color: "#6b7280" }}>Sumber</td>
                <td style={{ padding: "8px" }}>
                  <span className="badge badge-secondary">{defaultSource}</span>
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={{ padding: "8px", fontWeight: 600, color: "#6b7280" }}>Parkir Normal</td>
                <td style={{ padding: "8px" }}>{lastDetectionResult.summary?.normal ?? 0}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={{ padding: "8px", fontWeight: 600, color: "#6b7280" }}>Pelanggaran</td>
                <td style={{ padding: "8px" }}>{lastDetectionResult.summary?.violation ?? 0}</td>
              </tr>
              <tr>
                <td style={{ padding: "8px", fontWeight: 600, color: "#6b7280" }}>Confidence</td>
                <td style={{ padding: "8px", fontWeight: 600, color: "#059669" }}>
                  {(lastDetectionResult.confidence * 100).toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>

          <button className="btn btn-primary" style={{ width: "100%" }}>
            Kirim & Analisis
          </button>
        </div>
      )}

      {/* Violations Table - Hanya tampil di Jukir */}
      {showViolationsTable && violations.length > 0 && (
        <div className="violations-table-container card">
          <h4 style={{ marginTop: 0, marginBottom: 12 }}>Laporan Saya</h4>
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb", backgroundColor: "#f9fafb" }}>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: 600, fontSize: "13px" }}>Foto</th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: 600, fontSize: "13px" }}>Jenis</th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: 600, fontSize: "13px" }}>Area</th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: 600, fontSize: "13px" }}>Sumber</th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: 600, fontSize: "13px" }}>Status</th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: 600, fontSize: "13px" }}>Waktu</th>
                  <th style={{ padding: "10px", textAlign: "left", fontWeight: 600, fontSize: "13px" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {violations.slice().reverse().map((v) => (
                  <tr key={v.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "10px" }}>
                      <a href={v.photoPath} target="_blank" rel="noreferrer">
                        <img src={v.photoPath} alt="violation" style={{ width: 60, height: 45, borderRadius: 4, objectFit: "cover" }} />
                      </a>
                    </td>
                    <td style={{ padding: "10px" }}>
                      {v.violationType === "parking_violation" ? (
                        <span className="badge badge-danger">ILLEGAL</span>
                      ) : v.violationType === "review" ? (
                        <span className="badge badge-warning">REVIEW</span>
                      ) : (
                        <span className="badge badge-success">CLEAR</span>
                      )}
                    </td>
                    <td style={{ padding: "10px", fontSize: "13px" }}>{v.area?.name || "—"}</td>
                    <td style={{ padding: "10px" }}>
                      <span className="badge badge-secondary">{v.source}</span>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <span className={`badge ${
                        v.status === "PENDING" ? "badge-warning" : 
                        v.status === "VALID" ? "badge-danger" : 
                        "badge-success"
                      }`}>
                        {v.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px", fontSize: "12px", color: "#6b7280" }}>
                      {new Date(v.createdAt).toLocaleString("id-ID")}
                    </td>
                    <td style={{ padding: "10px" }}>
                      {v.status === "PENDING" ? (
                        <div style={{ display: "flex", gap: "6px", flexDirection: "column" }}>
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => handleValidate(v.id, "VALID")}
                            style={{ fontSize: "11px", padding: "4px 8px" }}
                          >
                            Valid
                          </button>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => handleValidate(v.id, "REJECTED")}
                            style={{ fontSize: "11px", padding: "4px 8px" }}
                          >
                            Tolak
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: "12px", color: "#6b7280" }}>Selesai</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`
        .live-camera-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .camera-settings-info {
          display: flex;
          gap: 24px;
          padding: 12px;
          background: #f9fafb;
          border-radius: 8px;
          margin-bottom: 12px;
        }
        .setting-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .setting-item strong {
          font-size: 13px;
          color: #6b7280;
        }
        .setting-item span {
          font-size: 18px;
          font-weight: 600;
          color: #1f2937;
        }
        .camera-preview-container {
          width: 100%;
          overflow: hidden;
        }
        .camera-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .camera-controls {
          display: flex;
          gap: 8px;
        }
        .frame-history {
          padding: 12px;
          background: #f9fafb;
          border-radius: 8px;
        }
        .frame-history h4 {
          margin: 0 0 8px;
          font-size: 14px;
        }
        .frame-history-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 6px;
        }
        .frame-item {
          padding: 8px;
          border-radius: 4px;
          text-align: center;
          font-size: 12px;
          position: relative;
        }
        .frame-item.violation {
          background: #fee2e2;
          color: #991b1b;
        }
        .frame-item.normal {
          background: #dcfce7;
          color: #166534;
        }
        .frame-badge {
          font-weight: 600;
        }
        .frame-conf {
          font-size: 11px;
          margin-top: 4px;
        }
        .alert-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          border-radius: 8px;
          background: #fecaca;
          color: #7f1d1d;
          margin: 0;
        }
        .alerts-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .alerts-list {
          max-height: 300px;
          overflow-y: auto;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 12px;
        }
        .alerts-list h4 {
          margin: 0 0 12px;
          font-size: 14px;
        }
        .alert-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px;
          border-bottom: 1px solid #f3f4f6;
          font-size: 13px;
        }
        .alert-item:last-child {
          border-bottom: none;
        }
        .small {
          font-size: 12px;
          margin-top: 4px;
        }
        .text-muted {
          color: #6b7280;
        }
        .detection-result-card {
          margin-bottom: 16px;
        }
        .detection-result-card h4 {
          font-size: 14px;
          font-weight: 600;
          color: #1f2937;
        }
        .result-table td {
          padding: 8px !important;
        }
        .badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
        }
        .badge-danger {
          background: #fee2e2;
          color: #991b1b;
        }
        .badge-warning {
          background: #fef3c7;
          color: #92400e;
        }
        .badge-success {
          background: #dcfce7;
          color: #166534;
        }
        .badge-secondary {
          background: #e5e7eb;
          color: #374151;
        }
      `}</style>
    </div>
  );
}
