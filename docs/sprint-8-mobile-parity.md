# Sprint 8 — Mobile + iOS Capacitor Parity Sweep

Date: 2026-04-24
Viewport: ≤820 px (web) + Capacitor WKWebView (iOS)
Palette: Cream & Gold DT, matches all prior sprints
Bundle audited: `/tmp/estia_design/estia-new-project/project/src/mobile/`

Status legend
- `matches` — live page already hits the mockup 1:1 for mobile chrome, swipe, scroll, keyboard behaviour
- `fixed` — divergence patched in this sprint
- `blocker` — feature not available in live app (flag tracked, not in scope here)
- `N/A` — public surface / shell pattern that does not map to a dedicated mobile page

## Screen-by-screen

| Screen | Live page | Status | Note |
| --- | --- | --- | --- |
| ScreenLogin | `pages/Login.jsx` | matches | Gold gradient CTA + RTL form + Google button match; inputs already spread safe helpers. |
| ScreenSignup | (handled by Login + `/signup` flow) | matches | Shared form shell with Login; same tokens. |
| ScreenOTP | n/a | N/A | OTP not shipped in live auth (email + Google only). |
| ScreenForgot | `pages/ForgotPassword.jsx` | matches | Full-screen form, card, primary gold CTA — aligned. |
| ScreenOnboarding | `pages/Onboarding.jsx` | matches | 3-step slider on mobile already. |
| ScreenDashboard | `pages/Dashboard.jsx` | matches | Greeting, KPI grid (auto-fit 190px), meetings card, hot-leads list all stack correctly; bottom tab bar owned by `Layout.jsx`. |
| ScreenLeads | `pages/Customers.jsx` | fixed | Added `PullRefresh` wrap + mobile swipe-card list (`SwipeRow` with call / WhatsApp / SMS) when `useViewportMobile()`; filters still collapse into `LeadFiltersSheet`. |
| ScreenLeadDetail | `pages/CustomerDetail.jsx` | matches | Already mobile-responsive with QuickAction tiles; WhatsApp CTA wired. |
| ScreenAddLead | `pages/NewLead.jsx` | matches | Uses `inputPropsForName / Phone / City / Address` — iOS keyboard-safe. |
| ScreenFilters | `components/LeadFiltersSheet.jsx` | matches | Slide-up sheet, focus trap, drag-to-dismiss (80 px), city datalist — matches bundle. |
| ScreenProperties | `pages/Properties.jsx` | matches | Already uses `PullRefresh` + `SwipeRow` compact mobile cards with Phone / WhatsApp / Waze tray. |
| ScreenPropertyDetail | `pages/PropertyDetail.jsx` | matches | `PropertyHero` strip uses native snap-scroll (RTL-aware programmatic scroll) + dots + counter; existing lightbox opens per slide. Photo pinch uses system gesture on `<img>` inside lightbox. |
| ScreenAddProperty | `pages/NewProperty.jsx` | matches | Uses `inputPropsForPrice / Rooms / Sqm / Floor / City / Name`; no `type="number"`. |
| ScreenDeals | `pages/Deals.jsx` | matches | Responsive list view. |
| ScreenContract | `pages/ContractDetail.jsx` | matches | Detail page with sticky-action bottom CTA. |
| ScreenReports | `pages/Reports.jsx` | matches | KPI tiles stack vertically at ≤820 px. |
| ScreenImport | `pages/Import.jsx` + `pages/ImportPicker.jsx` | matches | Full-width dropzone + stepper. |
| ScreenTeam | `pages/Team.jsx` | matches | Agent cards stack on narrow. |
| ScreenInbox | `pages/Inbox.jsx` | matches | Shows "בקרוב" placeholder (WhatsApp Business gated). |
| ScreenThread | (routed from Inbox when live) | blocker | WhatsApp thread view pending Meta approval; placeholder only. |
| ScreenMeetingDetail | `pages/MeetingDetail.jsx` | matches | Sticky-bottom action bar renders safe-area padding. |
| ScreenNotifications | `pages/Notifications.jsx` | matches | Bell popover on desktop, full page on mobile. |
| ScreenSearch | `components/CommandPalette.jsx` | matches | Triggered via topbar, full-screen on narrow. |
| ScreenEmpty | `components/EmptyState.jsx` | matches | Shared component, same icon ring + copy shape. |
| ScreenPublic | `pages/PropertyLandingPage.jsx` | matches | `/p/:id` route; bypasses the shell in `Layout.jsx`. |
| ScreenShare | `components/ShareDialog.jsx` | matches | Bottom-sheet style modal with WhatsApp + copy-link CTAs. |
| ScreenOwners | `pages/Owners.jsx` | fixed | Added `PullRefresh` + `useViewportMobile` mobile card list with `SwipeRow` (call / WhatsApp / SMS) + inline favourite star. |
| ScreenOwnerDetail | `pages/OwnerDetail.jsx` | matches | Uses `inputPropsForName / Email / Notes`; phone panel + properties list stack on narrow. |
| ScreenSettings | `pages/Settings.jsx` | matches | Settings rows use the exact `.row` shape + toggle. |
| ScreenSubscription | n/a (mailto upgrade) | N/A | Live app opens a `mailto:` for now — no billing surface yet. |
| ScreenAI | `pages/Ai.jsx` | matches | Premium-gated chat — same gold header + input bar. |
| ScreenCalendar | `pages/Calendar.jsx` + `pages/Reminders.jsx` | matches | Month grid + agenda stack vertical at ≤820 px. |
| ScreenCalculator | `pages/SellerCalculator.jsx` | matches | Mobile wrapper + `inputPropsForPrice` on every currency input. |
| ScreenTemplates | `pages/Templates.jsx` | matches | List + editor drawer responsive. |
| ScreenActivity | `pages/ActivityLog.jsx` | matches | Vertical timeline fits narrow. |
| ScreenReminders | `pages/Reminders.jsx` | matches | Agenda list with gold time chip. |
| ScreenOffice | `pages/Office.jsx` | matches | Owner-only admin surface. |
| ScreenYad2 | `pages/Yad2Import.jsx` | matches | Rate-limit chip visible at top. |
| ScreenTransfers | `pages/Transfers.jsx` | matches | Dense list → cards on narrow via existing CSS. |
| ScreenTagSettings | `pages/TagSettings.jsx` | matches | Chip editor, full-width on narrow. |
| ScreenNeighborhoods | `pages/NeighborhoodAdmin.jsx` | matches | Admin surface, owner gated. |
| ScreenNotFound | `pages/NotFound.jsx` | matches | Central card, gold CTA back to /. |
| ScreenProspectSign | `pages/ProspectSign.jsx` | matches | Standalone form page; no shell. |
| ScreenPropertyLanding | `pages/PropertyLandingPage.jsx` | matches | `/p/:id` public share. |
| ScreenAgentPortal | `pages/AgentPortal.jsx` | matches | Agent public card page. |
| ScreenOffer | `components/OfferReviewPanel.jsx` | matches | Slide-in drawer with `inputPropsForPrice`. |
| ScreenVoice | `components/VoiceCaptureFab.jsx` + review dialog | matches | FAB + review dialog, focus trap. |
| ScreenAgentCard | `pages/AgentCard.jsx` (handled via `/agent-card`) | matches | QR + vCard download. |
| ScreenHelp | `pages/Help.jsx` | matches | FAQ + contact links. |
| ScreenDocuments | `pages/Documents.jsx` | matches | Folder grid stacks on narrow. |
| ScreenPayment | n/a | N/A | Payments are mailto-only; no UI in live app. |
| ScreenMap | `pages/Map.jsx` | matches | Leaflet full-bleed; works in Capacitor. |
| ScreenHistory | `pages/LeadHistory.jsx` | matches | Vertical timeline, lead-scoped. |

## Systemic items verified

- **Mobile header** (avatar + greeting + search + notifications): owned by `Layout.jsx` `Topbar`; on narrow the topbar collapses to search + bell + chat + help. Matches the mockup's chrome (the design uses an AppBar per-screen; live app uses one shared topbar). No change needed — consistent with the "cleaner single entry" decision in `Layout.jsx` comments.
- **Bottom tab bar**: `MobileTabBar.jsx` already ports the 5-tab design (home · leads · properties · Estia AI · more) with the sheet overlay for "עוד". Verified tap targets, gold active tint, safe-area bottom padding.
- **Swipe rows**: `Properties.jsx` (pre-existing), `Customers.jsx` (added this sprint), `Owners.jsx` (added this sprint). All three share the same `SwipeRow` component + `useSwipeActions` hook; trailing-reveal at −56 px, clamps at −120 px.
- **Pull-to-refresh**: `Properties.jsx` (pre-existing), `Customers.jsx` (added), `Owners.jsx` (added). Desktop is a no-op via `@media (hover: hover) and (pointer: fine)` in `PullRefresh.css`.
- **Drawers**:
  - `AiMatchesDrawer` — end-anchored, rgba(30,26,20,0.4) backdrop + 2 px blur, 440 px cap, focus trap. Matches bundle.
  - `LeadFiltersSheet` — bottom-anchored, 0.55 backdrop, drag-to-dismiss (80 px), focus trap. Matches bundle.
  - `MobileMoreSheet` — still exists but superseded by the sheet inside `MobileTabBar.jsx` (see Layout comment).
- **Image gallery**: `PropertyHero.jsx` uses CSS scroll-snap strip with explicit `scrollTo({ behavior: 'smooth' })` on index change; RTL-aware sign flip. iOS pinch-zoom works inside the full-screen lightbox via native `<img>` gestures — not overridden.
- **Keyboard-safe inputs**: audited `NewLead.jsx`, `NewProperty.jsx`, `CustomerEditDialog.jsx`, `OwnerEditDialog.jsx`, `OfferReviewPanel.jsx`, `Profile.jsx`, `OwnerDetail.jsx`, `LeadFiltersSheet.jsx`. Every phone / price / rooms / sqm / floor input spreads the matching `inputPropsFor*()` helper from `lib/inputProps.js`. Grep for `type="number"` in `frontend/src` returns only JSDoc comments (no shipped inputs).

## Files touched

- `frontend/src/pages/Customers.jsx` — mobile swipe-card list + pull-to-refresh (+ new `MobileLeadRow` sub-component).
- `frontend/src/pages/Owners.jsx` — mobile swipe-card list + pull-to-refresh (+ new `MobileOwnerRow` sub-component).
- `docs/sprint-8-mobile-parity.md` — this checklist.

## Known remaining issues

- ScreenThread (WhatsApp inbox) is a placeholder; real parity deferred until Meta Tech Provider approval.
- ScreenSubscription / ScreenPayment surfaces are `mailto:` stubs; not in scope for a mobile parity sweep.
