import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface Notif {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  user?: { name: string; email: string } | null;
}

export function Notifications() {
  const [items, setItems] = useState<Notif[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/notifications")
      .then(({ data }) => setItems(data.data))
      .catch((err) => setError(err.response?.data?.message ?? "Gagal memuat"))
      .finally(() => setLoading(false));
  }, []);

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`);
    setItems((list) => list.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  }

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "crimson" }}>{error}</p>;

  return (
    <div>
      <div className="page-header">Notifications</div>
      <div style={{ display: "grid", gap: 10 }}>
        {items.map((n) => (
          <div key={n.id} className="card" style={{ opacity: n.isRead ? 0.6 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span className="badge badge-info" style={{ marginRight: 8 }}>{n.type}</span>
                <strong>{n.title}</strong>
                {!n.isRead && <span className="badge badge-warning" style={{ marginLeft: 8 }}>baru</span>}
              </div>
              {!n.isRead && (
                <button className="btn" onClick={() => markRead(n.id)}>
                  Tandai dibaca
                </button>
              )}
            </div>
            <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>{n.message}</p>
            <small style={{ color: "#9ca3af" }}>
              {n.user ? `${n.user.name} · ` : ""}
              {new Date(n.createdAt).toLocaleString("id-ID")}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}
