import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CreditCard, Plus } from "lucide-react";
import { apiClient } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";

interface Transaction {
  id: string;
  transactionCode: string;
  areaId: string;
  jukirId?: string | null;
  vehicleType?: string | null;
  plateNumber?: string | null;
  checkIn: Date;
  checkOut?: Date | null;
  durationMinutes?: number | null;
  amount?: number | null;
  paymentMethod?: "CASH" | "QRIS" | null;
  paidAt?: Date | null;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  area: { name: string };
}

const vehicleLabel = (t?: string | null) => (t === "car" ? "Mobil" : t === "motorcycle" ? "Motor" : "-");

export function JukirTransactions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ACTIVE" | "COMPLETED">("ALL");
  const [showForm, setShowForm] = useState(false);
  const [vehicleType, setVehicleType] = useState<"motorcycle" | "car">("motorcycle");
  const [plateNumber, setPlateNumber] = useState("");
  const [creating, setCreating] = useState(false);

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.areaId) {
      alert("Akun Anda belum ditugaskan ke area parkir. Hubungi admin.");
      return;
    }
    const plate = plateNumber.trim().toUpperCase();
    if (!plate) {
      alert("Plat nomor wajib diisi");
      return;
    }
    setCreating(true);
    try {
      const response = await apiClient.post("/transactions", {
        areaId: user.areaId,
        vehicleType,
        plateNumber: plate,
      });
      if (response.data.success) {
        setShowForm(false);
        setPlateNumber("");
        setVehicleType("motorcycle");
        fetchTransactions();
      } else {
        throw new Error(response.data.message || "Gagal membuat transaksi");
      }
    } catch (error) {
      console.error("Create transaction error:", error);
      alert("Gagal membuat transaksi baru");
    } finally {
      setCreating(false);
    }
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
        <h1><CreditCard className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" /> Transaksi Parkir</h1>
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
              onClick={() => setShowForm((v) => !v)}
            >
              <Plus size={16} strokeWidth={2} aria-hidden="true" /> Transaksi Baru
            </button>
          </div>
        </div>
      </div>

      {/* New Transaction Form */}
      {showForm && (
        <div className="card mb-4">
          <h2><Plus size={18} strokeWidth={1.8} aria-hidden="true" /> Transaksi Baru</h2>
          <form onSubmit={handleCreate}>
            <div className="grid grid-2">
              <div className="form-group">
                <label htmlFor="vehicleType">Jenis Kendaraan</label>
                <select
                  id="vehicleType"
                  className="input"
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as "motorcycle" | "car")}
                >
                  <option value="motorcycle">Motor</option>
                  <option value="car">Mobil</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="plateNumber">Plat Nomor</label>
                <input
                  id="plateNumber"
                  type="text"
                  className="input"
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                  placeholder="B 1234 XYZ"
                  maxLength={15}
                  required
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? "Menyimpan..." : "Simpan"}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setShowForm(false)}
                disabled={creating}
              >
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Transactions Table */}
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>ID Transaksi</th>
              <th>Kendaraan</th>
              <th>Plat</th>
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
                <td colSpan={10} className="text-center">Loading...</td>
              </tr>
            ) : filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center text-muted">Tidak ada data transaksi</td>
              </tr>
            ) : (
              filteredTransactions.map((tx) => (
                <tr key={tx.id}>
                  <td className="font-semibold">{tx.transactionCode}</td>
                  <td>{vehicleLabel(tx.vehicleType)}</td>
                  <td>{tx.plateNumber || "-"}</td>
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
