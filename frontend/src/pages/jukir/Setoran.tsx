import { useState, useEffect } from "react";
import { apiClient } from "../../api/client";

interface SetoranData {
  jukirId: string;
  areaId: string;
  date: Date;
  totalTransactions: number;
  grossAmount: number;
  taxPercent: number;
  taxAmount?: number;
  jukirSharePercent: number;
  jukirShareAmount?: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedAt?: Date;
  adminNote?: string;
}

export function JukirSetoran() {
  const [loading, setLoading] = useState(true);
  const [setoranData, setSetoranData] = useState<SetoranData | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    fetchSetoran();
  }, []);

  const fetchSetoran = async () => {
    try {
      // Get today's setoran
      const today = new Date().toISOString().split("T")[0];
      
      // Get current data
      const currentResponse = await apiClient.get(`/jukir/setoran/daily?date=${today}`);
      if (currentResponse.data.success) {
        setSetoranData(currentResponse.data.data);
      }

      // Get history
      const historyResponse = await apiClient.get("/jukir/setoran/history?limit=20");
      if (historyResponse.data.success) {
        setHistory(historyResponse.data.data);
      }
    } catch (error) {
      console.error("Error fetching setoran:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `Rp ${amount.toLocaleString("id-ID")}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return <span className="badge badge-success">✓ Approved</span>;
      case "REJECTED":
        return <span className="badge badge-danger">✗ Rejected</span>;
      default:
        return <span className="badge badge-warning">⏳ Pending</span>;
    }
  };

  if (loading) {
    return <div className="page"><div className="loading">Memuat setoran...</div></div>;
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>💰 Pajak & Setoran Jurik</h1>
        <p>Rincian setoran auto-calculated untuk hari ini</p>
      </header>

      {/* Main Calculation Card */}
      <div className="grid grid-2">
        {/* Left Column - Daily Summary */}
        <div className="card">
          <h2>📅 Setoran Hari Ini</h2>
          {setoranData ? (
            <div className="setoran-summary">
              <div className="summary-item">
                <label>Tanggal</label>
                <span>{new Date(setoranData.date).toLocaleDateString("id-ID", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric"
                })}</span>
              </div>

              <div className="summary-item">
                <label>Total Transaksi</label>
                <span className="stat-large">{setoranData.totalTransactions} kendaraan</span>
              </div>

              <div className="summary-divider">
                <label>Pendapatan Bruto</label>
                <span className="currency-large">{formatCurrency(setoranData.grossAmount)}</span>
              </div>

              <div className="calculation-section">
                <h3>Distribution</h3>
                
                <div className="calc-row">
                  <span>Pajak Pengelola ({setoranData.taxPercent}%)</span>
                  <span className="text-danger">-{formatCurrency(setoranData.taxAmount || 0)}</span>
                </div>

                <div className="calc-row">
                  <span>Bagian Jurik ({setoranData.jukirSharePercent}%)</span>
                  <span className="text-success">+{formatCurrency(setoranData.jukirShareAmount || 0)}</span>
                </div>

                <div className="calc-total">
                  <span>SETORAN HARUS DISERAHKAN:</span>
                  <span className="amount-primary">
                    {formatCurrency((setoranData.grossAmount - (setoranData.taxAmount || 0)))}
                  </span>
                </div>
              </div>

              {setoranData.status && (
                <div className="submission-status">
                  {getStatusBadge(setoranData.status)}
                  {setoranData.adminNote && (
                    <p className="note">{setoranData.adminNote}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="no-data">
              <p>Data setoran belum tersedia.</p>
              <button 
                className="btn btn-primary mt-4" 
                onClick={fetchSetoran}
              >
                Refresh Data
              </button>
            </div>
          )}
        </div>

        {/* Right Column - Breakdown */}
        <div className="card">
          <h2>📊 Rincian Per Jenis Kendaraan</h2>
          <div className="breakdown-list">
            <div className="breakdown-item">
              <div className="breakdown-header">
                <span className="type-label">Motorcycle</span>
                <span className="count">X vehicles</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar progress-motor"></div>
              </div>
              <div className="breakdown-footer">
                <span className="amount">Rp 85,000</span>
                <span className="percentage">57%</span>
              </div>
            </div>

            <div className="breakdown-item">
              <div className="breakdown-header">
                <span className="type-label">Car</span>
                <span className="count">X vehicles</span>
              </div>
              <div className="progress-track">
                <div className="progress-bar progress-car"></div>
              </div>
              <div className="breakdown-footer">
                <span className="amount">Rp 65,000</span>
                <span className="percentage">43%</span>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <button 
              className="btn btn-primary w-100"
              onClick={() => alert("Fitur submit setoran akan segera hadir")}
            >
              📤 Submit Setoran
            </button>
            
            <button 
              className="btn btn-outline w-100 mt-3"
              onClick={() => window.print()}
            >
              🖨️ Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* History Section */}
      <div className="card mt-6">
        <h2>📋 Riwayat Setoran</h2>
        <table className="table table-striped">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Total Transaksi</th>
              <th>Gross Amount</th>
              <th>Jurik Share</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {history.length > 0 ? (
              history.map((item, idx) => (
                <tr key={idx}>
                  <td>{new Date(item.date).toLocaleDateString("id-ID")}</td>
                  <td>{item.totalTransactions}</td>
                  <td>{formatCurrency(item.grossAmount)}</td>
                  <td>{formatCurrency(item.jukirShareAmount || 0)}</td>
                  <td>{getStatusBadge(item.status)}</td>
                  <td>
                    <button className="btn btn-sm btn-outline">Detail</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="text-center text-muted">Belum ada riwayat setoran</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
