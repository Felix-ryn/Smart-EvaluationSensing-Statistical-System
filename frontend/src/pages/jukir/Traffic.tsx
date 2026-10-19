import { useState, useEffect } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock, FileText, Hourglass, ParkingSquare } from "lucide-react";
import { apiClient } from "../../api/client";

export function JukirTraffic() {
  const [loading, setLoading] = useState(true);
  const [trafficData, setTrafficData] = useState<any>(null);

  useEffect(() => {
    // For now, fetch all areas and let Jurik select theirs
    // In production, would auto-select based on user's areaId
    fetchTraffic("area-a");
  }, []);

  const fetchTraffic = async (areaId: string) => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/jukir/live-traffic/${areaId}`);
      if (response.data.success) {
        setTrafficData(response.data.data);
      }
    } catch (error) {
      console.error("Error fetching live traffic:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !trafficData) {
    return <div className="page"><div className="loading">Loading live traffic...</div></div>;
  }

  const occupancyRate = trafficData.occupancyRate;
  const isFull = occupancyRate >= 80;
  const isWarning = occupancyRate >= 50 && occupancyRate < 80;
  const isNormal = occupancyRate < 50;

  const getOccupancyColor = () => {
    if (isFull) return "#E65B63"; // Danger red
    if (isWarning) return "#E7A33E"; // Warning yellow
    return "#009B83"; // Success teal
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1><Activity className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" /> Live Traffic - Area {trafficData.areaName}</h1>
        <p>Monitoring real-time traffic area yang Anda tangani</p>
      </header>

      {/* Overview Cards */}
      <div className="grid grid-kpi">
        <div className="card card-stat">
          <div className="icon-container icon-info"><ParkingSquare size={20} strokeWidth={1.8} aria-hidden="true" /></div>
          <div className="stat-content">
            <span className="stat-label">Kapasitas Total</span>
            <span className="stat-value">{trafficData.capacity}</span>
          </div>
        </div>

        <div className="card card-stat">
          <div className="icon-container icon-warning"><Hourglass size={20} strokeWidth={1.8} aria-hidden="true" /></div>
          <div className="stat-content">
            <span className="stat-label">Terisi</span>
            <span className="stat-value">{trafficData.currentOccupancy}</span>
          </div>
        </div>

        <div className="card card-stat">
          <div className="icon-container icon-success"><CheckCircle2 size={20} strokeWidth={1.8} aria-hidden="true" /></div>
          <div className="stat-content">
            <span className="stat-label">Tersedia</span>
            <span className="stat-value">{trafficData.emptySlots}</span>
          </div>
        </div>
      </div>

      {/* Main Visual */}
      <div className="grid grid-2 mt-4">
        {/* Left - Occupancy Bar */}
        <div className="card">
          <h2>Kapasitas Area</h2>
          
          <div className="occupancy-display">
            <div className="capacity-progress">
              <div 
                className="progress-fill" 
                style={{ 
                  width: `${occupancyRate}%`,
                  backgroundColor: getOccupancyColor()
                }}
              />
            </div>
            
            <div className="occupancy-stats">
              <div className="stat-big">
                <span>{trafficData.currentOccupancy}/{trafficData.capacity}</span>
                <small>terisi</small>
              </div>
              
              <div className="percentage-badge">
                {occupancyRate}%
              </div>
            </div>

            {isFull && (
              <div className="alert alert-danger">
                <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" /> Area hampir penuh! Kapasitas mencapai {occupancyRate}%
              </div>
            )}
          </div>

          <div className="mt-6">
            <h3>Informasi Area</h3>
            <div className="info-row">
              <strong>Lokasi:</strong>
              <span>{trafficData.location}</span>
            </div>
            <div className="info-row">
              <strong>Tipe Kendaraan:</strong>
              <span className="badge badge-secondary">{trafficData.vehicleType === 'motorcycle' ? 'Motorcycle' : 'Car'}</span>
            </div>
          </div>
        </div>

        {/* Right - Recent Activity Feed */}
        <div className="card">
          <h2>Recent Activity</h2>
          <p className="text-muted mb-4">
            Updated: {new Date(trafficData.lastUpdated).toLocaleTimeString("id-ID")}
          </p>
          
          <div className="activity-feed">
            {trafficData.recentActivity.length > 0 ? (
              <div className="activity-list">
                {trafficData.recentActivity.slice(0, 10).map((activity: any, idx: number) => (
                  <div key={idx} className="activity-item">
                    <div className="activity-icon">
                      {activity.status === "ACTIVE" ? (
                        <Clock size={16} strokeWidth={1.8} aria-hidden="true" />
                      ) : activity.checkOut ? (
                        <CheckCircle2 size={16} strokeWidth={1.8} aria-hidden="true" />
                      ) : (
                        <FileText size={16} strokeWidth={1.8} aria-hidden="true" />
                      )}
                    </div>
                    <div className="activity-content">
                      <div className="activity-title">
                        {activity.transactionCode}
                        <span className={`status-badge ${activity.status.toLowerCase()}`}>
                          {activity.status}
                        </span>
                      </div>
                      <div className="activity-time">
                        {activity.checkOut 
                          ? `Check-in: ${new Date(activity.checkIn).toLocaleTimeString("id-ID")}`
                          : `Check-in: ${new Date(activity.checkIn).toLocaleTimeString("id-ID")}`
                        }
                      </div>
                      {activity.amount && (
                        <div className="activity-amount">
                          Rp {activity.amount.toLocaleString("id-ID")}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data text-center">
                Tidak ada aktivitas terkini
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
