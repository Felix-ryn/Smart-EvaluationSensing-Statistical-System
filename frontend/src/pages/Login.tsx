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
      nav(data.data.user.role === "ADMIN" ? "/admin/dashboard" : "/user/find-parking");
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", padding: 24 }}>
      <h1>SESS Login</h1>
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
        {error && <div style={{ color: "crimson" }}>{error}</div>}
        <button disabled={loading} type="submit">{loading ? "..." : "Login"}</button>
      </form>
    </div>
  );
}
