import { useEffect, useState } from "react";
import { AlertCircle, Info, MapPin, CheckCircle2, Car, AlertTriangle } from "lucide-react";
import { api } from "../../api/client";

interface AreaRecon {
  areaId: string;
  name: string;
  capacity: number;
  activeTransactions: number;
  cvDetected: number;
  cvViolation: number;
  difference: number;
  needsReview: boolean;
  lastDetectedAt: string | null;
}

interface SummaryData {
  totalAreas: number;
  areasWithCvScan: number;
  areasWithoutScan: number;
  totalActiveTransactions: number;
  transactionsWithoutPlate: number;
  areasCvStatus: Array<{
    areaId: string;
    areaName: string;
    lastScanAt: string | null;
    hasBeenScanned: boolean;
  }>;
}

interface Transaction {
  id: string;
  transactionCode: string;
  areaId: string;
  areaName: string;
  jukirName: string;
  vehicleType: string;
  plateNumber: string | null;
  checkInTime: string;
  createdAt: string;
  hasPlateData: boolean;
}

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const timeFormat = (date: string) =>
  new Date(date).toLocaleString("id-ID", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

type Tab = "summary" | "detail" | "status";

export function Reconciliation() {
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [reconData, setReconData] = useState<AreaRecon[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.allSettled([
      api.get("/reports/reconciliation"),
      api.get("/reports/reconciliation/summary"),
      api.get("/reports/reconciliation/active-transactions"),
    ])
      .then(([reconRes, summaryRes, txRes]) => {
        if (reconRes.status === "fulfilled") {
          setReconData(reconRes.value.data.data ?? []);
          if (!selectedArea && reconRes.value.data.data?.[0]) {
            setSelectedArea(reconRes.value.data.data[0].areaId);
          }
        } else {
          setError("Gagal memuat data rekonsiliasi.");
        }

        if (summaryRes.status === "fulfilled") {
          setSummaryData(summaryRes.value.data.data ?? null);
        }

        if (txRes.status === "fulfilled") {
          setTransactions(txRes.value.data.data ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleAreaFilter = (areaId: string) => {
    setSelectedArea(areaId);
    setLoading(true);
    api
      .get("/reports/reconciliation/active-transactions", { params: { areaId } })
      .then(({ data }) => setTransactions(data.data ?? []))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  };

  const handleVerifyClick = (areaId: string) => {
    setActiveTab("detail");
    handleAreaFilter(areaId);
    // Smooth scroll ke detail section
    setTimeout(() => {
      document.querySelector('[data-tab="detail"]')?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  if (error) return <div className="alert alert-danger">{error}</div>;

  // === KPI Cards ===
  const kpiCards =
    summaryData && reconData.length > 0
      ? [
          {
            label: "Total Area",
            value: summaryData.totalAreas,
            icon: MapPin,
            tone: "info",
            color: "#0ea5e9",
            bgColor: "#f0f9ff",
          },
          {
            label: "Area Terscanning",
            value: summaryData.areasWithCvScan,
            subtext: `dari ${summaryData.totalAreas}`,
            icon: CheckCircle2,
            tone: "success",
            color: "#10b981",
            bgColor: "#f0fdf4",
          },
          {
            label: "Transaksi Aktif",
            value: summaryData.totalActiveTransactions,
            icon: Car,
            tone: "info",
            color: "#8b5cf6",
            bgColor: "#faf5ff",
          },
          {
            label: "Tanpa Data Plat",
            value: summaryData.transactionsWithoutPlate,
            subtext: `dari ${summaryData.totalActiveTransactions}`,
            icon: AlertTriangle,
            tone: "warning",
            color: "#f59e0b",
            bgColor: "#fffbeb",
          },
        ]
      : null;

  return (
    <div>
      <header className="page-header">
        <h1>Rekonsiliasi Transaksi & CV Monitoring</h1>
        <p>Bandingkan transaksi aktif dengan hasil deteksi computer vision per area</p>
      </header>

      {/* KPI Cards */}
      {kpiCards && (
        <div className="grid grid-kpi" style={{ marginBottom: "24px", gap: "16px" }}>
          {kpiCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="card"
                style={{
                  background: card.bgColor,
                  border: `2px solid ${card.color}`,
                  padding: "20px",
                  borderRadius: "8px",
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = `0 8px 16px ${card.color}33`;
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      background: card.color,
                      color: "white",
                      width: "48px",
                      height: "48px",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={24} strokeWidth={2} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: card.color,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        marginBottom: "4px",
                      }}
                    >
                      {card.label}
                    </div>
                    <div
                      style={{
                        fontSize: "28px",
                        fontWeight: 700,
                        color: card.color,
                        lineHeight: "1",
                        marginBottom: "2px",
                      }}
                    >
                      {card.value}
                    </div>
                    {card.subtext && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: card.color,
                          opacity: 0.7,
                        }}
                      >
                        {card.subtext}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="card" style={{ marginBottom: "0", borderRadius: "8px 8px 0 0" }} data-tab={activeTab}>
        <div style={{ display: "flex", gap: "0", borderBottom: "1px solid #e5e7eb" }}>
          {(["summary", "detail", "status"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: "12px 16px",
                background: activeTab === tab ? "#f8f9fa" : "transparent",
                border: "none",
                borderBottom:
                  activeTab === tab ? "3px solid var(--brand-500)" : "none",
                cursor: "pointer",
                fontWeight: activeTab === tab ? 600 : 500,
                fontSize: "14px",
                color: activeTab === tab ? "var(--text)" : "var(--muted)",
                transition: "all 0.2s",
              }}
            >
              {tab === "summary" && "Ringkasan Area"}
              {tab === "detail" && "Monitoring Transaksi"}
              {tab === "status" && "Status Data"}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: Ringkasan Area */}
      {activeTab === "summary" && (
        <div className="card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "16px",
              padding: "12px",
              background: "#f0f9ff",
              borderRadius: "4px",
              borderLeft: "4px solid #0ea5e9",
            }}
          >
            <Info size={18} style={{ color: "#0ea5e9" }} />
            <span style={{ fontSize: "13px", color: "#0369a1" }}>
              Membandingkan jumlah transaksi aktif dengan jumlah kendaraan normal
              yang terdeteksi CV per area. Selisih dapat terjadi karena lag update
              atau kesalahan deteksi. Gunakan untuk monitoring, bukan identifikasi
              kecurangan.
            </span>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "32px" }}>
              Memuat data...
            </div>
          ) : reconData.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "32px",
                color: "var(--muted)",
              }}
            >
              Belum ada data rekonsiliasi.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Area</th>
                  <th style={th} align="right">
                    Kapasitas
                  </th>
                  <th style={th} align="right">
                    Transaksi Aktif
                  </th>
                  <th style={th} align="right">
                    CV Normal
                  </th>
                  <th style={th} align="right">
                    CV Violation
                  </th>
                  <th style={th} align="right">
                    Selisih
                  </th>
                  <th style={th}>Status</th>
                  <th style={th}>Scan Terakhir</th>
                </tr>
              </thead>
              <tbody>
                {reconData.map((r) => (
                  <tr key={r.areaId}>
                    <td style={td}>
                      <strong>{r.name}</strong>
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>{r.capacity}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {r.activeTransactions}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>{r.cvDetected}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {r.cvViolation}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <span
                        style={{
                          fontWeight: 600,
                          color: r.difference > 2 ? "#dc2626" : r.difference < -2 ? "#0369a1" : "#059669",
                        }}
                      >
                        {r.difference > 0 ? "+" : ""}
                        {r.difference}
                      </span>
                    </td>
                    <td style={{ ...td, display: "flex", alignItems: "center", gap: "8px" }}>
                      {r.needsReview ? (
                        <>
                          <span className="badge badge-warning">⚠ Verifikasi</span>
                          <button
                            onClick={() => handleVerifyClick(r.areaId)}
                            style={{
                              padding: "4px 10px",
                              fontSize: "12px",
                              fontWeight: 600,
                              border: "1px solid #f59e0b",
                              background: "#fffbeb",
                              color: "#f59e0b",
                              borderRadius: "4px",
                              cursor: "pointer",
                              transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#f59e0b";
                              e.currentTarget.style.color = "white";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "#fffbeb";
                              e.currentTarget.style.color = "#f59e0b";
                            }}
                          >
                            Lihat Detail →
                          </button>
                        </>
                      ) : (
                        <span className="badge badge-success">✓ Sesuai</span>
                      )}
                    </td>
                    <td style={{ ...td, fontSize: "12px", color: "var(--muted)" }}>
                      {r.lastDetectedAt ? timeFormat(r.lastDetectedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB 2: Monitoring Transaksi Aktif */}
      {activeTab === "detail" && (
        <div className="card">
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: 600 }}>
              Filter Area
            </label>
            <select
              value={selectedArea}
              onChange={(e) => handleAreaFilter(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "4px",
                border: "1px solid #d1d5db",
                fontSize: "14px",
              }}
            >
              <option value="">Semua Area</option>
              {reconData.map((a) => (
                <option key={a.areaId} value={a.areaId}>
                  {a.name} ({a.activeTransactions} aktif)
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", padding: "32px" }}>
              Memuat data...
            </div>
          ) : transactions.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "32px",
                color: "var(--muted)",
              }}
            >
              Tidak ada transaksi aktif
              {selectedArea && ` di area ini`}.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Kode Transaksi</th>
                    <th style={th}>Area</th>
                    <th style={th}>Jukir</th>
                    <th style={th}>Tipe</th>
                    <th style={th}>Plat Nomor</th>
                    <th style={th}>Check-in</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td style={td}>
                        <strong>{tx.transactionCode}</strong>
                      </td>
                      <td style={td}>{tx.areaName}</td>
                      <td style={td}>{tx.jukirName}</td>
                      <td style={td}>{tx.vehicleType}</td>
                      <td style={td}>
                        {tx.plateNumber ? (
                          <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
                            {tx.plateNumber}
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>—</span>
                        )}
                      </td>
                      <td style={{ ...td, fontSize: "12px", color: "var(--muted)" }}>
                        {timeFormat(tx.checkInTime)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Status Data & Anomali */}
      {activeTab === "status" && (
        <div className="card">
          <div style={{ marginBottom: "20px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "12px" }}>
              📊 Status Ketersediaan Data
            </h3>

            {summaryData && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div
                  style={{
                    padding: "12px",
                    background: "#f3f4f6",
                    borderRadius: "4px",
                    borderLeft: "4px solid #10b981",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                    Area dengan CV Scan
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: 600 }}>
                    {summaryData.areasWithCvScan} / {summaryData.totalAreas}
                  </div>
                </div>
                <div
                  style={{
                    padding: "12px",
                    background: "#fef3c7",
                    borderRadius: "4px",
                    borderLeft: "4px solid #f59e0b",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                    Transaksi tanpa Data Plat
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: 600 }}>
                    {summaryData.transactionsWithoutPlate} / {summaryData.totalActiveTransactions}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: "20px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "12px" }}>
              🔍 Status CV Scan per Area
            </h3>

            {summaryData && summaryData.areasCvStatus.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Area</th>
                      <th style={th}>Status Scan</th>
                      <th style={th}>Scan Terakhir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryData.areasCvStatus.map((a) => (
                      <tr key={a.areaId}>
                        <td style={td}>
                          <strong>{a.areaName}</strong>
                        </td>
                        <td style={td}>
                          {a.hasBeenScanned ? (
                            <span className="badge badge-success">✓ Terscan</span>
                          ) : (
                            <span className="badge badge-secondary">✗ Belum</span>
                          )}
                        </td>
                        <td style={{ ...td, fontSize: "12px", color: "var(--muted)" }}>
                          {a.lastScanAt ? timeFormat(a.lastScanAt) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ color: "var(--muted)" }}>
                Belum ada data scan area.
              </div>
            )}
          </div>

          <div
            style={{
              padding: "12px",
              background: "#f0f9ff",
              borderRadius: "4px",
              borderLeft: "4px solid #0ea5e9",
              display: "flex",
              gap: "12px",
            }}
          >
            <AlertCircle size={18} style={{ color: "#0369a1", flexShrink: 0, marginTop: "2px" }} />
            <div style={{ fontSize: "13px", color: "#0369a1" }}>
              <strong>Catatan Fase 1:</strong> Sistem saat ini membandingkan jumlah
              transaksi aktif dengan deteksi kendaraan normal dari CV, bukan
              pencocokan plat nomor individual. Pengembangan OCR untuk deteksi plat
              dan pencocokan automatis akan ditambahkan di fase berikutnya.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "2px solid #e5e7eb",
  fontSize: "12px",
  fontWeight: 600,
  color: "#6b7280",
  backgroundColor: "#f9fafb",
};

const td: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f0f0f0",
  fontSize: "14px",
};
