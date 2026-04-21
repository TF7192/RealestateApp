import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';
import { clearPageCache } from './pageCache';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.me();
      setUser(res?.user || null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // F-2.2 — every 401 raised by the api wrapper dispatches
  // "estia:unauthorized"; we listen once at the root and bounce the
  // user to /login with a ?from=… so they return after re-auth.
  useEffect(() => {
    const handler = (e) => {
      setUser(null);
      clearPageCache();
      try {
        const from = e?.detail?.pathname || '/';
        if (!from.startsWith('/login')) {
          const url = `/login?from=${encodeURIComponent(from)}`;
          window.history.replaceState({}, '', url);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('estia:unauthorized', handler);
    return () => window.removeEventListener('estia:unauthorized', handler);
  }, []);

  const signup = async (data) => {
    const res = await api.signup(data);
    setUser(res.user);
    return res.user;
  };

  const login = async (data) => {
    const res = await api.login(data);
    setUser(res.user);
    return res.user;
  };

  const loginWithGoogle = async (role) => {
    const res = await api.googleMock({ role });
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setUser(null);
    clearPageCache();
  };

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, loginWithGoogle, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
