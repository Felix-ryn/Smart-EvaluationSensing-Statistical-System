import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface Stats {
  totalAreas: number;
  totalJukir: number;
  activeVehicles: number;
  todayRevenue: number;
  cashRevenue: number;
  qrisRevenue: number;
  pendingViolations: number;
}

const rupiah = (n: number) => "Rp " + n.toLocaleString("id-ID");

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/dashboard")
      .then(({ data }) => setStats(data.data))
      .catch((err) => setError(err.response?.data?.message ?? "Gagal memuat"));
  }, []);

  if (error) return <p style={{ color: "crimson" }}>{error}</p>;
  if (!stats) return <p>Loading...</p>;

  const cards = [
    { label: "Area Parkir", value: stats.totalAreas },
    { label: "Kendaraan Aktif", value: stats.activeVehicles },
    { label: "Pendapatan Hari Ini", value: rupiah(stats.todayRevenue) },
    { label: "Pendapatan Cash", value: rupiah(stats.cashRevenue) },
    { label: "Pendapatan QRIS", value: rupiah(stats.qrisRevenue) },
    { label: "Jukir", value: stats.totalJukir },
    { label: "Pelanggaran Pending", value: stats.pendingViolations },
  ];

  return (
    <div>
      <div className="page-header">Dashboard</div>
      <div className="grid">
        {cards.map((c) => (
          <div key={c.label} className="card stat">
            <div className="label">{c.label}</div>
            <div className="value">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
