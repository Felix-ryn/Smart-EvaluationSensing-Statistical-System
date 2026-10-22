import { useCallback, useEffect, useState } from "react";
import { Camera, CircleStop, RefreshCw, ScanLine, ShieldAlert } from "lucide-react";
import { api } from "../../api/client";

interface PlatePrediction {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  class: string;
}
interface CameraState {
  running: boolean;
  configured: boolean;
  status: string;
  message: string;
  cameraId?: string;
  modelId?: string;
  lastFrameAt?: string | null;
  lastInferenceAt?: string | null;
  frame?: string | null;
  predictions?: PlatePrediction[];
  error?: string | null;
}

const statusLabels: Record<string, string> = {
  stopped: "Berhenti",
  starting: "Menghubungkan",
  running: "Aktif",
  reconnecting: "Menyambungkan ulang",
  error: "Error",
};

export function LicensePlateCamera() {
  const [camera, setCamera] = useState<CameraState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refreshStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/license-plate/camera/status", { timeout: 10000 });
      setCamera(data.data as CameraState);
      setError("");
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Tidak dapat mengambil status AI service");
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 2000);
    return () => window.clearInterval(timer);
  }, [refreshStatus]);

  async function runAction(action: "start" | "stop") {
    setLoading(true);
    setError("");
    try {
      await api.post(`/license-plate/camera/${action}`);
      await refreshStatus();
    } catch (err: any) {
      setError(err.response?.data?.message ?? err.response?.data?.detail ?? `Gagal ${action === "start" ? "memulai" : "menghentikan"} kamera`);
    } finally {
      setLoading(false);
    }
  }

  const predictions = camera?.predictions ?? [];

  return (
    <div className="page">
      <header className="page-header">
        <h1><ScanLine className="title-icon" size={22} /> License Plate Detection</h1>
        <p>Deteksi kotak pelat nomor dari CCTV/IP Camera secara real-time menggunakan Roboflow.</p>
      </header>

      <section className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ marginTop: 0, marginBottom: 6 }}>Status kamera</h2>
            <p style={{ margin: 0, color: "var(--muted)" }}>{camera?.message ?? "Memuat status kamera..."}</p>
          </div>
          <span className={`badge ${camera?.status === "running" ? "badge-success" : camera?.status === "error" ? "badge-danger" : "badge-secondary"}`}>
            {statusLabels[camera?.status ?? ""] ?? "Memuat"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          <button className="btn btn-primary" disabled={loading || Boolean(camera?.running)} onClick={() => void runAction("start")}>
            <Camera size={16} /> {loading ? "Memproses..." : "Mulai deteksi"}
          </button>
          <button className="btn btn-outline" disabled={loading || !camera?.running} onClick={() => void runAction("stop")}>
            <CircleStop size={16} /> Hentikan
          </button>
          <button className="btn btn-outline" disabled={loading} onClick={() => void refreshStatus()}>
            <RefreshCw size={16} /> Refresh status
          </button>
        </div>
        {error && <p role="alert" style={{ color: "crimson", marginBottom: 0 }}>{error}</p>}
        {camera?.error && <p role="alert" style={{ color: "crimson", marginBottom: 0 }}>Detail: {camera.error}</p>}
        {!camera?.configured && (
          <p style={{ marginBottom: 0, marginTop: 12, color: "var(--muted)" }}>
            RTSP URL atau API key belum terdeteksi. Atur RTSP_URL dan ROBOFLOW_API_KEY pada environment container ai-service, lalu build ulang.
          </p>
        )}
      </section>

      <div className="grid grid-2">
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Preview CCTV</h2>
          {camera?.frame ? (
            <img src={camera.frame} alt="Preview CCTV dengan kotak deteksi pelat" style={{ display: "block", width: "100%", borderRadius: 8, background: "#111" }} />
          ) : (
            <div style={{ minHeight: 240, borderRadius: 8, background: "#111", color: "#ddd", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
              <div><Camera size={34} /><p>Preview muncul setelah CCTV tersambung dan inferensi pertama berhasil.</p></div>
            </div>
          )}
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 0 }}>
            Inferensi terakhir: {camera?.lastInferenceAt ? new Date(camera.lastInferenceAt).toLocaleString("id-ID") : "belum ada"}
          </p>
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0 }}>Hasil deteksi terbaru</h2>
          <div className="grid grid-kpi" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <div className="card card-stat" style={{ marginBottom: 0 }}>
              <div className="stat-content"><span className="stat-label">Pelat terdeteksi</span><span className="stat-value">{predictions.length}</span></div>
            </div>
            <div className="card card-stat" style={{ marginBottom: 0 }}>
              <div className="stat-content"><span className="stat-label">Confidence tertinggi</span><span className="stat-value">{predictions.length ? `${Math.round(Math.max(...predictions.map((p) => p.confidence)) * 100)}%` : "-"}</span></div>
            </div>
          </div>
          {predictions.length ? (
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table className="table">
                <thead><tr><th>No.</th><th>Kelas</th><th>Confidence</th></tr></thead>
                <tbody>{predictions.map((prediction, index) => (
                  <tr key={`${prediction.x}-${prediction.y}-${index}`}>
                    <td>{index + 1}</td><td>{prediction.class}</td><td>{(prediction.confidence * 100).toFixed(1)}%</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: "var(--muted)" }}>Belum ada pelat yang terdeteksi pada inferensi terakhir.</p>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, fontSize: 13, color: "var(--muted)" }}>
            <ShieldAlert size={18} style={{ flexShrink: 0 }} />
            <span>Model saat ini mendeteksi lokasi pelat dan confidence, bukan membaca teks nomor polisi. OCR dan pembuatan karcis otomatis belum diaktifkan.</span>
          </div>
        </section>
      </div>
    </div>
  );
}
