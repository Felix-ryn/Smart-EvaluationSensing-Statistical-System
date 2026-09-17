import { useState, useEffect } from "react";
import { apiClient } from "../../api/client";

export function JukirQris() {
  const [loading, setLoading] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState<string>("");
  const [qrData, setQrData] = useState<any>(null);
  const [checkStatusTxId, setCheckStatusTxId] = useState<string>("");
  const [qrisStatus, setQrisStatus] = useState<any>(null);

  const sampleTransactions = [
    { id: "tx1", code: "PARK-00001", amount: 5000 },
    { id: "tx2", code: "PARK-00002", amount: 8000 },
    { id: "tx3", code: "PARK-00003", amount: 12000 },
  ];

  const generateQRCode = async () => {
    if (!selectedTxId) {
      alert("Silakan pilih transaksi terlebih dahulu");
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post("/jukir/qris/generate", {
        transactionId: selectedTxId,
      });

      if (response.data.success) {
        setQrData(response.data.data);
      } else {
        throw new Error(response.data.message || "Failed to generate QR");
      }
    } catch (error) {
      console.error("QRIS generation error:", error);
      alert("Gagal generate QR Code");
    } finally {
      setLoading(false);
    }
  };

  const checkPaymentStatus = async () => {
    if (!checkStatusTxId) {
      alert("Masukkan ID transaksi");
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.get(`/jukir/qris/status/${checkStatusTxId}`);
      if (response.data.success) {
        setQrisStatus(response.data.data);
      } else {
        throw new Error(response.data.message || "Failed to check status");
      }
    } catch (error) {
      console.error("Status check error:", error);
      alert("Gagal cek status pembayaran");
    } finally {
      setLoading(false);
    }
  };

  const handlePrintQR = () => {
    window.print();
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>📱 Transaksi QRIS</h1>
        <p>Generate & monitor pembayaran via QRIS</p>
      </header>

      <div className="grid grid-2">
        {/* Left Column - Generate QR */}
        <div className="card">
          <h2>🏭 Generate QR Code</h2>
          
          <div className="form-section">
            <label>Pilih Transaksi</label>
            <select 
              className="input"
              value={selectedTxId}
              onChange={(e) => setSelectedTxId(e.target.value)}
            >
              <option value="">-- Pilih Transaksi --</option>
              {sampleTransactions.map((tx) => (
                <option key={tx.id} value={tx.id}>
                  {tx.code} - Rp {tx.amount.toLocaleString("id-ID")}
                </option>
              ))}
            </select>

            <button
              className="btn btn-primary mt-4 w-100"
              onClick={generateQRCode}
              disabled={loading}
            >
              {loading ? "Generating..." : "Generate QR Code"}
            </button>
          </div>

          {qrData && (
            <div className="qr-display mt-6">
              <h3>QR Code untuk Pembayaran</h3>
              
              <div className="qr-container">
                <div className="qr-placeholder">
                  <div className="qr-code-large">
                    {qrData.qrCodeUrl && (
                      <img src={qrData.qrCodeUrl} alt="QR Code" />
                    )}
                  </div>
                  
                  {!qrData.qrCodeUrl && (
                    <div className="qr-mock">
                      <div className="qr-pattern"></div>
                      <span>QR Code Display</span>
                    </div>
                  )}
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
                  🖨️ Print QR Code
                </button>
                <button 
                  className="btn btn-outline w-100 mt-3"
                  onClick={() => setQrData(null)}
                >
                  Generate Baru
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Check Payment Status */}
        <div className="card">
          <h2>✓ Cek Status Pembayaran</h2>
          
          <div className="form-section">
            <label>ID Transaksi</label>
            <input
              type="text"
              className="input"
              placeholder="Masukkan ID transaksi"
              value={checkStatusTxId}
              onChange={(e) => setCheckStatusTxId(e.target.value)}
            />

            <button
              className="btn btn-outline mt-4 w-100"
              onClick={checkPaymentStatus}
              disabled={loading}
            >
              {loading ? "Checking..." : "Check Status"}
            </button>
          </div>

          {qrisStatus && (
            <div className="status-display mt-6">
              <div className={`status-badge ${qrisStatus.isPaid ? "badge-success" : "badge-warning"}`}>
                {qrisStatus.isPaid ? "✓ PAID" : "⏳ Pending"}
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
                <button 
                  className="btn btn-primary w-100 mt-4"
                  onClick={() => window.location.reload()}
                >
                  Refresh Page
                </button>
              )}
            </div>
          )}

          <div className="info-box mt-6">
            <h3>ℹ️ Info QRIS</h3>
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
