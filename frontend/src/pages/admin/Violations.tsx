import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { ViolationForm } from "../ViolationForm";

interface Violation {
  id: string;
  photoPath: string;
  slotCode: string | null;
  violationType: string;
  confidence: number | null;
  status: "PENDING" | "REVIEWED" | "DISMISSED";
  reporterRole: string;
  createdAt: string;
  location?: { name: string } | null;
  reportedBy?: { name: string; email: string } | null;
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #e5e7eb", fontSize: 13, color: "#6b7280" };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #f0f0f0", verticalAlign: "top" };

const badge = (s: Violation["status"]) =>
  s === "PENDING" ? "badge-warning" : s === "REVIEWED" ? "badge-success" : "badge-danger";

export function Violations() {
  const [items, setItems] = useState<Violation[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () =>
    api
      .get("/violations")
      .then(({ data }) => setItems(data.data))
      .catch((err) => setError(err.response?.data?.message ?? "Gagal memuat"))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  async function setStatus(id: string, status: Violation["status"]) {
    await api.patch(`/violations/${id}/status`, { status });
    setItems((list) => list.map((v) => (v.id === id ? { ...v, status } : v)));
  }

  return (
    <div>
      <div className="page-header">Pelanggaran Parkir</div>

      <div className="card" style={{ marginBottom: 16, maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>Lapor sebagai Admin</h3>
        <ViolationForm onDone={load} />
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : error ? (
        <p style={{ color: "crimson" }}>{error}</p>
      ) : (
        <div className="card">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Foto</th>
                <th style={th}>Jenis</th>
                <th style={th}>Slot</th>
                <th style={th}>Pelapor</th>
                <th style={th}>Status</th>
                <th style={th}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td style={td} colSpan={6}>Belum ada laporan.</td>
                </tr>
              )}
              {items.map((v) => (
                <tr key={v.id}>
                  <td style={td}>
                    <a href={v.photoPath} target="_blank" rel="noreferrer">
                      <img src={v.photoPath} alt="" style={{ width: 80, borderRadius: 6 }} />
                    </a>
                  </td>
                  <td style={td}>
                    {v.violationType === "illegal-parking" ? (
                      <span className="badge badge-danger">illegal</span>
                    ) : (
                      <span className="badge badge-info">clear</span>
                    )}
                    {v.confidence != null && (
                      <div style={{ color: "#9ca3af", fontSize: 12 }}>{(v.confidence * 100).toFixed(0)}%</div>
                    )}
                  </td>
                  <td style={td}>{v.slotCode ?? "—"}</td>
                  <td style={td}>
                    {v.reportedBy?.name ?? "—"}
                    <div style={{ color: "#9ca3af", fontSize: 12 }}>{v.reporterRole}</div>
                  </td>
                  <td style={td}>
                    <span className={`badge ${badge(v.status)}`}>{v.status}</span>
                  </td>
                  <td style={td}>
                    {v.status === "PENDING" && (
                      <div style={{ display: "grid", gap: 4 }}>
                        <button className="btn" onClick={() => setStatus(v.id, "REVIEWED")}>Review</button>
                        <button className="btn" onClick={() => setStatus(v.id, "DISMISSED")}>Dismiss</button>
                      </div>
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
