import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, menuKey, allowedRoles, disallowedRoles }) {
  const { user, loading, canAccess } = useAuth();

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

  // Dynamic menuKey permission check (applies to all roles including admin)
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
