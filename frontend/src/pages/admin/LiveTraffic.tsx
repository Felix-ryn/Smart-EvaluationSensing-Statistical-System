import { useState, useEffect } from "react";
import { Activity, AlertTriangle, Check, Hourglass, Info, MapPin } from "lucide-react";
import { apiClient } from "../../api/client";

interface LiveTrafficItem {
  areaId: string;
  areaName: string;
  capacity: number;
  currentOccupancy: number;
  emptySlots: number;
  occupancyRate: number;
  vehicleType: string;
}

export function AdminLiveTraffic() {
  const [loading, setLoading] = useState(true);
  const [areas, setAreas] = useState<LiveTrafficItem[]>([]);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

  const areaIds = ["area-a", "area-b", "area-c"];

  useEffect(() => {
    fetchAllTraffic();
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchAllTraffic, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchAllTraffic = async () => {
    try {
      setLoading(true);
      const results = await Promise.all(
        areaIds.map(async (areaId) => {
          try {
            const response = await apiClient.get(`/jukir/live-traffic/${areaId}`);
            if (response.data.success) {
              return response.data.data;
            }
          } catch (error) {
            console.error(`Error fetching ${areaId}:`, error);
          }
          return null;
        })
      );

      const validResults = results.filter((r): r is LiveTrafficItem => r !== null);
      setAreas(validResults);
    } catch (error) {
      console.error("Error fetching live traffic:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectedAreaData = selectedArea ? areas.find((a) => a.areaId === selectedArea) : undefined;
  const selectedOccupancy = selectedAreaData?.occupancyRate ?? 0;

  const getOccupancyColor = (rate: number) => {
    if (rate >= 80) return "#E65B63"; // Danger red
    if (rate >= 50) return "#E7A33E"; // Warning yellow
    return "#009B83"; // Success teal
  };

  const handleSelectArea = (areaId: string) => {
    setSelectedArea(areaId === selectedArea ? null : areaId);
  };

  const formatCurrency = (amount?: number) => {
    if (amount == null) return "-";
    return `Rp ${amount.toLocaleString("id-ID")}`;
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1><Activity className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" /> Live Traffic Monitor</h1>
        <p>Real-time monitoring aktivitas per area parking</p>
      </header>

      {loading ? (
        <div className="card"><div className="loading">Loading live data...</div></div>
      ) : (
        <>
          {/* Area Grid */}
          <div className="grid grid-2">
            {areas.map((area) => (
              <div 
                key={area.areaId}
                className={`card area-card ${selectedArea === area.areaId ? "active" : ""}`}
                onClick={() => handleSelectArea(area.areaId)}
              >
                <div className="area-header">
                  <h2>{area.areaName}</h2>
                  <span
                    className="status-indicator"
                    style={{ backgroundColor: getOccupancyColor(area.occupancyRate) }}
                    aria-hidden="true"
                  />
                </div>

                <div className="area-stats">
                  <div className="stat-item">
                    <div className="stat-label">Kapasitas</div>
                    <div className="stat-value">{area.capacity}</div>
                  </div>
                  
                  <div className="stat-item">
                    <div className="stat-label">Terisi</div>
                    <div className="stat-value">{area.currentOccupancy}</div>
                  </div>
                  
                  <div className="stat-item">
                    <div className="stat-label">Tersedia</div>
                    <div className="stat-value">{area.emptySlots}</div>
                  </div>
                </div>

                <div className="area-progress">
                  <div 
                    className="progress-bar-area"
                    style={{ 
                      width: `${area.occupancyRate}%`,
                      backgroundColor: getOccupancyColor(area.occupancyRate)
                    }}
                  />
                  <div className="occupancy-badge">{area.occupancyRate}%</div>
                </div>

                <div className="area-location">
                  <MapPin size={14} strokeWidth={1.8} aria-hidden="true" /> {area.vehicleType === 'motorcycle' ? 'Motor' : 'Mobil'}
                </div>
              </div>
            ))}
          </div>

          {/* Selected Area Details */}
          {selectedArea && (
            <div className="card mt-4">
              <h2>Details - {selectedAreaData?.areaName}</h2>
              
              <div className="details-grid">
                <div className="detail-item">
                  <strong>Status:</strong>
                  <span className="badge" style={{ 
                    backgroundColor: getOccupancyColor(selectedOccupancy)
                  }}>
                    {selectedOccupancy >= 80 ? (
                      <><AlertTriangle size={14} strokeWidth={2} aria-hidden="true" /> Hampir Penuh</>
                    ) : selectedOccupancy >= 50 ? (
                      <><Hourglass size={14} strokeWidth={2} aria-hidden="true" /> Normal</>
                    ) : (
                      <><Check size={14} strokeWidth={2.4} aria-hidden="true" /> Tersedia</>
                    )}
                  </span>
                </div>

                <div className="detail-item">
                  <strong>Last Updated:</strong>
                  <span>Just now</span>
                </div>

                <div className="detail-item">
                  <strong>Capacity Status:</strong>
                  <span>
                    {selectedAreaData?.currentOccupancy ?? 0}/{selectedAreaData?.capacity ?? 0}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="info-box mt-4">
            <h3><Info className="title-icon" size={16} strokeWidth={1.8} aria-hidden="true" /> Legend</h3>
            <div className="legend-items">
              <div className="legend-item">
                <div style={{ backgroundColor: "#009B83" }} className="legend-color"></div>
                <span>Tersedia (&lt;50%)</span>
              </div>
              <div className="legend-item">
                <div style={{ backgroundColor: "#E7A33E" }} className="legend-color"></div>
                <span>Berisi (50-80%)</span>
              </div>
              <div className="legend-item">
                <div style={{ backgroundColor: "#E65B63" }} className="legend-color"></div>
                <span>Hampir Penuh (&gt;80%)</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
