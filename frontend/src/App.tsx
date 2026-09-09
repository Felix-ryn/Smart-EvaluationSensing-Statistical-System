import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout, UserLayout } from "./layouts";
import { Placeholder } from "./pages/Placeholder";
import { Login } from "./pages/Login";
import { FindParking } from "./pages/FindParking";
import { RequireAdmin } from "./pages/RequireAdmin";
import { Dashboard } from "./pages/admin/Dashboard";
import { Users } from "./pages/admin/Users";
import { Parking } from "./pages/admin/Parking";
import { Reports } from "./pages/admin/Reports";
import { Notifications } from "./pages/admin/Notifications";
import { Violations } from "./pages/admin/Violations";
import { SlotScan } from "./pages/admin/SlotScan";
import { ReportViolation } from "./pages/ReportViolation";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/user/find-parking" replace />} />
      <Route path="/login" element={<Login />} />

      <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="parking" element={<Parking />} />
        <Route path="users" element={<Users />} />
        <Route path="reports" element={<Reports />} />
        <Route path="violations" element={<Violations />} />
        <Route path="slot-scan" element={<SlotScan />} />
        <Route path="settings" element={<Placeholder title="Settings" phase="Phase 8" />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>

      <Route path="/user" element={<UserLayout />}>
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<Placeholder title="Home" phase="Phase 9" />} />
        <Route path="find-parking" element={<FindParking />} />
        <Route path="report" element={<ReportViolation />} />
        <Route path="parking/:id" element={<Placeholder title="Parking Detail" phase="Phase 9" />} />
        <Route path="parking/:id/live" element={<Placeholder title="Live Parking" phase="Phase 10" />} />
        <Route path="payment/:sessionId" element={<Placeholder title="Payment" phase="Phase 11" />} />
        <Route path="history" element={<Placeholder title="History" phase="Phase 9" />} />
        <Route path="profile" element={<Placeholder title="Profile" phase="Phase 9" />} />
      </Route>

      <Route path="*" element={<Navigate to="/user/find-parking" replace />} />
    </Routes>
  );
}
