import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../api/client";

interface Transaction {
  id: string;
  transactionCode: string;
  areaId: string;
  jukirId?: string | null;
  checkIn: Date;
  checkOut?: Date | null;
  durationMinutes?: number | null;
  amount?: number | null;
  paymentMethod?: "CASH" | "QRIS" | null;
  paidAt?: Date | null;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  area: { name: string };
}

export function JukirTransactions() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ACTIVE" | "COMPLETED">("ALL");

  useEffect(() => {
    fetchTransactions();
  }, [filterStatus]);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get("/transactions");
      if (response.data.success) {
        // Filter transactions based on Jurik's area
        setTransactions(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (transactionId: string) => {
    if (!confirm("Konfirmasi checkout transaksi ini?")) return;

    try {
      const response = await apiClient.post(`/transactions/${transactionId}/checkout`);
      if (response.data.success) {
        alert("Checkout berhasil!");
        fetchTransactions();
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Gagal melakukan checkout");
    }
  };

  const handlePayment = (transactionId: string) => {
    navigate(`/jukir/payment?tx=${transactionId}`);
  };

  const filteredTransactions = transactions.filter(tx => {
    if (filterStatus === "ALL") return true;
    return tx.status === filterStatus;
  });

  const formatCurrency = (amount?: number | null) => {
    if (amount == null) return "-";
    return `Rp ${amount.toLocaleString("id-ID")}`;
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <span className="badge badge-success">Selesai</span>;
      case "ACTIVE":
        return <span className="badge badge-warning">Aktif</span>;
      default:
        return <span className="badge badge-danger">Dibatalkan</span>;
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>💳 Transaksi Parkir</h1>
        <p>Kelola transaksi parkir yang masuk dan keluar</p>
      </header>

      {/* Filters & Actions */}
      <div className="card mb-4">
        <div className="filter-section">
          <div className="filter-tabs">
            <button
              className={filterStatus === "ALL" ? "active" : ""}
              onClick={() => setFilterStatus("ALL")}
            >
              Semua ({transactions.length})
            </button>
            <button
              className={filterStatus === "ACTIVE" ? "active" : ""}
              onClick={() => setFilterStatus("ACTIVE")}
            >
              Aktif
            </button>
            <button
              className={filterStatus === "COMPLETED" ? "active" : ""}
              onClick={() => setFilterStatus("COMPLETED")}
            >
              Selesai
            </button>
          </div>

          <div className="actions">
            <button 
              className="btn btn-primary" 
              onClick={() => {
                // In real app, open modal for new transaction
                alert("Fitur transaksi baru akan segera hadir");
              }}
            >
              ➕ Transaksi Baru
            </button>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>ID Transaksi</th>
              <th>Area</th>
              <th>Masuk</th>
              <th>Keluar</th>
              <th>Durasi</th>
              <th>Jumlah</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center">Loading...</td>
              </tr>
            ) : filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted">Tidak ada data transaksi</td>
              </tr>
            ) : (
              filteredTransactions.map((tx) => (
                <tr key={tx.id}>
                  <td className="font-semibold">{tx.transactionCode}</td>
                  <td>{tx.area.name}</td>
                  <td>{formatTime(new Date(tx.checkIn))}</td>
                  <td>
                    {tx.checkOut ? formatTime(new Date(tx.checkOut)) : "-"}
                  </td>
                  <td>
                    {tx.durationMinutes 
                      ? `${Math.floor(tx.durationMinutes / 60)}j ${tx.durationMinutes % 60}m`
                      : "-"}
                  </td>
                  <td>{formatCurrency(tx.amount)}</td>
                  <td>{getStatusBadge(tx.status)}</td>
                  <td>
                    <div className="action-buttons">
                      {tx.status === "ACTIVE" && !tx.checkOut && (
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => handleCheckout(tx.id)}
                        >
                          Checkout
                        </button>
                      )}
                      
                      {(tx.checkOut || tx.status === "COMPLETED") && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handlePayment(tx.id)}
                        >
                          Bayar
                        </button>
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
