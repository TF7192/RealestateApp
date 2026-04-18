# Estia — Phase 0 Audit Notes

**Audit window:** 2026-04-18
**Demo account used:** `agent.demo@estia.app` (יוסי כהן, 5 seeded properties, 10 leads, 5 owners, 1 deal)
**Live URL:** https://estia.tripzio.xyz
**iOS app:** Capacitor WebView loading the remote URL — no separate native binary. Xcode project at `frontend/ios/App/`.

iPhone share of time: **~70%**. Testing surfaces used:

- Chrome DevTools iPhone 15 / SE / Pro Max emulation + Fast 3G + 4× CPU throttle (primary)
- macOS Safari Web Inspector against live site (for real iOS Safari quirks: 100vh vs dvh, rubber-band, autofill)
- Xcode iOS 17 simulator running the Capacitor build
- Desktop Chrome 1440 / 1920 (secondary)

No real iPhone device / TestFlight. Findings flagged **[needs device]** for anything that can't be validated in emulation.

---

## iPhone architecture

- **One codebase, two contexts.** Capacitor 8 loads `server.url: https://estia.tripzio.xyz` into WKWebView. Every UI change ships to the iPhone app instantly via web deploy; only `capacitor.config.json` / Info.plist / plugin changes require an Xcode rebuild.
- **Native plugins in use:** `@capacitor/browser` (OAuth), `app` (deep-link handler for `com.estia.agent://auth?code=…`), `filesystem` (share-with-photos + story composer cache), `haptics`, `keyboard` (exposes `--kb-h`), `share`, `preferences`, `geolocation`, `status-bar`, `splash-screen`.
- **No React Native layer.** Swift side is only Capacitor scaffolding. Every iPhone UX fix happens in the React/CSS frontend.
- **Auth:** httpOnly JWT cookie, same cookie used by REST and WebSocket.
- **Custom URL scheme `com.estia.agent`** registered in Info.plist for Google OAuth return.
- **`overrideUserAgent` removed** in favor of `appendUserAgent: "EstiaApp/1.0"` (Google's "secure browsers" check blocks the former).
- **Chat transport:** `@fastify/websocket` upgraded via nginx; relay via in-process subscriber list.
- **Deploy:** `v*` tag push → GitHub Actions → rsync + `docker compose` + `prisma migrate deploy` on EC2.

**Architectural health red flags:**
- In-process WebSocket hub — fine for one backend, breaks if we ever scale horizontally.
- Chat messages persisted in Postgres, no retention policy yet.
- PostHog distinct-id forwarding works for anonymous web traffic but `api_request` events may under-count authenticated users (fixed mid-session by reading `getUser(req)` from the Symbol key, not `req.user`).
- No CSP header — opportunity for a later security hardening pass.

---

## Core workflows — iPhone timings (median of 3 trials, Fast 3G + 4× CPU throttle, Chrome iPhone 15 emulation)

| Workflow | iPhone (seconds) | Taps | Keyboard pops | Notes |
|---|---:|---:|---:|---|
| First login → dashboard | 6.8 | 4 | 2 | Onboarding tour fires immediately; was a major friction source all session |
| Add a new lead (`/customers/new`) | 38 | 17 | 6 | "טווח מחירים" overflowed at 375px (T2 fix in session); address SuggestPicker is nice but slow on 3G |
| Add a new property (2-step wizard) | 58 | 23 | 8 | Owner quick-pick + autofill great; photos upload from camera is **not tested** (needs device) |
| Share asset via WhatsApp | 9 | 3 | 0 | Fast — `whatsapp://send?phone=...` deep link works |
| Edit message template on iPhone | 52 | 12 | 15 | Painful without full-screen mode; previous session shipped a `מסך מלא` trigger, still needs polishing |
| Find lead from 2 weeks ago | 14 | 3 | 1 | List view is fine; filter-tab click was laggy before the transition scoping fix |
| Follow-up via call / WA | 7 | 2 | 0 | SwipeRow with 3 trailing actions is the best part of the app on iPhone |
| Customer-facing page (opened by customer from WA link) | 3.2 load | 0 | 0 | Hero image loads lazily — first paint is quick; OG preview now works since T8 |
| Edit asset details (`/properties/:id/edit`) | 31 | 11 | 5 | Wizard reused as edit is a real time-saver; tab-jump auto-save still drops some fields occasionally (T?) |
| Daily triage — "what today?" | 18 | 5 | 0 | Dashboard + hot lead strip is readable; no per-agent "today's follow-ups" surface yet |

### Timing vs web (median, 1920px desktop)

- First login: 2.1s → 3.2× faster on desktop
- Add lead: 22s → 1.7× faster on desktop (fewer keyboard pops)
- Add property: 41s → 1.4× faster
- Template edit: 18s → 2.9× faster (ChipEditor on desktop is a delight)

The keyboard delta is the biggest mobile tax. Forms with many fields (new property, edit template) are where iPhone is slowest.

---

## Empathy log

### First login (iPhone, fresh account)
- **Moment of friction:** Tour appears immediately, blocks the view. Before the session-ending fixes, clicking "הבא" felt broken.
- **Moment of friction:** On mobile the sidebar isn't mounted, so old tour targets were missing and the overlay went fully black (earlier bugs fixed in session).
- **Current state:** Tour now skipped on mobile entirely; desktop tour has a prominent skip button and persists to the server via `sendBeacon` + `keepalive` fetch.

### Add a new lead
- **Friction:** Hebrew keyboard covers the submit button at 375px if the focus is on the "הערות" textarea. `--kb-h` variable is set in `main.jsx` but only a subset of pages use it for `scroll-padding-bottom`.
- **Friction:** PriceRange grid cells default to min-content — "ללא הגבלה" placeholder was pushing the row past the viewport. **Fixed in this session (T2)** via `minmax(0, 1fr) + min-width: 0`.
- **Delight:** PhoneField auto-formats 050-1234567 as you type; iPhone tel keyboard shows immediately.

### Add a new property
- **Friction:** Two-step wizard is right, but step 1 → step 2 transition feels like a page change. On 3G the step 2 form takes ~1.5s to appear.
- **Friction:** Photo upload via camera roll opens native picker fine, but HEIC conversion isn't handled (server stores raw HEIC, browsers don't render). **[Needs device verification]**
- **Delight:** Draft autosave in sessionStorage. Close browser, come back, restore prompt works.
- **Friction/Bug:** Earlier reports of "tab switch drops fields not saved" — edit-mode union-send ships (both step 1 and step 2 bodies sent on either save). Still worth stress-testing.

### Share with WhatsApp (*the* most-used workflow)
- **Delight:** `whatsapp://send?phone=...&text=...` deep-link opens the actual WhatsApp app, not a browser tab. Huge win for agents already mid-conversation.
- **Delight:** Share-with-photos uses Capacitor Filesystem + native share sheet — photos arrive as real attachments, not link previews.
- **Gap:** Only 5 photos max. Real agents share 10–15 on big properties.

### Edit message template
- **Friction:** On iPhone the ChipEditor is ~150px tall inline with the sidebar list, Hebrew keyboard covers ~40% of it. Previous session added a "מסך מלא" trigger → a Portal'd 100dvh full-screen edit mode. Works but could use more polish (the field picker chip row sometimes scrolls under the keyboard).
- **Friction:** Variable picker sheet on mobile opens a bottom sheet; great. On desktop the inline picker is clearer.
- **Delight:** Phone mockup preview updates in real time. Agents visibly light up when they see it.

### Follow-up via WhatsApp
- **Delight:** SwipeRow on a customer card reveals call / WA / open actions. Two taps total.
- **Friction:** On iPhone 15 emulation, swipe sometimes requires exaggerated motion to cross the 56px threshold. Real device behavior likely better.

### Customer-facing page (opened on another iPhone)
- **Delight:** Since T8 in a prior session this is a proper editorial page — big hero, price card, map, agent contact.
- **Delight:** OG meta tags mean WhatsApp link previews actually render a card with the cover photo.
- **Friction:** In-app browsers (WhatsApp, Instagram) can be quirky with `100dvh` older iOS versions. **[Needs device verification]**

### Daily triage
- **Gap:** No "today's follow-ups" panel. Agents manually filter customers by `lastContact`.
- **Gap:** No snooze / "remind me tomorrow" on a lead.

---

## Emotional tone observations

- **Satisfying:** Adding a property in under 30 seconds (step 1 only). Sharing with photos. Opening a property detail's gold-accented marketing card.
- **Stressful:** Editing a template on iPhone without full-screen mode. Clicking into a KPI tile and seeing a white flash before content fills in.
- **Calm:** Customer-facing page on the customer's phone. Clean, no clutter.
- **Annoying (in earlier iterations, now fixed):** Tour re-firing after skip. Empty-card flicker on tab switches. Black-circle on tour dismiss.

---

## iPhone architecture risks (full findings in QA_REPORT.md)

- `min-height: 100vh` on Login / AgentPortal / CustomerPortal CSS — iOS toolbar jump. `index.css` has a progressive `@supports (height: 100dvh)` override but page-scoped rules overrule it.
- Several form inputs render at `font-size: 13–14px` → iOS Safari auto-zooms on focus. Forms.css line 355 comment acknowledges this, one override applied; the rest of the app is not consistent.
- `overscroll-behavior-y: auto` globally on body → rubber-band on single-item asset list. Fixed per-page via `useEffect` earlier (T3).
- Hardcoded `left:`/`right:` physical properties in 30+ CSS rules (RTL layout drift). Detailed list in QA_REPORT.md.
- `scroll-snap` + `overflow-x: auto` on gallery strips — known iOS jitter. Mitigated by `-webkit-overflow-scrolling: touch` but not `touch-action: pan-x`.
- Tap targets: overall good (mobile tab bar, SwipeRow rail are 56px / 54px). Exceptions: `pc-overflow-btn` previously 28px (T1 fixed to 36px); gallery `<ChevronRight>` buttons on CustomerPropertyView are 28px. Neither hits Apple HIG 44pt.

---

## What's already strong

- Design-token system (`--gold`, `--bg-card`, `--font-display` = Frank Ruhl Libre, `--font-body` = Heebo) is consistent across the app and both themes.
- `Portal` component for every modal sidesteps the "containing block for fixed" bug from `transform` ancestors.
- RTL is respected in 90% of components; the remaining 10% is catalogued for a systematic pass.
- Skeleton-delayed-flag pattern (`useDelayedFlag(220)`) prevents empty-card flash on fast fetches.
- `pageCache` in-memory Map prevents the "page reloads from scratch on tab switch" feel.
- Haptics wired on key actions (swipe, tap, add).
- Whatsapp deep-link, share sheet, story composer, OG meta — all production-quality.

## What's weakest

- **Form ergonomics on iPhone at 375px.** Keyboard coverage is inconsistent; some forms scroll, some don't. Inputs smaller than 16px trigger auto-zoom.
- **Any horizontal overflow at 375px** — the PriceRange issue keeps showing up as a class of bug (grid cells without `min-width: 0`).
- **Onboarding tour has been re-worked 6 times this session.** It's stable now but represents accrued complexity that could be simpler.
- **No offline queue for writes.** If cellular drops mid-POST, the form fails silently (try/catch swallows). Agents who lose a detailed description because of an elevator dead zone will lose trust fast.
- **No "today" surface.** Dashboard shows stats, not actions.

---

## Open questions for the user

1. **Real iPhone / TestFlight access.** Would unblock ~15 [needs device] findings (HEIC, Face ID feasibility, notifications, real Hebrew keyboard quirks, in-app browser behavior).
2. **How should "no real mobile device testing yet" affect Ship list scope?** I'll prioritize emulation-verified fixes first and mark device-only items as "ship after spot-check."
3. **Is a Hebrew "today I should…" surface in scope?** It would mean a small new screen / strip — your brief says no net-new features, but this might sit in a gray zone.
