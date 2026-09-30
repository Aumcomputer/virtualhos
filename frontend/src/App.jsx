import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import AllRegistrations from './pages/AllRegistrations';
import TodayRegistrations from './pages/TodayRegistrations';
import SettingsPage from './pages/SettingsPage';
import TelemedCasesPage from './pages/TelemedCasesPage';
import TelemedDashboardPage from './pages/TelemedDashboardPage';
import PrescreeningPage from './pages/PrescreeningPage';
import RequestTelemedPage from './pages/RequestTelemedPage';
import RegisterTelemedPage from './pages/RegisterTelemedPage';
import TelemedTodayAppointmentsPage from './pages/TelemedTodayAppointmentsPage';
import TelemedTodayPharmacyPage from './pages/TelemedTodayPharmacyPage';
import TelemedTodayFinancePage from './pages/TelemedTodayFinancePage';

import { useAuth } from './context/AuthContext';

function HomeRoute() {
  const { canAccess, isAdmin } = useAuth();
  if (isAdmin || canAccess('today_registrations')) {
    return <TodayRegistrations />;
  }
  // Redirect to first permitted route
  const defaultRoutes = [
    { key: 'telemed_today_pharmacy', path: '/telemed-today/pharmacy' },
    { key: 'telemed_today_finance', path: '/telemed-today/finance' },
    { key: 'request_telemed_receive', path: '/request-telemed/pending-receive' },
    { key: 'request_telemed_doctor', path: '/request-telemed/pending-doctor' },
    { key: 'request_telemed_pharmacist', path: '/request-telemed/pharmacist' },
    { key: 'request_telemed_approved', path: '/request-telemed/approved' },
    { key: 'request_telemed_all', path: '/request-telemed/all' },
    { key: 'telemed_today_appointments', path: '/telemed-today/appointments' },
    { key: 'telemed_dashboard', path: '/telemed-dashboard' },
    { key: 'telemed_cases', path: '/telemed-with-doctor' },
    { key: 'telemed_appointments', path: '/telemed-appointments' },
    { key: 'prescreening', path: '/prescreening' },
    { key: 'all_registrations', path: '/all' },
    { key: 'settings', path: '/settings' },
  ];
  for (const r of defaultRoutes) {
    if (canAccess(r.key)) {
      return <Navigate to={r.path} replace />;
    }
  }
  return (
    <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
      <h3>ไม่มีสิทธิ์เข้าถึงเมนู</h3>
      <p style={{ marginTop: '8px' }}>บัญชีของท่านยังไม่ได้รับสิทธิ์เข้าถึงเมนูใดในระบบ กรุณาติดต่อผู้ดูแลระบบ (Admin)</p>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<HomeRoute />} />
            <Route path="all" element={<ProtectedRoute menuKey="all_registrations"><AllRegistrations /></ProtectedRoute>} />
            <Route path="settings" element={<ProtectedRoute menuKey="settings"><SettingsPage /></ProtectedRoute>} />
            <Route path="telemed-dashboard" element={<ProtectedRoute menuKey="telemed_dashboard"><TelemedDashboardPage /></ProtectedRoute>} />
            <Route path="telemed-with-doctor" element={<ProtectedRoute menuKey="telemed_cases"><TelemedCasesPage type="combined" /></ProtectedRoute>} />
            <Route path="telemed-no-doctor" element={<ProtectedRoute menuKey="telemed_cases"><TelemedCasesPage type="combined" /></ProtectedRoute>} />
            <Route path="telemed-appointments" element={<ProtectedRoute menuKey="telemed_appointments"><TelemedCasesPage type="appointments" /></ProtectedRoute>} />
            <Route path="prescreening" element={<ProtectedRoute menuKey="prescreening"><PrescreeningPage /></ProtectedRoute>} />
            {/* Phase 1: Pre-screening (Request Telemed) */}
            <Route path="request-telemed/register" element={<ProtectedRoute menuKey="request_telemed_register"><RegisterTelemedPage /></ProtectedRoute>} />
            <Route path="request-telemed/pending-receive" element={<ProtectedRoute menuKey="request_telemed_receive"><RequestTelemedPage stage="receive" /></ProtectedRoute>} />
            <Route path="request-telemed/pending-doctor" element={<ProtectedRoute menuKey="request_telemed_doctor"><RequestTelemedPage stage="doctor" /></ProtectedRoute>} />
            <Route path="request-telemed/pharmacist" element={<ProtectedRoute menuKey="request_telemed_pharmacist"><RequestTelemedPage stage="pharmacist" /></ProtectedRoute>} />
            <Route path="request-telemed/approved" element={<ProtectedRoute menuKey="request_telemed_approved"><RequestTelemedPage stage="approved" /></ProtectedRoute>} />
            <Route path="request-telemed/all" element={<ProtectedRoute menuKey="request_telemed_all"><RequestTelemedPage stage="all" /></ProtectedRoute>} />
            <Route path="request-telemed/today" element={<Navigate to="/telemed-today/appointments" replace />} />
            <Route path="request-telemed" element={<Navigate to="/request-telemed/pending-receive" replace />} />
            {/* Phase 2: วันนัดจริง (Telemed Today) */}
            <Route path="telemed-today/appointments" element={<ProtectedRoute menuKey="telemed_today_appointments"><TelemedTodayAppointmentsPage /></ProtectedRoute>} />
            <Route path="telemed-today/pharmacy" element={<ProtectedRoute menuKey="telemed_today_pharmacy"><TelemedTodayPharmacyPage /></ProtectedRoute>} />
            <Route path="telemed-today/finance" element={<ProtectedRoute menuKey="telemed_today_finance"><TelemedTodayFinancePage /></ProtectedRoute>} />
            <Route path="telemed-today" element={<Navigate to="/telemed-today/appointments" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
