import { useMemo } from "react";
import { Award, Info, Target, TrendingUp } from "lucide-react";
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
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

  /**
   * Radar perlu skala seragam, jadi tiap metrik dinormalisasi ke 0-100
   * memakai nilai maksimum di seluruh jukir sebagai acuan.
   * Konsistensi dibalik: std dev kecil = lebih baik.
   */
  const radarData = useMemo(() => {
    if (!data || !me || !myStat) return [];
    const maxEarnings = Math.max(...data.members.map((m) => m.dailyEarnings), 1);
    const maxConsistency = Math.max(...data.members.map((m) => m.workConsistency), 0.0001);

    return [
      {
        metric: "Penghasilan",
        saya: (me.dailyEarnings / maxEarnings) * 100,
        cluster: (myStat.avgEarnings / maxEarnings) * 100,
      },
      {
        metric: "Konsistensi",
        saya: (1 - me.workConsistency / maxConsistency) * 100,
        cluster: (1 - myStat.avgConsistency / maxConsistency) * 100,
      },
      {
        metric: "Ketepatan Waktu",
        saya: me.punctualityPercent,
        cluster: myStat.avgPunctuality,
      },
    ];
  }, [data, me, myStat]);

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
          {" · pembaruan otomatis tiap 60 detik"}
        </p>
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

          <div className="grid grid-2">
            {/* Radar saya vs cluster */}
            <div className="card">
              <h2>Saya vs Rata-rata Cluster</h2>
              <p className="text-muted">
                Semua metrik diskalakan 0–100. Untuk konsistensi, nilai lebih tinggi berarti jam kerja lebih stabil.
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="metric" />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} />
                  <Tooltip formatter={(v) => `${Number(v).toFixed(1)} / 100`} />
                  <Legend />
                  <Radar name="Saya" dataKey="saya" stroke="#0066cc" fill="#0066cc" fillOpacity={0.45} />
                  <Radar
                    name="Rata-rata cluster"
                    dataKey="cluster"
                    stroke="#95a5a6"
                    fill="#95a5a6"
                    fillOpacity={0.25}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Saran */}
            <div className="card">
              <h2>Catatan Peningkatan</h2>
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
                Segmentasi dihasilkan model Gaussian Mixture berdasarkan penghasilan, konsistensi jam kerja,
                dan ketepatan waktu. Keyakinan model untuk penempatan Anda: {(me.gmmProbability * 100).toFixed(0)}%.
              </p>
            </div>
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
