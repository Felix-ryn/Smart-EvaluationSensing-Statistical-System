import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CarFront, CreditCard, ListFilter, Plus, Printer, Search, X, Camera } from "lucide-react";
import { apiClient } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { PlateDetectionModal } from "../../components/PlateDetectionModal";

interface Transaction {
  id: string;
  transactionCode: string;
  areaId: string;
  jukirId?: string | null;
  vehicleType?: string | null;
  plateNumber?: string | null;
  checkIn: Date | string;
  checkOut?: Date | string | null;
  durationMinutes?: number | null;
  amount?: number | null;
  paymentMethod?: "CASH" | "QRIS" | null;
  paidAt?: Date | string | null;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  area: { name: string };
}

interface TicketData {
  transactionCode: string;
  checkIn: Date | string;
  vehicleType?: string | null;
  plateNumber?: string | null;
  areaName: string;
  jukirName: string;
  qrCodeUrl: string;
}

const vehicleLabel = (t?: string | null) => (t === "car" ? "Mobil" : t === "motorcycle" ? "Motor" : "-");

export function JukirTransactions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filterStatus, setFilterStatus] = useState<"ALL" | "ACTIVE" | "COMPLETED">("ACTIVE");
  const [searchKeyword, setSearchKeyword] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [vehicleType, setVehicleType] = useState<"motorcycle" | "car">("motorcycle");
  const [plateNumber, setPlateNumber] = useState("");
  const [creating, setCreating] = useState(false);
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [showPlateDetection, setShowPlateDetection] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get("/transactions");
      if (response.data.success) {
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

  const handlePayment = (transactionCode: string) => {
    navigate(`/jukir/payment?tx=${encodeURIComponent(transactionCode)}`);
  };

  const openCreateModal = () => {
    setShowModal(true);
  };

  const closeCreateModal = () => {
    if (creating) return;
    // Stop webcam if it's running
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
    }
    setShowPlateDetection(false);
    setShowModal(false);
    setPlateNumber("");
    setVehicleType("motorcycle");
  };

  const forceCloseCreateModal = () => {
    setShowModal(false);
    setPlateNumber("");
    setVehicleType("motorcycle");
  };

  const closeTicketModal = () => {
    setTicketData(null);
  };

  const buildVehicleQrUrl = (tx: Pick<Transaction, "transactionCode" | "checkIn" | "vehicleType" | "plateNumber">) => {
    const qrPayload = `VEHICLE|${tx.transactionCode}|${new Date(tx.checkIn).toISOString()}|${tx.vehicleType || "-"}|${tx.plateNumber || "-"}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrPayload)}`;
  };

  const openTicketModal = (tx: Transaction) => {
    setTicketData({
      transactionCode: tx.transactionCode,
      checkIn: tx.checkIn,
      vehicleType: tx.vehicleType,
      plateNumber: tx.plateNumber,
      areaName: tx.area?.name || "-",
      jukirName: user?.name || "-",
      qrCodeUrl: buildVehicleQrUrl(tx),
    });
  };

  const handlePrintTicket = () => {
    window.print();
  };

  const handlePlateDetected = (detectedPlate: string, confidence: number) => {
    setPlateNumber(detectedPlate);
    setShowPlateDetection(false);
    // Optional: Show info about confidence
    if (confidence >= 0.85) {
      console.log(`Plat terdeteksi dengan confidence tinggi: ${(confidence * 100).toFixed(1)}%`);
    } else {
      console.log(`Plat terdeteksi dengan confidence rendah: ${(confidence * 100).toFixed(1)}%, silakan verifikasi`);
    }
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
        const createdTx = response.data.data as Transaction;
        forceCloseCreateModal();
        openTicketModal(createdTx);
        setTransactions((prev) => [createdTx, ...prev]);
        fetchTransactions();
      } else {
        throw new Error(response.data.message || "Gagal membuat transaksi");
      }
    } catch (error: any) {
      console.error("Create transaction error:", error);
      const message = error?.response?.data?.message || "Gagal membuat transaksi baru";
      alert(message);
    } finally {
      setCreating(false);
    }
  };

  const totalCount = transactions.length;
  const activeCount = transactions.filter((tx) => tx.status === "ACTIVE").length;
  const completedCount = transactions.filter((tx) => tx.status === "COMPLETED").length;

  const filteredTransactions = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();

    return transactions.filter((tx) => {
      if (filterStatus !== "ALL" && tx.status !== filterStatus) return false;

      if (!keyword) return true;
      const plate = tx.plateNumber?.toLowerCase() || "";
      const code = tx.transactionCode?.toLowerCase() || "";
      return plate.includes(keyword) || code.includes(keyword);
    });
  }, [transactions, filterStatus, searchKeyword]);

  const formatCurrency = (amount?: number | null) => {
    if (amount == null) return "-";
    return `Rp ${amount.toLocaleString("id-ID")}`;
  };

  const formatTime = (date: Date | string) => {
    return new Date(date).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDateTime = (date: Date | string) => {
    return new Date(date).toLocaleString("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
        <h1>
          <CreditCard className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" /> Transaksi Parkir
        </h1>
        <p>Kelola transaksi parkir yang masuk dan keluar</p>
      </header>

      <div className="grid grid-kpi jukir-transaction-kpi">
        <div className="card card-stat">
          <div className="icon-container icon-info">
            <CreditCard size={20} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Total Transaksi</span>
            <span className="stat-value">{totalCount}</span>
          </div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-warning">
            <ListFilter size={20} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Sedang Aktif</span>
            <span className="stat-value">{activeCount}</span>
          </div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-success">
            <CarFront size={20} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Selesai</span>
            <span className="stat-value">{completedCount}</span>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="filter-section jukir-transaction-toolbar">
          <div className="filter-tabs">
            <button className={filterStatus === "ALL" ? "active" : ""} onClick={() => setFilterStatus("ALL")}>
              Semua ({totalCount})
            </button>
            <button className={filterStatus === "ACTIVE" ? "active" : ""} onClick={() => setFilterStatus("ACTIVE")}>
              Aktif ({activeCount})
            </button>
            <button
              className={filterStatus === "COMPLETED" ? "active" : ""}
              onClick={() => setFilterStatus("COMPLETED")}
            >
              Selesai ({completedCount})
            </button>
          </div>

          <div className="jukir-toolbar-actions">
            <label className="input-icon-wrap" htmlFor="tx-search">
              <Search size={16} strokeWidth={1.9} aria-hidden="true" />
              <input
                id="tx-search"
                className="input"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="Cari plat / ID transaksi"
                autoComplete="off"
              />
            </label>

            <button className="btn btn-primary" onClick={openCreateModal}>
              <Plus size={16} strokeWidth={2} aria-hidden="true" /> Transaksi Baru
            </button>
          </div>
        </div>
      </div>

      <div className="card table-wrap">
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
                <td colSpan={10} className="text-center">
                  Loading...
                </td>
              </tr>
            ) : filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center text-muted jukir-empty-state-cell">
                  Tidak ada data transaksi yang cocok.
                </td>
              </tr>
            ) : (
              filteredTransactions.map((tx) => (
                <tr key={tx.id}>
                  <td className="font-semibold">{tx.transactionCode}</td>
                  <td>{vehicleLabel(tx.vehicleType)}</td>
                  <td>{tx.plateNumber || "-"}</td>
                  <td>{tx.area.name}</td>
                  <td>{formatTime(tx.checkIn)}</td>
                  <td>{tx.checkOut ? formatTime(tx.checkOut) : "-"}</td>
                  <td>
                    {tx.durationMinutes ? `${Math.floor(tx.durationMinutes / 60)}j ${tx.durationMinutes % 60}m` : "-"}
                  </td>
                  <td>{formatCurrency(tx.amount)}</td>
                  <td>{getStatusBadge(tx.status)}</td>
                  <td>
                    <div className="action-buttons">
                      {tx.status === "ACTIVE" && (
                        <button className="btn btn-sm btn-secondary" onClick={() => openTicketModal(tx)}>
                          <Printer size={14} strokeWidth={2} aria-hidden="true" /> Cetak Karcis
                        </button>
                      )}

                      {tx.status === "ACTIVE" && !tx.checkOut && (
                        <button className="btn btn-sm btn-outline" onClick={() => handleCheckout(tx.id)}>
                          Checkout
                        </button>
                      )}

                      {tx.status === "ACTIVE" && !!tx.checkOut && tx.amount != null && (
                        <button className="btn btn-sm btn-primary" onClick={() => handlePayment(tx.transactionCode)}>
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

      {showModal && (
        <div className="modal-backdrop" role="presentation" onClick={closeCreateModal}>
          <div className="modal-card jukir-transaction-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>
                <Plus size={18} strokeWidth={1.8} aria-hidden="true" /> Tambah Transaksi Baru
              </h2>
              <button type="button" className="btn btn-outline btn-sm" onClick={closeCreateModal} disabled={creating}>
                <X size={15} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>

            <p className="text-muted">Pilih jenis kendaraan dan isi plat nomor untuk check-in kendaraan baru.</p>

            <form onSubmit={handleCreate}>
              <div className="jukir-vehicle-select" role="radiogroup" aria-label="Jenis Kendaraan">
                <button
                  type="button"
                  className={`vehicle-choice ${vehicleType === "motorcycle" ? "active" : ""}`}
                  onClick={() => setVehicleType("motorcycle")}
                >
                  Motor
                </button>
                <button
                  type="button"
                  className={`vehicle-choice ${vehicleType === "car" ? "active" : ""}`}
                  onClick={() => setVehicleType("car")}
                >
                  Mobil
                </button>
              </div>

              <div className="form-group">
                <label htmlFor="plateNumber">Plat Nomor</label>
                <div className="input-with-action">
                  <input
                    id="plateNumber"
                    type="text"
                    className="input"
                    value={plateNumber}
                    onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                    placeholder="Contoh: B 1234 XYZ"
                    maxLength={15}
                    required
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowPlateDetection(true)}
                    title="Deteksi plat dengan kamera"
                  >
                    <Camera size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="actions">
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? "Menyimpan..." : "Simpan Transaksi"}
                </button>
                <button type="button" className="btn btn-outline" onClick={closeCreateModal} disabled={creating}>
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {ticketData && (
        <div className="modal-backdrop" role="presentation" onClick={closeTicketModal}>
          <div className="modal-card ticket-modal ticket-print-root" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head ticket-head">
              <h2>
                <Printer size={18} strokeWidth={1.8} aria-hidden="true" /> Karcis Parkir
              </h2>
              <button type="button" className="btn btn-outline btn-sm" onClick={closeTicketModal}>
                <X size={15} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>

            <div className="ticket-print-area">
              <div className="ticket-logo-wrap">
                <img src="/logo.png" alt="SESS" className="ticket-logo" />
                <div>
                  <p className="ticket-brand">Smart Street Parking</p>
                  <p className="ticket-sub">Karcis Kendaraan</p>
                </div>
              </div>

              <div className="ticket-divider" />

              <div className="ticket-meta">
                <div><span>ID</span><strong>{ticketData.transactionCode}</strong></div>
                <div><span>Jam Masuk</span><strong>{formatDateTime(ticketData.checkIn)}</strong></div>
                <div><span>Jenis</span><strong>{vehicleLabel(ticketData.vehicleType)}</strong></div>
                <div><span>Plat</span><strong>{ticketData.plateNumber || "-"}</strong></div>
                <div><span>Jukir</span><strong>{ticketData.jukirName}</strong></div>
                <div><span>Area</span><strong>{ticketData.areaName}</strong></div>
              </div>

              <div className="ticket-qr-wrap">
                <img src={ticketData.qrCodeUrl} alt={`QR Kendaraan ${ticketData.transactionCode}`} width={170} height={170} />
                <p className="ticket-note">Simpan karcis ini sampai kendaraan keluar.</p>
              </div>
            </div>

            <div className="actions ticket-modal-actions mt-4">
              <button type="button" className="btn btn-primary" onClick={handlePrintTicket}>
                <Printer size={16} strokeWidth={2} aria-hidden="true" /> Print Karcis
              </button>
              <button type="button" className="btn btn-outline" onClick={closeTicketModal}>
                Tutup
              </button>
            </div>
           </div>
         </div>
       )}

       {showModal && showPlateDetection && (
         <PlateDetectionModal
           vehicleType={vehicleType}
           onPlateDetected={handlePlateDetected}
           onClose={() => setShowPlateDetection(false)}
           aiServiceUrl={import.meta.env.VITE_AI_SERVICE_URL || "http://localhost:8000"}
         />
       )}

       <style>{`
         .input-with-action {
           display: flex;
           gap: 8px;
           align-items: center;
         }

         .input-with-action .input {
           flex: 1;
         }

         .input-with-action .btn {
           flex-shrink: 0;
         }
       `}</style>
     </div>
   );
}
