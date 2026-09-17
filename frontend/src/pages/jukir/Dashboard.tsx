import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../api/client";

interface DashboardStats {
  todayTransactions: number;
  activeTransactions: number;
  totalRevenue: number;
}

export function JukirDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

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
        <h1>🏠 Dashboard Jurik</h1>
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
              <div className="icon-container icon-info">📊</div>
              <div className="stat-content">
                <span className="stat-label">Transaksi Hari Ini</span>
                <span className="stat-value">{stats?.todayTransactions || 0}</span>
              </div>
            </div>

            <div className="card card-stat">
              <div className="icon-container icon-warning">⏳</div>
              <div className="stat-content">
                <span className="stat-label">Transaksi Aktif</span>
                <span className="stat-value">{stats?.activeTransactions || 0}</span>
              </div>
            </div>

            <div className="card card-stat">
              <div className="icon-container icon-success">💰</div>
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
                ➕ Transaksi Baru
              </button>
              <button className="btn btn-secondary" onClick={() => navigate("/jukir/payment")}>
                💵 Pembayaran
              </button>
              <button className="btn btn-outline" onClick={() => navigate("/jukir/setoran")}>
                📋 Setoran Saya
              </button>
            </div>
          </div>

          {/* My Area Info */}
          <div className="card">
            <h2>Area Saya</h2>
            <p className="text-muted">Lihat traffic area yang Anda tanggung</p>
            <button 
              className="btn btn-outline mt-4" 
              onClick={() => navigate("/jukir/traffic")}
            >
              🔴 Live Traffic Area
            </button>
          </div>
        </>
      )}
    </div>
  );
}
