import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Banknote, Check, ClipboardList, CreditCard, Smartphone } from "lucide-react";
import { apiClient } from "../../api/client";

interface Transaction {
  id: string;
  transactionCode: string;
  areaId: string;
  checkIn: Date;
  checkOut?: Date | null;
  durationMinutes?: number;
  amount?: number;
  area: { name: string };
}

export function JukirPayment() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const txId = searchParams.get("tx");
  const [loading, setLoading] = useState(true);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "QRIS">("CASH");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!txId) {
      navigate("/jukir/transactions");
      return;
    }
    fetchTransaction();
  }, [txId]);

  const fetchTransaction = async () => {
    try {
      const response = await apiClient.get(`/transactions/${txId}`);
      if (response.data.success) {
        setTransaction(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching transaction:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!transaction) return;
    
    if (!confirm(`Konfirmasi pembayaran ${paymentMethod} untuk ${transaction.transactionCode}?`)) {
      return;
    }

    setProcessing(true);
    try {
      const response = await apiClient.post(`/transactions/${transaction.id}/pay`, {
        paymentMethod,
      });

      if (response.data.success) {
        alert("Pembayaran berhasil!");
        navigate("/jukir/transactions");
      } else {
        throw new Error(response.data.message || "Payment failed");
      }
    } catch (error) {
      console.error("Payment error:", error);
      alert("Gagal melakukan pembayaran");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <div className="page"><div className="loading">Memuat data transaksi...</div></div>;
  }

  if (!transaction) {
    return <div className="page"><div className="empty-state">Transaksi tidak ditemukan</div></div>;
  }

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  };

  const calculateDuration = () => {
    if (!transaction.checkOut) return "-";
    
    const diffMs = new Date(transaction.checkOut).getTime() - new Date(transaction.checkIn).getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}j ${minutes}m`;
  };

  const totalAmount = transaction.amount || 0;

  return (
    <div className="page">
      <header className="page-header">
        <h1><Banknote className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" /> Pembayaran</h1>
        <p>Proses pembayaran pelanggan</p>
      </header>

      <div className="grid grid-2">
        {/* Left Column - Transaction Details */}
        <div className="card">
          <h2><ClipboardList className="title-icon" size={18} strokeWidth={1.8} aria-hidden="true" /> Detail Transaksi</h2>
          
          <div className="detail-item">
            <label>ID Transaksi</label>
            <span className="font-semibold">{transaction.transactionCode}</span>
          </div>

          <div className="detail-item">
            <label>Area Parkir</label>
            <span>{transaction.area.name}</span>
          </div>

          <div className="detail-row">
            <div className="detail-item">
              <label>Waktu Masuk</label>
              <span>{formatTime(new Date(transaction.checkIn))}</span>
            </div>
            
            <div className="detail-item">
              <label>Waktu Keluar</label>
              <span>{transaction.checkOut ? formatTime(new Date(transaction.checkOut)) : "-"}</span>
            </div>
          </div>

          <div className="detail-item">
            <label>Durasi</label>
            <span>{calculateDuration()}</span>
          </div>

          <div className="detail-item summary-item-large">
            <label>Total Bayar</label>
            <span className="currency-display">Rp {totalAmount.toLocaleString("id-ID")}</span>
          </div>
        </div>

        {/* Right Column - Payment Options */}
        <div className="card">
          <h2><CreditCard className="title-icon" size={18} strokeWidth={1.8} aria-hidden="true" /> Metode Pembayaran</h2>
          
          <div className="payment-methods">
            <button
              className={`payment-option ${paymentMethod === "CASH" ? "active" : ""}`}
              onClick={() => setPaymentMethod("CASH")}
            >
              <div className="payment-icon"><Banknote size={20} strokeWidth={1.8} aria-hidden="true" /></div>
              <div className="payment-info">
                <span className="payment-title">Tunai (Cash)</span>
                <span className="payment-desc">Bayar dengan uang tunai</span>
              </div>
              {paymentMethod === "CASH" && (
                <div className="checkmark"><Check size={16} strokeWidth={2.4} aria-hidden="true" /></div>
              )}
            </button>

            <button
              className={`payment-option ${paymentMethod === "QRIS" ? "active" : ""}`}
              onClick={() => setPaymentMethod("QRIS")}
            >
              <div className="payment-icon"><Smartphone size={20} strokeWidth={1.8} aria-hidden="true" /></div>
              <div className="payment-info">
                <span className="payment-title">QRIS</span>
                <span className="payment-desc">Scan QR Code atau bayar via app</span>
              </div>
              {paymentMethod === "QRIS" && (
                <div className="checkmark"><Check size={16} strokeWidth={2.4} aria-hidden="true" /></div>
              )}
            </button>
          </div>

          <div className="payment-summary">
            <div className="summary-row">
              <span>Total Pembayaran</span>
              <span className="amount-primary">Rp {totalAmount.toLocaleString("id-ID")}</span>
            </div>
          </div>

          <div className="actions mt-6">
            <button
              className="btn btn-primary w-100"
              onClick={handlePayment}
              disabled={processing}
            >
              {processing ? "Processing..." : "Selesaikan Transaksi"}
            </button>
            
            <button 
              className="btn btn-outline w-100 mt-3"
              onClick={() => navigate("/jukir/transactions")}
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
