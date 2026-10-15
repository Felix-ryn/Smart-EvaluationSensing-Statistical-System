import { useEffect, useState } from "react";
import { api } from "../api/client";

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
  const [file, setFile] = useState<File | null>(null);
  const [areaId, setAreaId] = useState("");
  const [source, setSource] = useState(defaultSource);
  const [note, setNote] = useState("");
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    api.get("/areas").then(({ data }) => {
      setAreas(data.data);
      if (data.data[0]) setAreaId(data.data[0].id);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      if (areaId) form.append("areaId", areaId);
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
    <form onSubmit={submit} className="violation-form-grid">
      <div className="form-group">
        <label>Area Parkir</label>
        <select className="input" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Sumber Laporan</label>
        <select className="input" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
          <option value="USER">User</option>
          <option value="JUKIR">Jukir</option>
          <option value="CCTV">CCTV</option>
        </select>
      </div>

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
          <strong>
            {result.violationDetected ? (
              <span className="badge badge-danger">Pelanggaran terdeteksi</span>
            ) : result.needsReview ? (
              <span className="badge badge-warning">Perlu review admin/jukir</span>
            ) : (
              <span className="badge badge-success">Tidak ada pelanggaran</span>
            )}
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
        </div>
      )}
    </form>
  );
}
