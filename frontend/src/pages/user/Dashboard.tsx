import { useEffect, useMemo, useState } from "react";
import { Clock, Info, LayoutDashboard, TrendingUp, Car } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../api/client";

interface TrendPoint {
  hour: number;
  label: string;
  count: number;
}

interface WeekdayPoint {
  dow: number;
  label: string;
  count: number;
}

interface DailyPoint {
  date: string;
  count: number;
}

interface TrendData {
  rangeDays: number;
  totalVehicles: number;
  peakHour: string | null;
  peakHourCount: number;
  hourly: TrendPoint[];
  weekday: WeekdayPoint[];
  daily: DailyPoint[];
}

const RANGE_OPTIONS = [7, 30, 90];

/** Ambang klasifikasi jam sibuk, relatif terhadap jam terpadat. */
const BUSY_HIGH = 0.66;
const BUSY_MID = 0.33;

function busyColor(count: number, max: number): string {
  if (max === 0) return "#DCE9EC";
  const ratio = count / max;
  if (ratio >= BUSY_HIGH) return "#C4444C"; // padat
  if (ratio >= BUSY_MID) return "#B0741E"; // sedang
  return "#19B79A"; // lengang
}

function busyLabel(count: number, max: number): string {
  if (max === 0 || count === 0) return "Kosong";
  const ratio = count / max;
  if (ratio >= BUSY_HIGH) return "Padat";
  if (ratio >= BUSY_MID) return "Sedang";
  return "Lengang";
}

function HourTooltip({ active, payload, maxCount }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as TrendPoint;
  return (
    <div className="card" style={{ padding: 10, fontSize: 13, margin: 0 }}>
      <strong>Pukul {d.label}</strong>
      <div>{d.count} kendaraan masuk</div>
      <div style={{ color: busyColor(d.count, maxCount), fontWeight: 600 }}>
        {busyLabel(d.count, maxCount)}
      </div>
    </div>
  );
}

export function UserDashboard() {
  const [data, setData] = useState<TrendData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .get(`/dashboard/trend?days=${range}`)
      .then(({ data: res }) => {
        if (!alive) return;
        setData(res.data);
        setError("");
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.response?.data?.message ?? "Gagal memuat tren parkir");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [range]);

  const maxHour = useMemo(
    () => (data ? Math.max(...data.hourly.map((h) => h.count), 0) : 0),
    [data],
  );

  const maxWeekday = useMemo(
    () => (data ? Math.max(...data.weekday.map((d) => d.count), 0) : 0),
    [data],
  );

  /** Tiga jam terpadat, untuk ditampilkan sebagai saran hindari/pilih waktu. */
  const topHours = useMemo(() => {
    if (!data) return [];
    return [...data.hourly]
      .filter((h) => h.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [data]);

  /** Jam paling lengang dalam rentang operasional wajar (06:00-22:00). */
  const quietHours = useMemo(() => {
    if (!data) return [];
    return [...data.hourly]
      .filter((h) => h.hour >= 6 && h.hour <= 22)
      .sort((a, b) => a.count - b.count)
      .slice(0, 3);
  }, [data]);

  const busiestDay = useMemo(() => {
    if (!data || maxWeekday === 0) return null;
    return data.weekday.reduce((a, b) => (b.count > a.count ? b : a), data.weekday[0]);
  }, [data, maxWeekday]);

  const dailyChart = useMemo(() => {
    if (!data) return [];
    return data.daily.map((d) => ({
      ...d,
      labelShort: new Date(d.date).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
      }),
    }));
  }, [data]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>
          <LayoutDashboard className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" />{" "}
          Tren & Jam Sibuk Parkir
        </h1>
        <p>
          Lihat jam tersibuk agar Anda bisa memilih waktu parkir yang lebih lengang.
        </p>
      </header>

      {/* Pemilih rentang waktu */}
      <div className="card">
        <div className="quick-actions">
          {RANGE_OPTIONS.map((d) => (
            <button
              key={d}
              className={range === d ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
              onClick={() => setRange(d)}
            >
              {d} hari terakhir
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div className="card">
          <div className="loading">Memuat tren parkir...</div>
        </div>
      ) : !data ? null : data.totalVehicles === 0 ? (
        <div className="card">
          <div className="alert alert-warning">
            <Info size={14} strokeWidth={2} aria-hidden="true" /> Belum ada data kendaraan pada{" "}
            {range} hari terakhir. Coba pilih rentang waktu yang lebih panjang.
          </div>
        </div>
      ) : (
        <>
          {/* Ringkasan */}
          <div className="grid grid-kpi">
            <div className="card card-stat">
              <div className="icon-container icon-info">
                <Car size={20} strokeWidth={1.8} aria-hidden="true" />
              </div>
              <div className="stat-content">
                <span className="stat-label">Total Kendaraan</span>
                <span className="stat-value">{data.totalVehicles.toLocaleString("id-ID")}</span>
                <span className="text-muted">{data.rangeDays} hari terakhir</span>
              </div>
            </div>

            <div className="card card-stat">
              <div className="icon-container icon-warning">
                <Clock size={20} strokeWidth={1.8} aria-hidden="true" />
              </div>
              <div className="stat-content">
                <span className="stat-label">Jam Tersibuk</span>
                <span className="stat-value">{data.peakHour ?? "—"}</span>
                <span className="text-muted">{data.peakHourCount} kendaraan</span>
              </div>
            </div>

            <div className="card card-stat">
              <div className="icon-container icon-info">
                <TrendingUp size={20} strokeWidth={1.8} aria-hidden="true" />
              </div>
              <div className="stat-content">
                <span className="stat-label">Hari Tersibuk</span>
                <span className="stat-value">{busiestDay?.label ?? "—"}</span>
                <span className="text-muted">{busiestDay?.count ?? 0} kendaraan</span>
              </div>
            </div>

            <div className="card card-stat">
              <div className="icon-container icon-success">
                <Clock size={20} strokeWidth={1.8} aria-hidden="true" />
              </div>
              <div className="stat-content">
                <span className="stat-label">Paling Lengang</span>
                <span className="stat-value">{quietHours[0]?.label ?? "—"}</span>
                <span className="text-muted">{quietHours[0]?.count ?? 0} kendaraan</span>
              </div>
            </div>
          </div>

          {/* Rush hour per jam */}
          <div className="card">
            <h2>Jam Sibuk (Rush Hour)</h2>
            <p className="text-muted">
              Warna batang menunjukkan tingkat kepadatan. Arahkan kursor untuk detail per jam.
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.hourly} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8F0F2" vertical={false} />
                <XAxis dataKey="label" interval={1} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  content={<HourTooltip maxCount={maxHour} />}
                  cursor={{ fill: "rgba(0,155,131,0.06)" }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {data.hourly.map((h) => (
                    <Cell key={h.hour} fill={busyColor(h.count, maxHour)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="quick-actions" style={{ marginTop: 10 }}>
              <span className="badge badge-danger">Padat</span>
              <span className="badge badge-warning">Sedang</span>
              <span className="badge badge-success">Lengang</span>
            </div>
          </div>

          <div className="grid grid-2">
            {/* Tren kendaraan harian — dipindah dari dashboard admin, kini pakai data nyata */}
            <div className="card">
              <h2>Tren Kendaraan di Area Parkir</h2>
              <p className="text-muted">Jumlah kendaraan masuk per hari.</p>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={dailyChart} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
                  <defs>
                    <linearGradient id="userTrendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#009B83" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#009B83" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8F0F2" vertical={false} />
                  <XAxis dataKey="labelShort" minTickGap={24} tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v) => [`${v} kendaraan`, "Masuk"]}
                    labelFormatter={(l) => `Tanggal ${l}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#009B83"
                    strokeWidth={2}
                    fill="url(#userTrendFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Pola per hari */}
            <div className="card">
              <h2>Pola per Hari</h2>
              <p className="text-muted">Hari apa area parkir paling padat.</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={data.weekday}
                  layout="vertical"
                  margin={{ top: 10, right: 20, bottom: 4, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8F0F2" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" width={64} tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(v) => [`${v} kendaraan`, "Total"]}
                    cursor={{ fill: "rgba(0,155,131,0.06)" }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {data.weekday.map((d) => (
                      <Cell key={d.dow} fill={busyColor(d.count, maxWeekday)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Saran waktu parkir */}
          <div className="card">
            <h2>Saran Waktu Parkir</h2>
            <div className="grid grid-2">
              <div>
                <h3 style={{ fontSize: "0.95rem", marginBottom: 8 }}>Sebaiknya dihindari</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Jam</th>
                      <th>Kendaraan</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topHours.map((h) => (
                      <tr key={h.hour}>
                        <td>{h.label}</td>
                        <td>{h.count}</td>
                        <td>
                          <span className="badge badge-danger">{busyLabel(h.count, maxHour)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 style={{ fontSize: "0.95rem", marginBottom: 8 }}>Waktu lebih lengang</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Jam</th>
                      <th>Kendaraan</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quietHours.map((h) => (
                      <tr key={h.hour}>
                        <td>{h.label}</td>
                        <td>{h.count}</td>
                        <td>
                          <span className="badge badge-success">{busyLabel(h.count, maxHour)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-muted" style={{ marginTop: 10 }}>
              Jam lengang dihitung pada rentang 06:00–22:00 agar sarannya tetap masuk akal.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
