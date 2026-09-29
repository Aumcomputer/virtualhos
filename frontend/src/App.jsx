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
            <Route index element={<TodayRegistrations />} />
            <Route path="all" element={<ProtectedRoute allowedRoles={['admin']}><AllRegistrations /></ProtectedRoute>} />
            <Route path="settings" element={<ProtectedRoute allowedRoles={['admin']}><SettingsPage /></ProtectedRoute>} />
            <Route path="telemed-dashboard" element={<ProtectedRoute disallowedRoles={['request_telemed']}><TelemedDashboardPage /></ProtectedRoute>} />
            <Route path="telemed-with-doctor" element={<ProtectedRoute disallowedRoles={['request_telemed']}><TelemedCasesPage type="combined" /></ProtectedRoute>} />
            <Route path="telemed-no-doctor" element={<ProtectedRoute disallowedRoles={['request_telemed']}><TelemedCasesPage type="combined" /></ProtectedRoute>} />
            <Route path="telemed-appointments" element={<ProtectedRoute disallowedRoles={['request_telemed']}><TelemedCasesPage type="appointments" /></ProtectedRoute>} />
            <Route path="prescreening" element={<ProtectedRoute disallowedRoles={['request_telemed']}><PrescreeningPage /></ProtectedRoute>} />
            <Route path="request-telemed/register" element={<RegisterTelemedPage />} />
            <Route path="request-telemed/pending-receive" element={<RequestTelemedPage stage="receive" />} />
            <Route path="request-telemed/pending-doctor" element={<RequestTelemedPage stage="doctor" />} />
            <Route path="request-telemed/pharmacist" element={<RequestTelemedPage stage="pharmacist" />} />
            <Route path="request-telemed/approved" element={<RequestTelemedPage stage="approved" />} />
            <Route path="request-telemed/all" element={<RequestTelemedPage stage="all" />} />
            <Route path="request-telemed/today" element={<RequestTelemedPage stage="today" />} />
            <Route path="request-telemed" element={<Navigate to="/request-telemed/pending-receive" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
