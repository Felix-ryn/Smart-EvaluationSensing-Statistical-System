import { useEffect, useState } from "react";
import { api } from "../../api/client";

interface User {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "USER";
  status: "ACTIVE" | "BLOCKED";
  createdAt: string;
  _count: { sessions: number; vehicles: number };
}

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", borderBottom: "2px solid #e5e7eb", fontSize: 13, color: "#6b7280" };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #f0f0f0" };

export function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () =>
    api
      .get("/users")
      .then(({ data }) => setUsers(data.data))
      .catch((err) => setError(err.response?.data?.message ?? "Gagal memuat"))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  async function toggle(u: User) {
    const status = u.status === "ACTIVE" ? "BLOCKED" : "ACTIVE";
    await api.patch(`/users/${u.id}/status`, { status });
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, status } : x)));
  }

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: "crimson" }}>{error}</p>;

  return (
    <div>
      <div className="page-header">User Management</div>
      <div className="card">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Nama</th>
              <th style={th}>Email</th>
              <th style={th}>Role</th>
              <th style={th}>Sesi</th>
              <th style={th}>Status</th>
              <th style={th}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={td}>{u.name}</td>
                <td style={td}>{u.email}</td>
                <td style={td}>{u.role}</td>
                <td style={td}>{u._count.sessions}</td>
                <td style={td}>
                  <span className={`badge ${u.status === "ACTIVE" ? "badge-success" : "badge-danger"}`}>
                    {u.status}
                  </span>
                </td>
                <td style={td}>
                  {u.role === "ADMIN" ? (
                    <span style={{ color: "#9ca3af" }}>—</span>
                  ) : (
                    <button className="btn" onClick={() => toggle(u)}>
                      {u.status === "ACTIVE" ? "Block" : "Unblock"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
