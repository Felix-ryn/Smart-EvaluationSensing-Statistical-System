import { useEffect, useMemo, useState } from "react";
import { Banknote, Calendar, QrCode, TrendingUp, Users2, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiClient } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

interface AreaItem {
  id: string;
  name: string;
}

interface JukirItem {
  id: string;
  name: string;
  areaId?: string | null;
}

interface CashQrisData {
  date: string;
  cash: number;
  qris: number;
  total: number;
  transactions: number;
}

const rupiah = (n: number) => "Rp " + (n ?? 0).toLocaleString("id-ID");

function todayLocal(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

export function CashQris() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [date, setDate] = useState(todayLocal());
  const [areas, setAreas] = useState<AreaItem[]>([]);
  const [jukirs, setJukirs] = useState<JukirItem[]>([]);
  const [areaId, setAreaId] = useState("");
  const [jukirId, setJukirId] = useState("");
  const [data, setData] = useState<CashQrisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isAdmin) {
      apiClient
        .get("/areas")
        .then(({ data }) => setAreas(data.data ?? []))
        .catch(() => {});
      apiClient
        .get("/jukir/list")
        .then(({ data }) => setJukirs(data.data ?? []))
        .catch(() => {});
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchData();
  }, [date, areaId, jukirId]);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const params: any = { date };
      if (isAdmin) {
        if (areaId) params.areaId = areaId;
        if (jukirId) params.jukirId = jukirId;
      }
      const res = await apiClient.get("/reports/cash-qris", { params });
      if (res.data.success) {
        setData(res.data.data);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Gagal memuat data pendapatan");
    } finally {
      setLoading(false);
    }
  };

  const filteredJukirs = useMemo(() => {
    if (!areaId) return jukirs;
    return jukirs.filter((j) => j.areaId === areaId);
  }, [jukirs, areaId]);

  const chartData = useMemo(
    () =>
      data
        ? [
            { name: "Cash", nominal: data.cash },
            { name: "QRIS", nominal: data.qris },
          ]
        : [],
    [data],
  );

  const areaLabel = isAdmin ? null : user?.area?.name ?? "Area Saya";
  const jukirLabel = isAdmin ? null : user?.name ?? "-";

  return (
    <div className="page">
      <header className="page-header">
        <h1>
          <TrendingUp className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" /> Pendapatan Cash &amp; QRIS
        </h1>
        <p>Ringkasan pendapatan harian berdasarkan area &amp; jukir</p>
      </header>

      <div className="card mb-4">
        <div className="filter-section" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="cashqris-date">Tanggal</label>
            <input
              id="cashqris-date"
              type="date"
              className="input"
              value={date}
              max={todayLocal()}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {isAdmin ? (
            <>
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="cashqris-area">Area</label>
                <select
                  id="cashqris-area"
                  className="input"
                  value={areaId}
                  onChange={(e) => {
                    setAreaId(e.target.value);
                    setJukirId("");
                  }}
                >
                  <option value="">Semua Area</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="cashqris-jukir">Jukir</label>
                <select
                  id="cashqris-jukir"
                  className="input"
                  value={jukirId}
                  onChange={(e) => setJukirId(e.target.value)}
                >
                  <option value="">Semua Jukir</option>
                  {filteredJukirs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Area</label>
                <div className="input" style={{ display: "flex", alignItems: "center", gap: "0.5rem", opacity: 0.9 }}>
                  <Calendar size={16} aria-hidden="true" /> {areaLabel}
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Jukir</label>
                <div className="input" style={{ display: "flex", alignItems: "center", gap: "0.5rem", opacity: 0.9 }}>
                  <Users2 size={16} aria-hidden="true" /> {jukirLabel}
                </div>
              </div>
            </>
          )}

          <button className="btn btn-outline" onClick={fetchData} disabled={loading}>
            {loading ? "Memuat..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="grid grid-kpi">
        <div className="card card-stat">
          <div className="icon-container icon-success">
            <Wallet size={20} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Total Pendapatan</span>
            <span className="stat-value">{rupiah(data?.total ?? 0)}</span>
          </div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-success">
            <Banknote size={20} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Pendapatan Cash</span>
            <span className="stat-value">{rupiah(data?.cash ?? 0)}</span>
          </div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-info">
            <QrCode size={20} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Pendapatan QRIS</span>
            <span className="stat-value">{rupiah(data?.qris ?? 0)}</span>
          </div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-info">
            <TrendingUp size={20} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <div className="stat-content">
            <span className="stat-label">Jumlah Transaksi</span>
            <span className="stat-value">{data?.transactions ?? 0}</span>
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <h2>Cash vs QRIS</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8F0F2" vertical={false} />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : `${v}`)} />
            <Tooltip formatter={(v) => rupiah(Number(v))} cursor={{ fill: "rgba(0,155,131,0.06)" }} />
            <Legend />
            <Bar dataKey="nominal" name="Pendapatan" fill="#19B79A" radius={[4, 4, 0, 0]} maxBarSize={70} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card mt-4">
        <h2>Rincian</h2>
        <table className="table table-striped">
          <thead>
            <tr>
              <th>Metode</th>
              <th>Nominal</th>
              <th>Kontribusi</th>
            </tr>
          </thead>
          <tbody>
            {data ? (
              <>
                <tr>
                  <td>
                    <span className="badge badge-success">Cash</span>
                  </td>
                  <td>{rupiah(data.cash)}</td>
                  <td>{data.total > 0 ? Math.round((data.cash / data.total) * 100) : 0}%</td>
                </tr>
                <tr>
                  <td>
                    <span className="badge badge-info">QRIS</span>
                  </td>
                  <td>{rupiah(data.qris)}</td>
                  <td>{data.total > 0 ? Math.round((data.qris / data.total) * 100) : 0}%</td>
                </tr>
              </>
            ) : (
              <tr>
                <td colSpan={3} className="text-center text-muted">
                  Belum ada data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
