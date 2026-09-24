import { useEffect, useState } from "react";
import { Banknote, FileBarChart, Hourglass, Info, QrCode, Receipt, Wallet } from "lucide-react";
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

// ponytail: dummy fallback supaya chart tetap tampil saat backend/data belum ada.
// Upgrade: hapus blok ini setelah endpoint /reports terisi data nyata.
const DUMMY_REVENUE: RevenuePoint[] = [
  { date: "09-12", cash: 420000, qris: 180000, total: 600000 },
  { date: "09-13", cash: 510000, qris: 240000, total: 750000 },
  { date: "09-14", cash: 385000, qris: 295000, total: 680000 },
  { date: "09-15", cash: 600000, qris: 310000, total: 910000 },
  { date: "09-16", cash: 470000, qris: 260000, total: 730000 },
  { date: "09-17", cash: 540000, qris: 350000, total: 890000 },
  { date: "09-18", cash: 480000, qris: 320000, total: 800000 },
];

const DUMMY_SUMMARY: Summary = {
  totalRevenue: 5360000,
  totalTransactions: 742,
  activeTransactions: 38,
  cashRevenue: 3405000,
  qrisRevenue: 1955000,
};

const DUMMY_SETTLEMENT: Settlement = {
  taxPercent: 30,
  totalRevenue: 5360000,
  cash: 3405000,
  qris: 1955000,
  taxAmount: 1608000,
  settlementFromCash: 1797000,
};

export function Reports() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [isDummy, setIsDummy] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get("/reports/summary"),
      api.get("/reports/revenue?days=7"),
      api.get("/reports/jukir-settlement"),
    ])
      .then(([s, r, j]) => {
        const points: RevenuePoint[] = (r.data.data ?? []).map((p: RevenuePoint) => ({
          ...p,
          date: p.date.slice(5),
        }));
        setSummary(s.data.data ?? DUMMY_SUMMARY);
        setSettlement(j.data.data ?? DUMMY_SETTLEMENT);
        setRevenue(points.length ? points : DUMMY_REVENUE);
        setIsDummy(points.length === 0);
      })
      .catch(() => {
        setSummary(DUMMY_SUMMARY);
        setSettlement(DUMMY_SETTLEMENT);
        setRevenue(DUMMY_REVENUE);
        setIsDummy(true);
      });
  }, []);

  const cards = summary && [
    { label: "Total Pendapatan", value: rupiah(summary.totalRevenue), icon: Wallet, tone: "icon-success" },
    { label: "Pendapatan Cash", value: rupiah(summary.cashRevenue), icon: Banknote, tone: "icon-success" },
    { label: "Pendapatan QRIS", value: rupiah(summary.qrisRevenue), icon: QrCode, tone: "icon-info" },
    { label: "Total Transaksi", value: summary.totalTransactions, icon: Receipt, tone: "icon-info" },
    { label: "Transaksi Aktif", value: summary.activeTransactions, icon: Hourglass, tone: "icon-warning" },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1><FileBarChart className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" /> Laporan &amp; Setoran Jukir</h1>
        <p>Hari ini - {new Date().toLocaleDateString("id-ID", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}</p>
      </header>

      {isDummy && (
        <div className="alert alert-danger">
          <Info size={16} strokeWidth={2} aria-hidden="true" /> Menampilkan data contoh. Data laporan belum tersedia dari server.
        </div>
      )}

      {!summary || !settlement ? (
        <div className="loading">Memuat data...</div>
      ) : (
        <>
      <div className="grid grid-kpi">
        {(cards || []).map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="card card-stat">
            <div className={`icon-container ${tone}`}><Icon size={20} strokeWidth={1.8} aria-hidden="true" /></div>
            <div className="stat-content">
              <span className="stat-label">{label}</span>
              <span className="stat-value">{value}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Pendapatan 7 Hari (Cash vs QRIS)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={revenue}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8F0F2" />
            <XAxis dataKey="date" />
            <YAxis tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : `${v}`)} />
            <Tooltip formatter={(v) => rupiah(Number(v))} />
            <Legend />
            <Bar dataKey="cash" fill="#19B79A" radius={[4, 4, 0, 0]} />
            <Bar dataKey="qris" fill="#3187C7" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h2>Setoran Jukir (MOU: {settlement.taxPercent}% pajak)</h2>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              <tr><td>Total Revenue</td><td><strong>{rupiah(settlement.totalRevenue)}</strong></td></tr>
              <tr><td>Cash</td><td>{rupiah(settlement.cash)}</td></tr>
              <tr><td>QRIS</td><td>{rupiah(settlement.qris)}</td></tr>
              <tr><td>Kewajiban Pajak ({settlement.taxPercent}%)</td><td>{rupiah(settlement.taxAmount)}</td></tr>
              <tr>
                <td>Sisa Disetor dari Cash</td>
                <td><strong>{rupiah(settlement.settlementFromCash)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
