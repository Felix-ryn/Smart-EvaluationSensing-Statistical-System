import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface Recon {
  areaId: string;
  name: string;
  capacity: number;
  activeTransactions: number;
  cvDetected: number;
  difference: number;
  needsReview: boolean;
  lastDetectedAt: string | null;
}

export function Reconciliation() {
  const [rows, setRows] = useState<Recon[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/reports/reconciliation")
      .then(({ data }) => setRows(data.data))
      .catch((err) => setError(err.response?.data?.message ?? "Gagal memuat"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "crimson" }}>{error}</p>;

  return (
    <div>
      <div className="page-header">Rekonsiliasi (Transaksi vs Computer Vision)</div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ marginTop: 0, color: "var(--muted)" }}>
          Membandingkan jumlah transaksi aktif dengan jumlah kendaraan yang terdeteksi Computer Vision.
          Selisih bukan berarti kecurangan — bisa jadi transaksi belum diperbarui atau kesalahan deteksi.
        </p>
      </div>

      <div className="card">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Area</th>
              <th style={th}>Kapasitas</th>
              <th style={th}>Transaksi Aktif</th>
              <th style={th}>CV Terdeteksi</th>
              <th style={th}>Selisih</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.areaId}>
                <td style={td}>{r.name}</td>
                <td style={td}>{r.capacity}</td>
                <td style={td}>{r.activeTransactions}</td>
                <td style={td}>{r.cvDetected}</td>
                <td style={td}>{r.difference > 0 ? `+${r.difference}` : r.difference}</td>
                <td style={td}>
                  {r.needsReview ? (
                    <span className="badge badge-warning">Perlu Pemeriksaan</span>
                  ) : (
                    <span className="badge badge-success">Sesuai</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #e5e7eb", fontSize: 13, color: "#6b7280" };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #f0f0f0" };
