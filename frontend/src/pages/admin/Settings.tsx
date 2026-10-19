import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { CheckCircle2, RefreshCw, Save, Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "../../api/client";

type UserRole = "ADMIN" | "JUKIR" | "USER";
type UserStatus = "ACTIVE" | "BLOCKED";

interface Area {
  id: string;
  name: string;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  areaId: string | null;
  areaJurik?: { name: string } | null;
}

interface GeneralSettingsState {
  appName: string;
  timezone: string;
  dateFormat: string;
  language: string;
  logoDataUrl: string;
  faviconDataUrl: string;
}

interface UserFormState {
  id: string | null;
  name: string;
  email: string;
  role: UserRole;
  areaId: string;
  password: string;
}

type PermissionKey =
  | "dashboard"
  | "liveTraffic"
  | "areas"
  | "transactions"
  | "violations"
  | "reports"
  | "users"
  | "settings";

type PermissionState = Record<UserRole, Record<PermissionKey, boolean>>;

const defaultGeneralSettings: GeneralSettingsState = {
  appName: "Smart Street Parking",
  timezone: "Asia/Jakarta",
  dateFormat: "DD/MM/YYYY HH:mm",
  language: "id",
  logoDataUrl: "",
  faviconDataUrl: "",
};

const defaultPermissions: PermissionState = {
  ADMIN: {
    dashboard: true,
    liveTraffic: true,
    areas: true,
    transactions: true,
    violations: true,
    reports: true,
    users: true,
    settings: true,
  },
  JUKIR: {
    dashboard: true,
    liveTraffic: false,
    areas: false,
    transactions: true,
    violations: true,
    reports: false,
    users: false,
    settings: false,
  },
  USER: {
    dashboard: true,
    liveTraffic: false,
    areas: false,
    transactions: false,
    violations: true,
    reports: false,
    users: false,
    settings: false,
  },
};

const moduleLabels: Record<PermissionKey, string> = {
  dashboard: "Dashboard",
  liveTraffic: "Live Traffic",
  areas: "Area Parkir",
  transactions: "Transaksi",
  violations: "Pelanggaran",
  reports: "Laporan",
  users: "Users & Jukir",
  settings: "Pengaturan",
};

const GENERAL_STORAGE_KEY = "admin_general_settings_mvp";
const RBAC_STORAGE_KEY = "admin_rbac_settings_mvp";

const emptyUserForm: UserFormState = {
  id: null,
  name: "",
  email: "",
  role: "USER",
  areaId: "",
  password: "",
};

function readLocalSettings<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function roleBadge(role: UserRole) {
  if (role === "ADMIN") return "badge-info";
  if (role === "JUKIR") return "badge-warning";
  return "badge-secondary";
}

export function Settings() {
  const [generalSettings, setGeneralSettings] = useState<GeneralSettingsState>(defaultGeneralSettings);
  const [rbacSettings, setRbacSettings] = useState<PermissionState>(defaultPermissions);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm);

  const [generalMsg, setGeneralMsg] = useState("");
  const [rbacMsg, setRbacMsg] = useState("");
  const [userMsg, setUserMsg] = useState("");
  const [error, setError] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [savingUser, setSavingUser] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserItem | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const userCounts = useMemo(
    () => ({
      total: users.length,
      admin: users.filter((u) => u.role === "ADMIN").length,
      jukir: users.filter((u) => u.role === "JUKIR").length,
      blocked: users.filter((u) => u.status === "BLOCKED").length,
    }),
    [users],
  );

  async function loadUsersAndAreas() {
    setLoadingUsers(true);
    setError("");
    try {
      const [{ data: usersRes }, { data: areasRes }] = await Promise.all([api.get("/users"), api.get("/areas")]);
      setUsers(usersRes.data ?? []);
      setAreas((areasRes.data ?? []).map((a: any) => ({ id: a.id, name: a.name })));
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Gagal memuat data user/area.");
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    setGeneralSettings(readLocalSettings(GENERAL_STORAGE_KEY, defaultGeneralSettings));
    setRbacSettings(readLocalSettings(RBAC_STORAGE_KEY, defaultPermissions));
    loadUsersAndAreas();
  }, []);

  function updateGeneral<K extends keyof GeneralSettingsState>(key: K, value: GeneralSettingsState[K]) {
    setGeneralSettings((prev) => ({ ...prev, [key]: value }));
    setGeneralMsg("");
  }

  async function onUploadImage(kind: "logoDataUrl" | "faviconDataUrl", e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    updateGeneral(kind, dataUrl);
  }

  function saveGeneralSettings() {
    localStorage.setItem(GENERAL_STORAGE_KEY, JSON.stringify(generalSettings));
    setGeneralMsg("Pengaturan umum berhasil disimpan.");
  }

  function resetGeneralSettings() {
    setGeneralSettings(defaultGeneralSettings);
    localStorage.removeItem(GENERAL_STORAGE_KEY);
    setGeneralMsg("Pengaturan umum dikembalikan ke default.");
  }

  function updateUserForm<K extends keyof UserFormState>(key: K, value: UserFormState[K]) {
    setUserForm((prev) => ({ ...prev, [key]: value }));
    setUserMsg("");
  }

  function handleEditUser(user: UserItem) {
    setUserForm({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      areaId: user.areaId ?? "",
      password: "",
    });
    setUserMsg(`Mode edit aktif untuk ${user.name}`);
  }

  function resetUserFormState() {
    setUserForm(emptyUserForm);
  }

  async function submitUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingUser(true);
    setUserMsg("");

    try {
      if (!userForm.id) {
        if (userForm.password.length < 6) {
          setUserMsg("Password minimal 6 karakter untuk user baru.");
          return;
        }

        const payload = {
          name: userForm.name,
          email: userForm.email,
          password: userForm.password,
          role: userForm.role,
          ...(userForm.role === "JUKIR" ? { areaId: userForm.areaId } : {}),
        };

        await api.post("/users", payload);
        setUserMsg("User baru berhasil ditambahkan.");
      } else {
        const payload = {
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          areaId: userForm.role === "JUKIR" ? userForm.areaId : null,
        };
        await api.patch(`/users/${userForm.id}`, payload);
        setUserMsg("Data user berhasil diperbarui.");
      }

      resetUserFormState();
      await loadUsersAndAreas();
    } catch (err: any) {
      setUserMsg(err.response?.data?.message ?? "Gagal menyimpan user.");
    } finally {
      setSavingUser(false);
    }
  }

  async function toggleStatus(user: UserItem) {
    const status: UserStatus = user.status === "ACTIVE" ? "BLOCKED" : "ACTIVE";
    try {
      await api.patch(`/users/${user.id}/status`, { status });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status } : u)));
    } catch {
      setUserMsg("Gagal mengubah status user.");
    }
  }

  async function submitResetPassword() {
    if (!resetTarget) return;
    if (resetPassword.length < 6) {
      setUserMsg("Password baru minimal 6 karakter.");
      return;
    }

    setResetLoading(true);
    try {
      await api.patch(`/users/${resetTarget.id}/reset-password`, { password: resetPassword });
      setUserMsg(`Password ${resetTarget.name} berhasil direset.`);
      setResetTarget(null);
      setResetPassword("");
    } catch (err: any) {
      setUserMsg(err.response?.data?.message ?? "Gagal reset password.");
    } finally {
      setResetLoading(false);
    }
  }

  function togglePermission(role: UserRole, module: PermissionKey) {
    setRbacSettings((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [module]: !prev[role][module],
      },
    }));
    setRbacMsg("");
  }

  function savePermissions() {
    localStorage.setItem(RBAC_STORAGE_KEY, JSON.stringify(rbacSettings));
    setRbacMsg("Konfigurasi RBAC berhasil disimpan.");
  }

  return (
    <div className="page settings-page">
      <div className="page-header settings-hero">
        <span className="badge badge-info settings-hero-badge">
          <Sparkles size={14} aria-hidden="true" /> MVP Pengaturan
        </span>
        <h1>Pengaturan Admin</h1>
        <p>
          Implementasi lengkap MVP: <strong>Pengaturan Umum</strong> dan <strong>User & Role Management</strong>.
        </p>
      </div>

      <div className="settings-grid settings-grid-main">
        <section className="card settings-card">
          <div className="settings-card-head">
            <h2>
              <Settings2 size={18} className="title-icon" aria-hidden="true" /> Pengaturan Umum
            </h2>
            <span className="badge badge-success">MVP</span>
          </div>
          <p className="settings-desc">Identitas aplikasi dan preferensi sistem secara global.</p>

          <div className="settings-form-grid">
            <div className="form-group">
              <label>Nama aplikasi</label>
              <input
                className="input"
                value={generalSettings.appName}
                onChange={(e) => updateGeneral("appName", e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Zona waktu</label>
              <select
                className="input"
                value={generalSettings.timezone}
                onChange={(e) => updateGeneral("timezone", e.target.value)}
              >
                <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Format tanggal/jam</label>
              <select
                className="input"
                value={generalSettings.dateFormat}
                onChange={(e) => updateGeneral("dateFormat", e.target.value)}
              >
                <option value="DD/MM/YYYY HH:mm">DD/MM/YYYY HH:mm</option>
                <option value="DD-MM-YYYY HH:mm">DD-MM-YYYY HH:mm</option>
                <option value="YYYY-MM-DD HH:mm">YYYY-MM-DD HH:mm</option>
              </select>
            </div>

            <div className="form-group">
              <label>Bahasa default</label>
              <select
                className="input"
                value={generalSettings.language}
                onChange={(e) => updateGeneral("language", e.target.value)}
              >
                <option value="id">Indonesia</option>
                <option value="en">English</option>
              </select>
            </div>

            <div className="form-group">
              <label>Logo aplikasi</label>
              <input type="file" accept="image/*" className="input" onChange={(e) => onUploadImage("logoDataUrl", e)} />
            </div>

            <div className="form-group">
              <label>Favicon</label>
              <input type="file" accept="image/*" className="input" onChange={(e) => onUploadImage("faviconDataUrl", e)} />
            </div>
          </div>

          <div className="settings-preview-wrap">
            <div className="settings-preview-box">
              <span className="small text-muted">Preview Logo</span>
              {generalSettings.logoDataUrl ? <img src={generalSettings.logoDataUrl} alt="logo preview" /> : <span>Belum ada logo</span>}
            </div>
            <div className="settings-preview-box">
              <span className="small text-muted">Preview Favicon</span>
              {generalSettings.faviconDataUrl ? <img src={generalSettings.faviconDataUrl} alt="favicon preview" /> : <span>Belum ada favicon</span>}
            </div>
          </div>

          <div className="settings-actions">
            <button className="btn btn-primary" onClick={saveGeneralSettings}>
              <Save size={16} /> Simpan
            </button>
            <button className="btn btn-outline" onClick={resetGeneralSettings}>
              <RefreshCw size={16} /> Reset Default
            </button>
          </div>
          {generalMsg && <p className="settings-message">{generalMsg}</p>}
        </section>

        <section className="card settings-card">
          <div className="settings-card-head">
            <h2>
              <ShieldCheck size={18} className="title-icon" aria-hidden="true" /> User & Role Management
            </h2>
            <span className="badge badge-success">MVP</span>
          </div>
          <p className="settings-desc">Daftar user/admin/staff, tambah/edit/nonaktifkan user, role, reset password, RBAC.</p>

          <div className="settings-user-stats">
            <div className="settings-mini-stat"><strong>{userCounts.total}</strong><span>Total</span></div>
            <div className="settings-mini-stat"><strong>{userCounts.admin}</strong><span>Admin</span></div>
            <div className="settings-mini-stat"><strong>{userCounts.jukir}</strong><span>Jukir</span></div>
            <div className="settings-mini-stat"><strong>{userCounts.blocked}</strong><span>Blocked</span></div>
          </div>

          <form className="settings-user-form" onSubmit={submitUser}>
            <div className="settings-form-grid">
              <div className="form-group">
                <label>Nama</label>
                <input className="input" value={userForm.name} onChange={(e) => updateUserForm("name", e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input className="input" type="email" value={userForm.email} onChange={(e) => updateUserForm("email", e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select className="input" value={userForm.role} onChange={(e) => updateUserForm("role", e.target.value as UserRole)}>
                  <option value="ADMIN">ADMIN</option>
                  <option value="JUKIR">JUKIR</option>
                  <option value="USER">USER</option>
                </select>
              </div>
              <div className="form-group">
                <label>Area (khusus JUKIR)</label>
                <select className="input" value={userForm.areaId} onChange={(e) => updateUserForm("areaId", e.target.value)} disabled={userForm.role !== "JUKIR"}>
                  <option value="">Pilih area</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>{area.name}</option>
                  ))}
                </select>
              </div>
              {!userForm.id && (
                <div className="form-group settings-password-field">
                  <label>Password awal</label>
                  <input
                    className="input"
                    type="password"
                    value={userForm.password}
                    onChange={(e) => updateUserForm("password", e.target.value)}
                    placeholder="Minimal 6 karakter"
                  />
                </div>
              )}
            </div>

            <div className="settings-actions">
              <button className="btn btn-primary" type="submit" disabled={savingUser}>
                <Save size={16} /> {userForm.id ? "Update User" : "Tambah User"}
              </button>
              <button type="button" className="btn btn-outline" onClick={resetUserFormState}>
                Reset Form
              </button>
            </div>
          </form>

          {userMsg && <p className="settings-message">{userMsg}</p>}
          {error && <p className="settings-error">{error}</p>}

          <div className="settings-table-wrap">
            {loadingUsers ? (
              <p>Loading user...</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Area</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td><span className={`badge ${roleBadge(user.role)}`}>{user.role}</span></td>
                      <td>{user.areaJurik?.name ?? "-"}</td>
                      <td>
                        <span className={`badge ${user.status === "ACTIVE" ? "badge-success" : "badge-danger"}`}>{user.status}</span>
                      </td>
                      <td>
                        <div className="settings-row-actions">
                          <button className="btn btn-outline btn-sm" onClick={() => handleEditUser(user)}>Edit</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setResetTarget(user)}>Reset Password</button>
                          {user.role !== "ADMIN" && (
                            <button className="btn btn-danger btn-sm" onClick={() => toggleStatus(user)}>
                              {user.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {resetTarget && (
            <div className="settings-reset-box">
              <h3>Reset Password: {resetTarget.name}</h3>
              <div className="settings-reset-actions">
                <input
                  className="input"
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Masukkan password baru"
                />
                <button className="btn btn-primary" onClick={submitResetPassword} disabled={resetLoading}>Simpan</button>
                <button className="btn btn-outline" onClick={() => setResetTarget(null)}>Batal</button>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="card settings-note">
        <div className="settings-card-head">
          <h2>
            <CheckCircle2 size={18} className="title-icon" aria-hidden="true" /> Hak Akses per Modul (RBAC)
          </h2>
          <span className="badge badge-success">MVP</span>
        </div>
        <p className="settings-desc">Atur role & permission untuk setiap modul agar akses lebih terkontrol.</p>

        <div className="settings-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Modul</th>
                <th>ADMIN</th>
                <th>JUKIR</th>
                <th>USER</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(moduleLabels) as PermissionKey[]).map((moduleKey) => (
                <tr key={moduleKey}>
                  <td>{moduleLabels[moduleKey]}</td>
                  {(["ADMIN", "JUKIR", "USER"] as UserRole[]).map((role) => (
                    <td key={`${moduleKey}-${role}`}>
                      <label className="settings-checkbox">
                        <input
                          type="checkbox"
                          checked={rbacSettings[role][moduleKey]}
                          onChange={() => togglePermission(role, moduleKey)}
                        />
                        <span>{rbacSettings[role][moduleKey] ? "Aktif" : "Nonaktif"}</span>
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="settings-actions">
          <button className="btn btn-primary" onClick={savePermissions}>
            <Save size={16} /> Simpan RBAC
          </button>
        </div>
        {rbacMsg && <p className="settings-message">{rbacMsg}</p>}
      </section>
    </div>
  );
}
