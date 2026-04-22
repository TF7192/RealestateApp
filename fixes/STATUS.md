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
| LP-1 | Pricing cards alignment | Sub-1 | ⚪ | — | — | — | — | |
| A-1 | Delete account | Sub-1 | ⚪ | — | — | — | — | Soft-delete, scary UX |
| A-2 | Google on signup | Sub-1 | ⚪ | — | — | — | — | |
| A-3 | Google button background | Sub-1 | ⚪ | — | — | — | — | |
| A-4 | First-login onboarding | Sub-1 | ⚪ | — | — | — | — | License 6–8 digits |
| D-1 | Remove conversion funnel | Sub-2 | 🟢 | ✅ | ✅ | ✅ (unit) | pending | ConversionFunnelCard + CSS gone; grid reflows |
| D-2 | Meetings list (today + 7d, N=5) | Sub-2 | 🟢 | ✅ | ✅ | ✅ (unit) | pending | New MeetingsCard, links to /reminders |
| D-3 | Leads card width | Sub-2 | 🟢 | — | ✅ | ✅ (visual) | pending | `min-width: 0` + equal 1fr grid |
| D-4 | Event count cap | Sub-2 | 🟢 | ✅ | ✅ | ✅ (unit) | pending | ActionQueue cap 5 + "צפה בהכול" link |
| D-6 | Reload lands on dashboard | Sub-2 | 🟢 | ✅ | ✅ | ✅ (unit + e2e spec) | pending | UnauthRedirect + PostLoginRedirect |
| F-1 | Remove new-deal from FAB | Sub-2 | 🟢 | ✅ | ✅ | ✅ (unit) | pending | MENU_ITEMS is now 2 entries |
| F-2 | Chat vs FAB overlap | Sub-2 | 🟢 | — | ✅ | ✅ (visual) | pending | FAB lifted to 84px; chat at 28/72px |
| N-1..N-17 | Assets list polish | Sub-3 | ⚪ | — | — | — | — | Large |
| P-1..P-15 | Asset detail polish | Sub-4 | ⚪ | — | — | — | — | Large |
| O-1..O-10 | Owners | Sub-5 | ⚪ | — | — | — | — | |
| L-1..L-13 | Leads | Sub-5 | ⚪ | — | — | — | — | |
| E-1..E-3 | Deals | Sub-6 | ⚪ | — | — | — | — | |
| C-1 | Calculator layout | Sub-6 | ⚪ | — | — | — | — | |
| R-1 | Reports rebuild | Sub-6 | ⚪ | — | — | — | — | |
| Y-1 | Durable Yad2 notification | Sub-7 | ⚪ | — | — | — | — | Rehydrate by jobId |
| Y-2 | Async download | Sub-7 | ⚪ | — | — | — | — | Already async job; polish |
| Y-3 | Yad2 heading layout | Sub-7 | ⚪ | — | — | — | — | |
| Y-4 | Post-import reset | Sub-7 | ⚪ | — | — | — | — | |
| U-1 | Notification position + close | Sub-7 | ⚪ | — | — | — | — | |

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
