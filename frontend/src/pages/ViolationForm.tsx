import { useState } from "react";
import { api } from "../api/client";

interface Result {
  illegalDetected: boolean;
  summary: { empty: number; occupied: number; illegal: number };
  violation: { photoPath: string; violationType: string; confidence: number | null };
}

/** Upload a photo/video to /api/violations and show the AI result.
 * Shared by the user report page and the admin violations page. */
export function ViolationForm({ onDone }: { onDone?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [slotCode, setSlotCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      if (slotCode) form.append("slotCode", slotCode);
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
      <input
        type="file"
        accept="image/*,video/*"
        capture="environment"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <input placeholder="Slot (opsional, mis. A3)" value={slotCode} onChange={(e) => setSlotCode(e.target.value)} />
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
