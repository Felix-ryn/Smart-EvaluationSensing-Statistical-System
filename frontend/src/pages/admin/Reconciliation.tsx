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

interface SetoranSummary {
  totalTax: number;
  totalNetSetoran: number;
}

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

export function Reconciliation() {
  const [rows, setRows] = useState<Recon[]>([]);
  const [setoranSummary, setSetoranSummary] = useState<SetoranSummary>({ totalTax: 0, totalNetSetoran: 0 });
  const [totalJukir, setTotalJukir] = useState(0);
  const [kpiInfo, setKpiInfo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.get("/reports/reconciliation"),
      api.get("/jukir/setoran/report"),
      api.get("/users"),
    ])
      .then(([reconRes, setoranRes, userRes]) => {
        const warnings: string[] = [];

        if (reconRes.status === "fulfilled") {
          setRows(reconRes.value.data.data ?? []);
        } else {
          setError(reconRes.reason?.response?.data?.message ?? "Gagal memuat data rekonsiliasi.");
        }

        if (setoranRes.status === "fulfilled") {
          setSetoranSummary({
            totalTax: setoranRes.value.data.data?.summary?.totalTax ?? 0,
            totalNetSetoran: setoranRes.value.data.data?.summary?.totalNetSetoran ?? 0,
          });
        } else {
          warnings.push("KPI pajak/setoran sementara tidak tersedia.");
        }

        if (userRes.status === "fulfilled") {
          const users: any[] = userRes.value.data.data ?? [];
          setTotalJukir(users.filter((u) => u.role === "JUKIR").length);
        } else {
          warnings.push("Total jukir belum dapat dimuat.");
        }

        setKpiInfo(warnings.join(" "));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "crimson" }}>{error}</p>;

  return (
    <div>
      <div className="page-header">Rekonsiliasi (Transaksi vs Computer Vision)</div>

      {kpiInfo && <div className="alert alert-warning">{kpiInfo}</div>}

      <div className="grid grid-kpi">
        <div className="card card-stat">
          <div className="stat-content">
            <span className="stat-label">Pajak & Retribusi</span>
            <span className="stat-value">{rupiah(setoranSummary.totalTax)}</span>
          </div>
        </div>
        <div className="card card-stat">
          <div className="stat-content">
            <span className="stat-label">Total Setor</span>
            <span className="stat-value">{rupiah(setoranSummary.totalNetSetoran)}</span>
          </div>
        </div>
        <div className="card card-stat">
          <div className="stat-content">
            <span className="stat-label">Total Jukir</span>
            <span className="stat-value">{totalJukir}</span>
          </div>
        </div>
      </div>

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
            {rows.length === 0 && (
              <tr>
                <td style={td} colSpan={6}>Belum ada data rekonsiliasi.</td>
              </tr>
            )}
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
