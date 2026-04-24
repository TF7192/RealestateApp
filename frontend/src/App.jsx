import { useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import DealDetail from './pages/DealDetail';
import Login from './pages/Login';
import AgentPortal from './pages/AgentPortal';
import PropertyLandingPage from './pages/PropertyLandingPage';
import CustomerPropertyView from './pages/CustomerPropertyView';
import ProspectSign from './pages/ProspectSign';
import NotFound from './pages/NotFound';
import Profile from './pages/Profile';
import Onboarding from './pages/Onboarding';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Transfers from './pages/Transfers';
// S13: Templates, AdminChats, CommandPalette are heavy and not on the
// critical path for the first page paint. Lazy-load them so the main
// bundle drops ~90KB and cold-start on cellular gets noticeably faster.
const Templates = lazy(() => import('./pages/Templates'));
const AdminChats = lazy(() => import('./pages/AdminChats'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const SellerCalculator = lazy(() => import('./pages/SellerCalculator'));
const Yad2Import = lazy(() => import('./pages/Yad2Import'));
// Excel / CSV import wizard — shared between /import/leads and
// /import/properties. Lazy so xlsx (~300KB) isn't in the main bundle.
const Import = lazy(() => import('./pages/Import'));
// Landing page the sidebar links to — picks leads vs properties and
// drops the agent into the wizard above.
const ImportPicker = lazy(() => import('./pages/ImportPicker'));
// MLS parity — Sprint 1/4/5 new pages. Lazy so each lands in its own
// chunk and the Dashboard-first-paint budget doesn't regress.
const Reports = lazy(() => import('./pages/Reports'));
const ActivityLog = lazy(() => import('./pages/ActivityLog'));
const Reminders = lazy(() => import('./pages/Reminders'));
// Sprint 4 — in-app notifications full-page list + read endpoints.
const Notifications = lazy(() => import('./pages/Notifications'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Office = lazy(() => import('./pages/Office'));
const Team = lazy(() => import('./pages/Team'));
const TagSettings = lazy(() => import('./pages/TagSettings'));
const Settings = lazy(() => import('./pages/Settings'));
// G2 — OWNER-only admin for marketable-area groups, linked from /settings.
const NeighborhoodAdmin = lazy(() => import('./pages/NeighborhoodAdmin'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));
import { AuthProvider, useAuth } from './lib/auth';
import ShortcutsOverlay from './components/ShortcutsOverlay';
import OfflineBanner from './components/OfflineBanner';
// OnboardingTour bundles react-joyride (~60 KB). Lazy so it lands in its
// own chunk — most authed sessions either already finished the tour
// (hasCompletedTutorial=true) or are on mobile (where the tour is
// silenced), so the main bundle doesn't need to pay for it up-front.
const OnboardingTour = lazy(() => import('./components/OnboardingTour'));

// Public marketing landing page. Lazy so unauthed visitors who arrive
// on a share-link route (e.g. /agents/:slug/:property) never pay the
// landing's CSS + hero weight; same for authed sessions.
const Landing = lazy(() => import('./pages/landing/Landing'));
const LegalPage = lazy(() => import('./pages/landing/LegalPage'));
// Headless ChatWidget — topbar chat button dispatches `estia:open-chat`
// to summon its panel. The old floating bubble is permanently hidden.
import ChatWidget from './components/ChatWidget';
import Yad2ScanBanner from './components/Yad2ScanBanner';
import MarketScanBanner from './components/MarketScanBanner';
import { useScrollRestore } from './hooks/mobile';
import { useDocumentTitle, useGlobalShortcuts } from './hooks/shortcuts';
import { useGlobalSearch } from './hooks/useGlobalSearch';
import { usePageviewTracking } from './hooks/analytics';
import { identify, resetIdentity } from './lib/analytics';

import { useEffect } from 'react';
import { initStatusBar } from './native';
import { isNative } from './native/platform';
import { api } from './lib/api';
import { useNavigate } from 'react-router-dom';
import './App.css';

// D-6 — Unauthenticated user hit a protected route (e.g. /dashboard).
// Redirect the URL to /login?from=<original> so (a) the address bar
// reflects the state and (b) PostLoginRedirect can bounce them back
// to where they were headed after a successful login. Public routes
// (landing, /login, /p/:id, /a/:id, /agents/:slug, /public/p/:token,
// /terms, /privacy) are handled above and never reach this component.
function UnauthRedirect() {
  const location = useLocation();
  // Skip re-encoding /login itself — prevents a double-redirect loop
  // in any code path that ever lands here while already on /login.
  if (location.pathname === '/login') {
    return <Login />;
  }
  const from = `${location.pathname}${location.search}`;
  return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />;
}

// D-6 — authed user on /login. Honor ?from= to land back where they
// were if UnauthRedirect captured it; otherwise fall back to the SPA
// dashboard alias (/ is served by static landing.html and would miss
// the app shell entirely).
function PostLoginRedirect() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const raw = params.get('from');
  // Guardrail — only honor same-origin, in-app paths so a crafted
  // ?from=https://evil.example/ can't redirect post-login traffic.
  const safeFrom = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
  return <Navigate to={safeFrom || '/dashboard'} replace />;
}

/**
 * Single app shell — the same pages run on mobile and desktop.
 */
function AppRoutes() {
  const { user, loading, logout, refresh } = useAuth();
  // Sprint 4 — useGlobalSearch owns the cmd-K palette lifecycle now:
  // keyboard shortcut + `estia:open-palette` / `estia:close-palette`
  // custom events (dispatched by the top-bar search button and the
  // mobile header search icon).
  const { open: paletteOpen, closePalette, togglePalette } = useGlobalSearch();
  const [helpOpen, setHelpOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useScrollRestore();
  useDocumentTitle();
  usePageviewTracking();
  useGlobalShortcuts({
    onOpenPalette: togglePalette,
    onOpenHelp:    () => setHelpOpen(true),
  });

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
          navigate('/dashboard', { replace: true });
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
      <Suspense fallback={<div className="app-loading"><div className="app-loading-spinner" /></div>}>
        <Routes>
          {/* Public landing page — mobile-first Hebrew marketing surface */}
          <Route path="/" element={<Landing />} />
          {/* Legal: terms + privacy. Public, standalone pages with their
              own slim nav. Reachable from the landing footer + from
              inside the app. */}
          <Route path="/terms"   element={<LegalPage which="terms"   />} />
          <Route path="/privacy" element={<LegalPage which="privacy" />} />
          {/* Explicit login route; the landing CTAs link here.
              `/login?flow=signup` preselects the signup tab inside Login.jsx. */}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* SEO-friendly public routes */}
          <Route path="/agents/:agentSlug" element={<AgentPortal />} />
          <Route path="/agents/:agentSlug/:propertySlug" element={<CustomerPropertyView />} />
          {/* Per-asset premium landing page — the shareable, minimal
              marketing-brochure surface (hero + photos + contact form).
              /agents/:slug/:slug is the full catalog listing with
              address / price / details; this is the curated variant
              the agent shares to drive inquiries. */}
          <Route path="/l/:agentSlug/:propertySlug" element={<PropertyLandingPage />} />
          {/* Public prospect sign page (1.5) — no login required. */}
          <Route path="/public/p/:token" element={<ProspectSign />} />
          {/* Legacy short routes — kept forever for shared-link backwards-compat */}
          <Route path="/p/:id" element={<CustomerPropertyView />} />
          <Route path="/a/:agentId" element={<AgentPortal />} />
          {/* D-6 — anything else is a protected authed route. Redirect
              the URL to /login?from=<pathname> so that (a) the address
              bar reflects the fact that the user needs to log in, and
              (b) after login we can bounce them back to exactly where
              they tried to go instead of silently dropping them on the
              dashboard. Rendering <Login /> here without updating the
              URL was the source of the "reload on /dashboard lands on
              /" bug — see PostLoginRedirect below. */}
          <Route path="*" element={<UnauthRedirect />} />
        </Routes>
      </Suspense>
    );
  }

  // A-4 — first-login onboarding gate. If the authed agent hasn't
  // submitted the onboarding form yet (profileCompletedAt === null),
  // hold them on /onboarding and deny every other route. The page
  // itself calls api.submitOnboarding() then api.me() refresh, which
  // flips this flag and releases the guard. Customers don't carry an
  // onboarding requirement; the gate only fires for AGENT / OWNER.
  const needsOnboarding =
    (user.role === 'AGENT' || user.role === 'OWNER') &&
    !user.profileCompletedAt;
  if (needsOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  if (needsOnboarding) {
    return <Onboarding />;
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
            {/* `/dashboard` is an alias for the authenticated Dashboard.
                Needed because `/` is served by the static landing.html in
                nginx — authenticated post-login redirects target this
                path so they land in the SPA instead of the marketing
                page. */}
            <Route path="/dashboard" element={<Dashboard />} />
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
            {/* A-4 — already-onboarded agents who navigate here manually
                get bounced back to the dashboard; the active guard
                above catches the "not onboarded yet" case. */}
            <Route path="/onboarding" element={<Navigate to="/dashboard" replace />} />
            <Route path="/transfers" element={<Transfers />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/admin/chats" element={<AdminChats />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/calculator" element={<SellerCalculator />} />
            <Route path="/integrations/yad2" element={<Yad2Import />} />
            <Route path="/import" element={<ImportPicker />} />
            <Route path="/import/:type" element={<Import />} />
            {/* MLS parity — Sprint 4/5/1 standalone pages. */}
            <Route path="/reports" element={<Reports />} />
            <Route path="/activity" element={<ActivityLog />} />
            <Route path="/reminders" element={<Reminders />} />
            {/* Sprint 4 — in-app notifications list. Auth is already
                enforced by the parent `if (!user) return <Login/>` gate
                above, matching the pattern used for /reminders and the
                other Layout-wrapped routes. */}
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/office" element={<Office />} />
            <Route path="/team" element={<Team />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/tags" element={<TagSettings />} />
            <Route path="/settings/neighborhoods" element={<NeighborhoodAdmin />} />
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
            <Route path="/deals/:id" element={<DealDetail />} />
            {/* D-6 — an already-authenticated user landing on /login
                should bounce to the `from` URL they were originally
                trying to reach (set by UnauthRedirect), or to the
                dashboard if nothing was captured. `/` is served by
                nginx's static landing page, so we send them to the SPA
                dashboard alias. */}
            <Route path="/login" element={<PostLoginRedirect />} />
          </Route>
          {/* SEO-friendly public routes */}
          <Route path="/agents/:agentSlug" element={<AgentPortal />} />
          <Route path="/agents/:agentSlug/:propertySlug" element={<CustomerPropertyView />} />
          <Route path="/l/:agentSlug/:propertySlug" element={<PropertyLandingPage />} />
          {/* Public prospect-sign page — also mounted here so an agent
              who clicks the generated "צור קישור" URL while signed in
              reaches the kiosk page instead of a 404. ProspectSign is
              self-contained (no Layout / nav), so no session leakage. */}
          <Route path="/public/p/:token" element={<ProspectSign />} />
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
          <CommandPalette open={paletteOpen} onClose={closePalette} />
        </Suspense>
      )}
      <ShortcutsOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
      <Suspense fallback={null}>
        <OnboardingTour />
      </Suspense>
      {/* Headless — renders the in-app developer chat panel when the
          topbar chat button dispatches `estia:open-chat`. The floating
          launcher is gone; the topbar is the single entry point. */}
      <ChatWidget />
      <Yad2ScanBanner />
      <MarketScanBanner />
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
