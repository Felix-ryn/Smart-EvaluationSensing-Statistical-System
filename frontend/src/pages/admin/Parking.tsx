import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface Slot {
  id: string;
  slotCode: string;
  slotType: string;
  status: "AVAILABLE" | "OCCUPIED" | "MAINTENANCE";
}
interface Location {
  id: string;
  name: string;
  address: string;
  slots: Slot[];
}

const badgeClass = (s: Slot["status"]) =>
  s === "AVAILABLE" ? "badge-success" : s === "OCCUPIED" ? "badge-warning" : "badge-danger";

export function Parking() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // /api/parking lists locations; fetch each location's slots in parallel.
    api
      .get("/parking")
      .then(async ({ data }) => {
        const details = await Promise.all(
          data.data.map((l: { id: string }) => api.get(`/parking/${l.id}`).then((r) => r.data.data)),
        );
        setLocations(details);
      })
      .catch((err) => setError(err.response?.data?.message ?? "Gagal memuat"))
      .finally(() => setLoading(false));
  }, []);

  async function changeStatus(locId: string, slot: Slot, status: Slot["status"]) {
    await api.patch(`/parking/slots/${slot.id}/status`, { status });
    setLocations((locs) =>
      locs.map((l) =>
        l.id !== locId ? l : { ...l, slots: l.slots.map((s) => (s.id === slot.id ? { ...s, status } : s)) },
      ),
    );
  }

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "crimson" }}>{error}</p>;

  return (
    <div>
      <div className="page-header">Parking Management</div>
      {locations.map((loc) => (
        <div key={loc.id} className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 4px" }}>{loc.name}</h3>
          <p style={{ margin: "0 0 12px", color: "var(--muted)" }}>{loc.address}</p>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
            {loc.slots.map((s) => (
              <div key={s.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>{s.slotCode}</strong>
                  <span className={`badge ${badgeClass(s.status)}`}>{s.status}</span>
                </div>
                <select
                  value={s.status}
                  onChange={(e) => changeStatus(loc.id, s, e.target.value as Slot["status"])}
                  style={{ marginTop: 8, width: "100%" }}
                >
                  <option value="AVAILABLE">AVAILABLE</option>
                  <option value="OCCUPIED">OCCUPIED</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
