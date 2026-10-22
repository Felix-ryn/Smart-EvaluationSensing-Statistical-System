import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Filter, Search, ShieldX } from "lucide-react";
import { api } from "../../api/client";

interface Violation {
  id: string;
  photoPath: string;
  violationType: string;
  confidence: number | null;
  source: "USER" | "JUKIR" | "CCTV" | string;
  status: "PENDING" | "VALID" | "REJECTED";
  reporterRole: string;
  createdAt: string;
  area?: { name: string } | null;
  reportedBy?: { name: string; email: string } | null;
}

type StatusFilter = "ALL" | Violation["status"];
type SourceFilter = "ALL" | "USER" | "JUKIR" | "CCTV";

const badgeByStatus: Record<Violation["status"], string> = {
  PENDING: "badge-warning",
  VALID: "badge-danger",
  REJECTED: "badge-success",
};

const confidenceLabel = (value: number | null) => {
  if (value == null) return "-";
  const pct = Math.round(value * 100);
  if (pct >= 80) return `Tinggi (${pct}%)`;
  if (pct >= 60) return `Sedang (${pct}%)`;
  return `Rendah (${pct}%)`;
};

export function Violations() {
  const [items, setItems] = useState<Violation[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
  const [search, setSearch] = useState("");

  const load = () =>
    api
      .get("/violations")
      .then(({ data }) => {
        setItems(data.data ?? []);
        setError("");
      })
      .catch((err) => setError(err.response?.data?.message ?? "Gagal memuat"))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: string, status: Violation["status"]) {
    await api.patch(`/violations/${id}/status`, { status });
    setItems((list) => list.map((v) => (v.id === id ? { ...v, status } : v)));
  }

  const stats = useMemo(() => {
    const pending = items.filter((v) => v.status === "PENDING").length;
    const valid = items.filter((v) => v.status === "VALID").length;
    const rejected = items.filter((v) => v.status === "REJECTED").length;
    return { total: items.length, pending, valid, rejected };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((v) => {
        // Only ILLEGAL violations
        const byType = v.violationType === "parking_violation";
        const byStatus = statusFilter === "ALL" || v.status === statusFilter;
        const bySource = sourceFilter === "ALL" || v.source === sourceFilter;
        const blob = `${v.area?.name ?? ""} ${v.reportedBy?.name ?? ""} ${v.reporterRole}`.toLowerCase();
        const bySearch = q.length === 0 || blob.includes(q);
        return byType && byStatus && bySource && bySearch;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [items, search, sourceFilter, statusFilter]);

  return (
    <div className="page">
      <header className="page-header">
        <h1><AlertTriangle className="title-icon" size={22} strokeWidth={1.8} /> Pelanggaran Parkir</h1>
        <p>Pantau laporan pelanggaran, confidence AI, dan proses validasi admin.</p>
      </header>

      <div className="grid grid-kpi">
        <div className="card card-stat">
          <div className="icon-container icon-info"><Filter size={20} strokeWidth={1.8} /></div>
          <div className="stat-content"><span className="stat-label">Total Laporan</span><span className="stat-value">{stats.total}</span></div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-warning"><Clock3 size={20} strokeWidth={1.8} /></div>
          <div className="stat-content"><span className="stat-label">Pending</span><span className="stat-value">{stats.pending}</span></div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-danger"><ShieldX size={20} strokeWidth={1.8} /></div>
          <div className="stat-content"><span className="stat-label">Valid</span><span className="stat-value">{stats.valid}</span></div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-success"><CheckCircle2 size={20} strokeWidth={1.8} /></div>
          <div className="stat-content"><span className="stat-label">Rejected</span><span className="stat-value">{stats.rejected}</span></div>
        </div>
      </div>



      <div className="card" style={{ marginBottom: 16 }}>
        <div className="violations-filter-grid">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
              <option value="ALL">Semua</option>
              <option value="PENDING">Pending</option>
              <option value="VALID">Valid</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Sumber</label>
            <select className="input" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}>
              <option value="ALL">Semua</option>
              <option value="USER">USER</option>
              <option value="JUKIR">JUKIR</option>
              <option value="CCTV">CCTV</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Pencarian</label>
            <div style={{ position: "relative" }}>
              <Search size={15} style={{ position: "absolute", left: 10, top: 10, color: "#718994" }} />
              <input
                className="input"
                style={{ paddingLeft: 32 }}
                placeholder="Cari area / pelapor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card"><div className="loading">Loading...</div></div>
      ) : error ? (
        <div className="alert alert-danger">{error}</div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Foto</th>
                <th>Jenis & Confidence</th>
                <th>Area</th>
                <th>Sumber</th>
                <th>Pelapor</th>
                <th>Waktu</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-muted">Belum ada laporan sesuai filter.</td>
                </tr>
              )}
              {filteredItems.map((v) => (
                <tr key={v.id}>
                  <td>
                    <a href={v.photoPath} target="_blank" rel="noreferrer">
                      <img src={v.photoPath} alt="violation" style={{ width: 90, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                    </a>
                  </td>
                  <td>
                    <div>
                      {v.violationType === "parking_violation" ? (
                        <span className="badge badge-danger">illegal</span>
                      ) : v.violationType === "review" ? (
                        <span className="badge badge-warning">review</span>
                      ) : (
                        <span className="badge badge-info">clear</span>
                      )}
                    </div>
                    <div className="small text-muted mt-3">{confidenceLabel(v.confidence)}</div>
                  </td>
                  <td>{v.area?.name ?? "—"}</td>
                  <td><span className="badge badge-secondary">{v.source}</span></td>
                  <td>
                    {v.reportedBy?.name ?? "—"}
                    <div className="small text-muted">{v.reporterRole}</div>
                  </td>
                  <td>{new Date(v.createdAt).toLocaleString("id-ID")}</td>
                  <td>
                    <span className={`badge ${badgeByStatus[v.status]}`}>{v.status}</span>
                  </td>
                  <td>
                    {v.status === "PENDING" ? (
                      <div style={{ display: "grid", gap: 6 }}>
                        <button className="btn btn-sm btn-success" onClick={() => setStatus(v.id, "VALID")}>Valid</button>
                        <button className="btn btn-sm btn-outline" onClick={() => setStatus(v.id, "REJECTED")}>Tolak</button>
                      </div>
                    ) : (
                      <span className="small text-muted">Selesai direview</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
