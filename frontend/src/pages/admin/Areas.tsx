import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface Area {
  id: string;
  name: string;
  location: string;
  vehicleType: string;
  capacity: number;
  activeVehicles: number;
  available: number;
  status: string;
}

export function Areas() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  // Form tambah area
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [vehicleType, setVehicleType] = useState("motorcycle");
  const [capacity, setCapacity] = useState(50);

  const load = () =>
    api
      .get("/areas")
      .then(({ data }) => setAreas(data.data))
      .catch((err) => setError(err.response?.data?.message ?? "Gagal memuat"))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  async function addArea(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/areas", { name, location, vehicleType, capacity: Number(capacity) });
      setName("");
      setLocation("");
      setCapacity(50);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Gagal menambah area");
    }
  }

  async function updateCapacity(id: string, newCapacity: number) {
    await api.patch(`/areas/${id}`, { capacity: newCapacity });
    load();
  }

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "crimson" }}>{error}</p>;

  return (
    <div>
      <div className="page-header">Area Parkir</div>

      <div className="card" style={{ marginBottom: 16, maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>Tambah Area</h3>
        <form onSubmit={addArea} style={{ display: "grid", gap: 10 }}>
          <input placeholder="Nama area (mis. Area D)" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Lokasi (mis. Jl. Thamrin No. 5)" value={location} onChange={(e) => setLocation(e.target.value)} />
          <select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
            <option value="motorcycle">Motor</option>
            <option value="car">Mobil</option>
          </select>
          <input
            type="number"
            min={1}
            placeholder="Kapasitas"
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
          <button className="btn" disabled={!name || !location}>Tambah</button>
        </form>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {areas.map((a) => (
          <div key={a.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0 }}>{a.name}</h3>
                <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>
                  {a.location} · {a.vehicleType === "motorcycle" ? "Motor" : "Mobil"}
                </p>
              </div>
              <span className={`badge ${a.status === "ACTIVE" ? "badge-success" : "badge-danger"}`}>{a.status}</span>
            </div>
            <p style={{ margin: "10px 0 0" }}>
              Kendaraan aktif: <strong>{a.activeVehicles}</strong> · Tersedia:{" "}
              <strong>{a.available}</strong> / {a.capacity}
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <label style={{ fontSize: 13, color: "var(--muted)" }}>Kapasitas:</label>
              <input
                type="number"
                min={1}
                defaultValue={a.capacity}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v > 0 && v !== a.capacity) updateCapacity(a.id, v);
                }}
                style={{ width: 90 }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
