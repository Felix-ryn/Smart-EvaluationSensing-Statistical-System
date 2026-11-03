import { useMemo, useState, useEffect } from "react";
import { BarChart3, Banknote, Check, Hourglass, Wallet, X, FileBarChart, QrCode, Receipt, Info } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, apiClient } from "../../api/client";
import { AreaMultiSelect } from "../../components/AreaMultiSelect";

interface Area {
  id: string;
  name: string;
}

interface RevenuePoint {
  month: string;
  cash: number;
  qris: number;
  total: number;
}

interface Summary {
  totalRevenue: number;
  totalTransactions: number;
  activeTransactions: number;
  cashRevenue: number;
  qrisRevenue: number;
}

interface Settlement {
  taxPercent: number;
  totalRevenue: number;
  cash: number;
  qris: number;
  taxAmount: number;
  settlementFromCash: number;
}

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

type TabType = "reports" | "pajak" | "setoran";
type FilterStatus = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

const rupiah = (n: number) => "Rp " + n.toLocaleString("id-ID");

// Dummy data fallback
const DUMMY_REVENUE: RevenuePoint[] = [
  { month: "Sep 2026", cash: 2100000, qris: 1150000, total: 3250000 },
  { month: "Oct 2026", cash: 2350000, qris: 1300000, total: 3650000 },
  { month: "Nov 2026", cash: 1950000, qris: 1100000, total: 3050000 },
];

const DUMMY_SUMMARY: Summary = {
  totalRevenue: 5360000,
  totalTransactions: 742,
  activeTransactions: 38,
  cashRevenue: 3405000,
  qrisRevenue: 1955000,
};

const DUMMY_SETTLEMENT: Settlement = {
  taxPercent: 30,
  totalRevenue: 5360000,
  cash: 3405000,
  qris: 1955000,
  taxAmount: 1608000,
  settlementFromCash: 1797000,
};

export function ReportsPajakSetoran() {
  const [activeTab, setActiveTab] = useState<TabType>("reports");
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  
  // Date range state
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });

  // Reports tab state
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenue, setRevenue] = useState<RevenuePoint[]>([]);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [isDummy, setIsDummy] = useState(false);

  // Pajak & Setoran tab state
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("ALL");
  const [error, setError] = useState("");

  // Fetch areas on mount
  useEffect(() => {
    const fetchAreas = async () => {
      try {
        const response = await api.get("/areas");
        const areasData = (response.data.data ?? []) as Area[];
        setAreas(areasData);
        // Default: all areas selected
        setSelectedAreas(areasData.map((a) => a.id));
      } catch (err) {
        console.error("Error fetching areas:", err);
      }
    };
    fetchAreas();
  }, []);

  // Fetch reports data when tab/filters change
  useEffect(() => {
    if (activeTab === "reports") {
      fetchReportsData();
    }
  }, [fromDate, toDate, selectedAreas, activeTab]);

  // Fetch setoran data when tab/filters change
  useEffect(() => {
    if (activeTab === "pajak" || activeTab === "setoran") {
      fetchSetoranData(filterStatus);
    }
  }, [fromDate, toDate, selectedAreas, filterStatus, activeTab]);

  const fetchReportsData = async () => {
    try {
      // ponytail: aggregate monthly data from API. Current endpoint returns daily.
      // Upgrade: add ?aggregation=monthly to backend endpoint.
      const params: any = {
        fromDate,
        toDate,
      };
      if (selectedAreas.length > 0) {
        params.areaIds = selectedAreas.join(",");
      }

      const [s, r, j] = await Promise.all([
        api.get("/reports/summary", { params }),
        api.get("/reports/revenue", { params }),
        api.get("/reports/jukir-settlement", { params }),
      ]);

      // Simple aggregation: group by month
      const dailyPoints: RevenuePoint[] = (r.data.data ?? []).map((p: any) => ({
        ...p,
        month: new Date(p.date).toLocaleDateString("id-ID", { month: "short", year: "numeric" }),
      }));

      const monthlyData = dailyPoints.reduce((acc, p) => {
        const existing = acc.find((m) => m.month === p.month);
        if (existing) {
          existing.cash += p.cash ?? 0;
          existing.qris += p.qris ?? 0;
          existing.total = existing.cash + existing.qris;
        } else {
          acc.push(p);
        }
        return acc;
      }, [] as RevenuePoint[]);

      setSummary(s.data.data ?? DUMMY_SUMMARY);
      setSettlement(j.data.data ?? DUMMY_SETTLEMENT);
      setRevenue(monthlyData.length ? monthlyData : DUMMY_REVENUE);
      setIsDummy(monthlyData.length === 0);
    } catch (err) {
      console.error("Error fetching reports data:", err);
      setSummary(DUMMY_SUMMARY);
      setSettlement(DUMMY_SETTLEMENT);
      setRevenue(DUMMY_REVENUE);
      setIsDummy(true);
    }
  };

  const fetchSetoranData = async (status: FilterStatus) => {
    try {
      setLoading(true);
      setError("");
      const params: any = {};
      if (status !== "ALL") params.status = status;
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;
      if (selectedAreas.length > 0) {
        params.areaIds = selectedAreas.join(",");
      }

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

  const handleApprove = async (id: string, status: "APPROVED" | "REJECTED") => {
    if (!confirm(`Confirm ${status === "APPROVED" ? "approval" : "rejection"}?`)) return;

    try {
      const response = await apiClient.put(`/jukir/setoran/${id}/approve`, {
        status,
        note: status === "APPROVED" ? "Approved by admin" : "Not approved",
      });

      if (response.data.success) {
        alert(`${status === "APPROVED" ? "Approved" : "Rejected"} successfully!`);
        fetchSetoranData(filterStatus);
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

  const filteredRows = useMemo(() => {
    const rows = report?.rows ?? [];
    if (filterStatus === "ALL") return rows;
    return rows.filter((row) => row.status === filterStatus);
  }, [report, filterStatus]);

  const summaryData = report?.summary;
  const reportsCards = summary && [
    { label: "Total Pendapatan", value: rupiah(summary.totalRevenue), icon: Wallet, tone: "icon-success" },
    { label: "Pendapatan Cash", value: rupiah(summary.cashRevenue), icon: Banknote, tone: "icon-success" },
    { label: "Pendapatan QRIS", value: rupiah(summary.qrisRevenue), icon: QrCode, tone: "icon-info" },
    { label: "Total Transaksi", value: summary.totalTransactions, icon: Receipt, tone: "icon-info" },
    { label: "Transaksi Aktif", value: summary.activeTransactions, icon: Hourglass, tone: "icon-warning" },
  ];

  return (
    <div className="page">
      <header className="page-header">
        <h1><FileBarChart className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" /> Laporan, Pajak &amp; Setoran Jukir</h1>
        <p>Kelola laporan pendapatan, pajak, dan setoran jukir dalam satu halaman</p>
      </header>

      {/* Filters Section */}
      <div className="card">
        <div className="filter-section">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
            {/* Date Range Filters */}
            <div>
              <label className="form-label">Dari Tanggal</label>
              <input
                type="date"
                className="form-input"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label">Sampai Tanggal</label>
              <input
                type="date"
                className="form-input"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>

            {/* Area Multi-Select */}
            <AreaMultiSelect
              areas={areas}
              selectedAreas={selectedAreas}
              onChange={setSelectedAreas}
              label="Area Parkir"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="filter-tabs" style={{ borderBottom: "1px solid #E8F0F2", marginBottom: "1rem" }}>
          <button
            className={activeTab === "reports" ? "active" : ""}
            onClick={() => setActiveTab("reports")}
            style={{ padding: "0.75rem 1.5rem", borderBottom: activeTab === "reports" ? "3px solid #19B79A" : "none" }}
          >
            Laporan
          </button>
          <button
            className={activeTab === "pajak" ? "active" : ""}
            onClick={() => setActiveTab("pajak")}
            style={{ padding: "0.75rem 1.5rem", borderBottom: activeTab === "pajak" ? "3px solid #19B79A" : "none" }}
          >
            Pajak
          </button>
          <button
            className={activeTab === "setoran" ? "active" : ""}
            onClick={() => setActiveTab("setoran")}
            style={{ padding: "0.75rem 1.5rem", borderBottom: activeTab === "setoran" ? "3px solid #19B79A" : "none" }}
          >
            Setoran
          </button>
        </div>
      </div>

      {/* TAB 1: LAPORAN */}
      {activeTab === "reports" && (
        <>
          {isDummy && (
            <div className="alert alert-danger">
              <Info size={16} strokeWidth={2} aria-hidden="true" /> Menampilkan data contoh. Data laporan belum tersedia dari server.
            </div>
          )}

          {!summary || !settlement ? (
            <div className="loading">Memuat data...</div>
          ) : (
            <>
              <div className="grid grid-kpi">
                {(reportsCards || []).map(({ label, value, icon: Icon, tone }) => (
                  <div key={label} className="card card-stat">
                    <div className={`icon-container ${tone}`}><Icon size={20} strokeWidth={1.8} aria-hidden="true" /></div>
                    <div className="stat-content">
                      <span className="stat-label">{label}</span>
                      <span className="stat-value">{value}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="card">
                <h2>Pendapatan per Bulan (Cash vs QRIS)</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={revenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8F0F2" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : `${v}`)} />
                    <Tooltip formatter={(v) => rupiah(Number(v))} />
                    <Legend />
                    <Bar dataKey="cash" fill="#19B79A" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="qris" fill="#3187C7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card">
                <h2>Setoran Jukir (MOU: {settlement.taxPercent}% pajak)</h2>
                <div className="table-wrap">
                  <table className="table">
                    <tbody>
                      <tr><td>Total Revenue</td><td><strong>{rupiah(settlement.totalRevenue)}</strong></td></tr>
                      <tr><td>Cash</td><td>{rupiah(settlement.cash)}</td></tr>
                      <tr><td>QRIS</td><td>{rupiah(settlement.qris)}</td></tr>
                      <tr><td>Kewajiban Pajak ({settlement.taxPercent}%)</td><td>{rupiah(settlement.taxAmount)}</td></tr>
                      <tr>
                        <td>Sisa Disetor dari Cash</td>
                        <td><strong>{rupiah(settlement.settlementFromCash)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* TAB 2: PAJAK */}
      {activeTab === "pajak" && (
        <>
          {error && <div className="alert alert-danger">{error}</div>}

          <div className="grid grid-kpi">
            <div className="card card-stat">
              <div className="icon-container icon-info"><BarChart3 size={20} strokeWidth={1.8} aria-hidden="true" /></div>
              <div className="stat-content">
                <span className="stat-label">Total Transaksi</span>
                <span className="stat-value">{summaryData?.totalTransactions ?? 0}</span>
              </div>
            </div>

            <div className="card card-stat">
              <div className="icon-container icon-success"><Banknote size={20} strokeWidth={1.8} aria-hidden="true" /></div>
              <div className="stat-content">
                <span className="stat-label">Total Gross</span>
                <span className="stat-value">{formatCurrency(summaryData?.totalGross)}</span>
              </div>
            </div>

            <div className="card card-stat">
              <div className="icon-container icon-warning"><Wallet size={20} strokeWidth={1.8} aria-hidden="true" /></div>
              <div className="stat-content">
                <span className="stat-label">Total Pajak</span>
                <span className="stat-value">{formatCurrency(summaryData?.totalTax)}</span>
              </div>
            </div>

            <div className="card card-stat">
              <div className="icon-container icon-info"><Check size={20} strokeWidth={1.8} aria-hidden="true" /></div>
              <div className="stat-content">
                <span className="stat-label">Total Net Setoran</span>
                <span className="stat-value">{formatCurrency(summaryData?.totalNetSetoran)}</span>
              </div>
            </div>
          </div>

          <div className="card mt-4">
            <div className="filter-section">
              <div className="filter-tabs">
                <button className={filterStatus === "ALL" ? "active" : ""} onClick={() => setFilterStatus("ALL")}>
                  All ({summaryData?.totalEntries ?? 0})
                </button>
                <button className={filterStatus === "PENDING" ? "active" : ""} onClick={() => setFilterStatus("PENDING")}>
                  Pending ({summaryData?.statusCounts.PENDING ?? 0})
                </button>
                <button className={filterStatus === "APPROVED" ? "active" : ""} onClick={() => setFilterStatus("APPROVED")}>
                  Approved ({summaryData?.statusCounts.APPROVED ?? 0})
                </button>
                <button className={filterStatus === "REJECTED" ? "active" : ""} onClick={() => setFilterStatus("REJECTED")}>
                  Rejected ({summaryData?.statusCounts.REJECTED ?? 0})
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
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center">Loading...</td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-muted">
                      {report ? "Belum ada data pajak pada filter/periode ini." : "Data tidak tersedia."}
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
                      <td>{getStatusBadge(entry.status)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* TAB 3: SETORAN */}
      {activeTab === "setoran" && (
        <>
          {error && <div className="alert alert-danger">{error}</div>}

          <div className="grid grid-kpi">
            <div className="card card-stat">
              <div className="icon-container icon-info"><BarChart3 size={20} strokeWidth={1.8} aria-hidden="true" /></div>
              <div className="stat-content">
                <span className="stat-label">Total Transaksi</span>
                <span className="stat-value">{summaryData?.totalTransactions ?? 0}</span>
              </div>
            </div>

            <div className="card card-stat">
              <div className="icon-container icon-success"><Banknote size={20} strokeWidth={1.8} aria-hidden="true" /></div>
              <div className="stat-content">
                <span className="stat-label">Total Gross</span>
                <span className="stat-value">{formatCurrency(summaryData?.totalGross)}</span>
              </div>
            </div>

            <div className="card card-stat">
              <div className="icon-container icon-warning"><Wallet size={20} strokeWidth={1.8} aria-hidden="true" /></div>
              <div className="stat-content">
                <span className="stat-label">Total Pajak</span>
                <span className="stat-value">{formatCurrency(summaryData?.totalTax)}</span>
              </div>
            </div>

            <div className="card card-stat">
              <div className="icon-container icon-info"><Check size={20} strokeWidth={1.8} aria-hidden="true" /></div>
              <div className="stat-content">
                <span className="stat-label">Total Net Setoran</span>
                <span className="stat-value">{formatCurrency(summaryData?.totalNetSetoran)}</span>
              </div>
            </div>
          </div>

          <div className="card mt-4">
            <div className="filter-section">
              <div className="filter-tabs">
                <button className={filterStatus === "ALL" ? "active" : ""} onClick={() => { setFilterStatus("ALL"); }}>
                  All ({summaryData?.totalEntries ?? 0})
                </button>
                <button className={filterStatus === "PENDING" ? "active" : ""} onClick={() => { setFilterStatus("PENDING"); }}>
                  Pending ({summaryData?.statusCounts.PENDING ?? 0})
                </button>
                <button className={filterStatus === "APPROVED" ? "active" : ""} onClick={() => { setFilterStatus("APPROVED"); }}>
                  Approved ({summaryData?.statusCounts.APPROVED ?? 0})
                </button>
                <button className={filterStatus === "REJECTED" ? "active" : ""} onClick={() => { setFilterStatus("REJECTED"); }}>
                  Rejected ({summaryData?.statusCounts.REJECTED ?? 0})
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
                      {report ? "Belum ada data setoran pada filter/periode ini." : "Data tidak tersedia."}
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
        </>
      )}
    </div>
  );
}
