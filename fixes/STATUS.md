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
| D-1 | Remove conversion funnel | Sub-2 | ⚪ | — | — | — | — | |
| D-2 | Meetings list (today + 7d, N=5) | Sub-2 | ⚪ | — | — | — | — | |
| D-3 | Leads card width | Sub-2 | ⚪ | — | — | — | — | |
| D-4 | Event count cap | Sub-2 | ⚪ | — | — | — | — | |
| D-6 | Reload lands on dashboard | Sub-2 | ⚪ | — | — | — | — | |
| F-1 | Remove new-deal from FAB | Sub-2 | ⚪ | — | — | — | — | |
| F-2 | Chat vs FAB overlap | Sub-2 | ⚪ | — | — | — | — | Same class as U-1 |
| N-1..N-17 | Assets list polish | Sub-3 | ⚪ | — | — | — | — | Large |
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
