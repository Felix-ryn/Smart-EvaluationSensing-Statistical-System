import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../../api/client";

interface Summary {
  totalRevenue: number;
  totalTransactions: number;
  activeTransactions: number;
  cashRevenue: number;
  qrisRevenue: number;
}
interface RevenuePoint {
  date: string;
  cash: number;
  qris: number;
  total: number;
}
interface Settlement {
  taxPercent: number;
  totalRevenue: number;
  cash: number;
  qris: number;
  taxAmount: number;
  settlementFromCash: number;
}

const rupiah = (n: number) => "Rp " + n.toLocaleString("id-ID");

export function Reports() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get("/reports/summary"),
      api.get("/reports/revenue?days=7"),
      api.get("/reports/jukir-settlement"),
    ])
      .then(([s, r, j]) => {
        setSummary(s.data.data);
        setRevenue(r.data.data.map((p: RevenuePoint) => ({ ...p, date: p.date.slice(5) })));
        setSettlement(j.data.data);
      })
      .catch((err) => setError(err.response?.data?.message ?? "Gagal memuat"));
  }, []);

  if (error) return <p style={{ color: "crimson" }}>{error}</p>;
  if (!summary || !settlement) return <p>Loading...</p>;

  const cards = [
    { label: "Total Pendapatan", value: rupiah(summary.totalRevenue) },
    { label: "Pendapatan Cash", value: rupiah(summary.cashRevenue) },
    { label: "Pendapatan QRIS", value: rupiah(summary.qrisRevenue) },
    { label: "Total Transaksi", value: summary.totalTransactions },
    { label: "Transaksi Aktif", value: summary.activeTransactions },
  ];

  return (
    <div>
      <div className="page-header">Laporan & Setoran Jukir</div>
      <div className="grid" style={{ marginBottom: 16 }}>
        {cards.map((c) => (
          <div key={c.label} className="card stat">
            <div className="label">{c.label}</div>
            <div className="value">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Pendapatan 7 Hari (Cash vs QRIS)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={revenue}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : `${v}`)} />
            <Tooltip formatter={(v) => rupiah(Number(v))} />
            <Legend />
            <Bar dataKey="cash" fill="#16a34a" radius={[4, 4, 0, 0]} />
            <Bar dataKey="qris" fill="#2563eb" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Setoran Jukir (MOU: {settlement.taxPercent}% pajak)</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr><td style={td}>Total Revenue</td><td style={td}><strong>{rupiah(settlement.totalRevenue)}</strong></td></tr>
            <tr><td style={td}>Cash</td><td style={td}>{rupiah(settlement.cash)}</td></tr>
            <tr><td style={td}>QRIS</td><td style={td}>{rupiah(settlement.qris)}</td></tr>
            <tr><td style={td}>Kewajiban Pajak ({settlement.taxPercent}%)</td><td style={td}>{rupiah(settlement.taxAmount)}</td></tr>
            <tr>
              <td style={td}>Sisa Disetor dari Cash</td>
              <td style={td}><strong>{rupiah(settlement.settlementFromCash)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #f0f0f0" };
