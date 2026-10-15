import { useEffect, useMemo, useState } from "react";
import { Layers, MapPin, Plus } from "lucide-react";
import { api } from "../../api/client";

type AreaStatus = "ACTIVE" | "INACTIVE" | "MAINTENANCE";

interface Area {
  id: string;
  name: string;
  location: string;
  vehicleType: string;
  capacity: number;
  activeVehicles: number;
  available: number;
  status: AreaStatus;
  latitude?: number | null;
  longitude?: number | null;
}

const statusBadgeClass: Record<AreaStatus, string> = {
  ACTIVE: "badge-success",
  INACTIVE: "badge-secondary",
  MAINTENANCE: "badge-warning",
};

export function Areas() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [vehicleType, setVehicleType] = useState("motorcycle");
  const [capacity, setCapacity] = useState(50);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const load = async () => {
    try {
      setError("");
      const { data } = await api.get("/areas");
      setAreas(data.data ?? []);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Gagal memuat area parkir");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    const totalCapacity = areas.reduce((s, a) => s + a.capacity, 0);
    const totalFilled = areas.reduce((s, a) => s + a.activeVehicles, 0);
    const totalEmpty = areas.reduce((s, a) => s + a.available, 0);
    return { totalCapacity, totalFilled, totalEmpty, totalAreas: areas.length };
  }, [areas]);

  async function addArea(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !location) return;

    const parsedLat = latitude.trim() === "" ? null : Number(latitude);
    const parsedLng = longitude.trim() === "" ? null : Number(longitude);

    if (parsedLat !== null && Number.isNaN(parsedLat)) {
      setError("Latitude harus berupa angka");
      return;
    }
    if (parsedLng !== null && Number.isNaN(parsedLng)) {
      setError("Longitude harus berupa angka");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      await api.post("/areas", {
        name,
        location,
        vehicleType,
        capacity: Number(capacity),
        latitude: parsedLat,
        longitude: parsedLng,
      });

      setName("");
      setLocation("");
      setVehicleType("motorcycle");
      setCapacity(50);
      setLatitude("");
      setLongitude("");
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Gagal menambah area");
    } finally {
      setSubmitting(false);
    }
  }

  async function updateArea(id: string, data: Partial<Pick<Area, "capacity">>) {
    try {
      await api.patch(`/areas/${id}`, data);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Gagal memperbarui area");
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1><Layers className="title-icon" size={22} strokeWidth={1.8} aria-hidden="true" /> Area Parkir</h1>
        <p>Kelola area parkir, kapasitas, status, dan titik koordinat.</p>
      </header>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="grid grid-kpi">
        <div className="card card-stat">
          <div className="icon-container icon-info"><Layers size={20} strokeWidth={1.8} /></div>
          <div className="stat-content">
            <span className="stat-label">Total Area</span>
            <span className="stat-value">{summary.totalAreas}</span>
          </div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-success"><MapPin size={20} strokeWidth={1.8} /></div>
          <div className="stat-content">
            <span className="stat-label">Total Kapasitas</span>
            <span className="stat-value">{summary.totalCapacity}</span>
          </div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-warning"><MapPin size={20} strokeWidth={1.8} /></div>
          <div className="stat-content">
            <span className="stat-label">Terisi</span>
            <span className="stat-value">{summary.totalFilled}</span>
          </div>
        </div>
        <div className="card card-stat">
          <div className="icon-container icon-info"><MapPin size={20} strokeWidth={1.8} /></div>
          <div className="stat-content">
            <span className="stat-label">Kosong</span>
            <span className="stat-value">{summary.totalEmpty}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h2><Plus className="title-icon" size={18} strokeWidth={1.8} /> Tambah Area Baru</h2>
        <form onSubmit={addArea} className="areas-form-grid">
          <input className="input" placeholder="Nama area (contoh: Area D)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="Lokasi (contoh: Jl. Ahmad Yani No. 15)" value={location} onChange={(e) => setLocation(e.target.value)} />
          <select className="input" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
            <option value="motorcycle">Motor</option>
            <option value="car">Mobil</option>
          </select>
          <input className="input" type="number" min={1} placeholder="Kapasitas" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
          <input className="input" type="number" step="any" placeholder="Latitude (opsional)" value={latitude} onChange={(e) => setLatitude(e.target.value)} />
          <input className="input" type="number" step="any" placeholder="Longitude (opsional)" value={longitude} onChange={(e) => setLongitude(e.target.value)} />
          <button className="btn btn-primary" disabled={submitting || !name || !location}>
            {submitting ? "Menyimpan..." : "Tambah Area"}
          </button>
        </form>
      </div>

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Nama Area</th>
              <th>Kapasitas</th>
              <th>Terisi</th>
              <th>Kosong</th>
              <th>Status</th>
              <th>Tipe</th>
              <th>Koordinat</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center">Loading...</td></tr>
            ) : areas.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-muted">Belum ada area parkir.</td></tr>
            ) : (
              areas.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div>{a.name}</div>
                    <div className="text-muted small">{a.location}</div>
                  </td>
                  <td>
                    <input
                      className="input areas-inline-input"
                      type="number"
                      min={1}
                      defaultValue={a.capacity}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v > 0 && v !== a.capacity) updateArea(a.id, { capacity: v });
                      }}
                    />
                  </td>
                  <td>{a.activeVehicles}</td>
                  <td>{a.available}</td>
                  <td><span className={`badge ${statusBadgeClass[a.status]}`}>{a.status}</span></td>
                  <td>{a.vehicleType === "motorcycle" ? "Motor" : "Mobil"}</td>
                  <td>
                    {a.latitude != null && a.longitude != null
                      ? `${a.latitude.toFixed(5)}, ${a.longitude.toFixed(5)}`
                      : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
