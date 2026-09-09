import { NavLink, Outlet } from "react-router-dom";

const link = ({ isActive }: { isActive: boolean }) => (isActive ? "active" : "");

export function AdminLayout() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">SESS Admin</div>
        <NavLink to="/admin/dashboard" className={link}><span>Dashboard</span></NavLink>
        <NavLink to="/admin/parking" className={link}><span>Parking</span></NavLink>
        <NavLink to="/admin/users" className={link}><span>Users</span></NavLink>
        <NavLink to="/admin/reports" className={link}><span>Reports</span></NavLink>
        <NavLink to="/admin/violations" className={link}><span>Pelanggaran</span></NavLink>
        <NavLink to="/admin/slot-scan" className={link}><span>Pindai Slot</span></NavLink>
        <NavLink to="/admin/settings" className={link}><span>Settings</span></NavLink>
        <NavLink to="/admin/notifications" className={link}><span>Notifications</span></NavLink>
        <div className="spacer" />
        <NavLink to="/user/home" className={link}><span>&rarr; User View</span></NavLink>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  );
}

export function UserLayout() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">SESS</div>
        <NavLink to="/user/home" className={link}><span>Home</span></NavLink>
        <NavLink to="/user/find-parking" className={link}><span>Find Parking</span></NavLink>
        <NavLink to="/user/report" className={link}><span>Lapor Pelanggaran</span></NavLink>
        <NavLink to="/user/history" className={link}><span>History</span></NavLink>
        <NavLink to="/user/profile" className={link}><span>Profile</span></NavLink>
        <div className="spacer" />
        <NavLink to="/admin/dashboard" className={link}><span>&rarr; Admin View</span></NavLink>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  );
}
