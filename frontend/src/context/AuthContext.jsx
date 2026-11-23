import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const data = await api.me();
      setUser(data.user);
      setPermissions(data.permissions || []);
      return data;
    } catch {
      return null;
    }
  }, []);

  // Check session on mount
  useEffect(() => {
    api.me()
      .then((data) => {
        setUser(data.user);
        setPermissions(data.permissions || []);
      })
      .catch(() => {
        setUser(null);
        setPermissions([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.login(username, password);
    setUser(data.user);
    setPermissions(data.permissions || []);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setPermissions([]);
      // Full page redirect to clear cache
      window.location.href = '/login';
    }
  }, []);

  const isAdmin = useMemo(() => user?.role === 'admin', [user]);

  // Check if current user has permission to access a menu key
  const canAccess = useCallback((menuKey) => {
    if (!user) return false;
    if (!menuKey) return true;
    if (user.role === 'admin' && menuKey === 'settings') return true;
    return permissions.includes(menuKey);
  }, [user, permissions]);

  return (
    <AuthContext.Provider value={{ user, permissions, loading, login, logout, refreshMe, isAdmin, canAccess }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
