import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface Mou {
  id: string;
  name: string;
  taxPercent: number;
  operatorPercent: number;
  validFrom: string;
  validTo: string | null;
}

export function Mou() {
  const [rules, setRules] = useState<Mou[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [taxPercent, setTaxPercent] = useState(10);

  const load = () =>
    api
      .get("/mou")
      .then(({ data }) => setRules(data.data))
      .catch((err) => setError(err.response?.data?.message ?? "Gagal memuat"))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await api.post("/mou", { name, taxPercent: Number(taxPercent), operatorPercent: 0, validFrom: new Date().toISOString() });
    setName("");
    load();
  }

  async function updateTax(id: string, taxPercent: number) {
    await api.patch(`/mou/${id}`, { taxPercent });
    load();
  }

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "crimson" }}>{error}</p>;

  return (
    <div>
      <div className="page-header">MOU / Aturan Pajak</div>

      <div className="card" style={{ marginBottom: 16, maxWidth: 480 }}>
        <form onSubmit={add} style={{ display: "grid", gap: 10 }}>
          <input placeholder="Nama aturan (mis. MOU 2026)" value={name} onChange={(e) => setName(e.target.value)} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>Pajak/pengelola:</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={taxPercent}
              onChange={(e) => setTaxPercent(Number(e.target.value))}
              style={{ width: 80 }}
            />
            <span>%</span>
          </div>
          <button className="btn" disabled={!name}>Tambah Aturan</button>
        </form>
      </div>

      <div className="card">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Nama</th>
              <th style={th}>Pajak (%)</th>
              <th style={th}>Berlaku Sejak</th>
              <th style={th}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <td style={td}>{r.name}</td>
                <td style={td}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    defaultValue={r.taxPercent}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== r.taxPercent) updateTax(r.id, v);
                    }}
                    style={{ width: 80 }}
                  />
                </td>
                <td style={td}>{new Date(r.validFrom).toLocaleDateString("id-ID")}</td>
                <td style={td}>
                  <span className="badge badge-info">aktif</span>
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
