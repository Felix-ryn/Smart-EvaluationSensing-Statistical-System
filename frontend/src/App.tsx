import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { AdminLayout, JukirLayout, PublicUserLayout } from "./layouts";
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
import { ReportsPajakSetoran } from "./pages/admin/ReportsPajakSetoran";
import { Violations } from "./pages/admin/Violations";
import { AreaScan } from "./pages/admin/AreaScan";
import { ReportViolation } from "./pages/ReportViolation";
import { Chatbot } from "./pages/Chatbot";
import { JukirDashboard } from "./pages/jukir/Dashboard";
import { TrendPublicPage } from "./pages/TrendPublicPage";
import { JukirTransactions } from "./pages/jukir/Transactions";
import { JukirPayment } from "./pages/jukir/Payment";
import { JukirSetoran } from "./pages/jukir/Setoran";
import { JukirQris } from "./pages/jukir/Qris";
import { JukirViolations } from "./pages/jukir/Violations";
import { JukirTraffic } from "./pages/jukir/Traffic";
import { Settings } from "./pages/admin/Settings";
<<<<<<< HEAD
import { LicensePlateCamera } from "./pages/admin/LicensePlateCamera";
=======
>>>>>>> 8165d05bccf72dca810dd6a3b222879eb0aa8bbf
import { CashQris } from "./pages/CashQris";


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
        {/* Public Pages - with sidebar menu (no auth required) */}
        <Route path="/" element={<PublicUserLayout />}>
          <Route index element={<TrendPublicPage />} />
          <Route path="find-parking" element={<FindParking />} />
          <Route path="report-violation" element={<ReportViolation />} />
          <Route path="chatbot" element={<Chatbot />} />
        </Route>

        <Route path="/login" element={<Login />} />

        {/* Admin Routes */}
        <Route path="/admin" element={<RequireAuth><RequireAdmin><AdminLayout /></RequireAdmin></RequireAuth>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="areas" element={<Areas />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="violations" element={<Violations />} />
          <Route path="reports" element={<ReportsPajakSetoran />} />
          <Route path="reconciliation" element={<Reconciliation />} />
          <Route path="users" element={<Users />} />
          <Route path="settings" element={<Settings />} />
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
          <Route path="pendapatan" element={<CashQris />} />
          <Route path="qris" element={<JukirQris />} />
          <Route path="traffic" element={<JukirTraffic />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
