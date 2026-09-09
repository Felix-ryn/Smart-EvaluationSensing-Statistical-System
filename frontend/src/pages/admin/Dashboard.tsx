import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface Stats {
  totalUsers: number;
  totalLocations: number;
  totalSlots: number;
  availableSlots: number;
  activeSessions: number;
  todayRevenue: number;
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
    { label: "Total Pengguna", value: stats.totalUsers },
    { label: "Lokasi Parkir", value: stats.totalLocations },
    { label: "Slot Tersedia", value: `${stats.availableSlots} / ${stats.totalSlots}` },
    { label: "Sesi Aktif", value: stats.activeSessions },
    { label: "Pendapatan Hari Ini", value: rupiah(stats.todayRevenue) },
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
