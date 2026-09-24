import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, BarChart3, Banknote, ClipboardList, Hourglass, LayoutDashboard, Plus, Wallet } from "lucide-react";
import { apiClient } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { ParkingMap, type MapArea } from "../../components/ParkingMap";

interface DashboardStats {
  todayTransactions: number;
  activeTransactions: number;
  totalRevenue: number;
}

export function JukirDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [myArea, setMyArea] = useState<MapArea | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (!user?.areaId) return;
    apiClient
      .get("/areas")
      .then(({ data }) => {
        const area = (data.data as MapArea[]).find((a) => a.id === user.areaId);
        setMyArea(area ?? null);
      })
      .catch(() => {});
  }, [user?.areaId]);

  const fetchDashboardData = async () => {
    try {
      const response = await apiClient.get("/jukir/stats/dashboard");
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1><LayoutDashboard className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" /> Dashboard Jukir</h1>
        <p>Hari ini - {new Date().toLocaleDateString("id-ID", { 
          weekday: "long", 
          year: "numeric", 
          month: "long", 
          day: "numeric" 
        })}</p>
      </header>

      {loading ? (
        <div className="loading">Memuat data...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-kpi">
            <div className="card card-stat">
              <div className="icon-container icon-info"><BarChart3 size={20} strokeWidth={1.8} aria-hidden="true" /></div>
              <div className="stat-content">
                <span className="stat-label">Transaksi Hari Ini</span>
                <span className="stat-value">{stats?.todayTransactions || 0}</span>
              </div>
            </div>

            <div className="card card-stat">
              <div className="icon-container icon-warning"><Hourglass size={20} strokeWidth={1.8} aria-hidden="true" /></div>
              <div className="stat-content">
                <span className="stat-label">Transaksi Aktif</span>
                <span className="stat-value">{stats?.activeTransactions || 0}</span>
              </div>
            </div>

            <div className="card card-stat">
              <div className="icon-container icon-success"><Wallet size={20} strokeWidth={1.8} aria-hidden="true" /></div>
              <div className="stat-content">
                <span className="stat-label">Pendapatan Hari Ini</span>
                <span className="stat-value">Rp {(stats?.totalRevenue || 0).toLocaleString("id-ID")}</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card">
            <h2>Aksi Cepat</h2>
            <div className="quick-actions">
              <button className="btn btn-primary" onClick={() => navigate("/jukir/transactions")}>
                <Plus size={16} strokeWidth={2} aria-hidden="true" /> Transaksi Baru
              </button>
              <button className="btn btn-secondary" onClick={() => navigate("/jukir/transactions")}>
                <Banknote size={16} strokeWidth={2} aria-hidden="true" /> Pembayaran
              </button>
              <button className="btn btn-outline" onClick={() => navigate("/jukir/setoran")}>
                <ClipboardList size={16} strokeWidth={2} aria-hidden="true" /> Setoran Saya
              </button>
            </div>
          </div>

          {/* My Area Info */}
          <div className="card">
            <h2>Area Saya</h2>
            <p className="text-muted">Lihat lokasi & traffic area yang Anda tanggung</p>
            {myArea ? (
              <ParkingMap areas={[myArea]} height={320} zoom={15} />
            ) : (
              <p className="text-muted mt-3">Lokasi area belum tersedia.</p>
            )}
            <button
              className="btn btn-outline mt-4"
              onClick={() => navigate("/jukir/traffic")}
            >
              <Activity size={16} strokeWidth={2} aria-hidden="true" /> Live Traffic Area
            </button>
          </div>
        </>
      )}
    </div>
  );
}
