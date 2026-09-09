import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../api/client";

interface Summary {
  totalRevenue: number;
  totalSessions: number;
  activeSessions: number;
  avgDurationMinutes: number;
}
interface RevenuePoint {
  date: string;
  amount: number;
}

const rupiah = (n: number) => "Rp " + n.toLocaleString("id-ID");

export function Reports() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get("/reports/summary"), api.get("/reports/revenue?days=7")])
      .then(([s, r]) => {
        setSummary(s.data.data);
        setRevenue(r.data.data.map((p: RevenuePoint) => ({ ...p, date: p.date.slice(5) })));
      })
      .catch((err) => setError(err.response?.data?.message ?? "Gagal memuat"));
  }, []);

  if (error) return <p style={{ color: "crimson" }}>{error}</p>;
  if (!summary) return <p>Loading...</p>;

  const cards = [
    { label: "Total Pendapatan", value: rupiah(summary.totalRevenue) },
    { label: "Total Sesi", value: summary.totalSessions },
    { label: "Sesi Aktif", value: summary.activeSessions },
    { label: "Rata-rata Durasi", value: `${summary.avgDurationMinutes} mnt` },
  ];

  return (
    <div>
      <div className="page-header">Reports</div>
      <div className="grid" style={{ marginBottom: 16 }}>
        {cards.map((c) => (
          <div key={c.label} className="card stat">
            <div className="label">{c.label}</div>
            <div className="value">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Pendapatan 7 Hari Terakhir</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={revenue}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : `${v}`)} />
            <Tooltip formatter={(v) => rupiah(Number(v))} />
            <Bar dataKey="amount" fill="#2563eb" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
