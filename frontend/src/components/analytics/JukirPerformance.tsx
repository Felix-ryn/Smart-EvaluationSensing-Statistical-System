import { useMemo } from "react";
import { Award, Info, Target, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  clusterColor,
  fetchJukirSegmentation,
  performanceLabel,
  rupiah,
  useAutoRefresh,
} from "../../api/analytics";

const REFRESH_MS = 60_000;

function Delta({ mine, avg, higherIsBetter = true }: { mine: number; avg: number; higherIsBetter?: boolean }) {
  if (avg === 0) return <span className="text-muted">—</span>;
  const diff = ((mine - avg) / avg) * 100;
  const good = higherIsBetter ? diff >= 0 : diff <= 0;
  const sign = diff >= 0 ? "+" : "";
  return (
    <span className={good ? "badge badge-success" : "badge badge-info"}>
      {sign}{diff.toFixed(1)}% vs rata-rata cluster
    </span>
  );
}

export function JukirPerformance() {
  const { data, error, loading, empty } = useAutoRefresh(fetchJukirSegmentation, REFRESH_MS);

  const me = data?.me ?? null;
  const myStat = me ? data?.clusterStatistics[me.clusterLabel] : undefined;

  const comparisonData = useMemo(
    () => [
      { model: "GMM", silhouette: data?.silhouette?.gmm ?? 0 },
      { model: "HDBSCAN", silhouette: data?.silhouette?.hdbscan ?? 0 },
    ],
    [data],
  );

  const compositionData = useMemo(() => {
    if (!data) return [] as Array<{ name: string; value: number; color: string }>;
    const map = new Map<number, number>();
    for (const m of data.members) map.set(m.clusterLabel, (map.get(m.clusterLabel) ?? 0) + 1);
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([label, count]) => ({
        name: label === -1 ? "Noise" : `C${label}`,
        value: count,
        color: label === -1 ? "#9ca3af" : clusterColor(label),
      }));
  }, [data]);

  const roster = useMemo(() => {
    if (!data) return [];
    return [...data.members].sort(
      (a, b) => a.clusterLabel - b.clusterLabel || b.dailyEarnings - a.dailyEarnings,
    );
  }, [data]);

  const tips = useMemo(() => {
    if (!me || !myStat) return [];
    const out: { ok: boolean; text: string }[] = [];
    out.push(
      me.punctualityPercent >= myStat.avgPunctuality
        ? { ok: true, text: "Ketepatan waktu Anda sudah di atas atau setara rata-rata cluster." }
        : { ok: false, text: "Ketepatan waktu masih di bawah rata-rata cluster — usahakan datang sesuai jadwal." },
    );
    out.push(
      me.dailyEarnings >= myStat.avgEarnings
        ? { ok: true, text: "Penghasilan harian Anda di atas atau setara rata-rata cluster." }
        : { ok: false, text: "Penghasilan harian di bawah rata-rata cluster — perhatikan jam ramai area Anda." },
    );
    out.push(
      me.workConsistency <= myStat.avgConsistency
        ? { ok: true, text: "Jam kerja Anda cukup konsisten dibanding rekan satu cluster." }
        : { ok: false, text: "Jam kerja Anda cukup berfluktuasi — jadwal yang lebih teratur akan membantu." },
    );
    if (me.clusterLabel === -1) {
      out.push({ ok: false, text: "Anda teridentifikasi sebagai outlier (noise). Disarankan evaluasi pola jam hadir dan konsistensi jam kerja." });
    }
    return out;
  }, [me, myStat]);

  if (loading) return <div className="card"><div className="loading">Memuat kinerja...</div></div>;

  if (empty) {
    return (
      <div className="card">
        <h2><Award className="title-icon" size={20} strokeWidth={1.8} /> Kinerja Saya</h2>
        <div className="alert alert-danger">
          <Info size={14} strokeWidth={2} /> Belum ada hasil analisis kinerja. Hubungi admin untuk menjalankan segmentasi.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h2><Award className="title-icon" size={20} strokeWidth={1.8} /> Kinerja Saya</h2>
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      <div className="card">
        <h2><Award className="title-icon" size={20} strokeWidth={1.8} /> Segmentasi Kinerja Jukir</h2>
        <p className="text-muted">
          {data.totalJukir} jukir dianalisis · {new Date(data.analyzedDate).toLocaleDateString("id-ID", { dateStyle: "long" })}
          {" · pembaruan otomatis tiap 60 detik"} · model terpilih: <strong>{(data.selectedModel ?? "gmm").toUpperCase()}</strong>
        </p>
      </div>

      <div className="grid grid-kpi">
        <div className="card card-stat"><div className="stat-content"><span className="stat-label">Silhouette GMM</span><span className="stat-value">{data.silhouette?.gmm != null ? data.silhouette.gmm.toFixed(3) : "—"}</span></div></div>
        <div className="card card-stat"><div className="stat-content"><span className="stat-label">Silhouette HDBSCAN</span><span className="stat-value">{data.silhouette?.hdbscan != null ? data.silhouette.hdbscan.toFixed(3) : "—"}</span></div></div>
        <div className="card card-stat"><div className="stat-content"><span className="stat-label">Noise (cluster -1)</span><span className="stat-value">{data.noiseCount ?? 0}</span></div></div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Perbandingan Model</h2>
          <p className="text-muted">Silhouette score lebih tinggi berarti pemisahan cluster lebih baik.</p>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={comparisonData} margin={{ top: 8, right: 18, left: 10, bottom: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8F0F2" vertical={false} />
              <XAxis dataKey="model" />
              <YAxis domain={[0, 1]} tickFormatter={(v) => Number(v).toFixed(1)} />
              <Tooltip formatter={(v) => Number(v).toFixed(3)} />
              <Bar dataKey="silhouette" fill="#0066cc" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2>Komposisi Cluster</h2>
          <p className="text-muted">Distribusi anggota cluster secara ringkas.</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={compositionData} dataKey="value" nameKey="name" innerRadius={38} outerRadius={62} paddingAngle={2}>
                {compositionData.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v, n) => [`${v} jukir`, String(n)]} />
              <Legend verticalAlign="bottom" height={26} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {!me ? (
        <div className="card">
          <div className="alert alert-danger">
            <Info size={14} strokeWidth={2} /> Anda belum masuk dalam hasil analisis terakhir.
            Data kehadiran Anda mungkin belum cukup pada periode tersebut.
          </div>
        </div>
      ) : (
        <>
          {/* Kartu utama */}
          <div className="grid grid-kpi">
            <div className="card card-stat">
              <div
                className="icon-container"
                style={{ background: clusterColor(me.clusterLabel), color: "#fff" }}
              >
                <Target size={20} strokeWidth={1.8} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Segmen Saya</span>
                <span className="stat-value">Cluster {me.clusterLabel}</span>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  Peringkat {me.rank} dari {me.clusterSize} ·{" "}
                  {performanceLabel(me.dailyEarnings, me.punctualityPercent)}
                </span>
              </div>
            </div>

            <div className="card card-stat">
              <div className="icon-container icon-success"><TrendingUp size={20} strokeWidth={1.8} /></div>
              <div className="stat-content">
                <span className="stat-label">Penghasilan / Hari</span>
                <span className="stat-value">{rupiah(me.dailyEarnings)}</span>
                {myStat && <Delta mine={me.dailyEarnings} avg={myStat.avgEarnings} />}
              </div>
            </div>

            <div className="card card-stat">
              <div className="icon-container icon-info"><Target size={20} strokeWidth={1.8} /></div>
              <div className="stat-content">
                <span className="stat-label">Ketepatan Waktu</span>
                <span className="stat-value">{me.punctualityPercent.toFixed(1)}%</span>
                {myStat && <Delta mine={me.punctualityPercent} avg={myStat.avgPunctuality} />}
              </div>
            </div>

            <div className="card card-stat">
              <div className="icon-container icon-warning"><Info size={20} strokeWidth={1.8} /></div>
              <div className="stat-content">
                <span className="stat-label">Konsistensi Jam Kerja</span>
                <span className="stat-value">{me.workConsistency.toFixed(2)}</span>
                {myStat && (
                  <Delta mine={me.workConsistency} avg={myStat.avgConsistency} higherIsBetter={false} />
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Rekomendasi untuk Anda</h2>
            <ul style={{ lineHeight: 1.9, paddingLeft: 18 }}>
              {tips.map((t, i) => (
                <li key={i}>
                  <span className={t.ok ? "badge badge-success" : "badge badge-info"}>
                    {t.ok ? "Baik" : "Perlu perhatian"}
                  </span>{" "}
                  {t.text}
                </li>
              ))}
            </ul>
            <p className="text-muted" style={{ fontSize: 12, marginTop: 12 }}>
              Hasil segmentasi ini adalah sinyal pembinaan (bukan penilaian final). Keyakinan penempatan Anda: {(me.gmmProbability * 100).toFixed(0)}%.
            </p>
          </div>
        </>
      )}

      {/* Daftar seluruh jukir */}
      <div className="card">
        <h2>Perbandingan Seluruh Jukir</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Cluster</th>
                <th>Penghasilan/hari</th>
                <th>Konsistensi</th>
                <th>Ketepatan Waktu</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((m) => {
                const isMe = me?.jukirId === m.jukirId;
                return (
                  <tr key={m.id} style={isMe ? { background: "rgba(0,102,204,0.08)", fontWeight: 600 } : undefined}>
                    <td>{m.name}{isMe && " (Anda)"}</td>
                    <td>
                      <span className="badge" style={{ background: clusterColor(m.clusterLabel), color: "#fff" }}>
                        {m.clusterLabel}
                      </span>
                    </td>
                    <td>{rupiah(m.dailyEarnings)}</td>
                    <td>{m.workConsistency.toFixed(2)}</td>
                    <td>{m.punctualityPercent.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
