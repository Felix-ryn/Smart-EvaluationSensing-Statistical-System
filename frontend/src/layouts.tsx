import { NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Banknote,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  ParkingSquare,
  Coins,
  QrCode,
  Scale,
  Search,
  Settings,
  TrendingUp,
  Users2,
} from "lucide-react";
import { useAuth, type User } from "./contexts/AuthContext";

// ================================================
// Menu configuration based on roles
// ================================================
const menuConfig = {
  ADMIN: [
    { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/admin/live-traffic", label: "Live Traffic", icon: Activity },
    { to: "/admin/areas", label: "Area Parkir", icon: ParkingSquare },
    { to: "/admin/transactions", label: "Transaksi", icon: CreditCard },
    { to: "/admin/violations", label: "Pelanggaran", icon: AlertTriangle },
    { to: "/admin/kapasitas", label: "Kapasitas", icon: TrendingUp },
    { to: "/admin/reports", label: "Laporan", icon: FileText },
    { to: "/admin/pajak-setoran", label: "Pajak & Setoran", icon: Coins },
    { to: "/admin/reconciliation", label: "Rekonsiliasi", icon: Scale },
    { to: "/admin/users", label: "Users & Jukir", icon: Users2 },
    { to: "/admin/settings", label: "Pengaturan", icon: Settings },
  ],
  JUKIR: [
    { to: "/jukir/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/jukir/transactions", label: "Transaksi Parkir", icon: CreditCard },
    { to: "/jukir/payment", label: "Pembayaran", icon: Banknote },
    { to: "/jukir/violations", label: "Pelanggaran", icon: AlertTriangle },
    { to: "/jukir/setoran", label: "Setoran", icon: Coins },
    { to: "/jukir/qris", label: "QRIS", icon: QrCode },
    { to: "/jukir/traffic", label: "Traffic Area", icon: Activity },
  ],
  USER: [
    { to: "/user/find-parking", label: "Cari Parkir", icon: Search },
    { to: "/user/my-transactions", label: "Transaksi Saya", icon: CreditCard },
    { to: "/user/report-violation", label: "Lapor Pelanggaran", icon: AlertTriangle },
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
  icon: LucideIcon;
}

function SidebarItem({ item }: { item: MenuItem }) {
  const Icon = item.icon;
  return (
    <li className="menu-item">
      <NavLink to={item.to} className={({ isActive }) => (isActive ? "active" : "")} title={item.label}>
        <Icon className="menu-icon" size={18} strokeWidth={1.8} aria-hidden="true" />
        <span className="menu-text">{item.label}</span>
      </NavLink>
    </li>
  );
}

interface SidebarProps {
  brand: string;
  menuItems: MenuItem[];
  onLogout?: () => void;
}

function Sidebar({ brand, menuItems, onLogout }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src="/logo.png" alt="" className="brand-logo" />
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
          {onLogout && (
            <li className="menu-item">
              <button type="button" className="logout-btn" onClick={onLogout} title="Keluar">
                <LogOut className="menu-icon" size={18} strokeWidth={1.8} aria-hidden="true" />
                <span className="menu-text">Keluar</span>
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
function Header({ title, user, onLogout }: { title: string; user: User; onLogout: () => void }) {
  return (
    <header className="app-header">
      <div className="header-left">
        <h1 className="page-title">{title}</h1>
        <span className="page-subtitle">Selamat datang, {user.name}</span>
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
  title: string;
  menuItems: MenuItem[];
}

function Layout({ brand, title, menuItems }: LayoutProps) {
  const { user, logout } = useAuth();

  return (
    <div className="lms-app">
      <Sidebar brand={brand} menuItems={menuItems} onLogout={logout} />
      {user && <Header title={title} user={user} onLogout={logout} />}
      <div className="lms-container">
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
      brand="Smart Street Parking"
      title="Admin Dashboard"
      menuItems={menuConfig.ADMIN}
    />
  );
}

export function JukirLayout() {
  return (
    <Layout
      brand="Smart Street Parking"
      title="Panel Juru Parkir"
      menuItems={menuConfig.JUKIR}
    />
  );
}

export function UserLayout() {
  return (
    <Layout
      brand="Smart Street Parking"
      title="Smart Parking"
      menuItems={menuConfig.USER}
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
