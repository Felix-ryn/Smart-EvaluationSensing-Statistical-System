import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("user@sess.local");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", data.data.token);
      localStorage.setItem("user", JSON.stringify(data.data.user));
      const role = data.data.user.role;
      if (role === "ADMIN") nav("/admin/dashboard");
      else if (role === "JUKIR") nav("/jukir/dashboard");
      else nav("/user/find-parking");
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>🅿️ Smart Parking</h1>
        <p style={{ textAlign: "center", color: "#64748b", fontSize: 13, marginBottom: 20 }}>
          Masuk ke sistem manajemen parkir
        </p>
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <div className="form-group">
            <label>Email</label>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              type="email"
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              type="password"
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn btn-primary w-100" disabled={loading} type="submit">
            {loading ? "Memproses..." : "Masuk"}
          </button>
        </form>
      </div>
    </div>
  );
}
