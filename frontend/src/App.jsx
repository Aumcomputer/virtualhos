import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
            <Route path="request-telemed" element={<RequestTelemedPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
