import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Properties from './pages/Properties';
import PropertyDetail from './pages/PropertyDetail';
import NewProperty from './pages/NewProperty';
import NewLead from './pages/NewLead';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Owners from './pages/Owners';
import OwnerDetail from './pages/OwnerDetail';
import Deals from './pages/Deals';
import Login from './pages/Login';
import AgentPortal from './pages/AgentPortal';
import CustomerPropertyView from './pages/CustomerPropertyView';
import Profile from './pages/Profile';
import Transfers from './pages/Transfers';
import Templates from './pages/Templates';
import { AuthProvider, useAuth } from './lib/auth';
import CommandPalette from './components/CommandPalette';
import ShortcutsOverlay from './components/ShortcutsOverlay';
import OfflineBanner from './components/OfflineBanner';
import OnboardingTour from './components/OnboardingTour';
import ChatWidget from './components/ChatWidget';
import AdminChats from './pages/AdminChats';
import { useScrollRestore } from './hooks/mobile';
import { useDocumentTitle, useGlobalShortcuts } from './hooks/shortcuts';
import { usePageviewTracking } from './hooks/analytics';
import { identify, resetIdentity } from './lib/analytics';

import { useEffect } from 'react';
import { initStatusBar } from './native';
import { isNative } from './native/platform';
import { api } from './lib/api';
import { useNavigate } from 'react-router-dom';
import './App.css';

/**
 * Single app shell — the same pages run on mobile and desktop.
 */
function AppRoutes() {
  const { user, loading, logout, refresh } = useAuth();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const navigate = useNavigate();

  useScrollRestore();
  useDocumentTitle();
  usePageviewTracking();
  useGlobalShortcuts({
    onOpenPalette: () => setPaletteOpen((v) => !v),
    onOpenHelp:    () => setHelpOpen(true),
  });

  // Tie the logged-in user to PostHog so session replay + funnels are
  // per-agent. On sign-out, reset so a new anonymous session starts.
  useEffect(() => {
    if (user?.id) identify(user);
    else resetIdentity();
  }, [user?.id]);

  useEffect(() => { initStatusBar(); }, []);

  // Native OAuth finish: SFSafariViewController redirects to
  // com.estia.agent://auth?code=<one-time code>. iOS opens the app and
  // Capacitor fires appUrlOpen. We trade the code for a session cookie,
  // close the Safari sheet, and refetch /me.
  useEffect(() => {
    if (!isNative()) return;
    let sub;
    (async () => {
      const [{ App: CapApp }, { Browser }] = await Promise.all([
        import('@capacitor/app'),
        import('@capacitor/browser'),
      ]);
      sub = await CapApp.addListener('appUrlOpen', async (event) => {
        const raw = event?.url || '';
        if (!raw.toLowerCase().startsWith('com.estia.agent://auth')) return;
        try {
          const u = new URL(raw);
          const code = u.searchParams.get('code');
          if (!code) return;
          await api.googleNativeExchange(code);
          await Browser.close().catch(() => {});
          await refresh();
          navigate('/', { replace: true });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[oauth] native exchange failed', e);
        }
      });
    })();
    return () => { try { sub?.remove?.(); } catch { /* ignore */ } };
  }, [refresh, navigate]);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        {/* SEO-friendly public routes */}
        <Route path="/agents/:agentSlug" element={<AgentPortal />} />
        <Route path="/agents/:agentSlug/:propertySlug" element={<CustomerPropertyView />} />
        {/* Legacy short routes — kept forever for shared-link backwards-compat */}
        <Route path="/p/:id" element={<CustomerPropertyView />} />
        <Route path="/a/:agentId" element={<AgentPortal />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <>
      <OfflineBanner />
      <Routes>
        <Route element={<Layout onLogout={logout} />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/properties" element={<Properties />} />
          <Route path="/properties/new" element={<NewProperty />} />
          <Route path="/properties/:id/edit" element={<NewProperty />} />
          <Route path="/properties/:id" element={<PropertyDetail />} />
          <Route path="/owners" element={<Owners />} />
          <Route path="/owners/:id" element={<OwnerDetail />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/new" element={<NewLead />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/transfers" element={<Transfers />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/admin/chats" element={<AdminChats />} />
          {/* Legacy routes — redirect */}
          <Route path="/leads" element={<Navigate to="/customers" replace />} />
          <Route path="/leads/new" element={<Navigate to="/customers/new" replace />} />
          <Route path="/buyers" element={<Navigate to="/customers?tab=active" replace />} />
          <Route path="/deals" element={<Deals />} />
        </Route>
        {/* SEO-friendly public routes */}
        <Route path="/agents/:agentSlug" element={<AgentPortal />} />
        <Route path="/agents/:agentSlug/:propertySlug" element={<CustomerPropertyView />} />
        {/* Legacy short routes — kept forever for shared-link backwards-compat */}
        <Route path="/p/:id" element={<CustomerPropertyView />} />
        <Route path="/a/:agentId" element={<AgentPortal />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
      <OnboardingTour />
      <ChatWidget />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
