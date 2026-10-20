import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Banknote, Check, ClipboardList, CreditCard, QrCode, Smartphone } from "lucide-react";
import { apiClient } from "../../api/client";

interface QrData {
  transactionCode: string;
  amount: number;
  merchantId: string;
  qrCodeUrl: string;
  expiresAt: string;
}

interface Transaction {
  id: string;
  transactionCode: string;
  areaId: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  vehicleType?: string | null;
  plateNumber?: string | null;
  checkIn: Date;
  checkOut?: Date | null;
  durationMinutes?: number;
  amount?: number;
  area: { name: string };
}

const vehicleLabel = (t?: string | null) => (t === "car" ? "Mobil" : t === "motorcycle" ? "Motor" : "-");

export function JukirPayment() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const txCode = searchParams.get("tx");
  const [loading, setLoading] = useState(true);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "QRIS">("CASH");
  const [processing, setProcessing] = useState(false);
  const [qr, setQr] = useState<QrData | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string>("");

  useEffect(() => {
    if (!txCode) {
      navigate("/jukir/transactions");
      return;
    }
    fetchTransaction();
  }, [txCode, navigate]);

  const fetchTransaction = async () => {
    if (!txCode) return;
    try {
      const response = await apiClient.get(`/transactions/${txCode}`);
      if (response.data.success) {
        setTransaction(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching transaction:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectMethod = (method: "CASH" | "QRIS") => {
    if (!transaction) return;

    const isCompleted = transaction.status === "COMPLETED";
    const hasCheckoutAmount = transaction.amount != null;

    if (method === "QRIS" && isCompleted) {
      alert("Transaksi ini sudah dibayar (COMPLETED)");
      return;
    }

    if (method === "QRIS" && !hasCheckoutAmount) {
      alert("Checkout dulu sebelum generate QRIS");
      return;
    }

    setPaymentMethod(method);
    setQrError("");
    if (method === "CASH") setQr(null);
    if (method === "QRIS" && !qr) generateQr();
  };

  const generateQr = async () => {
    if (!transaction) return;
    setQrLoading(true);
    try {
      setQrError("");
      const response = await apiClient.post("/jukir/qris/generate", {
        transactionId: transaction.id,
      });
      if (response.data.success) {
        setQr(response.data.data);
      } else {
        throw new Error(response.data.message || "Gagal generate QR");
      }
    } catch (error: any) {
      console.error("QR generate error:", error);
      const message = error?.response?.data?.message || "Gagal generate QR Code";
      setQrError(message);
      alert(message);
    } finally {
      setQrLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!transaction) return;

    if (paymentMethod === "QRIS" && !qr) {
      alert("Generate QR Code terlebih dahulu");
      return;
    }

    if (paymentMethod === "QRIS") {
      try {
        const statusResponse = await apiClient.get(`/jukir/qris/status/${transaction.id}`);
        if (statusResponse.data.success && statusResponse.data.data?.isPaid) {
          alert("Pembayaran QRIS sudah diterima. Status transaksi akan diperbarui otomatis.");
          fetchTransaction();
          navigate("/jukir/transactions");
        } else {
          alert("Pembayaran QRIS belum terkonfirmasi. Minta pelanggan selesaikan scan/pay terlebih dahulu.");
        }
      } catch (error) {
        console.error("QRIS status error:", error);
        alert("Gagal mengecek status QRIS");
      }
      return;
    }

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

  const isCompleted = transaction.status === "COMPLETED";
  const hasCheckoutAmount = transaction.amount != null;

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
              <label>Jenis Kendaraan</label>
              <span>{vehicleLabel(transaction.vehicleType)}</span>
            </div>

            <div className="detail-item">
              <label>Plat Nomor</label>
              <span className="font-semibold">{transaction.plateNumber || "-"}</span>
            </div>
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

          {isCompleted && (
            <div className="alert alert-success mb-4">Transaksi ini sudah dibayar (COMPLETED).</div>
          )}

          {!isCompleted && !hasCheckoutAmount && (
            <div className="alert alert-warning mb-4">Checkout dulu agar nominal pembayaran muncul.</div>
          )}

          {!!qrError && <div className="alert alert-danger mb-4">{qrError}</div>}
          
          <div className="payment-methods">
            <button
              className={`payment-option ${paymentMethod === "CASH" ? "active" : ""}`}
              onClick={() => selectMethod("CASH")}
              disabled={isCompleted || !hasCheckoutAmount}
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
              onClick={() => selectMethod("QRIS")}
              disabled={isCompleted || !hasCheckoutAmount}
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

          {paymentMethod === "QRIS" && (
            <div className="qr-display mt-4">
              {qrLoading && <p>Membuat QR Code...</p>}
              {!qrLoading && qr && (
                <div className="qr-container">
                  <div className="qr-code-large">
                    <img src={qr.qrCodeUrl} alt={`QR Code ${qr.transactionCode}`} width={220} height={220} />
                  </div>
                  <div className="qr-info">
                    <div className="info-row"><strong>ID Transaksi:</strong><span>{qr.transactionCode}</span></div>
                    <div className="info-row"><strong>Merchant:</strong><span>{qr.merchantId}</span></div>
                    <div className="info-row"><strong>Kadaluarsa:</strong><span>{new Date(qr.expiresAt).toLocaleTimeString("id-ID")}</span></div>
                  </div>
                  <p className="qr-hint">
                    <QrCode size={14} strokeWidth={1.8} aria-hidden="true" /> Minta pelanggan scan QR, lalu klik Selesaikan Transaksi.
                  </p>
                </div>
              )}
            </div>
          )}

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
              disabled={processing || isCompleted || !hasCheckoutAmount}
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
