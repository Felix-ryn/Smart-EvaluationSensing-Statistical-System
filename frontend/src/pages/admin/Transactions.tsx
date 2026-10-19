import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface Area {
  id: string;
  name: string;
}
interface Tx {
  id: string;
  transactionCode: string;
  areaId: string;
  checkIn: string;
  checkOut: string | null;
  amount: number | null;
  paymentMethod: "CASH" | "QRIS" | null;
  status: string;
  area?: { name: string };
  jukir?: { name: string } | null;
}

const rupiah = (n: number) => "Rp " + n.toLocaleString("id-ID");

export function Transactions() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [newAreaId, setNewAreaId] = useState("");

  const load = () =>
    api
      .get("/transactions")
      .then(({ data }) => setTxs(data.data))
      .catch((err) => setError(err.response?.data?.message ?? "Gagal memuat"))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    api.get("/areas").then(({ data }) => {
      setAreas(data.data);
      if (data.data[0]) setNewAreaId(data.data[0].id);
    });
  }, []);

  async function checkIn() {
    if (!newAreaId) return;
    await api.post("/transactions", { areaId: newAreaId });
    load();
  }

  async function checkout(id: string) {
    await api.post(`/transactions/${id}/checkout`);
    load();
  }

  async function pay(id: string, method: "CASH" | "QRIS") {
    await api.post(`/transactions/${id}/pay`, { paymentMethod: method });
    load();
  }

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "crimson" }}>{error}</p>;

  return (
    <div>
      <div className="page-header">Transaksi Parkir</div>

      <div className="card" style={{ marginBottom: 16, maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>Kendaraan Masuk</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={newAreaId} onChange={(e) => setNewAreaId(e.target.value)} style={{ flex: 1 }}>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button className="btn" onClick={checkIn}>Masuk</button>
        </div>
      </div>

      <div className="card">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Kode</th>
              <th style={th}>Area</th>
              <th style={th}>Masuk</th>
              <th style={th}>Keluar</th>
              <th style={th}>Tarif</th>
              <th style={th}>Bayar</th>
              <th style={th}>Status</th>
              <th style={th}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id}>
                <td style={td}><strong>{t.transactionCode}</strong></td>
                <td style={td}>{t.area?.name}</td>
                <td style={td}>{new Date(t.checkIn).toLocaleString("id-ID")}</td>
                <td style={td}>{t.checkOut ? new Date(t.checkOut).toLocaleString("id-ID") : "—"}</td>
                <td style={td}>{t.amount != null ? rupiah(t.amount) : "—"}</td>
                <td style={td}>
                  {t.paymentMethod ? (
                    <span className={`badge ${t.paymentMethod === "QRIS" ? "badge-info" : "badge-success"}`}>
                      {t.paymentMethod}
                    </span>
                  ) : "—"}
                </td>
                <td style={td}>
                  <span className={`badge ${t.status === "ACTIVE" ? "badge-warning" : "badge-success"}`}>
                    {t.status}
                  </span>
                </td>
                <td style={td}>
                  {t.status === "ACTIVE" && (
                    <button className="btn" onClick={() => checkout(t.id)}>Checkout</button>
                  )}
                  {t.status === "ACTIVE" && t.amount != null && (
                    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                      <button className="btn" onClick={() => pay(t.id, "CASH")}>Cash</button>
                      <button className="btn" onClick={() => pay(t.id, "QRIS")}>QRIS</button>
                    </div>
                  )}
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
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #f0f0f0", verticalAlign: "top" };
