import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface Location {
  id: string;
  name: string;
}
interface ScanResult {
  photoPath: string;
  summary: { empty: number; occupied: number; illegal: number };
  slotsUpdated: number;
  updates: { slotCode: string; status: string }[];
}

export function SlotScan() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);

  useEffect(() => {
    api.get("/parking").then(({ data }) => {
      setLocations(data.data);
      if (data.data[0]) setLocationId(data.data[0].id);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !locationId) return;
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      form.append("locationId", locationId);
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
      <div className="page-header">Pindai Slot Kosong (AI)</div>
      <div className="card" style={{ maxWidth: 480 }}>
        <p style={{ marginTop: 0, color: "var(--muted)" }}>
          Unggah foto/video lokasi. Model mendeteksi slot kosong/terisi lalu memperbarui status slot.
        </p>
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
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
            Terdeteksi — kosong: <strong>{result.summary.empty}</strong>, terisi:{" "}
            <strong>{result.summary.occupied}</strong>. Slot diperbarui: <strong>{result.slotsUpdated}</strong>.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {result.updates.map((u) => (
              <span key={u.slotCode} className={`badge ${u.status === "AVAILABLE" ? "badge-success" : "badge-warning"}`}>
                {u.slotCode}: {u.status}
              </span>
            ))}
          </div>
          <img src={result.photoPath} alt="scan" style={{ marginTop: 8, maxWidth: "100%", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
