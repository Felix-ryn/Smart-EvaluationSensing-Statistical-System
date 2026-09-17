import { NavLink, Outlet } from "react-router-dom";
import { useAuth, type User } from "./contexts/AuthContext";

// ================================================
// Menu configuration based on roles
// ================================================
const menuConfig = {
  ADMIN: [
    { to: "/admin/dashboard", label: "Dashboard", icon: "📊" },
    { to: "/admin/live-traffic", label: "Live Traffic", icon: "🔴" },
    { to: "/admin/areas", label: "Area Parkir", icon: "🅿️" },
    { to: "/admin/transactions", label: "Transaksi", icon: "💳" },
    { to: "/admin/violations", label: "Pelanggaran", icon: "⚠️" },
    { to: "/admin/kapasitas", label: "Kapasitas", icon: "📈" },
    { to: "/admin/reports", label: "Laporan", icon: "📑" },
    { to: "/admin/pajak-setoran", label: "Pajak & Setoran", icon: "💰" },
    { to: "/admin/reconciliation", label: "Rekonsiliasi", icon: "⚖️" },
    { to: "/admin/users", label: "Users & Jurik", icon: "👥" },
    { to: "/admin/settings", label: "Pengaturan", icon: "⚙️" },
  ],
  JUKIR: [
    { to: "/jukir/dashboard", label: "Dashboard", icon: "🏠" },
    { to: "/jukir/transactions", label: "Transaksi Parkir", icon: "💳" },
    { to: "/jukir/payment", label: "Pembayaran", icon: "💵" },
    { to: "/jukir/violations", label: "Pelanggaran", icon: "⚠️" },
    { to: "/jukir/setoran", label: "Setoran", icon: "💰" },
    { to: "/jukir/qris", label: "QRIS", icon: "📱" },
    { to: "/jukir/traffic", label: "Traffic Area", icon: "🔴" },
  ],
  USER: [
    { to: "/user/find-parking", label: "Cari Parkir", icon: "🔍" },
    { to: "/user/my-transactions", label: "Transaksi Saya", icon: "💳" },
    { to: "/user/report-violation", label: "Lapor Pelanggaran", icon: "⚠️" },
  ],
};

const roleBadge: Record<User["role"], string> = {
  ADMIN: "badge-info",
  JUKIR: "badge-success",
  USER: "badge-secondary",
};

// ================================================
// Sidebar Component
// ================================================
interface MenuItem {
  to: string;
  label: string;
  icon: string;
}

function SidebarItem({ item }: { item: MenuItem }) {
  return (
    <li className="menu-item">
      <NavLink to={item.to} className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="menu-icon">{item.icon}</span>
        <span className="menu-text">{item.label}</span>
      </NavLink>
    </li>
  );
}

interface SidebarProps {
  brand: string;
  brandIcon: string;
  menuItems: MenuItem[];
  footerLink?: { to: string; label: string };
  onLogout?: () => void;
}

function Sidebar({ brand, brandIcon, menuItems, footerLink, onLogout }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-icon">{brandIcon}</span>
        <span className="brand-text">{brand}</span>
      </div>

      <nav className="sidebar-nav">
        <ul className="menu-list">
          {menuItems.map((item) => (
            <SidebarItem key={item.to} item={item} />
          ))}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <ul className="footer-menu">
          {footerLink && (
            <li className="menu-item">
              <NavLink to={footerLink.to} className={({ isActive }) => (isActive ? "active" : "")}>
                <span className="menu-text">{footerLink.label}</span>
              </NavLink>
            </li>
          )}
          {onLogout && (
            <li className="menu-item">
              <button type="button" className="logout-btn" onClick={onLogout}>
                <span className="menu-icon">🚪</span>
                <span className="menu-text">Logout</span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </aside>
  );
}

// ================================================
// Header Component
// ================================================
function Header({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <header className="app-header">
      <div className="header-left">
        <h1 className="page-title">Smart Street Parking</h1>
      </div>
      <div className="header-right">
        <div className="header-user">
          <div className="user-avatar">{user.name.charAt(0).toUpperCase()}</div>
          <div className="user-info">
            <span className="user-name">{user.name}</span>
            <span className={`user-role badge ${roleBadge[user.role]}`}>{user.role}</span>
          </div>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={onLogout}>
          Keluar
        </button>
      </div>
    </header>
  );
}

// ================================================
// Layout Shell (LMS Style)
// ================================================
interface LayoutProps {
  brand: string;
  brandIcon: string;
  menuItems: MenuItem[];
  footerLink?: { to: string; label: string };
}

function Layout({ brand, brandIcon, menuItems, footerLink }: LayoutProps) {
  const { user, logout } = useAuth();

  return (
    <div className="lms-app">
      {user && <Header user={user} onLogout={logout} />}
      <div className="lms-container">
        <Sidebar
          brand={brand}
          brandIcon={brandIcon}
          menuItems={menuItems}
          footerLink={footerLink}
          onLogout={logout}
        />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ================================================
// Role-based Layouts
// ================================================
export function AdminLayout() {
  return (
    <Layout
      brand="Admin Dashboard"
      brandIcon="🏢"
      menuItems={menuConfig.ADMIN}
      footerLink={{ to: "/user/find-parking", label: "→ User View" }}
    />
  );
}

export function JukirLayout() {
  return (
    <Layout
      brand="Panel Juru Parkir"
      brandIcon="👨‍💼"
      menuItems={menuConfig.JUKIR}
    />
  );
}

export function UserLayout() {
  return (
    <Layout
      brand="Smart Parking"
      brandIcon="🅿️"
      menuItems={menuConfig.USER}
      footerLink={{ to: "/admin/dashboard", label: "→ Admin View" }}
    />
  );
}

// Dynamic layout wrapper that shows correct menu based on user role
export function AppLayout() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="lms-app">
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    );
  }

  switch (user.role) {
    case "ADMIN":
      return <AdminLayout />;
    case "JUKIR":
      return <JukirLayout />;
    case "USER":
      return <UserLayout />;
    default:
      return <AdminLayout />;
  }
}
