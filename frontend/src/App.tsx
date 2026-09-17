import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { AdminLayout, JukirLayout, UserLayout } from "./layouts";
import { Placeholder } from "./pages/Placeholder";
import { Login } from "./pages/Login";
import { FindParking } from "./pages/FindParking";
import { RequireAdmin } from "./pages/RequireAdmin";
import { Dashboard } from "./pages/admin/Dashboard";
import { Users } from "./pages/admin/Users";
import { Areas } from "./pages/admin/Areas";
import { Transactions } from "./pages/admin/Transactions";
import { Mou } from "./pages/admin/Mou";
import { Reconciliation } from "./pages/admin/Reconciliation";
import { Reports } from "./pages/admin/Reports";
import { Violations } from "./pages/admin/Violations";
import { AreaScan } from "./pages/admin/AreaScan";
import { ReportViolation } from "./pages/ReportViolation";
import { JukirDashboard } from "./pages/jukir/Dashboard";
import { JukirTransactions } from "./pages/jukir/Transactions";
import { JukirPayment } from "./pages/jukir/Payment";
import { JukirSetoran } from "./pages/jukir/Setoran";
import { JukirQris } from "./pages/jukir/Qris";
import { JukirViolations } from "./pages/jukir/Violations";
import { JukirTraffic } from "./pages/jukir/Traffic";
import { AdminLiveTraffic } from "./pages/admin/LiveTraffic";
import { AdminPajakSetoran } from "./pages/admin/PajakSetoran";

// Require authentication wrapper
function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("token");
  
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

// Guard untuk Jurik - redirect non-Jurik ke home
function RequireJukir({ children }: { children: React.ReactNode }) {
  // Simple check - in production would validate token role
  const isJukir = true; // Assume valid after routing
  
  if (!isJukir) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/user/find-parking" replace />} />
        <Route path="/login" element={<Login />} />

        {/* Admin Routes */}
        <Route path="/admin" element={<RequireAuth><RequireAdmin><AdminLayout /></RequireAdmin></RequireAuth>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="live-traffic" element={<AdminLiveTraffic />} />
          <Route path="areas" element={<Areas />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="violations" element={<Violations />} />
          <Route path="kapasitas" element={<Placeholder title="Kapasitas" phase="selanjutnya" />} />
          <Route path="reports" element={<Reports />} />
          <Route path="pajak-setoran" element={<AdminPajakSetoran />} />
          <Route path="reconciliation" element={<Reconciliation />} />
          <Route path="users" element={<Users />} />
          <Route path="settings" element={<Placeholder title="Pengaturan" phase="selanjutnya" />} />
          <Route path="jukir" element={<Placeholder title="Manage Jurik" phase="sudah ada di Users" />} />
          <Route path="mou" element={<Mou />} />
          <Route path="area-scan" element={<AreaScan />} />
        </Route>

        {/* Jukir Routes */}
        <Route path="/jukir" element={<RequireAuth><JukirLayout /></RequireAuth>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<JukirDashboard />} />
          <Route path="transactions" element={<JukirTransactions />} />
          <Route path="payment" element={<JukirPayment />} />
          <Route path="violations" element={<JukirViolations />} />
          <Route path="setoran" element={<JukirSetoran />} />
          <Route path="qris" element={<JukirQris />} />
          <Route path="traffic" element={<JukirTraffic />} />
        </Route>

        {/* User Routes */}
        <Route path="/user" element={<UserLayout />}>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<Placeholder title="Home" phase="selanjutnya" />} />
          <Route path="find-parking" element={<FindParking />} />
          <Route path="my-transactions" element={<Placeholder title="Transaksi Saya" phase="selanjutnya" />} />
          <Route path="report-violation" element={<ReportViolation />} />
        </Route>

        <Route path="*" element={<Navigate to="/user/find-parking" replace />} />
      </Routes>
    </AuthProvider>
  );
}
