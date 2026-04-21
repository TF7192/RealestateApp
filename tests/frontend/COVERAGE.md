# Frontend Test Coverage

**Last updated:** 2026-04-21
**Owner:** QA

Source of truth for the frontend (browser-layer) test suite. Backend and
integration tests live under `tests/integration/*` and are tracked in
`tests/COVERAGE.md`. This file is for component / hook / page / a11y /
responsive work only.

## Legend

`✅` complete · `🟡` partial · `⬜` not started · `N/A` doesn't apply

---

## Discovery — app inventory

### Framework & tooling (existing)
- **React 18** (JSX) with Vite bundler.
- **React Router v6** with `<Routes>` in `App.jsx`. Route table in `CLAUDE.md` under "Routes".
- **State**: local component state + a handful of Contexts (`AuthProvider`, `ToastProvider`, `ThemeProvider`). No Redux / Zustand / React Query. HTTP via hand-rolled `lib/api.js` (`fetch`-based with retry, timeout, and a `broadcastUnauthorized` event listener).
- **Forms**: hand-rolled controlled inputs (no React Hook Form / Formik). Light client-side validation in components.
- **Styling**: per-component CSS files alongside the JSX (`Component.css`). No Tailwind, no CSS-in-JS.
- **i18n / RTL**: Hebrew-first. `<html dir="rtl">` set in `index.html`. No i18n library — Hebrew strings live inline in JSX.
- **Design system / Storybook**: does not exist.
- **External JS integrations**: PostHog (analytics), Capacitor (native bridge, stubbed on web), WhatsApp deep links via `wa.me`, Waze via `waze.com/ul`.
- **Browser APIs used**: `matchMedia`, `IntersectionObserver`, `ResizeObserver`, `scrollTo`, `clipboard.writeText`, `navigator.share`, `navigator.onLine`, `window.history`. All need jsdom polyfills/mocks.

### Project layout (frontend/src)
- `lib/` — 19 pure helpers (see below)
- `hooks/` — 8 custom hooks
- `components/` — 41 components (mix of primitive/composite/feature)
- `pages/` — 25 page components
- `mobile/` — Capacitor-wrapped mobile shells (`MobileLayout.jsx`, `mobile/components/*`, `mobile/pages/*`). Out of scope for the web suite per CLAUDE.md.
- `native/` — Capacitor adapter (stubs on web). Out of scope.

---

## Proposed tooling

| Purpose | Tool | Status |
|---|---|---|
| Runner | Vitest | ✅ already in project |
| Component rendering | `@testing-library/react` | ✅ already installed |
| Interaction | `@testing-library/user-event` v14 | ✅ already installed |
| Network mocks | **`msw` v2** | 🟡 to install |
| A11y (jsdom) | **`vitest-axe`** | 🟡 to install |
| Coverage | V8 via Vitest | ✅ already wired |
| Responsive (viewport matrix) | Playwright | ✅ already in E2E |
| Visual regression | deferred |  |

**Not introducing**: Storybook, Chromatic, Cypress, Jest.

---

## Layer 1 — Pure logic unit tests

| Module | Status | Notes |
|---|---|---|
| `lib/sellerCalc.js` | ✅ | 13 tests — forward + reverse + VAT + edge cases |
| `lib/display.js` | ✅ | 24 tests — em-dash safety + IL currency + date formatting |
| `lib/formatFloor.js` | ✅ | 10 tests — ground-floor word + with-total |
| `lib/waLink.js` | ✅ | 9 tests — normalize + waUrl + telUrl + wazeUrl |
| `lib/relativeDate.js` | ⬜ | "לפני שעתיים" bucket logic |
| `lib/time.js` | ⬜ | ISO parse, range overlap, Israel tz |
| `lib/templates.js` | ⬜ | `buildVariables(property, user)` + placeholder substitution |
| `lib/publicUrl.js` | ⬜ | slug escape, URL builder |
| `lib/pageCache.js` | ⬜ | set/get/clear/scopedByRoute |
| `lib/useDebouncedValue.js` | ⬜ | **hook** — moves to Layer 2 |
| `lib/inputProps.js` | ⬜ | input-props helpers (autocomplete off, etc.) |
| `lib/tourKill.js` | ⬜ | localStorage tour state |
| `lib/yad2ScanStore.js` | ⬜ | store for the in-progress scan card |
| `lib/haptics.js` | ⬜ | no-op on web; assert no throw |
| `lib/analytics.js` | ⬜ | PostHog wrapper + distinct-id |

Phone validator — **the codebase doesn't have one yet**; the existing phone handling relies on `normalizeIsraeliPhone` in waLink.js (already covered). If a dedicated `isValidIsraeliPhone` is added later, it comes here.

---

## Layer 2 — Hook tests

All hooks live in `frontend/src/hooks/` (+ one in `frontend/src/lib/useDebouncedValue.js`).

| Hook | Initial | Happy | Loading | Error | Cleanup | Notes |
|---|---|---|---|---|---|---|
| `lib/useDebouncedValue` | ⬜ | ⬜ | N/A | N/A | ⬜ | Timer-based; needs fake timers |
| `hooks/useBeforeUnload` | ⬜ | ⬜ | N/A | N/A | ⬜ | beforeunload listener add/remove |
| `hooks/useFieldTouched` | ⬜ | ⬜ | N/A | N/A | N/A | Touch tracking on form fields |
| `hooks/useFocusTrap` | ⬜ | ⬜ | N/A | N/A | ⬜ | Focus trap on modal open/close |
| `hooks/useScrollRestore` | ⬜ | ⬜ | N/A | N/A | ⬜ | Scroll-pos cache by route key |
| `hooks/mobile.js → useViewportMobile` | ⬜ | ⬜ | N/A | N/A | ⬜ | matchMedia listener |
| `hooks/mobile.js → useDelayedFlag` | ⬜ | ⬜ | N/A | N/A | ⬜ | Delayed boolean flip |
| `hooks/shortcuts.js` | ⬜ | ⬜ | N/A | N/A | ⬜ | Keyboard shortcut registrations |
| `hooks/chat.js` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | WebSocket + polling hook |
| `hooks/analytics.js` | ⬜ | ⬜ | N/A | N/A | ⬜ | PostHog page-view events |

---

## Layer 3 — Component tests

**Matrix (per component)**: Render · Variants · Interactions · Validation · Loading · Empty · Error · A11y (axe) · RTL · Edge data.

### Primitives

| Component | Render | Interactions | A11y | RTL | Edge | Notes |
|---|---|---|---|---|---|---|
| `InlineText` | ✅ | ✅ | ⬜ | ✅ | ✅ | Existing coverage from slice 4; pending axe check |
| `Chip` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `ChipEditor` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `ConfirmDialog` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `EmptyState` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `Portal` | ⬜ | N/A | ⬜ | N/A | N/A | Mounts children in `document.body` |
| `StickyActionBar` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `WhatsAppIcon` | ⬜ | N/A | ⬜ | N/A | N/A | SVG icon; aria-hidden etc. |
| `PullRefresh` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Pointer + threshold |
| `SwipeRow` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Swipe gesture |
| `OfflineBanner` | ⬜ | ⬜ | ⬜ | ⬜ | N/A | `navigator.onLine` listener |
| `RootErrorBoundary` | ⬜ | N/A | ⬜ | ⬜ | ⬜ | Error boundary fallback |

### Composites (dialogs / pickers)

| Component | Render | Interactions | Validation | A11y | Focus/Esc | Notes |
|---|---|---|---|---|---|---|
| `AgreementDialog` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `CustomerEditDialog` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `LeadMeetingDialog` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `OwnerEditDialog` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `MarketingActionDialog` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `ProspectDialog` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `TransferPropertyDialog` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `ShareCatalogDialog` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `LeadPickerSheet` | ⬜ | ⬜ | N/A | ⬜ | ⬜ | |
| `OwnerPicker` | ⬜ | ⬜ | N/A | ⬜ | ⬜ | |
| `MobilePickers` | ⬜ | ⬜ | N/A | ⬜ | ⬜ | |
| `QuickEditDrawer` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `CommandPalette` | ⬜ | ⬜ | N/A | ⬜ | ⬜ | Cmd+K palette |
| `AddressField` | ⬜ | ⬜ | ⬜ | ⬜ | N/A | Photon autocomplete (mock) |
| `SmartFields` | ⬜ | ⬜ | ⬜ | ⬜ | N/A | Mixed inputs |

### Feature components

| Component | Render | Interactions | A11y | RTL | Notes |
|---|---|---|---|---|---|
| `Layout` | ⬜ | ⬜ | ⬜ | ⬜ | Sidebar, nav, dark-mode toggle |
| `MobileTabBar` | ⬜ | ⬜ | ⬜ | ⬜ | |
| `MobileMoreSheet` | ⬜ | ⬜ | ⬜ | ⬜ | |
| `PropertyHero` | ⬜ | ⬜ | ⬜ | ⬜ | Image carousel + KPI tiles |
| `PropertyKpiTile` | ⬜ | N/A | ⬜ | ⬜ | |
| `PropertyPhotoManager` | ⬜ | ⬜ | ⬜ | ⬜ | Upload + reorder (mock) |
| `PropertyVideoManager` | ⬜ | ⬜ | ⬜ | ⬜ | |
| `PropertyPanelSheet` | ⬜ | ⬜ | ⬜ | ⬜ | |
| `ChatWidget` | ⬜ | ⬜ | ⬜ | ⬜ | Socket mock |
| `Yad2ScanBanner` | ⬜ | ⬜ | ⬜ | ⬜ | Progress pill |
| `OnboardingTour` | ⬜ | ⬜ | ⬜ | ⬜ | |
| `PageTour` | ⬜ | ⬜ | ⬜ | ⬜ | |
| `WhatsAppSheet` | ⬜ | ⬜ | ⬜ | ⬜ | |
| `ShortcutsOverlay` | ⬜ | ⬜ | ⬜ | ⬜ | |

---

## Layer 4 — Page tests

| Page | Auth guard | Happy | Error | Deep link | A11y | Notes |
|---|---|---|---|---|---|---|
| `Login` | ✅ | ⬜ | ⬜ | N/A | ⬜ | E2E covers login flow |
| `Dashboard` | ⬜ | ⬜ | ⬜ | N/A | ⬜ | |
| `Properties` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `PropertyDetail` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `NewProperty` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | Step-1/step-2 |
| `Customers` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `CustomerDetail` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `NewLead` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `Owners` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `OwnerDetail` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `Deals` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `Transfers` | ⬜ | ⬜ | ⬜ | N/A | ⬜ | |
| `Templates` | ⬜ | ⬜ | ⬜ | N/A | ⬜ | |
| `Profile` | ⬜ | ⬜ | ⬜ | N/A | ⬜ | |
| `SellerCalculator` | ⬜ | ⬜ | N/A | N/A | ⬜ | Unit covers logic; page covers wiring |
| `Yad2Import` | ⬜ | ⬜ | ⬜ | N/A | ⬜ | |
| `AdminUsers` | ⬜ | ⬜ | ⬜ | N/A | ⬜ | |
| `AdminChats` | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| `AgentPortal` (public) | N/A | ⬜ | ⬜ | ⬜ | ⬜ | |
| `CustomerPropertyView` (public) | N/A | ⬜ | ⬜ | ⬜ | ⬜ | |
| `ProspectSign` (public) | N/A | ⬜ | ⬜ | ⬜ | ⬜ | |
| `NotFound` | N/A | ⬜ | N/A | N/A | ⬜ | |

---

## Layer 5 — Accessibility sweep

Per-component `axe` runs are covered in the component tests (Layer 3). This layer holds dedicated sweeps:

- [ ] Keyboard nav through the sidebar (`Layout`).
- [ ] Focus management: every dialog traps focus; Esc closes; focus returns to opener.
- [ ] All icon-only buttons have `aria-label` (checked in individual component tests, aggregated here).
- [ ] Skip-to-content link (project-wide audit).

---

## Layer 6 — Responsive

Playwright viewport matrix. Covered in `tests/e2e/responsive/` (new).

| Viewport | Size | Status |
|---|---|---|
| Small mobile | 320×568 | ⬜ |
| Mobile | 360×640 | ⬜ |
| Tablet | 768×1024 | ⬜ |
| Desktop | 1280×800 | ⬜ |
| Large desktop | 1920×1080 | ⬜ |

Per-page assertions: no horizontal scrollbar, primary nav accessible, no text overflow, modals within viewport.

---

## Layer 7 — Visual regression

Deferred. Will re-evaluate after the functional suite stabilizes.

---

## Bugs Found While Writing Tests

Anything surfaced by the tests that turned out to be a real app bug. Entries
stay in this list so we can prove the suite is earning its keep.

### ConfirmDialog a11y (slice 4)
- The close (X) button had no `aria-label` — icon-only buttons are invisible to screen readers. **Fixed:** added `aria-label="סגור"` and `aria-hidden="true"` on the inner `<X>` svg.
- The modal element lacked `role="dialog"` + `aria-modal="true"` + `aria-labelledby`. Failed axe's "All page content should be contained by landmarks" rule. **Fixed:** added the three ARIA attributes; `aria-labelledby` points at the existing `<h3>` via a `useId()` id.
- Confirm/cancel buttons were missing `type="button"` (implicit `type="submit"` inside a form would have caused surprising submits). **Fixed.**

### OwnerEditDialog a11y (slice 5)
- Modal had no `role="dialog"` / `aria-modal` / `aria-labelledby`. Same pattern as ConfirmDialog. **Fixed** with a `useId()`-backed title link.
- The "סוג בעלות" SelectField had no accessible name (the `<label>` wasn't `htmlFor`-linked and the underlying `<select>` had no `aria-label`). **Fixed** by passing `aria-label="סוג בעלות"` from OwnerEditDialog into the SelectField.

### Test-suite bugs caught during slice 5 (writing the sanity probe for `useToast`)
- **`export * from '@testing-library/react'` silently clobbered the custom `render()`** exported from `tests/frontend/setup/test-utils.tsx`. For 250+ tests, `render(<Foo />)` was quietly calling RTL's bare render — no providers ever mounted. Primitive tests passed because they never needed a Context, but the first context-consuming test exposed it. **Fixed** by switching to explicit named re-exports. Every earlier test still passes because the primitives genuinely didn't depend on providers, but from slice 5 onward the wrapper is honored.
- **jsdom's `AbortController` / `AbortSignal` clash with undici's fetch.** Real app code (`lib/api.js`) creates an `AbortController` and passes its signal to `fetch`; undici rejected it with "Expected signal to be an instance of AbortSignal", so every `save()` call died silently in the catch branch and the test only saw "שמירה נכשלה". Switched the frontend project's DOM to **happy-dom**, which shares Node's globals.

## Known Defects Covered by `test.fails()`

(none yet)
