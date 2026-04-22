import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';
import { clearPageCache } from './pageCache';
import { resetForLogout as resetYad2ScanStore } from './yad2ScanStore';
import { resetForLogout as resetMarketScanStore } from './marketScanStore';

// SEC-1 — one place to wipe every piece of cross-user client state when
// a session ends. Module-level stores + sessionStorage rehydration
// previously left one user's scan banner visible to the next user on
// the same browser. Any new cross-session store that gets added later
// should be cleared from here too.
function purgeClientSessionState() {
  clearPageCache();
  try { resetYad2ScanStore(); } catch { /* ignore */ }
  try { resetMarketScanStore(); } catch { /* ignore */ }
}

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
      purgeClientSessionState();
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
    return finalizeLogin(res.user);
  };

  const login = async (data) => {
    const res = await api.login(data);
    return finalizeLogin(res.user);
  };

  const loginWithGoogle = async (role) => {
    const res = await api.googleMock({ role });
    return finalizeLogin(res.user);
  };

  const logout = async () => {
    try { await api.logout(); } catch { /* ignore */ }
    setUser(null);
    purgeClientSessionState();
  };

  // SEC-1 — also purge on a successful fresh login so a different user
  // signing in on the same browser never inherits residual state from
  // whoever used this browser before (e.g. agent swap in an office, or
  // the previous user didn't cleanly log out). We run the purge BEFORE
  // setting the new user so any race in the scan stores doesn't see
  // the new identity mid-wipe.
  const finalizeLogin = (nextUser) => {
    purgeClientSessionState();
    setUser(nextUser);
    return nextUser;
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
