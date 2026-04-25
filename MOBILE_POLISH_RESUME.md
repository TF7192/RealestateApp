# Mobile Polish — Resume Context

## What this session is doing

Implementing every actionable task in `MOBILE_POLISH_TASKS.md` for
the iPhone (Capacitor WKWebView) build. Mobile-only — no desktop
regressions.

## Key rules (must be honored by any continuation)

From `CLAUDE.md`:
- **Do NOT `git push` or `git tag`** — local commits only. Pushing is
  the user's call.
- Hebrew UI is inline JSX. RTL via `margin-inline-*`, never
  `margin-left/right`.
- Canonical buttons: `.btn .btn-primary | .btn-secondary | .btn-ghost`.
- Canonical inputs: `SmartFields` (NumberField, PhoneField,
  SelectField, Segmented), `AddressField`, `DateQuickChips`. Helper
  spreaders in `frontend/src/lib/inputProps.js`.
- Empty states: `EmptyState` component.
- API: `frontend/src/lib/api.js`. Toast: `useToast()` — no `alert`.
- No new dependencies without justification.
- No new `console.log` in shipped code.
- Keep commits scoped — one topic per commit.
- iOS app shell points its WKWebView at `https://estia.co.il/login`
  via `frontend/capacitor.config.json:server.url`.

From user memory:
- Don't push or deploy until explicitly asked.
- Test policy: fix the app, not the test. Never `export *`.
- Test stack: Vitest workspace (happy-dom + jsdom) + MSW + Playwright.
- Demo creds for verification: `agent.demo@estia.app / Password1!`.

## What was already shipped before this batch

- `frontend/ios/App/App/Info.plist` — added `NSMicrophoneUsageDescription`,
  changed `armv7` → `arm64`, removed Landscape orientations.
- `frontend/src/pages/SearchResults.jsx:177` — search input iOS
  keyboard hints (`inputMode`, `enterKeyHint`, `autoComplete`,
  `autoCorrect`, `autoCapitalize`, `spellCheck`).

## Agent slices (this batch)

Six parallel agents own non-overlapping files:

| Agent | File scope | Tasks |
|---|---|---|
| 1 | Public/auth pages | LOGIN-*, FORGOT-*, RESET-*, CONTACT-*, LEGAL-*, AGENTP-*, CPV-* (CSS), PLP-*, PROS-* |
| 2 | Dashboard / Properties / Owners / Customers | DASH-*, PROP-*, NEWP-*, PD-*, OWN-*, CUST-* |
| 3 | Profile / Settings / Calendar / Help / AI / Voice | PROF-*, AC-*, SET-*, TAG-*, NBH-*, HLP-*, INB-*, NTF-*, CAL-*, MEET-*, AI-*, VD-* |
| 4 | Search / Reports / Activity / Reminders / Public-matches / Documents / Marketing / Map / Office / Admin / 404 | SR-*, REP-*, ACT-*, REM-*, PUB-*, DOC-*, MKT-*, MAP-*, OFC-*, TEAM-*, ADM-*, NF-* |
| 5 | Deals / Contracts / Templates / Transfers / Calculator / Yad2 / Import | DEAL-*, DD-*, CONT-*, CD-*, TPL-*, TRAN-*, CALC-*, YAD-*, IMP-* |
| 6 | Shell / shared components / global CSS | SHELL-1, GLOB-1..7, IOS-5, SF-*, MOD-*, DT-*, VC-* |

## After agents return

1. `cd /Users/adam/RealestateApp/frontend && npm run lint`
2. `cd /Users/adam/RealestateApp/frontend && npm run build`
3. `cd /Users/adam/RealestateApp && npm run test:frontend`
4. Update `MOBILE_POLISH_TRACKING.md` with shipped status.
5. Commit each thematic batch — `mobile-polish: <area>` messages.
6. **Do NOT push.**

## Tasks deferred (won't ship in this batch)

- Anything marked **Needs-device** in `MOBILE_POLISH_TASKS.md` —
  requires real iPhone for verification.
- `IOS-3` (privacy manifest) — needs deliberate plist construction.
- `IOS-7` (`WKAppBoundDomains`) — high blast radius, needs OAuth
  testing.
- `BLOCKED-1..7` — explicitly need human decision.
- `YAD-5` (react-window virtualization) — adds dep.
- `DT-1` (DataTable mobile fallback) — design call.
- `GLOB-3 / GLOB-4 / A11Y-2 / A11Y-3` — adopting jsx-a11y +
  jsx-no-target-blank ESLint rules will surface dozens of fixes;
  best as a focused follow-up PR.
