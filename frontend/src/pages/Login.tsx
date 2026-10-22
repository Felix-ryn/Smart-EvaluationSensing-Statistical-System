import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ParkingSquare, ShieldCheck, ArrowLeft } from "lucide-react";
import { useAuth, type User } from "../contexts/AuthContext";

const HOME_BY_ROLE: Record<User["role"], string> = {
  ADMIN: "/admin/dashboard",
  JUKIR: "/jukir/dashboard",
  USER: "/user/find-parking",
};

// Demo accounts from backend/prisma/seed.ts
const TABS = [
  { role: "ADMIN" as const, label: "Admin", icon: ShieldCheck, email: "admin@sess.local" },
  { role: "JUKIR" as const, label: "Juru Parkir", icon: ParkingSquare, email: "jukir.budi@sess.local" },
];

export function Login() {
  const nav = useNavigate();
  const { login } = useAuth();
  const [tab, setTab] = useState<User["role"]>("ADMIN");
  const [email, setEmail] = useState(TABS[0].email);
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function pickTab(next: (typeof TABS)[number]) {
    setTab(next.role);
    setEmail(next.email);
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(email, password);
      nav(HOME_BY_ROLE[user.role] ?? "/", { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message ?? err.message ?? "Login gagal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <img src="/logo.png" alt="" className="auth-logo" />
        <h1>Selamat Datang!</h1>
        <p className="auth-tagline">Parkir Aman, Hidup Lebih Mudah</p>

        <div className="auth-tabs" role="tablist" aria-label="Pilih jenis akun" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%" }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.role}
                type="button"
                role="tab"
                aria-selected={tab === t.role}
                className={`auth-tab ${tab === t.role ? "active" : ""}`}
                onClick={() => pickTab(t)}
                style={{ width: "100%" }}
              >
                <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                {t.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <div className="form-group">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              type="email"
              autoComplete="username"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="btn btn-primary w-100" disabled={loading} type="submit">
            {loading ? "Memproses..." : "Masuk"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => nav("/")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            width: "100%",
            padding: "10px 16px",
            marginTop: 8,
            backgroundColor: "#f3f4f6",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
            color: "#4b5563",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#e5e7eb";
            e.currentTarget.style.borderColor = "#9ca3af";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#f3f4f6";
            e.currentTarget.style.borderColor = "#d1d5db";
          }}
          title="Kembali ke halaman utama"
        >
          <ArrowLeft size={16} strokeWidth={2} />
          Kembali ke Halaman Utama
        </button>
      </div>
    </div>
  );
}
