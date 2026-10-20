import { useEffect, useMemo, useState } from "react";
import { Check, Hourglass, Info, Printer, QrCode, Smartphone } from "lucide-react";
import { apiClient } from "../../api/client";

interface TransactionItem {
  id: string;
  transactionCode: string;
  amount?: number | null;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  checkOut?: string | Date | null;
}

interface QrData {
  transactionCode: string;
  amount: number;
  merchantId: string;
  qrCodeUrl: string;
  expiresAt: string;
}

interface QrisStatus {
  transactionCode: string;
  status: string;
  paymentMethod?: string | null;
  amount?: number | null;
  paymentTime?: string | null;
  isPaid: boolean;
}

export function JukirQris() {
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState<string>("");
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [qrData, setQrData] = useState<QrData | null>(null);
  const [checkStatusTxId, setCheckStatusTxId] = useState<string>("");
  const [qrisStatus, setQrisStatus] = useState<QrisStatus | null>(null);

  useEffect(() => {
    fetchEligibleTransactions();
  }, []);

  const fetchEligibleTransactions = async () => {
    try {
      setLoadingTransactions(true);
      const response = await apiClient.get("/transactions");

      if (response.data.success) {
        setTransactions(response.data.data);
      }
    } catch (error) {
      console.error("Failed to fetch transactions for QRIS:", error);
      alert("Gagal memuat daftar transaksi");
    } finally {
      setLoadingTransactions(false);
    }
  };

  const eligibleTransactions = useMemo(
    () => transactions.filter((tx) => tx.status === "ACTIVE" && !!tx.amount && !!tx.checkOut),
    [transactions],
  );

  const selectedTransaction = useMemo(
    () => eligibleTransactions.find((tx) => tx.id === selectedTxId),
    [eligibleTransactions, selectedTxId],
  );

  const generateQRCode = async () => {
    if (!selectedTxId) {
      alert("Silakan pilih transaksi terlebih dahulu");
      return;
    }

    setLoadingGenerate(true);
    try {
      const response = await apiClient.post("/jukir/qris/generate", {
        transactionId: selectedTxId,
      });

      if (response.data.success) {
        setQrData(response.data.data);
      } else {
        throw new Error(response.data.message || "Failed to generate QR");
      }
    } catch (error: any) {
      console.error("QRIS generation error:", error);
      const message = error?.response?.data?.message || "Gagal generate QR Code";
      alert(message);
    } finally {
      setLoadingGenerate(false);
    }
  };

  const checkPaymentStatus = async () => {
    if (!checkStatusTxId) {
      alert("Masukkan ID transaksi");
      return;
    }

    setLoadingStatus(true);
    try {
      const response = await apiClient.get(`/jukir/qris/status/${checkStatusTxId}`);
      if (response.data.success) {
        setQrisStatus(response.data.data);
      } else {
        throw new Error(response.data.message || "Failed to check status");
      }
    } catch (error: any) {
      console.error("Status check error:", error);
      const message = error?.response?.data?.message || "Gagal cek status pembayaran";
      alert(message);
    } finally {
      setLoadingStatus(false);
    }
  };

  const handlePrintQR = () => {
    window.print();
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>
          <Smartphone className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" /> Transaksi QRIS
        </h1>
        <p>Generate & monitor pembayaran via QRIS</p>
      </header>

      <div className="grid grid-2">
        <div className="card">
          <h2>
            <QrCode className="title-icon" size={18} strokeWidth={1.8} aria-hidden="true" /> Generate QR Code
          </h2>

          <div className="form-section">
            <label htmlFor="qris-transaction-select">Pilih Transaksi</label>
            <select
              id="qris-transaction-select"
              className="input"
              value={selectedTxId}
              onChange={(e) => setSelectedTxId(e.target.value)}
              disabled={loadingTransactions}
            >
              <option value="">
                {loadingTransactions ? "Memuat transaksi..." : "-- Pilih Transaksi Eligible --"}
              </option>
              {eligibleTransactions.map((tx) => (
                <option key={tx.id} value={tx.id}>
                  {tx.transactionCode} - Rp {(tx.amount || 0).toLocaleString("id-ID")}
                </option>
              ))}
            </select>

            {!loadingTransactions && eligibleTransactions.length === 0 && (
              <p className="text-muted mt-3">Belum ada transaksi yang siap di-generate QRIS (checkout dulu).</p>
            )}

            {selectedTransaction && (
              <p className="text-muted mt-3">
                Transaksi dipilih: <strong>{selectedTransaction.transactionCode}</strong>
              </p>
            )}

            <button className="btn btn-primary mt-4 w-100" onClick={generateQRCode} disabled={loadingGenerate || !selectedTxId}>
              {loadingGenerate ? "Generating..." : "Generate QR Code"}
            </button>
          </div>

          {qrData && (
            <div className="qr-display mt-6">
              <h3>QR Code untuk Pembayaran</h3>

              <div className="qr-container">
                <div className="qr-placeholder">
                  <div className="qr-code-large">
                    {qrData.qrCodeUrl && <img src={qrData.qrCodeUrl} alt={`QR ${qrData.transactionCode}`} width={220} height={220} />}
                  </div>
                </div>

                <div className="qr-info">
                  <div className="info-row">
                    <strong>ID Transaksi:</strong>
                    <span>{qrData.transactionCode}</span>
                  </div>
                  <div className="info-row">
                    <strong>Jumlah:</strong>
                    <span className="currency-large">Rp {qrData.amount.toLocaleString("id-ID")}</span>
                  </div>
                  <div className="info-row">
                    <strong>Merchant:</strong>
                    <span>{qrData.merchantId}</span>
                  </div>
                  <div className="info-row">
                    <strong>Kadaluarsa:</strong>
                    <span>{new Date(qrData.expiresAt).toLocaleTimeString("id-ID")}</span>
                  </div>
                </div>
              </div>

              <div className="actions mt-4">
                <button className="btn btn-success w-100" onClick={handlePrintQR}>
                  <Printer size={16} strokeWidth={2} aria-hidden="true" /> Print QR Code
                </button>
                <button className="btn btn-outline w-100 mt-3" onClick={() => setQrData(null)}>
                  Generate Baru
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h2>
            <Check className="title-icon" size={18} strokeWidth={1.8} aria-hidden="true" /> Cek Status Pembayaran
          </h2>

          <div className="form-section">
            <label htmlFor="qris-check-id">ID Transaksi</label>
            <input
              id="qris-check-id"
              type="text"
              className="input"
              placeholder="Masukkan ID transaksi"
              value={checkStatusTxId}
              onChange={(e) => setCheckStatusTxId(e.target.value)}
            />

            <button className="btn btn-outline mt-4 w-100" onClick={checkPaymentStatus} disabled={loadingStatus}>
              {loadingStatus ? "Checking..." : "Check Status"}
            </button>
          </div>

          {qrisStatus && (
            <div className="status-display mt-6">
              <div className={`status-badge ${qrisStatus.isPaid ? "badge-success" : "badge-warning"}`}>
                {qrisStatus.isPaid ? (
                  <>
                    <Check size={14} strokeWidth={2.4} aria-hidden="true" /> PAID
                  </>
                ) : (
                  <>
                    <Hourglass size={14} strokeWidth={2} aria-hidden="true" /> Pending
                  </>
                )}
              </div>

              <div className="status-details">
                <div className="info-row">
                  <strong>ID:</strong>
                  <span>{qrisStatus.transactionCode}</span>
                </div>
                <div className="info-row">
                  <strong>Status:</strong>
                  <span>{qrisStatus.status}</span>
                </div>
                <div className="info-row">
                  <strong>Method:</strong>
                  <span>{qrisStatus.paymentMethod || "-"}</span>
                </div>
                <div className="info-row">
                  <strong>Amount:</strong>
                  <span>Rp {qrisStatus.amount?.toLocaleString("id-ID") || "-"}</span>
                </div>
                {qrisStatus.paymentTime && (
                  <div className="info-row">
                    <strong>Payment Time:</strong>
                    <span>{new Date(qrisStatus.paymentTime).toLocaleString("id-ID")}</span>
                  </div>
                )}
              </div>

              {qrisStatus.isPaid && (
                <button className="btn btn-primary w-100 mt-4" onClick={() => window.location.reload()}>
                  Refresh Page
                </button>
              )}
            </div>
          )}

          <div className="info-box mt-6">
            <h3>
              <Info className="title-icon" size={16} strokeWidth={1.8} aria-hidden="true" /> Info QRIS
            </h3>
            <ul>
              <li>QR Code valid selama 30 menit</li>
              <li>Pelanggan bisa scan dengan e-wallet/bank app</li>
              <li>Status otomatis terupdate setelah pembayaran</li>
              <li>Untuk transaksi gagal, ulangi generate QR</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
