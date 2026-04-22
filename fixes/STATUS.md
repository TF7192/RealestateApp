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
| X-1 | Print universal helper | Main | ⚪ | — | — | — | — | Blocks subagents |
| X-2 | Phone normalization utility | Main | ⚪ | — | — | — | — | Blocks subagents |
| X-3 | Placeholder styling tokens | Main | ⚪ | — | — | — | — | Blocks subagents |
| X-4 | Mutation/invalidation audit | Main | ⚪ | — | — | — | — | Blocks subagents |
| LP-1 | Pricing cards alignment | Sub-1 | ⚪ | — | — | — | — | |
| A-1 | Delete account | Sub-1 | ⚪ | — | — | — | — | Soft-delete, scary UX |
| A-2 | Google on signup | Sub-1 | ⚪ | — | — | — | — | |
| A-3 | Google button background | Sub-1 | ⚪ | — | — | — | — | |
| A-4 | First-login onboarding | Sub-1 | ⚪ | — | — | — | — | License 6–8 digits |
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
| Y-1 | Durable Yad2 notification | Sub-7 | ⚪ | — | — | — | — | Rehydrate by jobId |
| Y-2 | Async download | Sub-7 | ⚪ | — | — | — | — | Already async job; polish |
| Y-3 | Yad2 heading layout | Sub-7 | ⚪ | — | — | — | — | |
| Y-4 | Post-import reset | Sub-7 | ⚪ | — | — | — | — | |
| U-1 | Notification position + close | Sub-7 | ⚪ | — | — | — | — | |

## Log (append-only)

- **2026-04-22T17:00Z** — Discovery answers captured in `fixes/DISCOVERY.md`.
  SEC-1 investigation starts next. No subagents until SEC-1 + X-1..X-4 ship.
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
