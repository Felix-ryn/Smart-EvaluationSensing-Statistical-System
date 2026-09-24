import { useEffect, useState } from "react";
import { AlertTriangle, Banknote, Car, Info, Layers, LayoutDashboard, QrCode, Users, Wallet } from "lucide-react";
import {
  Area,
  AreaChart,
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

// ponytail: tren kendaraan pakai data contoh — backend /dashboard belum punya time-series.
// Upgrade: tambah endpoint /api/dashboard/trend (count kendaraan per hari) lalu ganti sumber ini.
const DUMMY_TREND = [
  { date: "Sen", kendaraan: 210 },
  { date: "Sel", kendaraan: 245 },
  { date: "Rab", kendaraan: 198 },
  { date: "Kam", kendaraan: 280 },
  { date: "Jum", kendaraan: 320 },
  { date: "Sab", kendaraan: 360 },
  { date: "Min", kendaraan: 290 },
];

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

      <div className="grid grid-2">
        <div className="card">
          <h2>Tren Kendaraan di Area Parkir</h2>
          <div className="alert alert-danger" style={{ marginBottom: 12 }}>
            <Info size={14} strokeWidth={2} aria-hidden="true" /> Data contoh — tren harian belum tersedia dari server.
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={DUMMY_TREND}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#009B83" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#009B83" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8F0F2" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="kendaraan"
                stroke="#009B83"
                strokeWidth={2}
                fill="url(#trendFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2>Pendapatan: Cash vs QRIS</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={revenueData || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8F0F2" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : `${v}`)} />
              <Tooltip formatter={(v) => rupiah(Number(v))} />
              <Legend />
              <Bar dataKey="nominal" name="Pendapatan" fill="#19B79A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
