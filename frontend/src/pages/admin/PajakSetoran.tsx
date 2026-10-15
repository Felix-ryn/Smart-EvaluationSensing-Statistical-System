import { useMemo, useState, useEffect } from "react";
import { BarChart3, Banknote, Check, Hourglass, Wallet, X } from "lucide-react";
import { apiClient } from "../../api/client";

interface SetoranEntry {
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
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedAt?: string;
  approvedBy?: string | null;
  adminNote?: string | null;
  jukir?: { id: string; name: string; email: string };
  area?: { id: string; name: string };
}

interface ReportResponse {
  summary: {
    totalEntries: number;
    totalTransactions: number;
    totalGross: number;
    totalTax: number;
    totalNetSetoran: number;
    statusCounts: { PENDING: number; APPROVED: number; REJECTED: number };
  };
  rows: SetoranEntry[];
}

type FilterStatus = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

export function AdminPajakSetoran() {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("ALL");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchReport(filterStatus);
  }, [filterStatus]);

  const fetchReport = async (status: FilterStatus) => {
    try {
      setLoading(true);
      setError("");
      const params: any = {};
      if (status !== "ALL") params.status = status;
      const response = await apiClient.get("/jukir/setoran/report", { params });
      if (response.data.success) {
        setReport(response.data.data);
      } else {
        setReport(null);
        setError("Data laporan setoran tidak tersedia.");
      }
    } catch (error: any) {
      console.error("Error fetching setoran report:", error);
      setReport(null);
      if (error.response?.status === 403) {
        setError("Akses ditolak. Pastikan Anda login sebagai admin.");
      } else if (error.response?.status === 401) {
        setError("Sesi login berakhir. Silakan login ulang.");
      } else {
        setError(error.response?.data?.message ?? "Gagal memuat data pajak & setoran.");
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = useMemo(() => {
    const rows = report?.rows ?? [];
    if (filterStatus === "ALL") return rows;
    return rows.filter((row) => row.status === filterStatus);
  }, [report, filterStatus]);

  const handleApprove = async (id: string, status: "APPROVED" | "REJECTED") => {
    if (!confirm(`Confirm ${status === "APPROVED" ? "approval" : "rejection"}?`)) return;

    try {
      const response = await apiClient.put(`/jukir/setoran/${id}/approve`, {
        status,
        note: status === "APPROVED" ? "Approved by admin" : "Not approved",
      });

      if (response.data.success) {
        alert(`${status === "APPROVED" ? "Approved" : "Rejected"} successfully!`);
        fetchReport(filterStatus);
      }
    } catch (error) {
      console.error("Approve/reject error:", error);
      alert("Failed to update setoran");
    }
  };

  const formatCurrency = (amount?: number) => {
    if (amount == null) return "-";
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

  const summary = report?.summary;

  return (
    <div className="page">
      <header className="page-header">
        <h1><Wallet className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" /> Pajak &amp; Setoran Jukir</h1>
        <p>Potongan pajak otomatis berdasarkan MOU dari pendapatan transaksi completed</p>
      </header>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="grid grid-kpi">
        <div className="card card-stat">
          <div className="icon-container icon-info"><BarChart3 size={20} strokeWidth={1.8} aria-hidden="true" /></div>
          <div className="stat-content">
            <span className="stat-label">Total Transaksi</span>
            <span className="stat-value">{summary?.totalTransactions ?? 0}</span>
          </div>
        </div>

        <div className="card card-stat">
          <div className="icon-container icon-success"><Banknote size={20} strokeWidth={1.8} aria-hidden="true" /></div>
          <div className="stat-content">
            <span className="stat-label">Total Gross</span>
            <span className="stat-value">{formatCurrency(summary?.totalGross)}</span>
          </div>
        </div>

        <div className="card card-stat">
          <div className="icon-container icon-warning"><Wallet size={20} strokeWidth={1.8} aria-hidden="true" /></div>
          <div className="stat-content">
            <span className="stat-label">Total Pajak</span>
            <span className="stat-value">{formatCurrency(summary?.totalTax)}</span>
          </div>
        </div>

        <div className="card card-stat">
          <div className="icon-container icon-info"><Check size={20} strokeWidth={1.8} aria-hidden="true" /></div>
          <div className="stat-content">
            <span className="stat-label">Total Net Setoran</span>
            <span className="stat-value">{formatCurrency(summary?.totalNetSetoran)}</span>
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <div className="filter-section">
          <div className="filter-tabs">
            <button className={filterStatus === "ALL" ? "active" : ""} onClick={() => setFilterStatus("ALL")}>
              All ({summary?.totalEntries ?? 0})
            </button>
            <button className={filterStatus === "PENDING" ? "active" : ""} onClick={() => setFilterStatus("PENDING")}>
              Pending ({summary?.statusCounts.PENDING ?? 0})
            </button>
            <button className={filterStatus === "APPROVED" ? "active" : ""} onClick={() => setFilterStatus("APPROVED")}>
              Approved ({summary?.statusCounts.APPROVED ?? 0})
            </button>
            <button className={filterStatus === "REJECTED" ? "active" : ""} onClick={() => setFilterStatus("REJECTED")}>
              Rejected ({summary?.statusCounts.REJECTED ?? 0})
            </button>
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <table className="table">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Jukir</th>
              <th>Area</th>
              <th>Transaksi</th>
              <th>Gross</th>
              <th>Pajak</th>
              <th>Net Setoran</th>
              <th>Info Bagian Jukir</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="text-center">Loading...</td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center text-muted">
                  {report
                    ? "Belum ada data setoran pada filter/periode ini."
                    : "Data tidak tersedia. Cek koneksi atau akses admin Anda."}
                </td>
              </tr>
            ) : (
              filteredRows.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.date).toLocaleDateString("id-ID")}</td>
                  <td>{entry.jukir?.name ?? entry.jukirId}</td>
                  <td>{entry.area?.name ?? entry.areaId}</td>
                  <td>{entry.totalTransactions}</td>
                  <td>{formatCurrency(entry.grossAmount)}</td>
                  <td className="text-danger">-{formatCurrency(entry.taxAmount)} ({entry.taxPercent}%)</td>
                  <td className="text-success">{formatCurrency(entry.netSetoranAmount)}</td>
                  <td>{formatCurrency(entry.jukirShareAmount)} ({entry.jukirSharePercent}%)</td>
                  <td>{getStatusBadge(entry.status)}</td>
                  <td>
                    <div className="action-buttons">
                      {entry.status === "PENDING" && (
                        <>
                          <button className="btn btn-sm btn-success" onClick={() => handleApprove(entry.id, "APPROVED")}>
                            <Check size={14} strokeWidth={2.4} aria-hidden="true" /> Approve
                          </button>
                          <button className="btn btn-sm btn-outline" onClick={() => handleApprove(entry.id, "REJECTED")}>
                            <X size={14} strokeWidth={2.4} aria-hidden="true" /> Reject
                          </button>
                        </>
                      )}
                      {entry.status !== "PENDING" && (
                        <span className="text-muted small">
                          {entry.approvedAt && new Date(entry.approvedAt).toLocaleDateString("id-ID")}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
