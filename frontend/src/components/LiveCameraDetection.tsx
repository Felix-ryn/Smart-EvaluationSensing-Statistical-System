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
  hideDetectionResultCard?: boolean; // Hide untuk Jukir (hasil langsung ke tabel)
  fixedAreaId?: string;
  fixedAreaName?: string;
}

export function LiveCameraDetection({ onViolationDetected, defaultSource = "USER", showViolationsTable = false, hideDetectionResultCard = false, fixedAreaId, fixedAreaName }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isDetecting, setIsDetecting] = useState(false);
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState("");
  const [areaNote, setAreaNote] = useState("");
  const [lastSaveTime, setLastSaveTime] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [supportsVibration] = useState(() => "vibrate" in navigator);
  const [lastDetectionResult, setLastDetectionResult] = useState<any>(null);
  const [violations, setViolations] = useState<any[]>([]);
  const thresholdValue = 0.5; // Frontend threshold: 50%

  // Load areas & violations on mount
  useEffect(() => {
    if (fixedAreaId) {
      setSelectedAreaId(fixedAreaId);
    } else {
      api.get("/areas").then(({ data }) => {
        setAreas(data.data || []);
        if (data.data?.[0]) setSelectedAreaId(data.data[0].id);
      });
    }
    loadViolations();
  }, [fixedAreaId]);

  function loadViolations() {
    api.get("/violations/mine").then(({ data }) => {
      const ilegalOnly = (data.data || [])
        .filter((v: any) => v.violationType === "parking_violation")
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setViolations(ilegalOnly);
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
    setLastDetectionResult(null);
  }

  function startFrameProcessing() {
    let frameCount = 0;
    detectionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current) return;

      try {
        frameCount++;
        if (frameCount % 3 !== 0) return; // Sample every 3rd frame (~2.5 FPS)

        const now = Date.now();
        const cooldown = 5000; // 5 seconds in ms
        // Only process if cooldown elapsed
        if (now - lastSaveTime < cooldown) return;

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

              // Save only if parking_violation detected with confidence >= 70%
              if (violation?.violationType === "parking_violation" && violation?.confidence >= thresholdValue) {
                setLastSaveTime(Date.now());
                
                // Trigger sound + vibration
                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const osc = audioCtx.createOscillator();
                osc.frequency.value = 800;
                osc.connect(audioCtx.destination);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.2);
                if (supportsVibration) navigator.vibrate?.(200);

                // Show snapshot in preview
                if (canvasRef.current) {
                  const snapshot = canvasRef.current.toDataURL("image/jpeg");
                  const area = areas.find((a) => a.id === selectedAreaId);
                  setLastDetectionResult({
                    violationType: violation.violationType,
                    confidence: violation.confidence,
                    summary: data.data?.summary,
                    decision: data.data?.decision,
                    snapshot,
                    areaName: area?.name || "Unknown",
                  });
                }
                
                // Reload violations table if Jukir
                if (showViolationsTable) loadViolations();
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



  return (
    <div className="live-camera-container">
      {/* Form Section */}
      <div style={{ marginBottom: 20 }}>
        <div className="form-group">
          <label>Area Parkir</label>
          {fixedAreaId ? (
            <input className="input" value={fixedAreaName || ""} readOnly />
          ) : (
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
          )}
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
            <span>{(thresholdValue * 100).toFixed(0)}%</span>
          </div>
          <div className="setting-item">
            <strong>Cooldown Simpan:</strong>
            <span>5s</span>
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
            setError("");
            setLastDetectionResult(null);
          }}
          disabled={isDetecting}
        >
          <RotateCcw size={16} /> Reset
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}



      {/* Detection Result Card - auto-saved (hide if hideDetectionResultCard true) */}
      {lastDetectionResult && !hideDetectionResultCard && (
        <div className="detection-result-card card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h4 style={{ margin: 0 }}>Pelanggaran Terdeteksi & Tersimpan</h4>
            <span className="badge badge-danger">ILLEGAL</span>
          </div>

          {lastDetectionResult.snapshot && (
            <img
              src={lastDetectionResult.snapshot}
              alt="snapshot"
              style={{ width: "100%", borderRadius: 8, marginBottom: 16, maxHeight: 300, objectFit: "cover" }}
            />
          )}

          <table className="result-table" style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
            <tbody>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={{ padding: "8px", fontWeight: 600, width: "30%", color: "#6b7280" }}>Area</td>
                <td style={{ padding: "8px" }}>{lastDetectionResult.areaName || "—"}</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={{ padding: "8px", fontWeight: 600, color: "#6b7280" }}>Sumber</td>
                <td style={{ padding: "8px" }}>
                  <span className="badge badge-secondary">{defaultSource}</span>
                </td>
              </tr>
              <tr>
                <td style={{ padding: "8px", fontWeight: 600, color: "#6b7280" }}>Confidence</td>
                <td style={{ padding: "8px", fontWeight: 600, color: "#059669" }}>
                  {(lastDetectionResult.confidence * 100).toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ fontSize: 13, color: "#6b7280", padding: "8px 0" }}>
            ✓ Laporan tersimpan otomatis. Cooldown 5s sebelum deteksi berikutnya.
          </div>
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
