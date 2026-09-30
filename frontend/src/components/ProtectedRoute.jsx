import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, menuKey, allowedRoles, disallowedRoles }) {
  const { user, loading, canAccess, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="page-loader">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Admin has access to all routes
  if (isAdmin) {
    return children;
  }

  // Dynamic menuKey permission check
  if (menuKey && !canAccess(menuKey)) {
    return <Navigate to="/" replace />;
  }

  // Legacy role check fallback
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  if (disallowedRoles && disallowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
