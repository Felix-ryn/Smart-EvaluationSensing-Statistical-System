import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout, UserLayout } from "./layouts";
import { Placeholder } from "./pages/Placeholder";
import { Login } from "./pages/Login";
import { FindParking } from "./pages/FindParking";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/login" element={<Login />} />

      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Placeholder title="Dashboard" phase="Phase 4" />} />
        <Route path="parking" element={<Placeholder title="Parking Management" phase="Phase 5" />} />
        <Route path="users" element={<Placeholder title="User Management" phase="Phase 6" />} />
        <Route path="reports" element={<Placeholder title="Reports" phase="Phase 7" />} />
        <Route path="settings" element={<Placeholder title="Settings" phase="Phase 8" />} />
        <Route path="notifications" element={<Placeholder title="Notifications" phase="Phase 8" />} />
      </Route>

      <Route path="/user" element={<UserLayout />}>
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<Placeholder title="Home" phase="Phase 9" />} />
        <Route path="find-parking" element={<FindParking />} />
        <Route path="parking/:id" element={<Placeholder title="Parking Detail" phase="Phase 9" />} />
        <Route path="parking/:id/live" element={<Placeholder title="Live Parking" phase="Phase 10" />} />
        <Route path="payment/:sessionId" element={<Placeholder title="Payment" phase="Phase 11" />} />
        <Route path="history" element={<Placeholder title="History" phase="Phase 9" />} />
        <Route path="profile" element={<Placeholder title="Profile" phase="Phase 9" />} />
      </Route>

      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes>
  );
}
