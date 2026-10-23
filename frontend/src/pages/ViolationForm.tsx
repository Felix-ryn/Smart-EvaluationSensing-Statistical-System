import { useEffect, useState } from "react";
import { Camera, Upload } from "lucide-react";
import { api } from "../api/client";
import { LiveCameraDetection } from "../components/LiveCameraDetection";
import { useAuth } from "../contexts/AuthContext";

interface Area {
  id: string;
  name: string;
}
interface Result {
  violationDetected: boolean;
  needsReview?: boolean;
  decision?: "parking_violation" | "review" | "none";
  summary: { violation: number; normal: number };
  violation: { photoPath: string; violationType: string; confidence: number | null };
}

/** Upload foto/video ke /api/violations dan tampilkan hasil AI.
 * Dipakai halaman laporan user dan halaman pelanggaran admin. */
export function ViolationForm({
  onDone,
  defaultSource = "USER",
}: {
  onDone?: () => void;
  defaultSource?: "USER" | "JUKIR" | "CCTV";
}) {
  const { user } = useAuth();
  const isJukir = defaultSource === "JUKIR";
  const [activeTab, setActiveTab] = useState<"upload" | "camera">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [areaId, setAreaId] = useState("");
  const [source, setSource] = useState(defaultSource);
  const [note, setNote] = useState("");
  const [areas, setAreas] = useState<Area[]>([]);
  const [myAreaName, setMyAreaName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isJukir && user?.areaId) {
      api.get("/areas").then(({ data }) => {
        const list = (data.data || []) as Area[];
        setAreas(list);
        const my = list.find((a) => a.id === user.areaId);
        if (my) setMyAreaName(my.name);
      });
      return;
    }
    api.get("/areas").then(({ data }) => {
      setAreas(data.data);
      if (data.data[0]) setAreaId(data.data[0].id);
    });
  }, [isJukir, user?.areaId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      const resolvedAreaId = isJukir ? user?.areaId : areaId;
      if (resolvedAreaId) form.append("areaId", resolvedAreaId);
      form.append("source", source);
      if (note.trim()) form.append("note", note.trim());
      const { data } = await api.post("/violations", form);
      setResult(data.data);
      onDone?.();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Gagal menganalisis");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div>
      {/* Tab toggle */}
      <div className="tabs-container" style={{ marginBottom: 16, display: "flex", gap: 8, borderBottom: "1px solid #e5e7eb" }}>
        <button
          type="button"
          className={`tab-button ${activeTab === "upload" ? "active" : ""}`}
          onClick={() => setActiveTab("upload")}
          style={{
            padding: "8px 16px",
            backgroundColor: activeTab === "upload" ? "#f3f4f6" : "transparent",
            border: "none",
            borderBottom: activeTab === "upload" ? "2px solid var(--primary)" : "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: "14px",
            fontWeight: activeTab === "upload" ? "600" : "400",
          }}
        >
          <Upload size={16} /> Upload Foto/Video
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === "camera" ? "active" : ""}`}
          onClick={() => setActiveTab("camera")}
          style={{
            padding: "8px 16px",
            backgroundColor: activeTab === "camera" ? "#f3f4f6" : "transparent",
            border: "none",
            borderBottom: activeTab === "camera" ? "2px solid var(--primary)" : "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: "14px",
            fontWeight: activeTab === "camera" ? "600" : "400",
          }}
        >
          <Camera size={16} /> Kamera Live
        </button>
      </div>

      {/* Upload tab */}
      {activeTab === "upload" && (
        <form onSubmit={submit} className="violation-form-grid">
          <div className="form-group">
            <label>Area Parkir</label>
            {isJukir ? (
              <input className="input" value={myAreaName} readOnly />
            ) : (
              <select className="input" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
          </div>

          {!isJukir && (
            <div className="form-group">
              <label>Sumber Laporan</label>
              <select className="input" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
                <option value="USER">User</option>
                <option value="JUKIR">Jukir</option>
                <option value="CCTV">CCTV</option>
              </select>
            </div>
          )}

          <div className="form-group">
            <label>Upload Bukti</label>
            <div className="violation-upload-box">
              <input
                className="input"
                type="file"
                accept="image/*,video/*"
                capture="environment"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-muted">Gunakan foto/video yang menampilkan kendaraan dan area secara jelas.</p>
              {file && <p className="small">File: <strong>{file.name}</strong></p>}
              {previewUrl && file?.type.startsWith("image/") && (
                <img src={previewUrl} alt="preview" className="violation-preview" />
              )}
            </div>
          </div>

          <div className="form-group">
            <label>Keterangan Tambahan (Opsional)</label>
            <textarea
              className="input"
              rows={3}
              placeholder="Contoh: kendaraan parkir di jalur keluar-masuk"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ resize: "vertical" }}
            />
          </div>

          <button className="btn btn-primary" disabled={!file || loading} type="submit">
            {loading ? "Menganalisis..." : "Kirim & Analisis"}
          </button>
          {error && <div style={{ color: "crimson" }}>{error}</div>}
          {result && (
            <div className="card">
              {result.violationDetected ? (
                <>
                  <strong>
                    <span className="badge badge-danger">Pelanggaran Terdeteksi & Tersimpan</span>
                  </strong>
                  <p style={{ margin: "8px 0 0" }}>
                    Parkir normal: {result.summary.normal} · pelanggaran: {result.summary.violation}
                  </p>
                  {result.violation.confidence != null && (
                    <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>
                      Keyakinan: {(result.violation.confidence * 100).toFixed(1)}%
                    </p>
                  )}
                  <img
                    src={result.violation.photoPath}
                    alt="laporan"
                    style={{ marginTop: 8, maxWidth: "100%", borderRadius: 8 }}
                  />
                </>
              ) : (
                <div style={{ padding: "16px 0" }}>
                  <strong style={{ display: "block", marginBottom: 8 }}>Tidak Terdeteksi Pelanggaran</strong>
                  <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "14px" }}>
                    Foto/video tidak menunjukkan pelanggaran parkir. Silakan coba unggah bukti lain jika diperlukan.
                  </p>
                </div>
              )}
            </div>
          )}
        </form>
      )}

      {/* Camera tab */}
      {activeTab === "camera" && (
        <LiveCameraDetection
          onViolationDetected={onDone}
          defaultSource={defaultSource as "USER" | "JUKIR"}
          showViolationsTable={false}
          hideDetectionResultCard={defaultSource === "JUKIR"}
          fixedAreaId={isJukir ? user?.areaId : undefined}
          fixedAreaName={isJukir ? myAreaName : undefined}
        />
      )}
    </div>
  );
}
