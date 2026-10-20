import { useState, useEffect } from "react";
import { BarChart3, Calendar, Check, ClipboardList, Hourglass, Printer, Upload, Wallet, X } from "lucide-react";
import { apiClient } from "../../api/client";

interface BreakdownItem {
  vehicleType: string;
  count: number;
  amount: number;
}

interface SetoranData {
  id: string;
  jukirId: string;
  areaId: string;
  date: string;
  totalTransactions: number;
  grossAmount: number;
  taxPercent: number;
  taxAmount?: number;
  jukirSharePercent: number;
  jukirShareAmount?: number;
  netSetoranAmount: number;
  cashAmount?: number;
  qrisAmount?: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedAt?: string;
  adminNote?: string;
  breakdown?: BreakdownItem[];
}

export function JukirSetoran() {
  const [loading, setLoading] = useState(true);
  const [setoranData, setSetoranData] = useState<SetoranData | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchSetoran();
  }, []);

  const fetchSetoran = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const [dailyResult, historyResult] = await Promise.allSettled([
        apiClient.get(`/jukir/setoran/daily?date=${today}`),
        apiClient.get("/jukir/setoran/history?limit=20"),
      ]);

      if (dailyResult.status === "fulfilled") {
        if (dailyResult.value.data.success) setSetoranData(dailyResult.value.data.data);
      } else {
        setSetoranData(null);
        console.error("Error fetching daily setoran:", dailyResult.reason);
      }

      if (historyResult.status === "fulfilled") {
        if (historyResult.value.data.success) setHistory(historyResult.value.data.data);
      } else {
        setHistory([]);
        console.error("Error fetching setoran history:", historyResult.reason);
      }
    } catch (error) {
      console.error("Error fetching setoran:", error);
    } finally {
      setLoading(false);
    }
  };

  const submitSetoran = async () => {
    if (!setoranData || setoranData.status !== "PENDING") return;
    if (!confirm("Submit setoran hari ini untuk approval admin?")) return;

    try {
      setSubmitting(true);
      const response = await apiClient.post("/jukir/setoran/submit", {
        date: setoranData.date,
      });
      if (response.data.success) {
        alert("Setoran berhasil disubmit");
        fetchSetoran();
      }
    } catch (error: any) {
      alert(error?.response?.data?.message ?? "Gagal submit setoran");
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `Rp ${amount.toLocaleString("id-ID")}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "APPROVED":
        return <span className="badge badge-success"><Check size={14} strokeWidth={2.4} aria-hidden="true" /> Approved</span>;
      case "REJECTED":
        return <span className="badge badge-danger"><X size={14} strokeWidth={2.4} aria-hidden="true" /> Rejected</span>;
      default:
        return <span className="badge badge-warning"><Hourglass size={14} strokeWidth={2} aria-hidden="true" /> Pending</span>;
    }
  };

  const totalBreakdown = (setoranData?.breakdown ?? []).reduce((sum, b) => sum + b.amount, 0);

  if (loading) {
    return <div className="page"><div className="loading">Memuat setoran...</div></div>;
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1><Wallet className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" /> Pajak &amp; Setoran Jukir</h1>
        <p>Pajak otomatis dipotong dari pendapatan bruto berdasarkan MOU aktif</p>
        <p className="text-muted" style={{ marginTop: "0.35rem" }}>
          QRIS masuk langsung ke admin. Setoran fisik yang diserahkan jukir dihitung dari komponen CASH transaksi <strong>COMPLETED</strong> hari ini.
        </p>
      </header>

      <div className="grid grid-2">
        <div className="card">
          <h2><Calendar className="title-icon" size={18} strokeWidth={1.8} aria-hidden="true" /> Setoran Hari Ini</h2>
          {setoranData ? (
            <div className="setoran-summary">
              <div className="summary-item">
                <label>Tanggal</label>
                <span>{new Date(setoranData.date).toLocaleDateString("id-ID", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
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

                <div className="calc-row">
                  <span>Masuk via CASH</span>
                  <span>{formatCurrency(setoranData.cashAmount || 0)}</span>
                </div>

                <div className="calc-row">
                  <span>Tercatat via QRIS</span>
                  <span>{formatCurrency(setoranData.qrisAmount || 0)}</span>
                </div>

              <div className="calculation-section">
                <h3>Distribusi</h3>

                <div className="calc-row">
                  <span>Pajak Pengelola ({setoranData.taxPercent}%)</span>
                  <span className="text-danger">-{formatCurrency(setoranData.taxAmount || 0)}</span>
                </div>

                <div className="calc-row">
                  <span>Info Bagian Jukir ({setoranData.jukirSharePercent}%)</span>
                  <span className="text-success">{formatCurrency(setoranData.jukirShareAmount || 0)}</span>
                </div>

                <div className="calc-total">
                  <span>SETORAN FISIK (DARI CASH):</span>
                  <span className="amount-primary">{formatCurrency(setoranData.netSetoranAmount)}</span>
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
              <button className="btn btn-primary mt-4" onClick={fetchSetoran}>Refresh Data</button>
            </div>
          )}
        </div>

        <div className="card">
          <h2><BarChart3 className="title-icon" size={18} strokeWidth={1.8} aria-hidden="true" /> Rincian Per Jenis Kendaraan</h2>
          <div className="breakdown-list">
            {(setoranData?.breakdown ?? []).length > 0 ? (
              (setoranData?.breakdown ?? []).map((item) => {
                const percentage = totalBreakdown > 0 ? Math.round((item.amount / totalBreakdown) * 100) : 0;
                return (
                  <div className="breakdown-item" key={item.vehicleType}>
                    <div className="breakdown-header">
                      <span className="type-label">{item.vehicleType === "car" ? "Car" : "Motorcycle"}</span>
                      <span className="count">{item.count} kendaraan</span>
                    </div>
                    <div className="progress-track">
                      <div className={`progress-bar ${item.vehicleType === "car" ? "progress-car" : "progress-motor"}`} style={{ width: `${percentage}%` }}></div>
                    </div>
                    <div className="breakdown-footer">
                      <span className="amount">{formatCurrency(item.amount)}</span>
                      <span className="percentage">{percentage}%</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-muted">Belum ada transaksi completed hari ini.</div>
            )}
          </div>

          <div className="mt-6">
            <button className="btn btn-primary w-100" onClick={submitSetoran} disabled={submitting || !setoranData || setoranData.status !== "PENDING"}>
              <Upload size={16} strokeWidth={2} aria-hidden="true" /> {submitting ? "Submitting..." : "Submit Setoran"}
            </button>

            <button className="btn btn-outline w-100 mt-3" onClick={() => window.print()}>
              <Printer size={16} strokeWidth={2} aria-hidden="true" /> Export PDF
            </button>
          </div>
        </div>
      </div>

      <div className="card mt-6">
        <h2><ClipboardList className="title-icon" size={18} strokeWidth={1.8} aria-hidden="true" /> Riwayat Setoran</h2>
        <p className="text-muted" style={{ marginBottom: "0.8rem" }}>Menampilkan riwayat setoran akun jukir ini (lintas area penugasan).</p>
        <table className="table table-striped">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Total Transaksi</th>
              <th>Gross Amount</th>
              <th>Pajak</th>
              <th>Net Setoran</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {history.length > 0 ? (
              history.map((item, idx) => (
                <tr key={idx}>
                  <td>{new Date(item.date).toLocaleDateString("id-ID")}</td>
                  <td>{item.totalTransactions}</td>
                  <td>{formatCurrency(item.grossAmount)}</td>
                  <td>{formatCurrency(item.taxAmount || 0)}</td>
                  <td>{formatCurrency(item.netSetoranAmount ?? Math.max(0, (item.cashAmount || 0) - (item.taxAmount || 0)))}</td>
                  <td>{getStatusBadge(item.status)}</td>
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
