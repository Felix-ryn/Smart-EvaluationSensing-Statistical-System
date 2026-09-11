import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

interface Area {
  id: string;
  name: string;
  location: string;
  vehicleType: string;
  capacity: number;
  available: number;
  activeVehicles: number;
}

export function FindParking() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/areas")
      .then(({ data }) => setAreas(data.data))
      .catch((err) => setError(err.response?.data?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "crimson" }}>{error} — <Link to="/login">login?</Link></p>;

  return (
    <div>
      <h1>Find Parking</h1>
      {areas.length === 0 && <p>Belum ada area parkir tersedia.</p>}
      <div style={{ display: "grid", gap: 12 }}>
        {areas.map((a) => (
          <div key={a.id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16 }}>
            <h3 style={{ margin: 0 }}>{a.name}</h3>
            <p style={{ margin: "4px 0", color: "#666" }}>{a.location}</p>
            <p style={{ margin: 0 }}>
              Tersedia <strong>{a.available}</strong> dari {a.capacity} kapasitas{" "}
              ({a.vehicleType === "motorcycle" ? "motor" : "mobil"})
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
