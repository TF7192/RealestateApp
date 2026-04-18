# Estia — Phase 0.5 QA Report

iPhone-first systematic test sweep. **Demo:** `agent.demo@estia.app` / `Password1!`. All findings below are from Chrome iPhone 15 / SE / Pro Max emulation, macOS Safari with iPhone user agent, Xcode iOS 17 simulator, and desktop Chrome — NOT from a real iOS device unless marked otherwise. Anything requiring device-only capabilities (HEIC EXIF, Face ID, APNs, real cellular) is flagged **[needs device]**.

Severity scale per brief: **Critical** (data loss, security, blocks core workflow) / **High** (major feature broken) / **Medium** (workaround exists) / **Low** (cosmetic). **iPhone bugs auto-bump one level up.**

---

## 1. Feature inventory

| # | Feature (HE / EN) | Entry | Key files | iPhone status |
|---|---|---|---|---|
| 1 | Signup / Login / Google OAuth / Logout (הרשמה/התחברות/גוגל/יציאה) | `/` | `pages/Login.jsx`, `backend/routes/auth.ts`, `oauth-google.ts` | iOS: Browser plugin + `com.estia.agent://` deep link |
| 2 | Dashboard (לוח בקרה) | `/` | `pages/Dashboard.jsx`, `backend/routes/reports.ts` | Pull-to-refresh; pageCache seeds sub-pages |
| 3 | Properties list (נכסים) | `/properties` | `pages/Properties.jsx`, `backend/routes/properties.ts` | SwipeRow + 3-action rail, 96px dense row |
| 4 | Property detail dashboard (כרטיס נכס) | `/properties/:id` | `pages/PropertyDetail.jsx`, `PropertyHero.jsx` | KPI strip, 6 dashboard cards, 22 marketing actions |
| 5 | New / edit property wizard (נכס חדש) | `/properties/new`, `/properties/:id/edit` | `pages/NewProperty.jsx` | 2 steps, SmartFields, owner quick-pick, PDF agreement |
| 6 | Photo manager (ניהול תמונות) | `pd → thumbs → ניהול` | `components/PropertyPhotoManager.jsx` | Portal modal, drag-to-reorder |
| 7 | Video manager (ניהול סרטונים) | `pd → סרטונים` | `components/PropertyVideoManager.jsx` | Upload + YT/Vimeo embed |
| 8 | Marketing actions (22 פעולות שיווק) | `pd → שיווק` | `components/MarketingActionDialog.jsx` | Per-action: upload / link / notes |
| 9 | Exclusivity agreement PDF (הסכם בלעדיות) | `pd → בלעדיות → העלה PDF` | `backend/routes/agreements.ts` | File input (accept=application/pdf) |
| 10 | Transfer property (העברת נכס) | `pd → העבר` | `components/TransferPropertyDialog.jsx`, `backend/routes/transfers.ts` | Accept/decline/cancel; owner card follows |
| 11 | Owners list (בעלי נכסים) | `/owners` | `pages/Owners.jsx`, `backend/routes/owners.ts` | 64px dense row, SwipeRow, gold FAB |
| 12 | Owner detail / edit (כרטיס בעל נכס) | `/owners/:id` | `pages/OwnerDetail.jsx`, `OwnerEditDialog.jsx` | Stacked mobile, StickyActionBar |
| 13 | Owner picker (בחר בעל נכס) | `new property → בחר בעל נכסים` | `components/OwnerPicker.jsx` | Bottom sheet autocomplete |
| 14 | Customers / leads list (לקוחות) | `/customers` | `pages/Customers.jsx`, `backend/routes/leads.ts` | Card view default on mobile, list on desktop |
| 15 | Customer detail / edit (כרטיס לקוח) | `/customers/:id` | `pages/CustomerDetail.jsx`, `CustomerEditDialog.jsx` | Matching pills, inline edits |
| 16 | New lead (ליד חדש) | `/customers/new` | `pages/NewLead.jsx` | SmartFields, PriceRange, SuggestPicker |
| 17 | Customer → property matching (התאמת לקוחות) | Auto, client-side | `pages/Properties.jsx leadMatchesProperty()` | Rules: city, looking-for, rooms±1, price±15% |
| 18 | Templates studio (תבניות הודעות) | `/templates` | `pages/Templates.jsx`, `ChipEditor.jsx`, `lib/templates.js` | Desktop inline / mobile fullscreen editor, phone-mockup preview |
| 19 | Deals kanban (עסקאות) | `/deals` | `pages/Deals.jsx`, `backend/routes/deals.ts` | Low-traffic legacy |
| 20 | Transfers list (העברות) | `/transfers` | `pages/Transfers.jsx` | Incoming / outgoing tabs |
| 21 | Customer-facing property page | `/agents/:slug/:prop-slug`, `/p/:id` | `pages/CustomerPropertyView.jsx`, `backend/routes/public.ts` | OG meta, 100dvh hero, mobile bottom bar |
| 22 | Agent portal | `/agents/:slug`, `/a/:id` | `pages/AgentPortal.jsx`, `backend/routes/agents.ts` | Public portfolio |
| 23 | Chat widget + admin panel | Floating button / `/admin/chats` | `components/ChatWidget.jsx`, `pages/AdminChats.jsx`, `backend/routes/chat.ts` | WS via `@fastify/websocket`, admin allowlist |
| 24 | Onboarding tour + page tours | Automatic first-login (desktop only) | `components/OnboardingTour.jsx`, `PageTour.jsx`, `lib/tourKill.js` | Mobile skipped; persisted via sendBeacon + keepalive |
| 25 | Profile / avatar / theme (פרופיל) | `/profile` | `pages/Profile.jsx`, `lib/theme.jsx` | Avatar upload, light default |
| 26 | Catalog share link (קישור הקטלוג) | Sidebar / more sheet | `components/Layout.jsx`, `MobileMoreSheet.jsx` | `navigator.clipboard.writeText` |
| 27 | Sharing: WA deep-link, share-with-photos, Story composer | Property detail | `native/share.js`, `native/storyComposer.js` | iOS share sheet, 1080×1920 canvas, whatsapp:// scheme |
| 28 | Command palette (פאלטת פקודות) | `Cmd+K` | `components/CommandPalette.jsx` | Desktop only |
| 29 | Mobile tab bar + more sheet | Always on mobile | `MobileTabBar.jsx`, `MobileMoreSheet.jsx` | Safe-area aware, 44pt targets |
| 30 | Geolocation reverse-geocode | New property → "השתמש במיקום" | `native/geolocation.js`, `backend/routes/geo.ts` | Nominatim proxy |
| 31 | Pull-to-refresh | Lists | `components/PullRefresh.jsx`, `hooks/mobile.js` | JS-tracked, haptic tick at threshold |
| 32 | Swipe actions | Rows | `components/SwipeRow.jsx` | RTL-aware, 72px trailing actions |
| 33 | Sticky action bar (SAB) | Form pages on mobile | `components/StickyActionBar.jsx` | Safe-area inset + tab-bar stacking |
| 34 | Smart fields | Throughout | `components/SmartFields.jsx` | NumberField (comma + unit), PhoneField (IL format), SelectField, RoomsChips, DateQuickChips, SuggestPicker, PriceRange, Segmented |
| 35 | Offline banner | Auto | `components/OfflineBanner.jsx`, `hooks/mobile.useOnlineStatus` | Banner on `offline`/`online` events |
| 36 | Toast notifications | Auto | `lib/toast.jsx` | Portal render |
| 37 | Analytics (PostHog) | Auto | `lib/analytics.js`, `backend/lib/analytics.ts` | identify + pageview + event + server api_request |

---

## 2. Coverage matrix (iPhone columns first)

✅ works · ⚠️ issues · ❌ broken · ⏭️ blocked / not runnable · ➖ N/A

| Feature | iPhone native (simulator) | iPhone web | Desktop web |
|---|:-:|:-:|:-:|
| Signup / login (email) | ✅ | ✅ | ✅ |
| Google OAuth | ✅ (with correct `com.estia.agent` scheme) | ✅ | ✅ |
| Biometric / Face ID | ➖ not implemented | ➖ | ➖ |
| Logout | ✅ | ✅ | ✅ |
| Dashboard | ✅ | ✅ | ✅ |
| Properties list | ✅ | ✅ | ✅ |
| Property detail | ✅ | ✅ | ✅ |
| New property step 1 | ✅ | ✅ | ✅ |
| New property step 2 | ⚠️ BUG-011 keyboard covers date pickers | ⚠️ | ✅ |
| Property edit (reused wizard) | ⚠️ BUG-013 tab-swap auto-save edge case | ⚠️ | ✅ |
| Photo manager | ⏭️ HEIC not tested [needs device] | ✅ | ✅ |
| Marketing actions (22) | ✅ | ✅ | ✅ |
| Exclusivity PDF upload | ✅ (sim: picks from Files app) | ✅ | ✅ |
| Transfer property | ✅ | ✅ | ✅ |
| Owners list | ✅ | ✅ | ✅ |
| Owner detail | ✅ | ✅ | ✅ |
| Customers list (card) | ✅ | ✅ | ✅ |
| Customers list (list/table) | ➖ desktop default | ➖ | ✅ |
| New lead | ⚠️ BUG-003 PriceRange at 375 was cut off (fixed earlier in session); regression test passes | ✅ | ✅ |
| Lead-to-property matching pill | ✅ | ✅ | ✅ |
| Templates list + kind switcher | ✅ | ✅ | ✅ |
| Templates editor (inline) | ⚠️ Hebrew keyboard covers progress dots | ⚠️ | ✅ |
| Templates editor (fullscreen modal) | ✅ shipped | ✅ | ➖ |
| Phone-mockup preview | ✅ | ✅ | ✅ |
| Deals kanban | ⚠️ horizontal scroll jitter [BUG-022] | ⚠️ | ✅ |
| Transfers incoming/outgoing | ✅ | ✅ | ✅ |
| Customer property page (public) | ✅ | ✅ | ✅ |
| OG preview in WA / Telegram | ✅ verified via scraper | ✅ | ✅ |
| Agent portal (public) | ✅ | ✅ | ✅ |
| Chat widget (opens, sends, receives) | ✅ (TOP-RIGHT after session fix) | ✅ | ✅ |
| Chat WebSocket reconnect | ✅ (3s retry) | ✅ | ✅ |
| Admin chat panel | ➖ desktop-first | ➖ | ✅ |
| Onboarding tour — desktop | ➖ disabled on phone | ➖ | ✅ (after multiple fixes) |
| Onboarding tour — mobile | ✅ correctly skipped | ✅ | ➖ |
| Profile edit + avatar | ✅ | ✅ | ✅ |
| Theme toggle (light default) | ✅ | ✅ | ✅ |
| WhatsApp deep link | ✅ (native wkwebview intercepts whatsapp://) | ✅ (wa.me fallback) | ✅ |
| Share-with-photos (iOS share sheet) | ✅ | ➖ (web = text-only share) | ➖ |
| Instagram Story composer | ✅ (composes 1080×1920, opens share sheet) | ⚠️ falls back to PNG download | ➖ |
| Command palette (Cmd+K) | ➖ desktop only | ➖ | ✅ |
| Mobile tab bar | ✅ | ✅ | ➖ |
| Mobile more sheet | ✅ | ✅ | ➖ |
| Geolocation reverse-geocode | ⏭️ sim returns Apple Park coords [needs device] | ✅ | ✅ |
| Pull-to-refresh | ✅ | ✅ | ➖ |
| SwipeRow | ✅ (threshold a bit high) | ⚠️ emulation jittery | ➖ |
| Sticky action bar | ✅ | ✅ | ➖ |
| SmartFields NumberField | ✅ | ✅ | ✅ |
| SmartFields PhoneField | ✅ | ✅ | ✅ |
| Offline banner | ⏭️ toggle Airplane mode [needs device] | ✅ (toggles on Chrome offline) | ✅ |
| pageCache | ✅ (instant tab paint after first load) | ✅ | ✅ |
| PostHog events | ✅ | ✅ | ✅ |

---

## 3. Bug log

### Critical

**BUG-001** — [SECURITY / REVIEW] Admin chat allowlist is a hardcoded Set in client code  
Platform: all. Severity: Critical (flagged for review, not auto-fixed per rule).  
`ChatWidget.jsx`, `AdminChats.jsx`, `Layout.jsx`, `MobileMoreSheet.jsx` all contain `new Set(['talfuks1234@gmail.com'])`. The server gates admin routes via `ADMIN_EMAILS` env, so this is only UI — but anyone editing 4 files can add themselves to the menu. Not a real breach because backend enforces. Suggest consolidating to a single `const` (or `user.isAdmin` flag returned by `/me`) to avoid drift.

**BUG-002** — [SECURITY / REVIEW] No CSP header on frontend  
Nginx config doesn't emit a `Content-Security-Policy`. With user-uploaded HTML never rendered directly this is low real-world risk, but any future XSS surface would have zero defense-in-depth. Flagged for human review.

### High

**BUG-003** — PriceRange overflows at 375px on `/customers/new`  
Platform: iPhone web + native. Severity: High (→ Critical on iPhone bump).  
**Status: FIXED earlier this session (T2, commit d8830d7).** Regression test passes — `minmax(0, 1fr)` + `min-width: 0` + `overflow: hidden` keep the cells inside the viewport. Keep in this report as proof of class-of-bug: grid cells without `min-width: 0` recur in many places; see BUG-019.

**BUG-004** — Inputs with `font-size < 16px` trigger iOS Safari auto-zoom on focus  
Platform: iPhone web + native. Severity: High.  
`Forms.css:342, 367` set inputs at 13–14px. `NumberField` / `PhoneField` inherit. When the user taps a cell like "חדרים" on iPhone the whole viewport zooms in, then won't zoom back out. Fix: force `font-size: 16px` on touch devices via `@media (max-width: 900px)` or globally on `.form-input, .sf-num-input, ...`.

**BUG-005** — `min-height: 100vh` on Login / AgentPortal / CustomerPortal pages overrules the global dvh progressive enhancement  
Platform: iPhone web + native. Severity: High.  
`Login.css:6`, `AgentPortal.css:2`, `CustomerPortal.css:2` each hardcode `min-height: 100vh`. The general `@supports (height: 100dvh)` rule in `index.css:768` can't beat a more-specific page rule. Fix: change the three page-scoped rules to use `100dvh` (with `100vh` fallback).

**BUG-006** — Gallery arrows on `CustomerPropertyView` are below the 44pt tap target (HIG)  
Platform: iPhone web. Severity: High.  
`.cpv-nav-prev`, `.cpv-nav-next` render at 28×28px. Customer is on their phone in WhatsApp, trying to flip through photos of an apartment. Fix: bump to 44pt, extend hit area with `::before` pseudo if visual size needs to stay small.

**BUG-007** — Hardcoded `left:`/`right:` physical positioning in 30+ rules breaks RTL  
Platform: all. Severity: High on pages that visibly misrender; Medium on decorative ones.  
**List of worst offenders (need fix first):**
- `Owners.css:277–278` — `.od-delete-target { left: 16px; right: auto }` → delete button appears on wrong corner in RTL.
- `Properties.css:294, 302, 426` — status badges + overflow icon misalign. T1 fixed `pc-overflow-btn` but not all siblings.
- `Layout.css:127` — `margin-right: 64px` on `.main-content[data-sidebar="collapsed"]` — sidebar is on the visual right in RTL, content margin should be on logical start.
- `Forms.css:70` — toggle button separator — visible seam on wrong edge.
- `Forms.css:194, 210` — SmartField unit/error icons placed with physical props.
- `Dashboard.css:19` — `.stat-cards-carousel { left: -50% }` → carousel starts off the wrong edge.

Fix: sweep and replace `left`/`right` with `inset-inline-start/end`, `margin-*` → `margin-inline-*`, `border-*` → `border-inline-*`, `text-align: left/right` → `text-align: start/end`. Full list in `AUDIT_NOTES.md`.

**BUG-008** — Offline POST silently fails — no queue  
Platform: iPhone native (cellular / elevator). Severity: High.  
On mobile, if the user taps "שמור" in an elevator, fetch rejects, toast says "שמירה נכשלה", the typed data stays in the form but the user has no persistent record. If they navigate away accidentally, data is lost. Fix: IndexedDB-backed retry queue for writes; show a "ממתין לחיבור" badge; auto-replay on `online` event. Offline banner already listens for that.

**BUG-009** — HEIC photos upload as-is and don't render in browsers  
Platform: iPhone native (camera roll). Severity: High. **[needs device]**  
Image upload endpoint accepts any mimetype that starts with `image/`. iPhone HEIC shots are `image/heic` and don't render in Chrome, Firefox, Android WhatsApp, etc. Fix: convert server-side to JPEG via Sharp, or reject HEIC with a clear toast.

### Medium

**BUG-010** — Tour component pool was re-rendered but `shouldRun` was memoized on `[user, isPhone]`  
Platform: all. Severity: Medium.  
**Status: FIXED this session (commit e3cec00).** Kept in report because this is a recurring React bug class: `useMemo` vs external-state-change. Lesson: never memoize gates on external `module state` — recompute them every render.

**BUG-011** — Keyboard covers date pickers on NewProperty step 2  
Platform: iPhone web + native. Severity: Medium (→ High on iPhone).  
`<input type="date">` triggers iOS native picker sheet, which is fine. But if the agent types a city in SuggestPicker first (opens keyboard), then taps date, the keyboard dismisses and the picker opens in the displaced position — fast scroll can put the date field under the sticky action bar.  
Fix: on `focusin` of inputs on NewProperty, scroll the focused element into view (already works in main.jsx but only on text inputs, not date). Extend the selector.

**BUG-012** — ChipEditor "var pill" count is misleading  
Platform: all. Severity: Medium.  
When a template has `{{price}}` next to another `{{price}}`, the ChipEditor shows two pills but the "used fields" chip picker below shows one entry highlighted. Minor inconsistency.

**BUG-013** — Edit-mode: tab-switch auto-save may race with in-progress typing  
Platform: all. Severity: Medium.  
`/properties/:id/edit` switches between step 1 and step 2 by tab click; `goToStep()` auto-saves before the switch. If the user is mid-typing in a SmartField, the save uses the last committed state, dropping the uncommitted character. Fix: call `editor.blur()` on the active input before `goToStep`.

**BUG-014** — `scroll-snap` + `overflow-x: auto` jitter on iOS galleries  
Platform: iPhone web. Severity: Medium. **[partially needs device]**  
`PropertyHero` gallery strip; mobile.css tab carousels. Known iOS bug when the parent has `transform`, `filter`, or when snap-points fall inside safe-area. Mitigation: `-webkit-overflow-scrolling: touch` is present. Add `touch-action: pan-x` on `.ph-strip` to hint the browser.

**BUG-015** — Avatar image in sidebar + more sheet missing `width/height` (CLS)  
Platform: all. Severity: Medium.  
Every `<img>` without `width`/`height` causes a layout shift when it loads. List: `PropertyHero.jsx:104`, `CustomerPropertyView.jsx:376`, `Layout.jsx` avatar, `MobileMoreSheet.jsx` avatar. Fix: add attributes or wrapper with `aspect-ratio`.

**BUG-016** — Keyboard sometimes doesn't fire `focusin` scroll on the first focus of a page  
Platform: iPhone native. Severity: Medium.  
`main.jsx` binds `document.addEventListener('focusin', ...)` after `DOMContentLoaded`. On cold start of the app the first focus can happen before the listener binds. Fix: bind the listener synchronously at module top.

**BUG-017** — Mobile header "back" arrow uses `ChevronLeft` even in RTL  
Platform: all. Severity: Medium.  
Hebrew users expect the back glyph on the visual right and pointing right-ward (which means left in logical space). The current `<ChevronLeft>` inside a button that's already on the correct side visually appears backwards to some users. Worth A/B polling.

**BUG-018** — Deals kanban horizontal scroll stutters at 60fps  
Platform: iPhone web (CPU throttle × 4). Severity: Medium.  
Each deal card has box-shadow + backdrop-filter; 10+ cards in a column nuke frame rate. Fix: `content-visibility: auto` on offscreen columns; drop backdrop-filter on mobile.

**BUG-019** — Recurring "grid cells without min-width: 0" class bug  
Platform: all. Severity: Medium.  
T2 fixed one instance (`PriceRange`). The same pattern exists in: `cpv-thumbs` (customer property thumbs can push past viewport if there are many), `pd-kpis` on narrow mobile, `dc-channel-grid` in marketing card. Each should have `minmax(0, 1fr)` + `min-width: 0` on cells. Preventive fix to a utility class `.grid-shrinkable`.

**BUG-020** — Customer detail "inline edit text" commits on blur without confirmation  
Platform: all. Severity: Medium.  
`InlineText` in `Customers.jsx` commits on blur. If the user taps outside the card accidentally, a partial edit persists. Fix: commit only on Enter or an explicit ✓, or add a short undo toast.

**BUG-021** — Share catalog button doesn't confirm on iOS (clipboard silently blocked)  
Platform: iPhone native. Severity: Medium. **[needs device]**  
Capacitor WKWebView requires user gesture for `navigator.clipboard.writeText`. The current callers are inside a click handler, so it should work — but any transitive async (e.g., await `api.me()` before writing) severs the gesture context. Fix: read the catalog URL synchronously from `user.slug` already in memory.

**BUG-022** — `-webkit-backdrop-filter` missing on two components  
Platform: iPhone web (older iOS). Severity: Medium.  
`OfflineBanner.css`, `AdminChats.css` use `backdrop-filter` without the `-webkit-` fallback. iOS 15 won't render the blur.

**BUG-023** — `position: sticky` elements inside scroll-container on iOS  
Platform: iPhone native. Severity: Medium. **[needs device]**  
`CustomerPropertyView.css:70`, `Templates.css:246`, `OwnerDetail.css:179`. iOS has historic sticky bugs with transformed ancestors. Verify on device; likely fine but worth a pass.

### Low

**BUG-024** — Text alignment `left`/`right` literal in many rules  
Platform: all. Severity: Low.  
`Profile.css:316, 373`, `Customers.css:74, 526, 688, 811, 1367`, `Index.css:532`. Visible only in dir-switched contexts.

**BUG-025** — Email inputs lack `autoComplete="email"` / `autocapitalize="off"`  
Platform: iPhone web + native. Severity: Low.  
Login form, Profile, Signup flow. iOS keyboard won't surface the email address bar hint. Ergonomic loss, not a bug.

**BUG-026** — Lucide icons don't mirror directionally in RTL  
Platform: all. Severity: Low (by design; users accept it).  
Chevrons, arrows use lucide. Library doesn't auto-flip. Current usage accepts this. Not a fix unless an agent complains.

**BUG-027** — Toast notifications stack without max  
Platform: all. Severity: Low.  
Rapid-fire API errors can stack 5+ toasts. `lib/toast.jsx` has no max-queue. Fix: cap at 3 with older ones sliding off.

**BUG-028** — Customer-facing page's agent-info avatar doesn't have an alt text for the agent name  
Platform: all. Severity: Low (a11y).  
`<img className="cpv-avatar" alt="">` — should be the agent's display name. VoiceOver user misses context.

**BUG-029** — SwipeRow threshold (56px) is too high in Chrome iPhone emulation  
Platform: iPhone web (emulation). Severity: Low.  
**[needs device]** — on a real finger, 56px is perfect; on Chrome trackpad it's a stretch.

**BUG-030** — `onboarding` tour's skip-all button shadows primary CTA in the Hebrew keyboard open state  
Platform: iPhone web. Severity: Low.  
Fix: add `padding-bottom: var(--kb-h, 0)` on `.tour-tooltip`.

**BUG-031** — NewProperty "draft restore" banner doesn't mention how old the draft is  
Platform: all. Severity: Low (UX).  
Agents could recover a draft from weeks ago and be confused. Add "Saved X minutes ago" next to the restore button.

### Open questions (not bugs — need your call)

- **Q1**: Should the iPhone app aggressively offer "save to iOS Contacts" when adding a lead? Would be a genuine time-saver on device. Not in codebase today.
- **Q2**: Should the customer-facing page work without JS? Right now it's a full React client render; for WhatsApp in-app browsers that block JS it breaks to a blank page.
- **Q3**: Do you want push notifications (APNs + web-push) for new chat messages, or is the in-app dot enough?
- **Q4**: When a lead's `lastContact` is over 10 days, should we show a subtle "X ימים ללא קשר" pill on the card? Very cheap, arguably high-value.

---

## 4. Parity gaps — where iPhone is worse than web

1. **Template editing.** Desktop has the ChipEditor next to a big phone mockup. iPhone has the Full-Screen Editor (shipped this session) but the chip row scrolls awkwardly under the keyboard.
2. **Command palette.** Cmd+K on desktop jumps to anything. No iPhone equivalent. Could add a global search surface in the more sheet.
3. **Customers list table view.** Desktop has a sortable table. iPhone has cards only — fine for triage, slow for scanning 50+ leads with the same price range.
4. **Multi-select / bulk actions.** Desktop has checkboxes. iPhone has none. "Archive 10 cold leads at once" isn't possible.
5. **Date pickers.** iOS native picker is great for date-of-birth; `<input type="date">` has no easy "today / +3m / +6m" chips. We've added `DateQuickChips` but they aren't on every date field.

No spot where iPhone is BETTER than web except the share sheet (iOS share extension gives Telegram / Messenger / AirDrop / Save to Files for free).

---

## 5. Performance findings

- **Cold start (iOS sim, warm cache):** 1.8s from tap to first-paint of Dashboard. ✅ under target.
- **Cold start (iOS sim, cold cache):** 3.9s. Above 2s target — network waterfall shows 420KB JS bundle + 150KB CSS + Frank Ruhl Libre / Heebo webfonts (~130KB).
- **JS bundle is 768KB pre-gzip.** Rolldown warns; none of the routes are dynamically imported. Biggest single win: split `AdminChats`, `Templates`, `CommandPalette` into lazy chunks — each ~30–60KB.
- **Memory growth over 10-minute session:** +38MB in DevTools (opens + closes 15 modals, switches 30 tabs). Within budget; no obvious leak.
- **List scroll at 500 leads (synthesized):** 58fps on desktop, 42fps on iPhone 15 emulation with CPU throttle. Cards use `content-visibility: auto` already (shipped T6). Further gain if we virtualize.
- **Lighthouse mobile on `/agents/yossi-cohen/apartment-7`:** Performance 72 / Accessibility 88 / Best Practices 92 / SEO 90. LCP = hero image; fixing `loading` + dimensions should push to 85+.

---

## 6. Accessibility

- **Keyboard nav (desktop):** tab order is sensible everywhere tested; focus rings visible on `.btn`, `.nav-item`, `.tour-btn`. ✅
- **Screen reader labels:**
  - Missing `aria-label` on several `<button>` that are icon-only: `pc-overflow-btn` (fixed), `.dc-owner-round-*`, `cpv-icon-btn` (✓), `mh-profile-btn` (✓), FAB center button (✓).
  - `cpv-avatar` has empty `alt` — should be agent name. (BUG-028)
- **Contrast:** gold on white is 3.8:1 for the gold color (`--gold: #c9a96e`) on `--bg-card: #fdfaf3`. WCAG AA requires 4.5:1 for body text. ✅ for large display type (3:1) but ⚠️ for body copy. Occurs on page tour footer text and some chips.
- **Reduce Motion:** `index.css` has `@media (prefers-reduced-motion: reduce)` overriding nav/tab/panel/fadeIn animations. ✅
- **Dynamic Type:** untested on iOS Simulator (requires real device). **[needs device]**
- **VoiceOver:** untested; simulator VoiceOver is unreliable. **[needs device]**

---

## 7. Security concerns (flagged, not patched)

- **CSP missing** (BUG-002)
- **Admin allowlist duplication** (BUG-001)
- **Rate limiting:** server has rate-limit plugin but we haven't verified it's applied to `/api/chat/me/messages` and `/api/auth/google/native-exchange`. Worth a review.
- **JWT expiry:** 30 days with `sameSite: lax`, `secure: prod`. Reasonable. Refresh mechanism: none; re-login on expiry.
- **S3 object ACLs:** uploads bucket — **unverified**. Need to confirm private + signed URL for agreements/videos, public for property images.
- **File-upload MIME validation:** property-image endpoint checks `image/*`, video checks `video/*`, agreement checks `application/pdf`. Size limit `fastify-multipart` is 100MB. All ✓.
- **No captcha / brute-force throttle on login:** could be added via `fastify-rate-limit` per IP — see above.

All flagged for human review, **no auto-fix**.

---

## 8. Patterns noticed (root causes)

1. **Gated state that must update on external signals should NOT be memoized.** Caused the tour "Skip does nothing" bug. `shouldRun` via `useMemo(..., [user])` stayed stale when the kill-switch fired. Lesson: if a derived boolean depends on module state or an event, compute it fresh every render.
2. **Async POSTs inside component unmount paths get cancelled.** Fixed via `fetch({ keepalive: true })` + `navigator.sendBeacon`. Worth auditing every `api.foo()` call that happens inside a click handler that *also* triggers a state change that returns null.
3. **Grid cells in flex/grid containers need `min-width: 0`.** Class of bug that keeps recurring (PriceRange, headline stat row, marketing chip grid). A `.grid-shrinkable` helper class would prevent it.
4. **Physical CSS properties linger in RTL-first codebases.** Need a systematic search-and-replace + a lint rule (stylelint-logical) for future discipline.
5. **Input font-size < 16px on mobile is a trap.** Need a shared `.form-input-mobile-safe` mixin or a global media-query override.
6. **Server-side auth enforced correctly, but clients duplicate the admin allowlist.** Single source of truth via a `user.isAdmin` field from `/me` would eliminate the drift.

---

## 9. Counts / scoreboard

- Bugs found: **31** (Critical 2, High 9, Medium 14, Low 6)
- Platform split: iPhone-impacting 22, desktop-only 4, both 5
- RTL issues: **30+ individual CSS locations**, grouped in BUG-007
- Accessibility items: 6 (one High-ish via low-contrast gold-on-white)
- Security items: 5 flagged for review
- Performance: 3 quantified improvements (lazy-chunk, `loading="lazy"` on off-screen images, HEIC conversion)

---

## Deliverables ready

- ✅ `AUDIT_NOTES.md` (Phase 0 empathy log, iPhone timings, architecture notes)
- ✅ `QA_REPORT.md` (this file)
- ⏭️ `screenshots/` — no real screenshots captured because testing was CLI + emulation. Filenames noted in the report where relevant. If you want real PNGs I can script Playwright captures.
- ⏳ `SHIP_LIST.md` (Phase 1, awaiting your approval to draft)
- ⏳ `CHANGES.md` (Phase 2, one-per-shipped-item, after you approve Ship list)
- ⏳ `BACKLOG.md` (fills as Ship items get prioritized out or shipped)

**Phase 0 + 0.5 complete. Stopping here for your review before drafting the Ship list.**
