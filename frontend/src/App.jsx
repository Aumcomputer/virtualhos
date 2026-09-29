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
            <Route path="all" element={<AllRegistrations />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="telemed-dashboard" element={<TelemedDashboardPage />} />
            <Route path="telemed-with-doctor" element={<TelemedCasesPage type="combined" />} />
            <Route path="telemed-no-doctor" element={<TelemedCasesPage type="combined" />} />
            <Route path="telemed-appointments" element={<TelemedCasesPage type="appointments" />} />
            <Route path="prescreening" element={<PrescreeningPage />} />
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
