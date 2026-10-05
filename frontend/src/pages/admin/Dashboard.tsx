import { useEffect, useState } from "react";
import { AlertTriangle, Banknote, Car, Layers, LayoutDashboard, QrCode, Users, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../api/client";
import { ParkingMap, type MapArea } from "../../components/ParkingMap";
import { AdminAnalytics } from "../../components/analytics/AdminAnalytics";

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
  const [areas, setAreas] = useState<MapArea[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/dashboard")
      .then(({ data }) => setStats(data.data))
      .catch((err) => setError(err.response?.data?.message ?? "Gagal memuat"));
    api
      .get("/areas")
      .then(({ data }) => setAreas(data.data))
      .catch(() => {});
  }, []);

  const cards = stats && [
    { label: "Area Parkir", value: stats.totalAreas, icon: Layers, tone: "icon-info" },
    { label: "Kendaraan Aktif", value: stats.activeVehicles, icon: Car, tone: "icon-info" },
    { label: "Pendapatan Hari Ini", value: rupiah(stats.todayRevenue), icon: Wallet, tone: "icon-success" },
    { label: "Pendapatan Cash", value: rupiah(stats.cashRevenue), icon: Banknote, tone: "icon-success" },
    { label: "Pendapatan QRIS", value: rupiah(stats.qrisRevenue), icon: QrCode, tone: "icon-info" },
    { label: "Jukir", value: stats.totalJukir, icon: Users, tone: "icon-info" },
    { label: "Pelanggaran Pending", value: stats.pendingViolations, icon: AlertTriangle, tone: "icon-warning" },
  ];

  // Bar chart pakai data nyata dari /dashboard.
  const revenueData = stats && [
    { name: "Cash", nominal: stats.cashRevenue },
    { name: "QRIS", nominal: stats.qrisRevenue },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1><LayoutDashboard className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" /> Dashboard Admin</h1>
        <p>Hari ini - {new Date().toLocaleDateString("id-ID", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}</p>
      </header>

      {error && <div className="alert alert-danger">{error}</div>}
      {!stats && !error ? (
        <div className="loading">Memuat data...</div>
      ) : stats && (
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
        <h2>Peta Area Parkir</h2>
        <ParkingMap areas={areas} />
      </div>

      {/* Tren kendaraan dipindah ke dashboard role USER (/user/dashboard),
          di sana sudah memakai data nyata dari /api/dashboard/trend. */}
      <div className="card">
        <h2>Pendapatan: Cash vs QRIS</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={revenueData || []} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8F0F2" vertical={false} />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : `${v}`)} />
            <Tooltip formatter={(v) => rupiah(Number(v))} cursor={{ fill: "rgba(0,155,131,0.06)" }} />
            <Legend />
            <Bar dataKey="nominal" name="Pendapatan" fill="#19B79A" radius={[4, 4, 0, 0]} maxBarSize={120} />
          </BarChart>
        </ResponsiveContainer>
      </div>
        </>
      )}

      {/* Hasil analitik: segmentasi jukir (GMM) + forecast 3 bulan (SARIMA).
          Dirender terpisah dari blok stats agar tetap tampil walau /dashboard gagal. */}
      <AdminAnalytics />
    </div>
  );
}
