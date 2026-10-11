import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Fix Leaflet default marker icons under Vite bundling (paths break otherwise).
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export interface MapArea {
  id: string;
  name: string;
  location: string;
  vehicleType: string;
  capacity: number;
  available: number;
  latitude?: number | null;
  longitude?: number | null;
}

interface ParkingMapProps {
  areas: MapArea[];
  center?: [number, number];
  zoom?: number;
  height?: number;
}

// Fallback: pusat kota Surabaya bila tak ada koordinat area.
const DEFAULT_CENTER: [number, number] = [-7.2512, 112.7553];

export function ParkingMap({ areas, center, zoom = 17, height = 360 }: ParkingMapProps) {
  const located = areas.filter(
    (a): a is MapArea & { latitude: number; longitude: number } =>
      a.latitude != null && a.longitude != null,
  );

  const mapCenter =
    center ??
    (located.length
      ? [
          located.reduce((s, a) => s + a.latitude, 0) / located.length,
          located.reduce((s, a) => s + a.longitude, 0) / located.length,
        ]
      : DEFAULT_CENTER);

  return (
    <MapContainer
      center={mapCenter as [number, number]}
      zoom={zoom}
      scrollWheelZoom
      style={{ height, width: "100%", borderRadius: 12 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {located.map((a) => (
        <Marker key={a.id} position={[a.latitude, a.longitude]}>
          <Popup>
            <strong>{a.name}</strong>
            <br />
            {a.location}
            <br />
            Tersedia {a.available}/{a.capacity} (
            {a.vehicleType === "motorcycle" ? "motor" : "mobil"})
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
