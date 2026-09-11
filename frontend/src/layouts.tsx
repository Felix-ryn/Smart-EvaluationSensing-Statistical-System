import { NavLink, Outlet } from "react-router-dom";

const link = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : "");

export function AdminLayout() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">Smart Parking Admin</div>
        <NavLink to="/admin/dashboard" className={link}><span>Dashboard</span></NavLink>
        <NavLink to="/admin/areas" className={link}><span>Area Parkir</span></NavLink>
        <NavLink to="/admin/transactions" className={link}><span>Transaksi</span></NavLink>
        <NavLink to="/admin/jukir" className={link}><span>Jukir</span></NavLink>
        <NavLink to="/admin/mou" className={link}><span>MOU / Pajak</span></NavLink>
        <NavLink to="/admin/reconciliation" className={link}><span>Rekonsiliasi</span></NavLink>
        <NavLink to="/admin/reports" className={link}><span>Laporan</span></NavLink>
        <NavLink to="/admin/violations" className={link}><span>Pelanggaran</span></NavLink>
        <NavLink to="/admin/area-scan" className={link}><span>Pindai Area (AI)</span></NavLink>
        <NavLink to="/admin/users" className={link}><span>Users</span></NavLink>
        <div className="spacer" />
        <NavLink to="/user/find-parking" className={link}><span>&rarr; User View</span></NavLink>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  );
}

export function UserLayout() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">Smart Parking</div>
        <NavLink to="/user/home" className={link}><span>Home</span></NavLink>
        <NavLink to="/user/find-parking" className={link}><span>Find Parking</span></NavLink>
        <NavLink to="/user/report" className={link}><span>Lapor Pelanggaran</span></NavLink>
        <div className="spacer" />
        <NavLink to="/admin/dashboard" className={link}><span>&rarr; Admin View</span></NavLink>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  );
}
