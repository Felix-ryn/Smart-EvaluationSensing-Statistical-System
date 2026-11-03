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
  BarChart,
  Bar,
} from "recharts";
import {
  clusterColor,
  compactRupiah,
  fetchAdminSegmentation,
  fetchForecast,
  fetchShiftRevenue,
  fetchActualRevenue,
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

function MonthlyForecastTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  
  return (
    <div className="card" style={{ padding: 10, fontSize: 13, margin: 0 }}>
      <strong>{label}</strong>
      {payload.map((entry: any, idx: number) => (
        <div key={idx} style={{ color: entry.color }}>
          {entry.name}: {rupiah(entry.value)}
        </div>
      ))}
    </div>
  );
}

function ForecastSection() {
  const { data, error, loading, empty } = useAutoRefresh(fetchForecast, REFRESH_MS);
  const { data: actualData, loading: actualLoading } = useAutoRefresh(() => fetchActualRevenue(90), REFRESH_MS);

  const total = data?.TOTAL;
  
  // Aggregate actual data dari database per bulan
  const actualDataByMonth = useMemo(() => {
    if (!actualData || actualData.length === 0) return new Map<string, number>();
    
    const buckets = new Map<string, number>();
    for (const point of actualData) {
      const d = new Date(point.date);
      const monthKey = new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("id-ID", {
        month: "short",
        year: "numeric",
      });
      // point.total = cash + qris dari /reports/revenue endpoint
      buckets.set(monthKey, (buckets.get(monthKey) ?? 0) + (point.total ?? 0));
    }
    return buckets;
  }, [actualData]);
  
  // Build chart data: merge actual dari DB + forecast dari API
  const chartData = useMemo(() => {
    if (!total || !actualDataByMonth) return [];
    
    // Aggregate forecast data per bulan
    const monthlyMap = new Map<string, number>();
    const monthDates = new Map<string, Date>();
    
    for (const p of total.forecast) {
      const d = new Date(p.date);
      const monthLabel = new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("id-ID", {
        month: "short",
        year: "numeric",
      });
      
      if (!monthDates.has(monthLabel)) {
        monthDates.set(monthLabel, new Date(d.getFullYear(), d.getMonth(), 1));
      }
      monthlyMap.set(monthLabel, (monthlyMap.get(monthLabel) ?? 0) + p.point);
    }
    
    // Store actual month dates
    for (const monthLabel of actualDataByMonth.keys()) {
      if (!monthDates.has(monthLabel)) {
        const [monthName, yearStr] = monthLabel.split(" ");
        const months: Record<string, number> = {
          "Jan": 0, "Feb": 1, "Mar": 2, "Apr": 3, "Mei": 4, "Jun": 5,
          "Jul": 6, "Agu": 7, "Sep": 8, "Okt": 9, "Nov": 10, "Des": 11
        };
        const monthNum = months[monthName] ?? 0;
        const year = parseInt(yearStr);
        monthDates.set(monthLabel, new Date(year, monthNum, 1));
      }
    }
    
    // Merge: actual from DB, forecast from API
    const allMonths = new Set<string>([...actualDataByMonth.keys(), ...monthlyMap.keys()]);
    
    return Array.from(allMonths)
      .sort((a, b) => {
        const dateA = monthDates.get(a) ?? new Date();
        const dateB = monthDates.get(b) ?? new Date();
        return dateA.getTime() - dateB.getTime();
      })
      .map((month) => ({
        month,
        actual: actualDataByMonth.has(month) ? actualDataByMonth.get(month) : null,
        forecast: monthlyMap.has(month) ? monthlyMap.get(month) : null,
      }));
  }, [total, actualDataByMonth]);

  const kpi = useMemo(() => {
    if (!total || total.forecast.length === 0) return null;
    const f = total.forecast;
    
    // Sum actual + forecast
    const actualSum = Array.from(actualDataByMonth.values()).reduce((s, v) => s + v, 0);
    const forecastSum = f.reduce((s, p) => s + p.point, 0);
    const sum = actualSum + forecastSum;
    
    // Count unique months
    const monthSet = new Set<string>();
    for (const p of f) {
      const d = new Date(p.date);
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      monthSet.add(monthKey);
    }
    // Add actual months
    for (const month of actualDataByMonth.keys()) {
      monthSet.add(month);
    }
    
    const first = f[0];
    const last = f[f.length - 1];
    const trend = first.point > 0 ? ((last.point - first.point) / first.point) * 100 : 0;
    const ciWidth = last.point > 0 ? ((last.upper - last.lower) / last.point) * 100 : 0;
    return { sum, avg: sum / monthSet.size, trend, ciWidth, months: monthSet.size };
  }, [total, actualDataByMonth]);

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

  if (loading || actualLoading) return <div className="card"><div className="loading">Memuat forecast & data aktual...</div></div>;

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
          Horizon {kpi.months} bulan · agregat seluruh area · pembaruan otomatis tiap 60 detik
        </p>
      </div>

      <div className="grid grid-kpi">
        <div className="card card-stat">
          <div className="icon-container icon-success"><TrendingUp size={20} strokeWidth={1.8} /></div>
          <div className="stat-content">
            <span className="stat-label">Total {kpi.months} Bulan</span>
            <span className="stat-value">{compactRupiah(kpi.sum)}</span>
          </div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-info"><TrendingUp size={20} strokeWidth={1.8} /></div>
          <div className="stat-content">
            <span className="stat-label">Rata-rata / Bulan</span>
            <span className="stat-value">{compactRupiah(kpi.avg)}</span>
          </div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-info"><TrendingUp size={20} strokeWidth={1.8} /></div>
          <div className="stat-content">
            <span className="stat-label">Tren Bulan 1 → {kpi.months}</span>
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
        <h2>Proyeksi Pendapatan per Bulan</h2>
        <p className="text-muted">Garis biru = data aktual · Garis merah = forecast. Arahkan kursor ke grafik untuk detail.</p>
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8F0F2" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={compactRupiah} />
            <Tooltip content={<MonthlyForecastTooltip />} />
            <Legend />
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#0066cc"
              strokeWidth={3}
              dot={{ fill: "#0066cc", r: 6 }}
              connectNulls={true}
              name="Data Aktual"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="#ff4444"
              strokeWidth={3}
              strokeDasharray="5 5"
              dot={{ fill: "#ff4444", r: 6 }}
              connectNulls={true}
              name="Forecast"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h2>Ringkasan Proyeksi per Bulan</h2>
        <p className="text-muted">Nilai agregat per bulan (gabungan seluruh area).</p>
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
