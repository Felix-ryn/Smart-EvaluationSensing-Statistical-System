import { useMemo } from "react";
import { Info, TrendingUp } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  clusterColor,
  compactRupiah,
  fetchAdminSegmentation,
  fetchForecast,
  fetchShiftRevenue,
  rupiah,
  useAutoRefresh,
} from "../../api/analytics";

const REFRESH_MS = 60_000;

export function AdminAnalyticsTopCards() {
  const { data, error, loading, empty } = useAutoRefresh(fetchAdminSegmentation, REFRESH_MS);

  const rows = useMemo(() => {
    if (!data) return [];
    return [...data.members]
      .sort((a, b) => {
        if (b.punctualityPercent !== a.punctualityPercent) return b.punctualityPercent - a.punctualityPercent;
        return b.dailyEarnings - a.dailyEarnings;
      });
  }, [data]);

  if (loading) {
    return (
      <div className="card admin-analytics-equal-card">
        <div className="loading">Memuat perbandingan jukir...</div>
      </div>
    );
  }

  if (empty || error || !data) {
    return (
      <div className="card admin-analytics-equal-card">
        <h2>Perbandingan Jukir</h2>
        <div className="alert alert-danger">{error ?? "Data segmentasi belum tersedia."}</div>
      </div>
    );
  }

  return (
    <div className="card admin-analytics-equal-card">
      <h2>Perbandingan Jukir</h2>
      <p className="text-muted">Perbandingan ketepatan waktu & pendapatan harian. Scroll daftar di dalam box.</p>
      <div className="admin-jukir-scroll-wrap">
        <table className="table admin-jukir-compare-table">
          <thead>
            <tr>
              <th>Nama Jukir</th>
              <th>Cluster</th>
              <th>Ketepatan</th>
              <th>Pendapatan/Hari</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>
                  <span
                    className="badge"
                    style={{ background: m.clusterLabel === -1 ? "#9ca3af" : clusterColor(m.clusterLabel), color: "#fff" }}
                  >
                    {m.clusterLabel === -1 ? "Noise" : `C${m.clusterLabel}`}
                  </span>
                </td>
                <td>{m.punctualityPercent.toFixed(1)}%</td>
                <td>{rupiah(m.dailyEarnings)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ForecastTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as { date: string; point: number; lower: number; upper: number };
  return (
    <div className="card" style={{ padding: 10, fontSize: 13, margin: 0 }}>
      <strong>{new Date(label).toLocaleDateString("id-ID", { dateStyle: "medium" })}</strong>
      <div>Prediksi: {rupiah(row.point)}</div>
      <div>Rentang 95%: {rupiah(row.lower)} – {rupiah(row.upper)}</div>
    </div>
  );
}

function ForecastSection() {
  const { data, error, loading, empty } = useAutoRefresh(fetchForecast, REFRESH_MS);

  const total = data?.TOTAL;

  const chartData = useMemo(() => {
    if (!total) return [];
    return total.forecast.map((p) => ({
      date: p.date,
      point: p.point,
      lower: p.lower,
      upper: p.upper,
      ciBase: p.lower,
      ciBand: Math.max(0, p.upper - p.lower),
    }));
  }, [total]);

  const kpi = useMemo(() => {
    if (!total || total.forecast.length === 0) return null;
    const f = total.forecast;
    const sum = f.reduce((s, p) => s + p.point, 0);
    const first = f[0];
    const last = f[f.length - 1];
    const trend = first.point > 0 ? ((last.point - first.point) / first.point) * 100 : 0;
    const ciWidth = last.point > 0 ? ((last.upper - last.lower) / last.point) * 100 : 0;
    return { sum, avg: sum / f.length, trend, ciWidth, days: f.length };
  }, [total]);

  const monthly = useMemo(() => {
    if (!total) return [];
    const buckets = new Map<string, number>();
    for (const p of total.forecast) {
      const d = new Date(p.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, (buckets.get(key) ?? 0) + p.point);
    }
    return [...buckets.entries()].map(([key, value]) => {
      const [y, m] = key.split("-");
      return {
        label: new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("id-ID", {
          month: "long",
          year: "numeric",
        }),
        value,
      };
    });
  }, [total]);

  const areaRows = useMemo(() => {
    if (!data) return [];
    return Object.entries(data)
      .filter(([k]) => k !== "TOTAL")
      .map(([id, area]) => {
        const f = area.forecast;
        const at = (i: number) => (f[i] ? f[i].point : 0);
        const first = at(0);
        const last = f.length ? f[f.length - 1].point : 0;
        return {
          id,
          name: area.area_name,
          d1: first,
          d30: at(29),
          d60: at(59),
          d90: last,
          trend: first > 0 ? ((last - first) / first) * 100 : 0,
        };
      });
  }, [data]);

  if (loading) return <div className="card"><div className="loading">Memuat forecast...</div></div>;

  if (empty) {
    return (
      <div className="card">
        <h2><TrendingUp className="title-icon" size={20} strokeWidth={1.8} /> Forecast Pendapatan 3 Bulan</h2>
        <div className="alert alert-danger">
          <Info size={14} strokeWidth={2} /> Belum ada hasil forecast. Jalankan forecast terlebih dahulu.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h2><TrendingUp className="title-icon" size={20} strokeWidth={1.8} /> Forecast Pendapatan 3 Bulan</h2>
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  if (!total || !kpi) {
    return (
      <div className="card">
        <h2><TrendingUp className="title-icon" size={20} strokeWidth={1.8} /> Forecast Pendapatan 3 Bulan</h2>
        <div className="alert alert-danger">
          <Info size={14} strokeWidth={2} /> Data agregat total tidak tersedia pada hasil forecast.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <h2><TrendingUp className="title-icon" size={20} strokeWidth={1.8} /> Forecast Pendapatan 3 Bulan</h2>
        <p className="text-muted">
          Horizon {kpi.days} hari · agregat seluruh area · pembaruan otomatis tiap 60 detik
        </p>
      </div>

      <div className="grid grid-kpi">
        <div className="card card-stat">
          <div className="icon-container icon-success"><TrendingUp size={20} strokeWidth={1.8} /></div>
          <div className="stat-content">
            <span className="stat-label">Total {kpi.days} Hari</span>
            <span className="stat-value">{compactRupiah(kpi.sum)}</span>
          </div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-info"><TrendingUp size={20} strokeWidth={1.8} /></div>
          <div className="stat-content">
            <span className="stat-label">Rata-rata / Hari</span>
            <span className="stat-value">{compactRupiah(kpi.avg)}</span>
          </div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-info"><TrendingUp size={20} strokeWidth={1.8} /></div>
          <div className="stat-content">
            <span className="stat-label">Tren Hari 1 → {kpi.days}</span>
            <span className="stat-value">{kpi.trend >= 0 ? "+" : ""}{kpi.trend.toFixed(1)}%</span>
          </div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-warning"><Info size={20} strokeWidth={1.8} /></div>
          <div className="stat-content">
            <span className="stat-label">Lebar Interval 95%</span>
            <span className="stat-value">±{(kpi.ciWidth / 2).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Proyeksi Harian & Interval Keyakinan</h2>
        <p className="text-muted">Arahkan kursor ke grafik untuk melihat nilai per tanggal.</p>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8F0F2" />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => new Date(v).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}
              minTickGap={32}
            />
            <YAxis tickFormatter={compactRupiah} />
            <Tooltip content={<ForecastTooltip />} />
            <Legend />
            <Area
              type="monotone"
              dataKey="ciBase"
              stackId="ci"
              stroke="none"
              fill="transparent"
              legendType="none"
              activeDot={false}
            />
            <Area
              type="monotone"
              dataKey="ciBand"
              stackId="ci"
              stroke="none"
              fill="#0066cc"
              fillOpacity={0.15}
              name="Interval 95%"
              activeDot={false}
            />
            <Line type="monotone" dataKey="point" stroke="#0066cc" strokeWidth={2} dot={false} name="Prediksi" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h2>Proyeksi per Bulan</h2>
        <p className="text-muted">Ringkasan nilai prediksi yang sudah dijumlahkan per bulan kalender.</p>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr><th>Bulan</th><th>Proyeksi Pendapatan</th></tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.label}>
                  <td>{m.label}</td>
                  <td className="font-semibold">{rupiah(m.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Rincian Forecast per Area</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Area</th><th>Hari 1</th><th>Hari 30</th><th>Hari 60</th><th>Hari 90</th><th>Tren</th>
              </tr>
            </thead>
            <tbody>
              {areaRows.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{rupiah(a.d1)}</td>
                  <td>{rupiah(a.d30)}</td>
                  <td>{rupiah(a.d60)}</td>
                  <td>{rupiah(a.d90)}</td>
                  <td>{a.trend >= 0 ? "+" : ""}{a.trend.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ShiftRevenueSection() {
  const { data, error, loading, empty } = useAutoRefresh(() => fetchShiftRevenue(90, "daily"), REFRESH_MS);

  if (loading) return <div className="card"><div className="loading">Memuat pendapatan per shift...</div></div>;

  if (empty || !data || data.series.length === 0) {
    return (
      <div className="card">
        <h2>Pendapatan per Shift</h2>
        <div className="alert alert-danger">
          <Info size={14} strokeWidth={2} /> Data pendapatan shift belum tersedia.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h2>Pendapatan per Shift</h2>
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Pendapatan per Shift (PAGI vs SORE)</h2>
      <p className="text-muted">Garis putus-putus = rata-rata gabungan seluruh shift pada periode ({rupiah(data.overallAverage)}).</p>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data.series} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E8F0F2" />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => new Date(v).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}
            minTickGap={30}
          />
          <YAxis tickFormatter={(v) => `Rp ${Math.round(Number(v) / 1000)}k`} />
          <Tooltip formatter={(v) => rupiah(Number(v))} />
          <Legend />
          <ReferenceLine
            y={data.overallAverage}
            stroke="#6b7280"
            strokeDasharray="4 4"
            label={{ value: "Rata-rata", position: "insideTopRight", fill: "#6b7280", fontSize: 11 }}
          />
          <Line type="monotone" dataKey="pagi" stroke="#0066cc" strokeWidth={2} dot={false} name="Shift Pagi" />
          <Line type="monotone" dataKey="sore" stroke="#ff6600" strokeWidth={2} dot={false} name="Shift Sore" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AdminAnalytics() {
  return (
    <>
      <ForecastSection />
      <ShiftRevenueSection />
    </>
  );
}
