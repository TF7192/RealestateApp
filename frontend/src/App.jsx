import { useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
// F-8.6 — These modules are already statically imported from
// native/share.js + Login.jsx, so the dynamic import below was being
// rewritten by Vite into a static one anyway (the "INEFFECTIVE_DYNAMIC
// _IMPORT" warning). Replacing the dynamic imports in the effect with
// static imports at the top of this file removes the warning without
// changing actual bundle behavior.
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
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
import ProspectSign from './pages/ProspectSign';
import NotFound from './pages/NotFound';
import Profile from './pages/Profile';
import Transfers from './pages/Transfers';
// S13: Templates, AdminChats, CommandPalette are heavy and not on the
// critical path for the first page paint. Lazy-load them so the main
// bundle drops ~90KB and cold-start on cellular gets noticeably faster.
const Templates = lazy(() => import('./pages/Templates'));
const AdminChats = lazy(() => import('./pages/AdminChats'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const SellerCalculator = lazy(() => import('./pages/SellerCalculator'));
const Yad2Import = lazy(() => import('./pages/Yad2Import'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));
import { AuthProvider, useAuth } from './lib/auth';
import ShortcutsOverlay from './components/ShortcutsOverlay';
import OfflineBanner from './components/OfflineBanner';
import OnboardingTour from './components/OnboardingTour';
import ChatWidget from './components/ChatWidget';
import Yad2ScanBanner from './components/Yad2ScanBanner';
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

  // S21 — mobile global search. The mobile header button dispatches an
  // 'estia:open-palette' event from anywhere in the tree; we listen here
  // and toggle the same palette state desktop's ⌘K uses. Decoupled so
  // the Layout component doesn't need a reference to App's setter.
  useEffect(() => {
    const onOpen = () => setPaletteOpen(true);
    window.addEventListener('estia:open-palette', onOpen);
    return () => window.removeEventListener('estia:open-palette', onOpen);
  }, []);

  // Tie the logged-in user to PostHog so session replay + funnels are
  // per-agent. On sign-out, reset so a new anonymous session starts.
  // Depending on `user` directly triggers the identify call whenever
  // any displayed field (displayName, avatar) changes — PostHog dedupes
  // by distinctId so the extra calls are cheap and keep traits fresh.
  useEffect(() => {
    if (user?.id) identify(user);
    else resetIdentity();
  }, [user]);

  useEffect(() => { initStatusBar(); }, []);

  // Native OAuth finish: SFSafariViewController redirects to
  // com.estia.agent://auth?code=<one-time code>. iOS opens the app and
  // Capacitor fires appUrlOpen. We trade the code for a session cookie,
  // close the Safari sheet, and refetch /me.
  useEffect(() => {
    if (!isNative()) return;
    let sub;
    (async () => {
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
          // Swallow: this runs during native OAuth resume. A noisy log
          // would surface in PostHog sessions; the user sees a toast
          // from refresh()/navigate() if the session couldn't be
          // established.
          void e;
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
        {/* Public prospect sign page (1.5) — no login required. */}
        <Route path="/public/p/:token" element={<ProspectSign />} />
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
      {/* F-26 — Suspense fallback is now a tiny page-aware skeleton
          instead of a silent blank. Kicks in while Templates / AdminChats /
          SellerCalculator / Yad2Import lazy chunks load on first visit. */}
      <Suspense fallback={(
        <div className="app-loading app-loading-skel" aria-hidden>
          <div className="skel skel-line w-40" style={{ margin: '24px auto', maxWidth: 420 }} />
          <div className="skel skel-line w-70" style={{ margin: '12px auto', maxWidth: 420 }} />
          <div className="skel skel-line w-90" style={{ margin: '12px auto', maxWidth: 420 }} />
        </div>
      )}>
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
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/calculator" element={<SellerCalculator />} />
            <Route path="/integrations/yad2" element={<Yad2Import />} />
            {/* Legacy + alias routes — redirect.
                `/assets` is a reasonable English guess for "נכסים"
                (literally "assets") — hitting the 404 felt like a bug
                even though it was just an unbound URL. Redirect to the
                canonical path so guessed URLs resolve. */}
            <Route path="/leads" element={<Navigate to="/customers" replace />} />
            <Route path="/leads/new" element={<Navigate to="/customers/new" replace />} />
            <Route path="/buyers" element={<Navigate to="/customers?tab=active" replace />} />
            <Route path="/assets" element={<Navigate to="/properties" replace />} />
            <Route path="/assets/:id" element={<Navigate to="/properties" replace />} />
            <Route path="/deals" element={<Deals />} />
          </Route>
          {/* SEO-friendly public routes */}
          <Route path="/agents/:agentSlug" element={<AgentPortal />} />
          <Route path="/agents/:agentSlug/:propertySlug" element={<CustomerPropertyView />} />
          {/* Legacy short routes — kept forever for shared-link backwards-compat */}
          <Route path="/p/:id" element={<CustomerPropertyView />} />
          <Route path="/a/:agentId" element={<AgentPortal />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      {/* Palette is only mounted when opened — another small win for
          first-paint. Suspense fallback is null because the palette
          already has its own backdrop+transition. */}
      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        </Suspense>
      )}
      <ShortcutsOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
      <OnboardingTour />
      <ChatWidget />
      <Yad2ScanBanner />
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
