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
// Critical-path authed pages: Dashboard + Customers + Properties +
// PropertyDetail are the four routes the agent lands on first after
// login. Keep them eager so the main bundle has them inline.
import Dashboard from './pages/Dashboard';
import Properties from './pages/Properties';
import PropertyDetail from './pages/PropertyDetail';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Login from './pages/Login';
// Perf 2026-04-25 — secondary authed pages were eagerly imported and
// dragged ~150KB of code into the main bundle that ~80% of sessions
// never touch on first paint. Lazy them so each lands in its own chunk
// and the main bundle drops accordingly. The Suspense fallback at the
// app root already handles the brief skeleton between click + chunk.
const NewProperty = lazy(() => import('./pages/NewProperty'));
const NewLead = lazy(() => import('./pages/NewLead'));
const Owners = lazy(() => import('./pages/Owners'));
const OwnerDetail = lazy(() => import('./pages/OwnerDetail'));
const Deals = lazy(() => import('./pages/Deals'));
const DealDetail = lazy(() => import('./pages/DealDetail'));
const AgentPortal = lazy(() => import('./pages/AgentPortal'));
const PropertyLandingPage = lazy(() => import('./pages/PropertyLandingPage'));
const CustomerPropertyView = lazy(() => import('./pages/CustomerPropertyView'));
const ProspectSign = lazy(() => import('./pages/ProspectSign'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Profile = lazy(() => import('./pages/Profile'));
// Sprint 7 — two small new pages (agent business-card + full per-lead
// history timeline). Lazy so neither weighs down first paint.
const AgentCard = lazy(() => import('./pages/AgentCard'));
const LeadHistory = lazy(() => import('./pages/LeadHistory'));
// Sprint 7 — /inbox premium-gated placeholder. The WhatsApp Business
// integration is deferred until Meta approves Estia as a Tech
// Provider; the page gives the sidebar entry a real route to point
// at and funnels early-access interest to /contact.
const Inbox = lazy(() => import('./pages/Inbox'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Transfers = lazy(() => import('./pages/Transfers'));
// Sprint 5.1 — public "צרו קשר" page + premium-gate dialog. The page
// itself is lazy (only reached from premium-gate or landing footer);
// the dialog is mounted once at the root and stays eager.
const Contact = lazy(() => import('./pages/Contact'));
import PremiumGateDialog from './components/PremiumGateDialog';
// S13: Templates, AdminChats, CommandPalette are heavy and not on the
// critical path for the first page paint. Lazy-load them so the main
// bundle drops ~90KB and cold-start on cellular gets noticeably faster.
const Templates = lazy(() => import('./pages/Templates'));
const AdminChats = lazy(() => import('./pages/AdminChats'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const Admin = lazy(() => import('./pages/Admin'));
const SellerCalculator = lazy(() => import('./pages/SellerCalculator'));
const Yad2Import = lazy(() => import('./pages/Yad2Import'));
// Excel / CSV import wizard — shared between /import/leads and
// /import/properties. Lazy so exceljs (~256KB gzipped) isn't in the
// main bundle.
const Import = lazy(() => import('./pages/Import'));
// Landing page the sidebar links to — picks leads vs properties and
// drops the agent into the wizard above.
const ImportPicker = lazy(() => import('./pages/ImportPicker'));
// Voice-ingest POC — record audio → Whisper + Haiku → structured JSON.
const VoiceDemo = lazy(() => import('./pages/VoiceDemo'));
// MLS parity — Sprint 1/4/5 new pages. Lazy so each lands in its own
// chunk and the Dashboard-first-paint budget doesn't regress.
const Reports = lazy(() => import('./pages/Reports'));
const ActivityLog = lazy(() => import('./pages/ActivityLog'));
const Reminders = lazy(() => import('./pages/Reminders'));
// Sprint 4 — in-app notifications full-page list + read endpoints.
const Notifications = lazy(() => import('./pages/Notifications'));
// Sprint 6 — Documents library (S3-backed pdf/dwg/zip/xlsx). Lazy so
// the cards grid + file icons don't weigh down the main bundle.
const Documents = lazy(() => import('./pages/Documents'));
// Sprint 9 — Marketing hub (/marketing). Three-tab surface (overview /
// landing-page inquiries / agreements). Lazy so the KPI + sparkline
// rendering doesn't weigh down first paint for agents who never open it.
const Marketing = lazy(() => import('./pages/Marketing'));
const PublicMatches = lazy(() => import('./pages/PublicMatches'));
const Calendar = lazy(() => import('./pages/Calendar'));
// Sprint 7 — Leaflet map of the agent's properties. Lazy so the
// ~150KB leaflet + react-leaflet chunk doesn't weigh down first paint
// for agents who never open the map view.
const MapPage = lazy(() => import('./pages/Map'));
const Office = lazy(() => import('./pages/Office'));
const Team = lazy(() => import('./pages/Team'));
const TeamAgentDetail = lazy(() => import('./pages/TeamAgentDetail'));
// Sprint 7 — full-page results for the global search (?q=foo). Links
// from CommandPalette's new "ראה את כל התוצאות" footer button.
const SearchResults = lazy(() => import('./pages/SearchResults'));
const TagSettings = lazy(() => import('./pages/TagSettings'));
const Settings = lazy(() => import('./pages/Settings'));
// Sprint 7 — in-app FAQ + support-channel hub (/help). Lazy so the
// static JSON registry + DT card styling don't weigh down the main
// bundle for agents who never open the help page.
const Help = lazy(() => import('./pages/Help'));
// G2 — OWNER-only admin for marketable-area groups, linked from /settings.
const NeighborhoodAdmin = lazy(() => import('./pages/NeighborhoodAdmin'));
// Sprint 6 / ScreenContract — in-house digital contract e-sign (no
// DocuSign). Lazy so the pdfkit-rendered preview iframe lands in its
// own chunk.
const Contracts = lazy(() => import('./pages/Contracts'));
const ContractDetail = lazy(() => import('./pages/ContractDetail'));
// Sprint 7 — AI surfaces. /ai (chat) + /meetings/:id (pre-meeting
// brief) land in their own lazy chunks so agents who never open them
// don't pay the bundle cost.
const Ai = lazy(() => import('./pages/Ai'));
const MeetingDetail = lazy(() => import('./pages/MeetingDetail'));
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
// Headless AiChatWidget — twin of ChatWidget for the Estia AI chat
// surface. The topbar's "AI Chat" button dispatches `estia:open-ai-chat`
// to toggle the floating panel. Shares the `estia-ai-chat-v1` localStorage
// key with /ai so the conversation survives switching surfaces.
import AiChatWidget from './components/AiChatWidget';
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
  // Sprint 5.1 — premium gate. lib/api.js broadcasts this event on
  // every 402 PREMIUM_REQUIRED response; we read the feature label
  // off the detail and feed it into the dialog mounted below.
  const [premiumFeature, setPremiumFeature] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onGate = (e) => {
      // Premium users never see the upsell — the backend cleared
      // them, any 402 for them is a stale / misrouted call we shouldn't
      // nag about.
      if (user?.isPremium) return;
      const f = e?.detail?.feature;
      setPremiumFeature(typeof f === 'string' && f ? f : 'Estia Premium');
    };
    window.addEventListener('estia:premium-gate', onGate);
    return () => window.removeEventListener('estia:premium-gate', onGate);
  }, [user?.isPremium]);

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
          {/* Sprint 5.1 — public contact form. Linked from the
              premium-gate dialog + landing footer; accessible without auth. */}
          <Route path="/contact" element={<Contact />} />
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
            {/* SEC-010 — admin (role=ADMIN) sees the admin console at
                / and /dashboard instead of the agent dashboard. */}
            <Route
              path="/"
              element={user?.role === 'ADMIN'
                ? <Navigate to="/admin" replace />
                : <Dashboard />}
            />
            <Route
              path="/dashboard"
              element={user?.role === 'ADMIN'
                ? <Navigate to="/admin" replace />
                : <Dashboard />}
            />
            <Route path="/properties" element={<Properties />} />
            <Route path="/properties/new" element={<NewProperty />} />
            <Route path="/properties/:id/edit" element={<NewProperty />} />
            <Route path="/properties/:id" element={<PropertyDetail />} />
            <Route path="/owners" element={<Owners />} />
            <Route path="/owners/:id" element={<OwnerDetail />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/new" element={<NewLead />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            {/* Sprint 7 — full-page event stream for a single lead. */}
            <Route path="/customers/:id/history" element={<LeadHistory />} />
            <Route path="/profile" element={<Profile />} />
            {/* Sprint 7 — the agent's business-card surface. */}
            <Route path="/agent-card" element={<AgentCard />} />
            {/* A-4 — already-onboarded agents who navigate here manually
                get bounced back to the dashboard; the active guard
                above catches the "not onboarded yet" case. */}
            <Route path="/onboarding" element={<Navigate to="/dashboard" replace />} />
            <Route path="/transfers" element={<Transfers />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/chats" element={<AdminChats />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/calculator" element={<SellerCalculator />} />
            <Route path="/integrations/yad2" element={<Yad2Import />} />
            <Route path="/import" element={<ImportPicker />} />
            <Route path="/import/:type" element={<Import />} />
            {/* Voice-ingest POC — no DB writes, renders extracted JSON. */}
            <Route path="/voice-demo" element={<VoiceDemo />} />
            {/* MLS parity — Sprint 4/5/1 standalone pages. */}
            <Route path="/reports" element={<Reports />} />
            <Route path="/activity" element={<ActivityLog />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/public-matches" element={<PublicMatches />} />
            {/* Sprint 4 — in-app notifications list. Auth is already
                enforced by the parent `if (!user) return <Login/>` gate
                above, matching the pattern used for /reminders and the
                other Layout-wrapped routes. */}
            <Route path="/notifications" element={<Notifications />} />
            {/* Sprint 6 — Documents library (pdf/dwg/zip/xlsx).
                S3-backed; route matches `api.listDocuments` / `api.uploadDocument`. */}
            <Route path="/documents" element={<Documents />} />
            {/* Sprint 9 — Marketing hub. KPIs + landing-page inquiry
                inbox + brokerage-agreement status. */}
            <Route path="/marketing" element={<Marketing />} />
            <Route path="/calendar" element={<Calendar />} />
            {/* Sprint 7 — /map shows property pins on a Leaflet /
                OpenStreetMap tile layer. Auth-gated via the outer
                `if (!user)` check above. */}
            <Route path="/map" element={<MapPage />} />
            <Route path="/office" element={<Office />} />
            <Route path="/team" element={<Team />} />
            <Route path="/team/:agentId" element={<TeamAgentDetail />} />
            {/* Sprint 7 — full-page results for the ⌘K global search.
                Reads ?q= from the URL and renders 4 buckets. The
                palette's "ראה את כל התוצאות" footer button deep-
                navigates here with the current query. */}
            <Route path="/search" element={<SearchResults />} />
            {/* Sprint 7 — /help renders the in-app FAQ + support channels
                (WhatsApp / email / contact form). Static JSON registry,
                no Intercom. */}
            <Route path="/help" element={<Help />} />
            {/* Sprint 7 — /inbox premium-gated WhatsApp Business Inbox
                placeholder. Real integration is deferred pending Meta
                Tech Provider approval; the page advertises the feature
                and points early-access CTAs at /contact. */}
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/tags" element={<TagSettings />} />
            <Route path="/settings/neighborhoods" element={<NeighborhoodAdmin />} />
            {/* Sprint 6 / ScreenContract — in-house digital contract
                e-sign flow. List + detail (preview + type-to-sign). */}
            <Route path="/contracts" element={<Contracts />} />
            <Route path="/contracts/:id" element={<ContractDetail />} />
            {/* Sprint 7 — AI surfaces. /ai is the open-ended chat page;
                /meetings/:id is the pre-meeting brief detail page. */}
            <Route path="/ai" element={<Ai />} />
            <Route path="/meetings/:id" element={<MeetingDetail />} />
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
          {/* Sprint 5.1 — authed users can reach /contact too. The
              page renders its own full-bleed shell without the app Layout. */}
          <Route path="/contact" element={<Contact />} />
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
      {/* Perf 2026-04-25 — only mount (and therefore import) the tour
          chunk when there's any chance it will run. OnboardingTour
          itself bails out for OWNER/CUSTOMER roles, mobile/native, and
          users who already finished the tour, but the lazy chunk still
          downloaded for everyone. Gate the mount so the joyride bundle
          (~26 KB transferred) only lands for AGENTs who haven't
          completed it on a desktop browser. */}
      {user && user.role === 'AGENT' && !user.hasCompletedTutorial && (
        <Suspense fallback={null}>
          <OnboardingTour />
        </Suspense>
      )}
      {/* Headless — renders the in-app developer chat panel when the
          topbar chat button dispatches `estia:open-chat`. The floating
          launcher is gone; the topbar is the single entry point. */}
      <ChatWidget />
      {/* Headless — renders the Estia AI floating chat when the topbar
          AI-chat button dispatches `estia:open-ai-chat`. Shares the
          `estia-ai-chat-v1` localStorage key with /ai so the conversation
          continues across surfaces. */}
      <AiChatWidget />
      <Yad2ScanBanner />
      <MarketScanBanner />
      {/* Sprint 5.1 — premium gate. Mounted at the authed root so any
          gated API call (Estia AI, meeting summariser, …) surfaces the
          "שדרגו" dialog without the calling page needing plumbing. */}
      {premiumFeature && (
        <PremiumGateDialog
          featureName={premiumFeature}
          onClose={() => setPremiumFeature(null)}
        />
      )}
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
