import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout, UserLayout } from "./layouts";
import { Placeholder } from "./pages/Placeholder";
import { Login } from "./pages/Login";
import { FindParking } from "./pages/FindParking";
import { RequireAdmin } from "./pages/RequireAdmin";
import { Dashboard } from "./pages/admin/Dashboard";
import { Users } from "./pages/admin/Users";
import { Areas } from "./pages/admin/Areas";
import { Transactions } from "./pages/admin/Transactions";
import { Jukir } from "./pages/admin/Jukir";
import { Mou } from "./pages/admin/Mou";
import { Reconciliation } from "./pages/admin/Reconciliation";
import { Reports } from "./pages/admin/Reports";
import { Violations } from "./pages/admin/Violations";
import { AreaScan } from "./pages/admin/AreaScan";
import { ReportViolation } from "./pages/ReportViolation";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/user/find-parking" replace />} />
      <Route path="/login" element={<Login />} />

      <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="areas" element={<Areas />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="jukir" element={<Jukir />} />
        <Route path="mou" element={<Mou />} />
        <Route path="reconciliation" element={<Reconciliation />} />
        <Route path="reports" element={<Reports />} />
        <Route path="violations" element={<Violations />} />
        <Route path="area-scan" element={<AreaScan />} />
        <Route path="users" element={<Users />} />
      </Route>

      <Route path="/user" element={<UserLayout />}>
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<Placeholder title="Home" phase="selanjutnya" />} />
        <Route path="find-parking" element={<FindParking />} />
        <Route path="report" element={<ReportViolation />} />
      </Route>

      <Route path="*" element={<Navigate to="/user/find-parking" replace />} />
    </Routes>
  );
}
