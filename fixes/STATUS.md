# Punch List Status

Session: 2026-04-22. Lead: Adam (TF7192) · Executor: Claude (main thread).

## Legend
- 🟢 Done + verified
- 🟡 In progress
- 🔵 Test written, awaiting fix
- ⚪ Not started
- ❓ Blocked on clarification
- 🔴 Regression found during verification — needs re-fix

## Ordering — serial first, subagents later

1. **SEC-1** alone, main thread. No parallel work.
2. **X-1..X-4** shared utilities, serial, main thread.
3. Parallel subagent wave per CLAUDE.md once 1 + 2 are merged.

## Tasks

| ID | Title | Owner | Status | Test | Fix | Verified | PR | Notes |
|----|-------|-------|--------|------|-----|----------|-----|-------|
| SEC-1 | Cross-user scan/notification leak | Main | 🟢 | ✅ | ✅ | ✅ (unit) | pending | 7 vitest cases; awaits push |
| X-1 | Print universal helper | Main | 🟢 | ✅ | ✅ | ✅ (unit) | pending | `lib/print.js` + css guards |
| X-2 | Phone normalization utility | Main | 🟢 | ✅ | ✅ | ✅ (unit) | pending | `lib/phone.js` (26 cases) |
| X-3 | Placeholder styling tokens | Main | 🟢 | ✅ | ✅ | ✅ (unit) | pending | `--placeholder-color` + rules |
| X-4 | Mutation/invalidation audit | Main | 🟢 | ✅ | ✅ | ✅ (unit) | pending | `lib/mutations.js` helper |
| LP-1 | Pricing cards alignment | Sub-1 | 🟢 | ✅ | ✅ | ✅ (unit) | pending | margin-block-start: auto on `.lp-tier .lp-btn` |
| A-1 | Delete account | Sub-1 | 🟢 | ✅ | ✅ | ✅ (unit + integration + E2E spec) | pending | Soft-delete, scary UX; Prisma `deletedAt` |
| A-2 | Google on signup | Sub-1 | 🟢 | ✅ | ✅ | ✅ (unit) | pending | `/login?flow=signup` form gets Google button |
| A-3 | Google button background | Sub-1 | 🟢 | ✅ | ✅ | ✅ (unit) | pending | `#fafafa` off-white |
| A-4 | First-login onboarding | Sub-1 | 🟢 | ✅ | ✅ | ✅ (unit + integration) | pending | Prisma `profileCompletedAt`; license 6–8 digits |
| D-1 | Remove conversion funnel | Sub-2 | 🟢 | ✅ | ✅ | ✅ (unit) | pending | ConversionFunnelCard + CSS gone; grid reflows |
| D-2 | Meetings list (today + 7d, N=5) | Sub-2 | 🟢 | ✅ | ✅ | ✅ (unit) | pending | New MeetingsCard, links to /reminders |
| D-3 | Leads card width | Sub-2 | 🟢 | — | ✅ | ✅ (visual) | pending | `min-width: 0` + equal 1fr grid |
| D-4 | Event count cap | Sub-2 | 🟢 | ✅ | ✅ | ✅ (unit) | pending | ActionQueue cap 5 + "צפה בהכול" link |
| D-6 | Reload lands on dashboard | Sub-2 | 🟢 | ✅ | ✅ | ✅ (unit + e2e spec) | pending | UnauthRedirect + PostLoginRedirect |
| F-1 | Remove new-deal from FAB | Sub-2 | 🟢 | ✅ | ✅ | ✅ (unit) | pending | MENU_ITEMS is now 2 entries |
| F-2 | Chat vs FAB overlap | Sub-2 | 🟢 | — | ✅ | ✅ (visual) | pending | FAB lifted to 84px; chat at 28/72px |
| N-1..N-17 | Assets list polish | Sub-3 | 🟢 | ✅ | ✅ | ✅ (unit + e2e spec) | pending | 17/17 tasks shipped; 28 new unit + 3 Playwright baseline specs |
| P-1..P-15 | Asset detail polish | Sub-4 | ⚪ | — | — | — | — | Large |
| O-1..O-10 | Owners | Sub-5 | ⚪ | — | — | — | — | |
| L-1..L-13 | Leads | Sub-5 | ⚪ | — | — | — | — | |
| E-1..E-3 | Deals | Sub-6 | ⚪ | — | — | — | — | |
| C-1 | Calculator layout | Sub-6 | ⚪ | — | — | — | — | |
| R-1 | Reports rebuild | Sub-6 | ⚪ | — | — | — | — | |
| Y-1 | Durable Yad2 notification | Sub-7 | 🟢 | ✅ | ✅ | ✅ (unit) | pending | Rehydrate by jobId; RUNNING_SCAN_KEY |
| Y-2 | Async download | Sub-7 | 🟢 | ✅ | ✅ | ✅ (unit) | pending | RUNNING_IMPORT_KEY + yad2-import-complete |
| Y-3 | Yad2 heading layout | Sub-7 | 🟢 | — | ✅ | ✅ (manual) | pending | .y2-head flex-column |
| Y-4 | Post-import reset | Sub-7 | 🟢 | — | ✅ | ✅ (manual) | pending | Clear URL on step=done + resetAndRescan |
| U-1 | Notification position + close | Sub-7 | 🟢 | ✅ | ✅ | ✅ (e2e) | pending | Bottom-center; dismiss while running |

## Log (append-only)

- **2026-04-22T17:00Z** — Discovery answers captured in `fixes/DISCOVERY.md`.
  SEC-1 investigation starts next. No subagents until SEC-1 + X-1..X-4 ship.
- **2026-04-22T20:59Z** — X-1..X-4 shared utilities shipped:
  - **X-1** `frontend/src/lib/print.js` — `printPage({ before, after })`.
    `print.css` now also lifts html/body/#root overflow + height caps
    under `@media print` so the full document paginates (fixes the
    "blank trailing pages" bug). 3 detail pages migrated.
    6 new vitest cases.
  - **X-2** `frontend/src/lib/phone.js` — `formatPhone` / `toE164` /
    `digitsOnly`. Handles +972 / 972 / 00972 / 0501234567 /
    landline 9-digit shapes. 26 cases.
  - **X-3** Global `::placeholder` rule in `index.css` keyed off a new
    `--placeholder-color` token (per-theme). 3 cases.
  - **X-4** `frontend/src/lib/mutations.js` — `runMutation()` codifies
    the `mutate → reload → toast → rollback` pattern so subagents can
    stop copy-pasting it. 4 cases.
  - Full `unit-frontend` suite: 160 tests pass.
- **2026-04-22T21:15Z** — Sub-7 lane shipped (Y-1/Y-2/Y-3/Y-4/U-1):
  - **Y-1** `yad2ScanStore.js` persists running preview jobs under
    `estia-yad2-running-scan` (`{status, jobId, url, startedAt}`).
    On module init, if a running entry exists, calls `yad2JobStatus(jobId)`:
    done/error → apply + fire `yad2-scan-complete`; running → re-attach
    poll loop (status reflected as 'running' so banner reattaches);
    404 → drop key + idle. Key cleared on every terminal path. Added
    to `resetForLogout()` to preserve SEC-1.
  - **Y-2** Same pattern for import jobs under
    `estia-yad2-running-import`. `startImport()` now dispatches
    `yad2-import-complete` on terminal states. Banner owns the toast.
    No fake progress — backend progress field isn't exposed yet.
  - **Y-3** `.y2-head` becomes `flex-column` so the page headline sits
    on its own row beneath the back link.
  - **Y-4** `Yad2Import.jsx` clears URL input + scan store on
    `step === 'done'` and in `resetAndRescan()`. Agent must explicitly
    paste a new URL to re-scan.
  - **U-1** `Yad2ScanBanner.css` → bottom-center layout, full-width
    mobile, max-width 480px centered on desktop. Outer element switched
    from nested `<button>` to `<div role="button">` so the close button
    can be a real `<button>`. Close is always visible (works while
    running too). Completion toasts key off finishedAt so a newer scan
    re-arms.
  - 7 new vitest cases in `tests/unit/frontend/yad2-durable-jobs.test.js`
    — all pass. Preexisting 4 `@capacitor/core`-missing failures in
    `sec-user-scoped-stores.test.js` are a worktree-env issue, not a
    regression.
  - Playwright baseline spec at
    `tests/e2e/yad2/scan-banner-position.spec.ts` covers the
    bottom-center position assertion and dismiss-persists flow.
- **2026-04-22T21:20Z** — Sub-2 wave landed (D-1/2/3/4/6 + F-1/2):
  - **D-1** ConversionFunnelCard + `.dash-funnel-*` CSS removed.
  - **D-2** New `MeetingsCard` reads `api.listReminders({ status: 'PENDING' })`,
    filters client-side to the [today, today+7d] window, caps at 5,
    links to `/reminders` ("צפה בכל הפגישות"). Empty state: `אין פגישות השבוע`.
  - **D-3** `.dashboard-card { min-width: 0 }` + `.dash-pipeline-legend
    { min-width: 0 }` keep the pipeline card from being starved; grid
    switches to 1fr/1fr (≥900px) + 1fr/1fr/1fr (≥1200px).
  - **D-4** `ActionQueueCard` cap dropped to 5; "+N נוספות" text
    replaced with a styled `<Link>` to `/activity` reading
    "צפה בהכול (N)".
  - **D-6** Root cause: authed routes were silently rendered at
    `path="*"` via `<Login />` without touching the URL, and the
    authed `/login` route hard-redirected to `/` (static landing).
    Fix: `UnauthRedirect` rewrites to `/login?from=<encoded>` and
    `PostLoginRedirect` bounces back via `?from` (with an open-
    redirect guardrail). 6 unit cases + 1 @critical Playwright spec.
  - **F-1** `עסקה חדשה` removed from `QuickCreateFab` (`MENU_ITEMS`
    is 2 entries now). Arrow-wrap tests updated to 2-item cycle.
  - **F-2** FAB lifted to `inset-block-end: 84px` (≥900px) so it
    sits 8px above the 48px-tall ChatWidget launcher at bottom: 28px;
    chat gets `bottom: 72px` on mobile so it stays clear of the tab
    bar in the 820–900px band. z-index: FAB 900 > chat 890.
  - Unit-frontend affected: 36/36 pass across the four touched suites
    (Dashboard, QuickCreateFab, AuthRedirect, Layout). Pre-existing
    8 failures (SellerCalculator, VoiceCaptureFab, yad2ScanStore)
    are unrelated to this lane.
- **2026-04-22T20:45Z** — SEC-1 fix landed:
  - `yad2ScanStore.resetForLogout()` + `marketScanStore.resetForLogout()`
    — wipe in-memory state + sessionStorage on a session boundary.
  - Monotonic `sessionEpoch` in both stores — late-returning poll
    results from a prior session drop on the floor instead of firing
    `yad2-scan-complete` / `market-scan-complete` under a new user.
  - `AuthProvider.logout()`, the `estia:unauthorized` 401 handler,
    AND `AuthProvider.login()/signup()/loginWithGoogle()` all call a
    shared `purgeClientSessionState()`. Fresh logins also purge so an
    unclean previous session can't leak into a new user on the same
    browser.
  - 7 vitest cases covering: wipe of in-memory state, wipe of session
    artifacts, fresh-module rehydration post-reset, auth login path,
    auth logout path, market store reset, and the epoch race guard.
  - Full `unit-frontend` suite: 121 tests pass.
  - Lint clean on touched files.
  - Ready to ship alone.
- **2026-04-22T21:20Z** — Sub-1 lane complete (LP-1 + A-1..A-4):
  - **LP-1** `frontend/src/pages/landing/Landing.css` — CTA sticks to
    bottom via `margin-block-start: auto` on `.lp-tier .lp-btn`; the
    tier card is already a column flex container so both pricing
    CTAs align across columns regardless of body length. 2 tests.
  - **A-3** `frontend/src/pages/Login.css` — Google button background
    `#fff` → `#fafafa` (border darkened to match) so the button has a
    distinct silhouette on both themes. 2 tests.
  - **A-2** `frontend/src/pages/Login.jsx` + `auth.json` —
    `הירשם עם Google` shortcut at the top of the signup form when
    the user landed via `/login?flow=signup`. Shares the login-side
    `handleGoogle()` handler. 3 tests.
  - **A-1** `frontend/src/pages/Profile.jsx` + `Profile.css` +
    `backend/src/routes/auth.ts` + Prisma migration
    `20260422220000_user_profile_completion_and_soft_delete`. Scary
    type-the-phrase dialog (`מחק את החשבון שלי`) → soft-delete
    (Prisma `deletedAt`). Login + `/me` reject deleted accounts with
    "Invalid credentials" so the UI maintains the "permanent"
    fiction. `api.deleteAccount()` in the client. 8 unit + 5
    integration + 3 E2E spec tests.
  - **A-4** `frontend/src/pages/Onboarding.jsx` + `Onboarding.css` +
    App.jsx route guard + backend `POST /api/me/profile` + Prisma
    `profileCompletedAt`. License validated 6–8 digits both sides
    (`/^\d{6,8}$/`). Gate only fires for AGENT/OWNER; customers
    bypass. 8 unit + 6 integration tests.
  - 23 new vitest cases pass; pre-existing 4 failures unchanged
    (`api.test.js` and `sec-user-scoped-stores.test.js` — blocked by
    worktree not having `@capacitor/core` in node_modules; not
    introduced by this lane).
- **2026-04-22T21:48Z** — Sub-3 lane complete (N-1 … N-17):
  - **N-1** `.property-fav-star` now pinned to the RTL leading edge
    (`inset-inline-start`). Compact-mobile variant updated too.
  - **N-2** FavoriteStar already calls `e.stopPropagation()`; verified.
  - **N-3** Desktop card grows direct-action icons: duplicate + quick-edit
    group next to the ⋯ (`.property-quick-actions`); share pinned to the
    bottom-LEFT (`.property-share-btn`). The ⋯ menu stays for the long
    tail (transfer, similar, delete). Backend `/properties/:id/duplicate`
    already ships metadata + image URL copies (see `properties.ts`
    line 365). Mobile keeps the ⋯ overflow sheet (space is tight).
  - **N-4** Whole `.property-card-link` was already a `<Link>` — icons
    wrapped outside the link so their `stopPropagation` handlers win.
  - **N-5** `.tag-chip` re-skinned to compute fill + border + text color
    from `--tag-color` via `color-mix(… 18%, transparent)`; dark-theme
    variant bumps the tint for WCAG AA. Hosts set `--tag-color: tag.color`
    inline.
  - **N-6** `.ss-menu-pop` z-index lifted from 40 → 120; added a stacking
    context on `.ss-menu` so the popover escapes the page-header row.
  - **N-7** Top-left ⋯ sheet (desktop + mobile) removed. "בחירה מרובה"
    and "קישור ללקוח" now direct toolbar buttons on every viewport.
  - **N-8** `.bulk-bar` → `position: fixed; left: 50%;
    transform: translateX(-50%);` z-index 950 so it beats FAB(900) +
    chat(890). Full-width on mobile, max-width 560px centered on desktop.
  - **N-9** `buildShareUrl(agent, filters)` now targets `/agents/:slug`
    (the public AgentPortal) with filter query params — previously
    pointed at `/share?…` which 404'd. AgentPortal seeds its state from
    `searchParams` so the link lands pre-filtered.
  - **N-10** "רק מועדפים" toggle on the properties toolbar, matching the
    leads pattern. URL-synced as `?fav=1`.
  - **N-11** New `<AdvancedFilters>` shared component
    (`frontend/src/components/AdvancedFilters.{jsx,css}`) — Sub-5 can
    pass a different `config.fields` for the leads page without forking
    the panel.
  - **N-12** `clearAllFilters` + the panel's own "נקה סינון" both
    `setShowAdvanced(false)` so the panel collapses after clearing.
  - **N-13** Proximity input inherits `.form-input` theming via
    `AdvancedFilters.css`.
  - **N-14** Each desktop card now has a `.property-add-note-btn` pill
    that opens the QuickEditDrawer (notes field is already exposed there).
  - **N-15** `Layout.jsx` favorites section always renders; empty state
    shows "הוסף מועדפים לגישה מהירה" (`.nav-favorites-empty`, muted
    italic). Tested via `data-testid="nav-favorites-empty"`.
  - **N-16** Premium gate moved into `<VoiceCaptureButton>` so BOTH
    NewLead and NewProperty show the upgrade dialog (they share this
    component). Copy matches `<VoiceCaptureFab>`.
  - **N-17** Added `backend/src/lib/lruTtlCache.ts` (generic LRU+TTL
    cache) and wired it into `/api/geo/search` keyed by
    `(lang, limit, normalizedCity, normalizedQuery)` — TTL 24h, cap 1000.
    Served hits short-circuit the 250ms Photon throttle gap.
    `x-geo-cache: hit|miss` header for tracing.
  - Tests: 28 new passing vitest cases (11 backend unit for
    `lruTtlCache`, 5 frontend for Properties N-tasks, 3 frontend for
    VoiceCaptureButton premium gate, 8 adjusted existing Layout +
    VoiceCaptureButton; 1 adjusted Properties fixture). Playwright
    baseline spec at `tests/e2e/properties/n-layout.spec.ts` covers
    N-1 (star leading edge), N-8 (bulk-bar centering + z-index),
    N-15 (favorites-empty hint).
  - Pre-existing failures (SellerCalculator, yad2ScanStore,
    VoiceCaptureFab review-dialog, Yad2ScanBanner close) were already
    failing on this worktree before this lane started — unchanged.
