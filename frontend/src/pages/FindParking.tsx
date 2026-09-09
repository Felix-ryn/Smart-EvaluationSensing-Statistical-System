import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

interface Location {
  id: string;
  name: string;
  address: string;
  totalSlots: number;
  availableSlots: number;
}

export function FindParking() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/parking")
      .then(({ data }) => setLocations(data.data))
      .catch((err) => setError(err.response?.data?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "crimson" }}>{error} — <Link to="/login">login?</Link></p>;

  return (
    <div>
      <h1>Find Parking</h1>
      {locations.length === 0 && <p>No parking locations available.</p>}
      <div style={{ display: "grid", gap: 12 }}>
        {locations.map((loc) => (
          <div key={loc.id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16 }}>
            <h3 style={{ margin: 0 }}>{loc.name}</h3>
            <p style={{ margin: "4px 0", color: "#666" }}>{loc.address}</p>
            <p style={{ margin: 0 }}>
              <strong>{loc.availableSlots}</strong> / {loc.totalSlots} slot tersedia
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
