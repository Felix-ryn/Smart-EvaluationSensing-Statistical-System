import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface Area {
  id: string;
  name: string;
}
interface Jukir {
  id: string;
  name: string;
  areaId: string;
  status: string;
  area?: { name: string };
}

export function Jukir() {
  const [jukirs, setJukirs] = useState<Jukir[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [areaId, setAreaId] = useState("");

  const load = () =>
    api
      .get("/jukir")
      .then(({ data }) => setJukirs(data.data))
      .catch((err) => setError(err.response?.data?.message ?? "Gagal memuat"))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    api.get("/areas").then(({ data }) => {
      setAreas(data.data);
      if (data.data[0]) setAreaId(data.data[0].id);
    });
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await api.post("/jukir", { name, areaId });
    setName("");
    load();
  }

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "crimson" }}>{error}</p>;

  return (
    <div>
      <div className="page-header">Jukir (Petugas Parkir)</div>

      <div className="card" style={{ marginBottom: 16, maxWidth: 480 }}>
        <form onSubmit={add} style={{ display: "grid", gap: 10 }}>
          <input placeholder="Nama jukir" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button className="btn" disabled={!name}>Tambah Jukir</button>
        </form>
      </div>

      <div className="card">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Nama</th>
              <th style={th}>Area Kerja</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {jukirs.map((j) => (
              <tr key={j.id}>
                <td style={td}>{j.name}</td>
                <td style={td}>{j.area?.name}</td>
                <td style={td}>
                  <span className={`badge ${j.status === "ACTIVE" ? "badge-success" : "badge-danger"}`}>
                    {j.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #e5e7eb", fontSize: 13, color: "#6b7280" };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #f0f0f0" };
