import { useMemo, useState } from "react";
import { Info, Layers, TrendingUp, Users2 } from "lucide-react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  fetchModelInfo,
  performanceLabel,
  rupiah,
  useAutoRefresh,
  type ClusterMember,
} from "../../api/analytics";

const REFRESH_MS = 60_000;

// ============================================
// SEGMENTASI JUKIR
// ============================================

/** Tooltip bersama untuk chart peringkat jukir. */
function JukirBarTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ClusterMember;
  return (
    <div className="card" style={{ padding: 10, fontSize: 13, margin: 0 }}>
      <strong>{d.name}</strong>
      <div style={{ color: clusterColor(d.clusterLabel), fontWeight: 600 }}>
        Cluster {d.clusterLabel} · {performanceLabel(d.dailyEarnings, d.punctualityPercent)}
      </div>
      <div style={{ marginTop: 4 }}>Penghasilan: {rupiah(d.dailyEarnings)}/hari</div>
      <div>Ketepatan waktu: {d.punctualityPercent.toFixed(1)}%</div>
      <div>Konsistensi (std dev jam): {d.workConsistency.toFixed(2)}</div>
      <div>Keyakinan model: {(d.gmmProbability * 100).toFixed(0)}%</div>
    </div>
  );
}

function SegmentationSection() {
  const { data, error, loading, empty } = useAutoRefresh(fetchAdminSegmentation, REFRESH_MS);
  const model = useAutoRefresh(fetchModelInfo, REFRESH_MS);
  const [filter, setFilter] = useState<number | "all">("all");

  const clusterLabels = useMemo(
    () => (data ? [...new Set(data.members.map((m) => m.clusterLabel))].sort((a, b) => a - b) : []),
    [data],
  );

  const visible = useMemo(() => {
    if (!data) return [];
    const rows = filter === "all" ? data.members : data.members.filter((m) => m.clusterLabel === filter);
    return [...rows].sort((a, b) => b.dailyEarnings - a.dailyEarnings);
  }, [data, filter]);

  const bicData = useMemo(() => {
    const scores = model.data?.bicScores ?? {};
    return Object.entries(scores)
      .map(([k, v]) => ({ clusters: Number(k), bic: Number(v) }))
      .sort((a, b) => a.clusters - b.clusters);
  }, [model.data]);

  if (loading) return <div className="card"><div className="loading">Memuat segmentasi...</div></div>;

  if (empty) {
    return (
      <div className="card">
        <h2><Users2 className="title-icon" size={20} strokeWidth={1.8} /> Segmentasi Kinerja Jukir</h2>
        <div className="alert alert-danger">
          <Info size={14} strokeWidth={2} /> Belum ada hasil analisis. Jalankan segmentasi terlebih dahulu.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h2><Users2 className="title-icon" size={20} strokeWidth={1.8} /> Segmentasi Kinerja Jukir</h2>
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      <div className="card">
        <h2><Users2 className="title-icon" size={20} strokeWidth={1.8} /> Segmentasi Kinerja Jukir (GMM)</h2>
        <p className="text-muted">
          {data.totalJukir} jukir · {clusterLabels.length} segmen · analisis{" "}
          {new Date(data.analyzedDate).toLocaleDateString("id-ID", { dateStyle: "long" })}
          {" · pembaruan otomatis tiap 60 detik"}
        </p>
      </div>

      {/* Kartu ringkasan per cluster */}
      <div className="grid grid-kpi">
        {clusterLabels.map((label) => {
          const s = data.clusterStatistics[label];
          if (!s) return null;
          return (
            <div key={label} className="card card-stat">
              <div className="icon-container" style={{ background: clusterColor(label), color: "#fff" }}>
                <Layers size={20} strokeWidth={1.8} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Cluster {label} · {s.count} jukir</span>
                <span className="stat-value">{compactRupiah(s.avgEarnings)}/hari</span>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  Ketepatan {s.avgPunctuality}% · Konsistensi {s.avgConsistency}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter cluster: memengaruhi kedua chart dan tabel di bawahnya. */}
      <div className="card">
        <div className="quick-actions">
          <button
            className={filter === "all" ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
            onClick={() => setFilter("all")}
          >
            Semua ({data.members.length})
          </button>
          {clusterLabels.map((label) => (
            <button
              key={label}
              className={filter === label ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
              onClick={() => setFilter(label)}
            >
              Cluster {label} ({data.clusterStatistics[label]?.count ?? 0})
            </button>
          ))}
        </div>
      </div>

      {/* Peringkat penghasilan — bar horizontal jauh lebih mudah dibaca
          daripada scatter saat jumlah jukir sedikit, dan nama langsung terlihat. */}
      <div className="card">
        <h2>Peringkat Penghasilan Harian per Jukir</h2>
        <p className="text-muted">
          Warna batang menunjukkan segmen hasil GMM. Arahkan kursor untuk detail lengkap.
        </p>
        <ResponsiveContainer width="100%" height={Math.max(220, visible.length * 44)}>
          <BarChart
            data={visible}
            layout="vertical"
            margin={{ top: 4, right: 70, bottom: 4, left: 8 }}
            barCategoryGap="22%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E8F0F2" horizontal={false} />
            <XAxis type="number" tickFormatter={compactRupiah} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} />
            <Tooltip content={<JukirBarTooltip />} cursor={{ fill: "rgba(0,155,131,0.06)" }} />
            <Bar dataKey="dailyEarnings" radius={[0, 5, 5, 0]} maxBarSize={28}>
              {visible.map((m) => (
                <Cell key={m.id} fill={clusterColor(m.clusterLabel)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="quick-actions" style={{ marginTop: 10 }}>
          {clusterLabels.map((label) => (
            <span
              key={label}
              className="badge"
              style={{ background: clusterColor(label), color: "#fff" }}
            >
              Cluster {label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-2">
        {/* Ketepatan waktu per jukir */}
        <div className="card">
          <h2>Ketepatan Waktu per Jukir</h2>
          <p className="text-muted">Persentase kehadiran tepat waktu (maksimum 100%).</p>
          <ResponsiveContainer width="100%" height={Math.max(220, visible.length * 40)}>
            <BarChart
              data={visible}
              layout="vertical"
              margin={{ top: 4, right: 40, bottom: 4, left: 8 }}
              barCategoryGap="22%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E8F0F2" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11 }}
              />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} />
              <Tooltip content={<JukirBarTooltip />} cursor={{ fill: "rgba(0,155,131,0.06)" }} />
              <Bar dataKey="punctualityPercent" radius={[0, 5, 5, 0]} maxBarSize={24}>
                {visible.map((m) => (
                  <Cell key={m.id} fill={clusterColor(m.clusterLabel)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* BIC */}
        <div className="card">
          <h2>Pemilihan Jumlah Cluster (BIC)</h2>
          {model.empty || bicData.length === 0 ? (
            <div className="alert alert-danger">
              <Info size={14} strokeWidth={2} /> Info model belum tersedia.
            </div>
          ) : (
            <>
              <p className="text-muted">
                BIC terendah = jumlah cluster optimal. Optimal: {model.data?.optimalClusters} cluster.
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={bicData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8F0F2" />
                  <XAxis
                    dataKey="clusters"
                    label={{ value: "Jumlah cluster", position: "insideBottom", offset: -12, fontSize: 12 }}
                  />
                  <YAxis label={{ value: "BIC", angle: -90, position: "insideLeft", fontSize: 12 }} />
                  <Tooltip formatter={(v) => Number(v).toFixed(1)} />
                  {model.data?.optimalClusters != null && (
                    <ReferenceLine
                      x={model.data.optimalClusters}
                      stroke="#e74c3c"
                      strokeDasharray="4 4"
                      label={{ value: "Optimal", fontSize: 11, fill: "#e74c3c" }}
                    />
                  )}
                  <Line type="monotone" dataKey="bic" stroke="#0066cc" strokeWidth={2} dot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      </div>

      {/* Tabel semua jukir */}
      <div className="card">
        <h2>Rincian per Jukir</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Cluster</th>
                <th>Penghasilan/hari</th>
                <th>Konsistensi</th>
                <th>Ketepatan Waktu</th>
                <th>Keyakinan</th>
                <th>Kategori</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>
                    <span className="badge" style={{ background: clusterColor(m.clusterLabel), color: "#fff" }}>
                      {m.clusterLabel}
                    </span>
                  </td>
                  <td>{rupiah(m.dailyEarnings)}</td>
                  <td>{m.workConsistency.toFixed(2)}</td>
                  <td>{m.punctualityPercent.toFixed(1)}%</td>
                  <td>{(m.gmmProbability * 100).toFixed(0)}%</td>
                  <td>{performanceLabel(m.dailyEarnings, m.punctualityPercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
          Kategori dihitung saat tampil dan tidak disimpan ke database, agar hasil clustering tetap objektif.
        </p>
      </div>
    </>
  );
}

// ============================================
// FORECAST 3 BULAN
// ============================================

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
      // Recharts menumpuk Area: basis transparan + tinggi band = pita CI
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

  /** Jumlah titik prediksi dikelompokkan per bulan kalender. */
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
          aic: area.model_aic,
          bic: area.model_bic,
          rmse: area.model_rmse,
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
          SARIMA(1,1,1)×(0,1,0)₇ · horizon {kpi.days} hari · agregat seluruh area · pembaruan otomatis tiap 60 detik
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
            {/* Pita CI dibuat dari dua Area bertumpuk: basis transparan, lalu tinggi band. */}
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

      <div className="grid grid-2">
        <div className="card">
          <h2>Proyeksi per Bulan</h2>
          <table className="table">
            <thead>
              <tr><th>Bulan</th><th>Proyeksi Pendapatan</th></tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.label}>
                  <td>{m.label}</td>
                  <td>{rupiah(m.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Parameter Model per Area</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr><th>Area</th><th>AIC</th><th>BIC</th><th>RMSE</th></tr>
              </thead>
              <tbody>
                {areaRows.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{a.aic != null ? a.aic.toFixed(1) : "—"}</td>
                    <td>{a.bic != null ? a.bic.toFixed(1) : "—"}</td>
                    <td>{a.rmse != null ? compactRupiah(a.rmse) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

// ============================================
// EXPORT
// ============================================

export function AdminAnalytics() {
  return (
    <>
      <SegmentationSection />
      <ForecastSection />
    </>
  );
}
