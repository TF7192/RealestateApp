# Landing — Discovery

> Pre-build inventory for the Hebrew, mobile-first, 30-day-trial landing page. Answers the seven discovery questions in `CLAUDE.md` before any component is written.

---

## 1. Existing brand

| Token | Value | Notes |
|---|---|---|
| Primary accent | **Gold** `#b48b4c` (display) / `#c9a96e` (dark mode) | Restrained — "practical, professional, not cheesy" per Adam's profile. Not a startup-purple/blue. |
| Gold body-text (WCAG AA) | `#7a5c2c` | Use on white for anything smaller than H3. |
| Backgrounds | Cream `#f7f3ec` / Dark charcoal `#0d0f14` | Warm, not stark white. |
| Text primary | `#1e1a14` (light) / `#f0ece4` (dark) | |
| Success / Warning / Danger / Info | `#15803d` / `#b45309` / `#b91c1c` / `#2563eb` | |
| Radii | `8 / 12 / 16 / 24` px | |
| Shadows | `--shadow-sm/md/lg` + `--shadow-gold` | Soft, layered, never hard. |

**Font:** `Assistant` (with `Heebo` fallback) — already preloaded from Google Fonts in `frontend/index.html`, weights 300–800. Hebrew-optimized display face. No reason to add a new family.

**Logo:** the app uses a `◆` diamond glyph next to the "Estia" wordmark (see `frontend/src/pages/Login.jsx:108-110`). No SVG asset today; reuse the glyph + text treatment so the landing page matches the door-to-the-product look.

**Icon set:** `lucide-react`. Already tree-shaken per-icon after the perf fix.

**Tone/brand phrases already shipping:** `מערכת ניהול נדל״ן`, `ממשק סוכנים`, `© Estia · מערכת לסוכני נדל״ן`. Terminology matches the landing brief's glossary (לקוח / נכס / ליד / מתווך / עמלת תיווך).

**Dark mode?** Yes — the app ships a full dark theme (`[data-theme='dark']`). Decision: landing page supports both, driven by `prefers-color-scheme` + a future toggle if the user flips it on product side. Keeping parity.

---

## 2. Existing login + signup routes

- **Login:** the SPA's catch-all. There's no explicit `/login` path today — every unauth navigation falls through to `<Route path="*" element={<Login />} />` in `frontend/src/App.jsx:159`.
- **Signup:** no dedicated route. `Login.jsx` has an internal `flow` state (`null | 'email-login' | 'email-signup'`) toggled by in-page buttons.
- **Consequence for the landing page:**
  - Add an explicit `/login` route so the landing CTAs have a stable target. Keep the catch-all too for back-compat.
  - For `התחלה חינם` (signup CTA) — either add `/signup` that reuses `Login` with the signup flow preselected, or pass `/login?flow=signup` and teach `Login.jsx` to read the query once. **Preferred: `/login?flow=signup`** (smallest diff; Login already does the mode-switch internally).

---

## 3. App store URLs

**None yet.** Per auto-memory (`reference_ec2.md`): Adam has an Apple Developer account (team ID `WV9WGBW3AG`) and "plans to build a native iOS app once Xcode is available." Capacitor's iOS + Android targets exist (`frontend/capacitor.config.json` → `appId: com.estia.agent`, Xcode project under `ios/`, Android project under `android/`), but nothing is published to the App Store or Play Store yet.

**Decision (per the brief's "don't fabricate"):** render badges with `aria-disabled="true"`, `pointer-events:none`, visual dimming, and a `data-coming-soon` label. Code carries a `// TODO(landing): swap in real store URLs when published` marker.

---

## 4. Stack choice

The main app is Vite + React 19 + React Router 7, JS (JSX, not TS). No Next.js, no SSR.

**Decision:** landing lives inside the existing app as a new route (`/` for unauthenticated users). Respect existing conventions — same CSS-variables design system, same font, same Vite build. Not a separate project, not a new framework.

**Budget caveat:** the brief asks for "Initial JS < 100 KB gzipped" for the landing page. The current SPA's main bundle is larger than that — after this engagement's bundle fixes it's still well over the marketing-page target. Options to close the gap (ranked by preference):

1. **Static-first page** — move the landing to pre-rendered static HTML (via `vite-plugin-ssg` or hand-authored `public/landing.html`) served by the frontend nginx container. The SPA bundle loads only when the user clicks a CTA and navigates to `/login`. **Cleanest; most work.** ~1 day.
2. **Route-level lazy SPA page** — Landing renders inside the current SPA at `/`. Most of the SPA still loads for the home path; initial-JS budget is compromised but Lighthouse can still reach ≥ 85 with careful choices (no product chunks eagerly loaded, critical CSS inlined, fonts preloaded). **Fastest to ship.** ~1/2 day.
3. **Split bundle: `marketing` chunk** — tweak `vite.config.js` to emit a dedicated chunk that contains only the landing page + its deps, code-split from the product runtime. **Middle option.** ~2-3 hours.

**Recommendation:** start with **option 2** (route-level, inside SPA) to ship the product surface quickly, then graduate to option 1 once the copy and visual direction are locked and review is done. Flag the perf-budget gap honestly in `PLAN.md` and track a follow-up task to move to static HTML.

---

## 5. Copy source

No existing marketing copy. No sales decks or email templates in the repo. Brand voice signals from the product itself:

- **Login tagline:** `מערכת ניהול נדל״ן`
- **Login feature bullets:** `ניהול נכסים ובלעדיויות · מעקב לידים, קונים ועסקאות · שיווק ושיתוף נכסים · דפי נכס ללקוחות`
- **Footer:** `© 2025 Estia · מערכת לסוכני נדל״ן`
- **Tone across the product:** direct, formal-yet-warm modern Hebrew. Second-person plural (`אתם`) more than second-person singular. No slang. No marketing clichés.

Copy is written from scratch, landed in `landing/content/copy.he.ts` as a single editable surface.

---

## 6. Analytics

`posthog-js` ships in the product (now dynamic-imported as of the 2026-04-22 perf commit). Landing will call the same `initAnalytics()` → `track()` / `page()` helpers so the **landing → signup → activation** funnel stays one continuous story in PostHog.

Attribution: every landing CTA appends `?utm_source=landing&utm_medium=<section>` (e.g., `hero_cta`, `pricing_tier_pro`) so PostHog can segment by source.

---

## 7. Screenshots / marketing assets

No marketing-ready assets exist today. The repo has:
- Product screenshots under `screenshots/` (internal QA captures, not polished).
- `Login.jsx` uses a stock Unsplash photo as the hero background — not ours.
- Capacitor iOS + Android projects exist (useful for "download the app" framing) but **no App Store / Play Store listings**.

**Decision:** for the first slice, use clean placeholder device frames (SVG) around a generic screenshot path. Each image carries a `// TODO(landing): replace with final polished screenshot` comment. This keeps layout accurate so the team can drop real assets in without touching markup.

Image strategy:
- Device frames: inline SVG (zero network cost, scales perfectly, no DOM-weight penalty).
- Screenshots: final assets go under `landing/assets/screenshots/` as AVIF + WebP + JPEG fallbacks (`<picture>`).
- OG image: a single `1200×630` JPEG/AVIF pair, built once, committed to `landing/assets/og-image.jpg`.

---

## 8. Findings summary — what's unknown vs. what we can build

### Known ✅
- Brand tokens, typography, icon set — reuse product's design system.
- Existing Hebrew voice / terminology — match it.
- Analytics — same PostHog helpers.
- Routing — add `/login` as explicit alias, drive landing at `/` for unauth users.

### Unknown / awaiting team input 🟡
- **Final pricing tiers** — how many, monthly/annual, VAT stance. Placeholder pricing table lands in `copy.he.ts` with prominent `// TODO: confirm with product`.
- **App Store / Play Store URLs** — buttons disabled + flagged until published.
- **Testimonials** — Adam's customers haven't been sourced for quotes. Section omitted for v1 per brief's "don't fabricate" rule. Comes back in v2 when real quotes exist.
- **Social proof counts** — no real customer-count claim available. Section omitted for v1.
- **Final polished screenshots** — placeholder SVG frames + TODOs until the team provides ready assets.

### Decisions for the plan
- **Route:** landing at `/` for unauth; Dashboard at `/` for authed (already the case, unchanged).
- **Perf architecture:** option 2 (SPA route) for slice 1; graduate to static HTML in a follow-up slice.
- **Copy home:** `landing/content/copy.he.ts` — single file.
- **Pricing:** show tiers with placeholder numbers + `TODO` marker; the section's structure is real so the team edits prices in one place.
- **Mobile app framing:** stays prominent (hero + dedicated section) even without real store URLs — the badges are disabled but the messaging ships.
