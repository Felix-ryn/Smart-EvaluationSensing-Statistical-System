import { useState, useEffect } from "react";
import { BarChart3, Banknote, Check, Hourglass, Wallet, X } from "lucide-react";
import { apiClient } from "../../api/client";

interface SetoranEntry {
  id: string;
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
  approvedBy?: string | null;
}

export function AdminPajakSetoran() {
  const [loading, setLoading] = useState(true);
  const [setoranList, setSetoranList] = useState<SetoranEntry[]>([]);
  const [filterStatus, setFilterStatus] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");

  useEffect(() => {
    fetchSetoran();
  }, [filterStatus]);

  const fetchSetoran = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get("/jukir/setoran/history?limit=100");
      if (response.data.success) {
        setSetoranList(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching setoran:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string, status: "APPROVED" | "REJECTED") => {
    if (!confirm(`Confirm ${status === 'APPROVED' ? 'approval' : 'rejection'}?`)) return;

    try {
      const response = await apiClient.put(`/jukir/setoran/${id}/approve`, {
        status,
        note: status === "APPROVED" ? "Approved by admin" : "Not approved",
      });

      if (response.data.success) {
        alert(`${status === "APPROVED" ? "Approved" : "Rejected"} successfully!`);
        fetchSetoran();
      }
    } catch (error) {
      console.error("Approve/reject error:", error);
      alert("Failed to update setoran");
    }
  };

  const filteredSetoran = setoranList.filter(entry => {
    if (filterStatus === "ALL") return true;
    return entry.status === filterStatus;
  });

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

  const getJurikName = (jurikId: string) => {
    // In production, would fetch from user list
    const jurikNames: Record<string, string> = {
      "jurik-1": "Budi Santoso",
      "jurik-2": "Siti Rahayu",
      "jurik-3": "Agus Wijaya",
      "jurik-4": "Dewi Lestari",
    };
    return jurikNames[jurikId] || "Unknown Jurik";
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1><Wallet className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" /> Pajak &amp; Setoran Jukir</h1>
        <p>Kelola pajak pengelola dan setoran jukir parkir</p>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-kpi">
        <div className="card card-stat">
          <div className="icon-container icon-info"><BarChart3 size={20} strokeWidth={1.8} aria-hidden="true" /></div>
          <div className="stat-content">
            <span className="stat-label">Total Transactions Today</span>
            <span className="stat-value">
              {setoranList.reduce((sum, s) => sum + s.totalTransactions, 0)}
            </span>
          </div>
        </div>

        <div className="card card-stat">
          <div className="icon-container icon-success"><Banknote size={20} strokeWidth={1.8} aria-hidden="true" /></div>
          <div className="stat-content">
            <span className="stat-label">Gross Revenue Today</span>
            <span className="stat-value">
              Rp {setoranList.reduce((sum, s) => sum + (s.grossAmount || 0), 0).toLocaleString("id-ID")}
            </span>
          </div>
        </div>

        <div className="card card-stat">
          <div className="icon-container icon-warning"><Hourglass size={20} strokeWidth={1.8} aria-hidden="true" /></div>
          <div className="stat-content">
            <span className="stat-label">Pending Approval</span>
            <span className="stat-value">{setoranList.filter(s => s.status === "PENDING").length}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card mt-4">
        <div className="filter-section">
          <div className="filter-tabs">
            <button
              className={filterStatus === "ALL" ? "active" : ""}
              onClick={() => setFilterStatus("ALL")}
            >
              All ({setoranList.length})
            </button>
            <button
              className={filterStatus === "PENDING" ? "active" : ""}
              onClick={() => setFilterStatus("PENDING")}
            >
              Pending ({setoranList.filter(s => s.status === "PENDING").length})
            </button>
            <button
              className={filterStatus === "APPROVED" ? "active" : ""}
              onClick={() => setFilterStatus("APPROVED")}
            >
              Approved ({setoranList.filter(s => s.status === "APPROVED").length})
            </button>
            <button
              className={filterStatus === "REJECTED" ? "active" : ""}
              onClick={() => setFilterStatus("REJECTED")}
            >
              Rejected
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card mt-4">
        <table className="table">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Jurik</th>
              <th>Area</th>
              <th>Transaksi</th>
              <th>Gross Amount</th>
              <th>Pajak (Admin)</th>
              <th>Jurik Share</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center">Loading...</td>
              </tr>
            ) : filteredSetoran.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center text-muted">No data available</td>
              </tr>
            ) : (
              filteredSetoran.map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.date).toLocaleDateString("id-ID")}</td>
                  <td>{getJurikName(entry.jukirId)}</td>
                  <td>{entry.areaId}</td>
                  <td>{entry.totalTransactions}</td>
                  <td>{formatCurrency(entry.grossAmount)}</td>
                  <td className="text-danger">
                    -{formatCurrency(entry.taxAmount)} ({entry.taxPercent}%)
                  </td>
                  <td className="text-success">+{formatCurrency(entry.jukirShareAmount)}</td>
                  <td>{getStatusBadge(entry.status)}</td>
                  <td>
                    <div className="action-buttons">
                      {entry.status === "PENDING" && (
                        <>
                          <button 
                            className="btn btn-sm btn-success"
                            onClick={() => handleApprove(entry.id, "APPROVED")}
                          >
                            <Check size={14} strokeWidth={2.4} aria-hidden="true" /> Approve
                          </button>
                          <button 
                            className="btn btn-sm btn-outline"
                            onClick={() => handleApprove(entry.id, "REJECTED")}
                          >
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
