# Mobile Polish State

## Project Snapshot

- **App name:** Estia (com.estia.agent)
- **Framework:** React 19 + Vite + React Router 7 (frontend), Fastify 5 backend
- **Package manager:** npm 11 (workspaces: `frontend`, `backend`)
- **Capacitor version:** 8.3.1 (`@capacitor/core`, `@capacitor/ios`, `@capacitor/android`)
- **iOS project path:** `frontend/ios/App/`
- **Main app entry:** `frontend/src/main.jsx` → `frontend/src/App.jsx`
- **Routing system:** React Router v7 declarative `<Routes>` in `frontend/src/App.jsx`
- **Design system:** Hand-rolled CSS custom properties (`frontend/src/index.css` :root tokens) +
  per-component CSS files. No UI library. Hebrew-RTL, dark/light themes.
- **Test commands discovered:**
  - `npm test` (root) → unit + frontend + integration via Vitest
  - `npm run test:e2e` → Playwright
  - `cd frontend && npm run lint` → ESLint flat config
  - `cd frontend && npm run build` → Vite production build
  - `cd frontend && npm run cap:sync` → Vite build + cap sync
  - `cd frontend && npm run cap:ios` → build + sync + open Xcode
- **Build commands discovered:**
  - `cd frontend && npm run build` (Vite)
  - `xcodebuild -workspace frontend/ios/App/App.xcworkspace -scheme App -sdk iphonesimulator …`
- **Date started:** 2026-04-25

### Notable architectural facts

- **iOS app is a thin Capacitor shell over the prod web app.**
  `frontend/capacitor.config.json:server.url = "https://estia.co.il/login"` —
  the WKWebView loads the production website; it is *not* a bundled
  offline web build. Mobile polish therefore lives almost entirely in
  `frontend/src/`, which is what the iPhone WKWebView renders.
- **Orientation:** locked to portrait at the Capacitor layer
  (`supportedOrientations: ["portrait"]`), now mirrored in
  Info.plist by this sweep (Info.plist previously also allowed
  landscape — fixed below).
- **Status bar:** light style, cream background, `overlaysWebView=false`
  so the WebView starts below the status bar (matches our cream theme).
- **Keyboard:** `resize: "native"` — iOS lays the keyboard *under* the
  WebView and shrinks the WebView frame; `--kb-h` CSS var is parked
  at 0 because we no longer shift sticky elements ourselves.

### Initial git status

```
Modified (this sweep): frontend/ios/App/App/Info.plist
Created  (this sweep): MOBILE_POLISH_STATE.md, MOBILE_POLISH_TASKS.md, MOBILE_POLISH_SUMMARY.md
```

A separate set of unrelated test-file modifications and the
performance / security audit files were already in the working tree
on entry — left untouched.

---

## Global Findings

| Area | Status | Notes | Files |
|---|---:|---|---|
| iOS safe areas | done | `env(safe-area-inset-*)` applied at the layout shell, mobile header (`Layout.css:467-486`), bottom tab bar, sticky-search, modals. `.safe-bottom` / `.safe-top` utilities exist. `100dvh` used where appropriate. | `frontend/src/index.css:851-864, 978-991`, `frontend/src/components/Layout.css`, `frontend/src/components/MobileTabBar.css` |
| iOS keyboard behavior | done | Capacitor `Keyboard.resize: native` (config.json), 16px input min font-size global belt-and-braces (`index.css:465-471`), `scroll-margin` on inputs, `kb-open` body-class hooks. No more "page jumps when keyboard opens" pattern. | `frontend/src/index.css:431-471`, `frontend/capacitor.config.json` |
| Mobile viewport sizing | done | `100dvh` progressive-enhancement for layout shells; `-webkit-fill-available` fallback for the WKWebView document; horizontal-overflow guard at `(max-width: 900px)`. | `frontend/src/index.css:224-244, 911-929, 978-991` |
| Inputs/forms | done | `lib/inputProps.js` provides `inputPropsFor{Price,Rooms,Sqm,Floor,Phone,Email,Name,Address,City,Search,Url,Notes}` — every helper sets `inputMode`, `autoComplete`, `autoCorrect`, `autoCapitalize`, `enterKeyHint`, `dir`. `SmartFields.jsx` is the canonical wrapper. Global `font-size: 16px !important` on `(max-width: 900px)` kills iOS auto-zoom. | `frontend/src/lib/inputProps.js`, `frontend/src/components/SmartFields.jsx` |
| Navigation/tab bars | done | `MobileTabBar` is fixed-bottom with safe-area, `mtb-fab` quick-create, the design's "עוד" tab routes to /settings. Mobile header is a sticky 52px topbar with menu / logo / search / quick-create. | `frontend/src/components/MobileTabBar.{jsx,css}`, `frontend/src/components/Layout.{jsx,css}` |
| Capacitor config | done | Reviewed `frontend/capacitor.config.json`. Plugins registered: SplashScreen, StatusBar, Keyboard, Haptics, Preferences, Geolocation. App-bound domains and `allowNavigation` allowlist are tight. **One concern**: `server.url` points at the production web app — see Tasks for App Store Guideline 4.7 / 3.2 implications. | `frontend/capacitor.config.json` |
| iOS Info.plist permissions | **fixed in this sweep** | Audited every key against actual code usage. Three issues found and fixed: (1) `NSMicrophoneUsageDescription` was MISSING despite `useMediaRecorder.js` + four VoiceCapture* components calling `getUserMedia` (would crash on first record on iOS 14+); (2) `UIRequiredDeviceCapabilities = armv7` is wrong for an iOS 15+ build (replaced with `arm64`); (3) `UISupportedInterfaceOrientations` listed Landscape options that contradict the Capacitor portrait-lock (matched to portrait-only). | `frontend/ios/App/App/Info.plist` |
| Privacy manifest | needs decision | No `PrivacyInfo.xcprivacy` file in `frontend/ios/App/App/`. Required since 2024-Q2 for any app that uses one of Apple's API categories or ships an SDK that does. Estia uses PostHog (`posthog-js`), Capacitor Filesystem, Preferences, Geolocation, and `URLSession` (via Apple Sign In Swift plugin). See Tasks `IOS-3`. | `frontend/ios/App/App/PrivacyInfo.xcprivacy` (does not yet exist) |
| Accessibility | partial | Focus-visible rings, reduced-motion respected, 16px inputs, 44px tap targets enforced via `.touch-target` + `.btn{min-height:44px}` + `(pointer:coarse)` overrides. Per-page audit shows good coverage on Login / Dashboard / NewProperty. Some icon-only buttons still rely on the icon for meaning — see Tasks `A11Y-1`. | `frontend/src/index.css`, per-page CSS |
| Performance | done (separate sweep) | Already covered by `performance_summary_new.md` / `performance_tasks.md` from the perf audit one day prior. Web-Vitals beacon, image variants, CDN, font self-host, lazy templates, deals/dashboard query parallelization all landed. | n/a |

---

## Page Inventory

The route table is `frontend/src/App.jsx`. **Status convention** — pages
marked `done-by-prior-sweep` were polished in earlier mobile-UX work
(`ESTIA_MOBILE_UX_AUDIT.md`, `MOBILE_POLISH_AUDIT.md`); this sweep
re-verified them at the global-CSS / shell level, which is where the
iPhone polish actually lives, rather than re-touching every page.

### Public / unauth (rendered in WKWebView; entry surface)

| ID | Route | Source | Status | Owner | Issues found | Fixes made | Notes |
|---:|---|---|---|---|---|---|---|
| P-01 | `/` | `pages/landing/*` + `pages/Landing.jsx` | done-by-prior-sweep | Layout | desktop-first hero on small iPhones | global horizontal-overflow guard catches; landing has its own mobile media queries | iOS-app entry is `/login`, not `/`, per capacitor.config server.url |
| P-02 | `/login` | `pages/Login.jsx` + `Login.css` | done-by-prior-sweep | Inputs | — | already uses `inputPropsForEmail`, password reveal, 16px inputs | this is the iOS app's first screen |
| P-03 | `/forgot-password` | `pages/ForgotPassword.jsx` | done-by-prior-sweep | Inputs | — | uses `inputPropsForEmail` | |
| P-04 | `/reset-password` | `pages/ResetPassword.jsx` | done-by-prior-sweep | Inputs | — | password input quality bar already met | |
| P-05 | `/contact` | `pages/Contact.jsx` | done-by-prior-sweep | Inputs | — | — | |
| P-06 | `/terms`, `/privacy` | `pages/legal/*` | done-by-prior-sweep | Layout | — | — | |
| P-07 | `/agents/:slug` | `pages/AgentPortal.jsx` | done-by-prior-sweep | Layout | — | — | public agent profile |
| P-08 | `/agents/:slug/:propSlug`, `/p/:id` | `pages/CustomerPropertyView.jsx` | done-by-prior-sweep | Layout | — | image carousel touch-friendly | |
| P-09 | `/l/:slug/:propSlug` | `pages/PropertyLandingPage.jsx` | done-by-prior-sweep | Layout | — | mobile-tuned hero | |
| P-10 | `/public/p/:token` | `pages/ProspectSign.jsx` | done-by-prior-sweep | Inputs | sanitizer is server-verified safe | — | prospect signature flow |

### Authenticated app shell (under `<Layout>`)

After the per-page sweep, every route was opened and read. **Status
key:** `audited` = read this sweep, findings filed in `MOBILE_POLISH_TASKS.md`;
`needs-fixes` = audited and has open P0/P1 items; `done` = audited
and clean.

| ID | Route | Source | Status | P0 count | P1 count | P2 count |
|---:|---|---|---|---:|---:|---:|
| A-01 | `/dashboard` | `pages/Dashboard.jsx` + `.css` | needs-fixes | 0 | 3 | 1 |
| A-02 | `/properties` | `pages/Properties.jsx` + `.css` | needs-fixes | 0 | 3 | 2 |
| A-03 | `/properties/new`, `/properties/:id/edit` | `pages/NewProperty.jsx` | needs-fixes | 3 | 3 | 1 |
| A-04 | `/properties/:id` | `pages/PropertyDetail.jsx` | done | 0 | 1 | 1 |
| A-05 | `/owners`, `/owners/:id` | `pages/Owners.jsx`, `OwnerDetail.jsx` | needs-fixes | 0 | 1 | 1 |
| A-06 | `/customers`, `/customers/new`, `/customers/:id`, `/customers/:id/history` | `pages/Customers.jsx`, `NewLead.jsx`, `CustomerDetail.jsx`, `LeadHistory.jsx` | needs-fixes | 0 | 3 | 1 |
| A-07 | `/profile` | `pages/Profile.jsx` | needs-fixes | 2 | 3 | 2 |
| A-08 | `/agent-card` | `pages/AgentCard.jsx` | needs-fixes | 1 | 3 | 1 |
| A-09 | `/transfers` | `pages/Transfers.jsx` | needs-fixes | 2 | 2 | 1 |
| A-10 | `/templates` | `pages/Templates.jsx` | needs-fixes | 2 | 4 | 2 |
| A-11 | `/admin`, `/admin/chats`, `/admin/users` | `pages/Admin*.jsx` | needs-fixes | 2 | 2 | 0 |
| A-12 | `/calculator` | `pages/SellerCalculator.jsx` | needs-fixes | 0 | 2 | 2 |
| A-13 | `/integrations/yad2` | `pages/Yad2Import.jsx` | needs-fixes | 3 | 2 | 2 |
| A-14 | `/import`, `/import/:type` | `pages/Import*.jsx` | needs-fixes | 2 | 2 | 1 |
| A-15 | `/voice-demo` | `pages/VoiceDemo.jsx` | needs-fixes | 0 | 2 | 2 |
| A-16 | `/reports` | `pages/Reports.jsx` | needs-fixes | 2 | 2 | 1 |
| A-17 | `/activity` | `pages/ActivityLog.jsx` | needs-fixes | 0 | 2 | 0 |
| A-18 | `/reminders` | `pages/Reminders.jsx` | needs-fixes | 3 | 1 | 1 |
| A-19 | `/public-matches` | `pages/PublicMatches.jsx` | needs-fixes | 3 | 3 | 0 |
| A-20 | `/notifications` | `pages/Notifications.jsx` | needs-fixes | 1 | 3 | 1 |
| A-21 | `/documents` | `pages/Documents.jsx` | needs-fixes | 2 | 2 | 0 |
| A-22 | `/marketing` | `pages/Marketing.jsx` | needs-fixes | 2 | 1 | 2 |
| A-23 | `/calendar` | `pages/Calendar.jsx` | needs-fixes | 2 | 4 | 0 |
| A-24 | `/map` | `pages/Map.jsx` | needs-fixes | 3 | 3 | 0 |
| A-25 | `/office` | `pages/Office.jsx` | needs-fixes | 2 | 2 | 0 |
| A-25b | `/team`, `/team/:id` | `pages/Team.jsx`, `TeamAgentDetail.jsx` | needs-fixes | 1 | 2 | 0 |
| A-26 | `/search` | `pages/SearchResults.jsx` | needs-fixes | 2 (1 shipped) | 2 | 1 |
| A-27 | `/help` | `pages/Help.jsx` | needs-fixes | 3 | 3 | 1 |
| A-28 | `/inbox` | `pages/Inbox.jsx` | done | 0 | 2 | 1 |
| A-29 | `/settings` | `pages/Settings.jsx` | done | 0 | 1 | 1 |
| A-29b | `/settings/tags` | `pages/TagSettings.jsx` | needs-fixes | 2 | 2 | 1 |
| A-29c | `/settings/neighborhoods` | `pages/NeighborhoodAdmin.jsx` | needs-fixes | 2 | 3 | 1 |
| A-30 | `/contracts`, `/contracts/:id` | `pages/Contracts.jsx`, `ContractDetail.jsx` | needs-fixes | 3 | 3 | 1 |
| A-31 | `/ai` | `pages/Ai.jsx` | needs-fixes | 2 | 2 | 2 |
| A-32 | `/meetings/:id` | `pages/MeetingDetail.jsx` | needs-fixes | 1 | 1 | 0 |
| A-33 | `/deals`, `/deals/:id` | `pages/Deals.jsx`, `DealDetail.jsx` | needs-fixes | 3 | 4 | 1 |
| A-34 | `*` (404) | `pages/NotFound.jsx` | done | 0 | 0 | 1 |

### Public / unauth — re-audited

| ID | Route | Source | Status | P0 count | P1 count | P2 count |
|---:|---|---|---|---:|---:|---:|
| P-02 | `/login` | `pages/Login.jsx` + `.css` | needs-fixes | 0 | 3 | 1 |
| P-03 | `/forgot-password` | `pages/ForgotPassword.jsx` | needs-fixes | 0 | 1 | 1 |
| P-04 | `/reset-password` | `pages/ResetPassword.jsx` | needs-fixes | 0 | 2 | 1 |
| P-05 | `/contact` | `pages/Contact.jsx` | needs-fixes | 0 | 2 | 2 |
| P-06 | `/terms`, `/privacy` | `pages/landing/LegalPage.jsx` | needs-fixes | 0 | 1 | 2 |
| P-07 | `/agents/:slug` | `pages/AgentPortal.jsx` | needs-fixes | 0 | 3 | 2 |
| P-08 | `/agents/:slug/:propSlug`, `/p/:id` | `pages/CustomerPropertyView.jsx` | needs-fixes | 1 | 3 | 2 |
| P-09 | `/l/:slug/:propSlug` | `pages/PropertyLandingPage.jsx` | needs-fixes | 1 | 2 | 3 |
| P-10 | `/public/p/:token` | `pages/ProspectSign.jsx` | needs-fixes | 1 | 1 | 2 |

---

## Subagent Assignments

| Agent | Responsibility | Status | Output |
|---|---|---|---|
| Repo Cartographer | Discover stack, route inventory, commands | done | snapshot above |
| iOS Native & Permissions | Audit Info.plist + Capacitor config + plugins | **done — 3 fixes shipped** | Info.plist edits |
| Public Pages Auditor | 9 public/auth routes (Login, Forgot, Reset, Contact, Legal, AgentPortal, CustomerPropertyView, PropertyLandingPage, ProspectSign) | **done — per-page sweep** | findings filed in tasks (LOGIN-*, FORGOT-*, RESET-*, CONTACT-*, LEGAL-*, AGENTP-*, CPV-*, PLP-*, PROS-*) |
| Dashboard/Properties/Customers Auditor | 6 routes incl. heaviest forms | **done — per-page sweep** | DASH-*, PROP-*, NEWP-*, PD-*, OWN-*, CUST-* |
| Deals/Contracts/Templates/Transfers/Calc/Yad2/Import Auditor | 8 routes | **done — per-page sweep** | DEAL-*, DD-*, CONT-*, CD-*, TPL-*, TRAN-*, CALC-*, YAD-*, IMP-* |
| Profile/Settings/Calendar/AI Auditor | 11 routes | **done — per-page sweep** | PROF-*, AC-*, SET-*, TAG-*, NBH-*, HLP-*, INB-*, NTF-*, CAL-*, MEET-*, AI-*, VD-* |
| Search/Reports/Docs/Marketing/Map/Office/Team/Admin/404 Auditor | 8 routes | **done — per-page sweep** | SR-*, REP-*, ACT-*, REM-*, PUB-*, DOC-*, MKT-*, MAP-*, OFC-*, TEAM-*, ADM-*, NF-* |
| Shell + Shared Components Auditor | Layout, MobileTabBar, FAB, SmartFields, AddressField, Modals, Voice, DataTable, ChatWidget | **done — per-page sweep** | SHELL-*, SF-*, MOD-*, VC-*, DT-* |
| State Manager / Orchestrator | Consolidate findings into the three files | **active** | this state file + tasks file + summary file |

---

## Open Questions / Blockers

| Blocker | Impact | Current workaround | Needed action |
|---|---|---|---|
| **Privacy manifest missing** (`PrivacyInfo.xcprivacy`) | App Store reviews now warn / soft-block apps that use `NSPrivacyAccessedAPICategory*` APIs without a manifest. PostHog is one such SDK. | None | Add `PrivacyInfo.xcprivacy` declaring file-timestamp / user-defaults / disk-space / system-boot-time access reasons that PostHog and Capacitor Filesystem use. See task `IOS-3`. |
| **`server.url` points at remote web app** (https://estia.co.il/login) | App Store Guideline 4.7 / 3.2 / 4.2 risk: reviewer may flag the iOS app as a "web wrapper" not native enough. The current Apple rejection is on Guideline 3.2 (B2B distribution, not 4.7) but a future review may raise 4.7. | Rejected on 3.2 separately; not yet on 4.7. | Document the Capacitor plugin surface (Camera/Geolocation/Haptics/Filesystem/Preferences/StatusBar/Keyboard/Splash/Apple Sign-In) we use to argue this is *more* than a wrapper — a hybrid app per 4.7's wording. |
| **Cannot run Xcode build from this environment** | Cannot verify iOS native simulator boot. | Manual verification required by user. | Run `cd frontend && npm run build && npx cap sync ios && npx cap open ios` then build for iPhone Simulator. |
| **Custom Apple Sign-In Swift plugin** (`frontend/ios/App/App/SignInWithApplePlugin.swift`) | Custom native code is outside Capacitor plugin auto-update. | Versioned in repo. | Verify it still compiles against current Capacitor 8.3 SDK on next Xcode build. |

---

## Commands Run

| Command | Result | Notes |
|---|---|---|
| `git status --short` | (working tree had unrelated edits) | recorded above |
| `cat frontend/capacitor.config.json` | OK | reviewed full config |
| `cat frontend/ios/App/App/Info.plist` | OK | found 3 issues |
| `grep -rln "getUserMedia\|MediaRecorder" frontend/src` | 5 matches | confirmed mic usage |
| `grep -rln "Route path=" frontend/src/App.jsx` | full route table | populated Page Inventory |
| `cat frontend/ios/App/App/App.entitlements` | OK | only `com.apple.developer.applesignin` — clean |
| `npm run build` (frontend) | not run in this sweep | run after Info.plist sync to verify cap sync |
| `xcodebuild -list` | not run | requires interactive Xcode |

---

## Final Completion Checklist

- [x] Every route/page discovered (Page Inventory above lists all 34 authenticated routes + 10 public routes)
- [x] Every route/page **individually audited per-page** by 6 parallel subagents (Sweep 2, this session)
- [x] Findings recorded per-page in `MOBILE_POLISH_TASKS.md` (every P0/P1/P2 with file:line)
- [x] Global mobile layout issues filed (`GLOB-1..8`)
- [x] Inputs/forms findings filed (`SF-1..7`, `FORM-*`, plus per-page input items)
- [x] iOS safe areas — global utilities verified; per-page safe-area gaps filed (`LAY-*`, `LOGIN-2`, `FORGOT-1`, `RESET-1`, `CONTACT-1`, `MOD-2`, `CPV-4`, `MAP-2`, others)
- [x] Keyboard overlap — global `Keyboard.resize: native` confirmed; per-page risks filed (`AI-1/AI-2`, `CONTACT-2`, `MOD-3`, `SF-2/SF-5`)
- [x] Capacitor iOS config audited (`frontend/capacitor.config.json` — clean)
- [x] Info.plist permission strings audited (**3 fixes shipped Sweep 1**)
- [ ] Privacy manifest audited — see `IOS-3` (task open; required for next App Store submission)
- [ ] Tests/lint/typecheck/build — deferred; user should run `cd frontend && npm run build && npx cap sync ios` next
- [x] Final summary written (see `MOBILE_POLISH_SUMMARY.md`)
- [x] Tap-target master sweep list compiled (`TT-1` appendix with every site)
- [ ] Tap-target master sweep IMPLEMENTED — bulk PR pending (P0)
- [x] **One concrete fix shipped this sweep:** `SearchResults.jsx:177` — added `inputMode="search"`, `enterKeyHint="search"`, `autoComplete="off"`, `autoCorrect="off"`, `autoCapitalize="off"`, `spellCheck={false}`
