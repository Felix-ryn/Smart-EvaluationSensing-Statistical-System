import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Car, CheckCircle2, Gauge, MapPin } from "lucide-react";
import { apiClient } from "../../api/client";

interface AreaRef {
  id: string;
  name: string;
  vehicleType: string;
  capacity: number;
}

interface LiveTrafficItem {
  areaId: string;
  areaName: string;
  capacity: number;
  currentOccupancy: number;
  emptySlots: number;
  occupancyRate: number;
  vehicleType: string;
  recentActivity?: Array<{
    id: string;
    transactionCode: string;
    status: string;
    amount?: number | null;
    createdAt: string;
  }>;
  lastUpdated?: string;
}

const clampRate = (n: number) => Math.max(0, Math.min(100, n));

export function AdminLiveTraffic() {
  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState<LiveTrafficItem[]>([]);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

  useEffect(() => {
    fetchAllTraffic();
    const interval = setInterval(fetchAllTraffic, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchAllTraffic = async () => {
    try {
      setLoading(true);
      const areasRes = await apiClient.get("/areas");
      const areaRefs: AreaRef[] = areasRes.data.data ?? [];

      const results = await Promise.all(
        areaRefs.map(async (a) => {
          try {
            const response = await apiClient.get(`/jukir/live-traffic/${a.id}`);
            if (response.data.success) return response.data.data as LiveTrafficItem;
          } catch {
            return {
              areaId: a.id,
              areaName: a.name,
              capacity: a.capacity,
              currentOccupancy: 0,
              emptySlots: a.capacity,
              occupancyRate: 0,
              vehicleType: a.vehicleType,
              recentActivity: [],
            } as LiveTrafficItem;
          }
          return null;
        }),
      );

      const valid = results.filter((r): r is LiveTrafficItem => r !== null);
      setAreas(valid);
      setSelectedArea((prev) => prev ?? valid[0]?.areaId ?? null);
    } finally {
      setLoading(false);
    }
  };

  const selectedAreaData = selectedArea ? areas.find((a) => a.areaId === selectedArea) : undefined;

  const summary = useMemo(() => {
    const totalCapacity = areas.reduce((s, a) => s + a.capacity, 0);
    const totalOccupied = areas.reduce((s, a) => s + a.currentOccupancy, 0);
    const avgOccupancy = totalCapacity > 0 ? (totalOccupied / totalCapacity) * 100 : 0;
    const criticalAreas = areas.filter((a) => a.occupancyRate >= 80).length;
    return { totalCapacity, totalOccupied, avgOccupancy, criticalAreas };
  }, [areas]);

  const getOccupancyTone = (rate: number) => {
    if (rate >= 80) return { label: "Kritis", color: "#E65B63", chip: "badge-danger" };
    if (rate >= 50) return { label: "Padat", color: "#E7A33E", chip: "badge-warning" };
    return { label: "Lancar", color: "#009B83", chip: "badge-success" };
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1><Activity className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" /> Live Traffic Monitor</h1>
        <p>Monitoring okupansi area parkir secara real-time per 15 detik.</p>
      </header>

      <div className="grid grid-kpi">
        <div className="card card-stat">
          <div className="icon-container icon-info"><Car size={20} strokeWidth={1.8} /></div>
          <div className="stat-content">
            <span className="stat-label">Total Kapasitas</span>
            <span className="stat-value">{summary.totalCapacity}</span>
          </div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-warning"><Gauge size={20} strokeWidth={1.8} /></div>
          <div className="stat-content">
            <span className="stat-label">Total Terisi</span>
            <span className="stat-value">{summary.totalOccupied}</span>
          </div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-success"><CheckCircle2 size={20} strokeWidth={1.8} /></div>
          <div className="stat-content">
            <span className="stat-label">Rata-rata Okupansi</span>
            <span className="stat-value">{summary.avgOccupancy.toFixed(1)}%</span>
          </div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-warning"><AlertTriangle size={20} strokeWidth={1.8} /></div>
          <div className="stat-content">
            <span className="stat-label">Area Kritis</span>
            <span className="stat-value">{summary.criticalAreas}</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card"><div className="loading">Loading live data...</div></div>
      ) : (
        <>
          <div className="grid grid-2">
            {areas.map((area) => {
              const tone = getOccupancyTone(area.occupancyRate);
              return (
                <div
                  key={area.areaId}
                  className={`card area-card ${selectedArea === area.areaId ? "active" : ""}`}
                  onClick={() => setSelectedArea(area.areaId)}
                >
                  <div className="area-header">
                    <h2>{area.areaName}</h2>
                    <span className={`badge ${tone.chip}`}>{tone.label}</span>
                  </div>
                  <p className="text-muted">{area.vehicleType === "motorcycle" ? "Motor" : "Mobil"}</p>
                  <div className="area-stats">
                    <div className="stat-item"><div className="stat-label">Kapasitas</div><div className="stat-value">{area.capacity}</div></div>
                    <div className="stat-item"><div className="stat-label">Terisi</div><div className="stat-value">{area.currentOccupancy}</div></div>
                    <div className="stat-item"><div className="stat-label">Kosong</div><div className="stat-value">{area.emptySlots}</div></div>
                  </div>

                  <div className="live-traffic-meter">
                    <div
                      className="live-traffic-fill"
                      style={{ width: `${clampRate(area.occupancyRate)}%`, backgroundColor: tone.color }}
                    />
                    <span>{clampRate(area.occupancyRate)}%</span>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedAreaData && (
            <div className="card mt-4">
              <h2><MapPin className="title-icon" size={18} strokeWidth={1.8} /> Detail Area - {selectedAreaData.areaName}</h2>
              <div className="grid grid-kpi">
                <div className="card card-stat" style={{ marginBottom: 0 }}>
                  <div className="stat-content">
                    <span className="stat-label">Status Trafik</span>
                    <span className="stat-value" style={{ fontSize: "1.15rem" }}>{getOccupancyTone(selectedAreaData.occupancyRate).label}</span>
                  </div>
                </div>
                <div className="card card-stat" style={{ marginBottom: 0 }}>
                  <div className="stat-content">
                    <span className="stat-label">Kapasitas Terpakai</span>
                    <span className="stat-value" style={{ fontSize: "1.15rem" }}>
                      {selectedAreaData.currentOccupancy}/{selectedAreaData.capacity}
                    </span>
                  </div>
                </div>
                <div className="card card-stat" style={{ marginBottom: 0 }}>
                  <div className="stat-content">
                    <span className="stat-label">Last Updated</span>
                    <span className="stat-value" style={{ fontSize: "1.15rem" }}>
                      {selectedAreaData.lastUpdated
                        ? new Date(selectedAreaData.lastUpdated).toLocaleTimeString("id-ID")
                        : "-"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="live-traffic-detail-chart mt-4">
                <div className="detail-chart-row">
                  <span>Terisi</span>
                  <div className="detail-chart-track">
                    <div
                      className="detail-chart-fill detail-chart-filled"
                      style={{ width: `${clampRate(selectedAreaData.occupancyRate)}%` }}
                    />
                  </div>
                  <strong>{selectedAreaData.currentOccupancy}</strong>
                </div>
                <div className="detail-chart-row">
                  <span>Kosong</span>
                  <div className="detail-chart-track">
                    <div
                      className="detail-chart-fill detail-chart-empty"
                      style={{
                        width: `${clampRate((selectedAreaData.emptySlots / Math.max(1, selectedAreaData.capacity)) * 100)}%`,
                      }}
                    />
                  </div>
                  <strong>{selectedAreaData.emptySlots}</strong>
                </div>
              </div>

              <div className="table-wrap mt-4">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Kode Transaksi</th>
                      <th>Status</th>
                      <th>Nominal</th>
                      <th>Waktu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedAreaData.recentActivity ?? []).length === 0 ? (
                      <tr><td colSpan={4} className="text-center text-muted">Belum ada aktivitas terbaru.</td></tr>
                    ) : (
                      (selectedAreaData.recentActivity ?? []).map((a) => (
                        <tr key={a.id}>
                          <td>{a.transactionCode}</td>
                          <td><span className={`badge ${a.status === "ACTIVE" ? "badge-warning" : "badge-success"}`}>{a.status}</span></td>
                          <td>{a.amount ? `Rp ${a.amount.toLocaleString("id-ID")}` : "-"}</td>
                          <td>{new Date(a.createdAt).toLocaleString("id-ID")}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
