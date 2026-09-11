import { useEffect, useState } from "react";
import { api } from "../api/client";

interface Area {
  id: string;
  name: string;
}
interface Result {
  illegalDetected: boolean;
  summary: { empty: number; occupied: number; illegal: number };
  violation: { photoPath: string; violationType: string; confidence: number | null };
}

/** Upload foto/video ke /api/violations dan tampilkan hasil AI.
 * Dipakai halaman laporan user dan halaman pelanggaran admin. */
export function ViolationForm({ onDone }: { onDone?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [areaId, setAreaId] = useState("");
  const [source, setSource] = useState("USER");
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

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
      const { data } = await api.post("/violations", form);
      setResult(data.data);
      onDone?.();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Gagal menganalisis");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
      <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <select value={source} onChange={(e) => setSource(e.target.value)}>
        <option value="USER">User</option>
        <option value="JUKIR">Jukir</option>
        <option value="CCTV">CCTV</option>
      </select>
      <input
        type="file"
        accept="image/*,video/*"
        capture="environment"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <button className="btn" disabled={!file || loading} type="submit">
        {loading ? "Menganalisis..." : "Kirim & Analisis"}
      </button>
      {error && <div style={{ color: "crimson" }}>{error}</div>}
      {result && (
        <div className="card">
          <strong>
            {result.illegalDetected ? (
              <span className="badge badge-danger">Pelanggaran terdeteksi</span>
            ) : (
              <span className="badge badge-success">Tidak ada pelanggaran</span>
            )}
          </strong>
          <p style={{ margin: "8px 0 0" }}>
            Slot kosong: {result.summary.empty} · terisi: {result.summary.occupied} · pelanggaran:{" "}
            {result.summary.illegal}
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
