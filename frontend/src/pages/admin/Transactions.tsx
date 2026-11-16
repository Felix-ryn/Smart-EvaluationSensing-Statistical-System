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
  plateNumber: string | null;
  area?: { name: string };
  jukir?: { name: string } | null;
}

const rupiah = (n: number) => "Rp " + n.toLocaleString("id-ID");

export function Transactions() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filterAreaId, setFilterAreaId] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const load = () =>
    api
      .get("/transactions", { params: { page, limit: 50, areaId: filterAreaId || undefined } })
      .then(({ data }) => {
        setTxs(data.data);
        setTotalPages(data.totalPages || 1);
      })
      .catch((err) => setError(err.response?.data?.message ?? "Gagal memuat"))
      .finally(() => setLoading(false));

  useEffect(() => {
    api.get("/areas").then(({ data }) => setAreas(data.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterAreaId]);

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

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <label style={{ fontSize: 13, color: "#6b7280" }}>Filter Area</label>
          <select
            value={filterAreaId}
            onChange={(e) => {
              setFilterAreaId(e.target.value);
              setPage(1);
            }}
            style={{ maxWidth: 240 }}
          >
            <option value="">Semua Area</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Kode</th>
              <th style={th}>Plat</th>
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
                <td style={td}>{t.plateNumber ?? "—"}</td>
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

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
        <span>Halaman {page} dari {totalPages}</span>
        <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #e5e7eb", fontSize: 13, color: "#6b7280" };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #f0f0f0", verticalAlign: "top" };
