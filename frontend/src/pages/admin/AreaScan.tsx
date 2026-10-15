import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface Area {
  id: string;
  name: string;
}
interface ScanResult {
  photoPath: string;
  summary: { violation: number; normal: number };
  activeTransactions: number;
  violationsDetected: number;
  normalSpots: number;
  hasViolation: boolean;
}

export function AreaScan() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);

  useEffect(() => {
    api.get("/areas").then(({ data }) => {
      setAreas(data.data);
      if (data.data[0]) setAreaId(data.data[0].id);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !areaId) return;
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      form.append("areaId", areaId);
      const { data } = await api.post("/detections/scan", form);
      setResult(data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Gagal memindai");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="page-header">Pindai Area (Computer Vision)</div>
      <div className="card" style={{ maxWidth: 480 }}>
        <p style={{ marginTop: 0, color: "var(--muted)" }}>
          Unggah foto/video area. Model mendeteksi parkir normal dan pelanggaran
          sebagai early warning.
        </p>
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <input type="file" accept="image/*,video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button className="btn" disabled={!file || loading} type="submit">
            {loading ? "Memindai..." : "Pindai"}
          </button>
          {error && <div style={{ color: "crimson" }}>{error}</div>}
        </form>
      </div>

      {result && (
        <div className="card" style={{ marginTop: 16, maxWidth: 480 }}>
          <p style={{ marginTop: 0 }}>
            Terdeteksi — normal: <strong>{result.summary.normal}</strong>, pelanggaran:{" "}
            <strong>{result.summary.violation}</strong>.
          </p>
          <p>
            Transaksi aktif: <strong>{result.activeTransactions}</strong> · Spot normal: <strong>{result.normalSpots}</strong> · Pelanggaran: <strong>{result.violationsDetected}</strong>
          </p>
          {result.hasViolation ? (
            <div className="badge badge-warning" style={{ display: "inline-block" }}>
              Pelanggaran terdeteksi — perlu pemeriksaan.
            </div>
          ) : (
            <div className="badge badge-success" style={{ display: "inline-block" }}>
              Tidak ada pelanggaran terdeteksi.
            </div>
          )}
          <img src={result.photoPath} alt="scan" style={{ marginTop: 8, maxWidth: "100%", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
