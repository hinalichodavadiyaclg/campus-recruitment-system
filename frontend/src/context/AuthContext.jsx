import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getToken, setToken, clearToken } from '../services/api.js';
import { authService } from '../services/auth.service.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resetState, setResetState] = useState({ email: '', token: null });

  const loadCurrentUser = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      const data = await authService.getMe();
      setMe(data);
    } catch {
      clearToken();
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCurrentUser();

    const handleAuthExpired = () => {
      clearToken();
      setMe(null);
      window.location.hash = '#/login';
    };

    window.addEventListener('auth:expired', handleAuthExpired);
    return () => window.removeEventListener('auth:expired', handleAuthExpired);
  }, [loadCurrentUser]);

  const login = async (email, password, remember = false) => {
    const data = await authService.login({ email, password });
    setToken(data.sessionToken, remember);
    const meData = await authService.getMe();
    setMe(meData);
    return meData;
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch {
      // Ignore if session already invalid on server
    }
    clearToken();
    setMe(null);
    window.location.hash = '#/login';
  };

  const has = useCallback(
    (permission) =>
      Boolean(
        me?.permissionIds?.includes(permission) ||
          (me?.permissions &&
            me.permissions.some((p) => p._id === permission && p.isActive))
      ),
    [me]
  );

  const can = has;

  return (
    <AuthContext.Provider
      value={{
        me,
        user: me?.user || null,
        role: me?.role || null,
        permissionIds: me?.permissionIds || [],
        loading,
        has,
        can,
        login,
        logout,
        refreshUser: loadCurrentUser,
        resetState,
        setResetState
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
