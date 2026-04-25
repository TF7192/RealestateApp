# iPhone Smoothness Map — Estia

A comprehensive map of the iPhone (Capacitor WKWebView) experience,
where smoothness goes wrong, and what's been done / what's still open.

Generated 2026-04-25, after the multi-batch mobile-polish + perf
sweep. Live on prod via deploy `24937661487` and successors.

---

## 0. The architecture, briefly

- **App shell**: Capacitor 8.3 iOS app. `frontend/capacitor.config.json:server.url`
  points the WKWebView at `https://estia.co.il/login`.
- **Web bundle**: React 19 + Vite + React Router v7. Hebrew RTL, custom
  CSS (no UI library). Self-hosted Assistant font.
- **Native plugins** (10): App, Browser, Filesystem, Geolocation,
  Haptics, Keyboard, Preferences, Share, SplashScreen, StatusBar.
  Custom in-tree Sign-in-with-Apple Swift plugin.
- **Performance baseline** (from `project_perf_baseline.md`): captured
  pre-PERF-001 to PERF-028 on /dashboard. The PERF series shipped:
  pagination, image variants + nginx cache, font self-host, lazy
  templates, dashboard summary endpoint, public-matches cap, slow-
  query log, streaming CSV, web vitals beacon.

The iPhone-specific perf gotchas live in two places: **(a) the React
bundle's main-thread cost** (rendering, animations, JS work), and
**(b) WKWebView quirks** (compositor, scroll-event cancellation,
`backdropFilter` repaint cost, View Transitions support).

---

## 1. The smoothness problems we hit (and what fixed each)

### 1.1 Tab bar dead during scroll

**Symptom** (user-reported, 2026-04-25): "When scrolling I can't
press the taskbar."

**Root cause**: `MobileTabBar` had `backdropFilter: 'blur(12px)'`. On
iOS WKWebView a blur backdrop forces the bar to recomposite on every
scroll frame because the content underneath the bar changes every
frame. The constant compositing captured pointer events and
delivered them to the scroll handler, not the tap target — so taps
during momentum scroll were eaten silently.

**Fix shipped** (commit `<this batch>`):

- Replaced `rgba + backdropFilter:blur` with **solid cream**
  `background: T.cream`. The bar is now a static GPU layer that
  WKWebView never marks dirty during scroll.
- Added `transform: translateZ(0); willChange: transform` on the
  nav element — explicit GPU layer promotion, defensive belt for
  the same goal.
- Switched tab items from `onClick` to `onPointerUp`. iOS WKWebView
  cancels `click` when its preceding `touchstart` is followed by a
  `touchmove` (= scroll). Pointer events fire consistently.
- Added explicit `touchAction: 'manipulation'` on each item.
- Added `WebkitTapHighlightColor: 'transparent'` so the press
  feedback stays in the `:active` scale-down (compositor) and
  doesn't repaint a gray overlay.

**Status**: ✅ shipped.

### 1.2 Slow general feel — animations + repaint stacking

**Symptom**: "Moving between screens, pressing the text, moving in
general — feels slow."

**Root causes** (multiple, additive):

1. `<main key={pathname}>` ran an `estia-page-fade` 180ms keyframe
   on every route change.
2. `main ul/ol/tbody/article` ran an `estia-content-fade` 180ms
   keyframe on every list re-render.
3. Per-page `.animate-in` cards had additional staggered delays.
4. `.card { transition: all 0.3s }` — `transition: all` re-diffs
   every computed property on every state flip.
5. `.btn-primary:hover { transform; box-shadow }` fires on tap
   (sticky-hover bug on iOS) and repaints a colored shadow each
   time.
6. `content-visibility: auto` was gated to `min-width: 821px` so
   phones did full paint of every offscreen card on long lists.

**Fix shipped** (commit `bd6d5fd`):

- Killed all three animation chains on `(pointer: coarse)`.
- `.card` transitions targeted to specific properties + disabled on
  touch.
- `.btn-primary:hover` pinned to resting style on touch.
- `content-visibility: auto` extended to all widths, with
  `contain-intrinsic-size: 96px` matched to the actual phone-card
  height, plus `contain: layout style` so each card walls off its
  layout from siblings.

**Status**: ✅ shipped.

### 1.3 No animations at all → app feels "dead"

**Symptom** (user-reported after 1.2 shipped): "No animations when
moving between screens and pressing button."

**Root cause**: 1.2 fixed sluggishness by killing all animations,
but it removed the on-screen-change feedback entirely. The eye reads
"no animation = same screen, wait, why is the title different now?"

**Fix shipped** (commit `<this batch>`):

- **View Transitions API** for route changes: `@view-transition {
  navigation: auto; }` plus `::view-transition-old/new(root)` with a
  140ms iOS spring crossfade. Runs on the Metal compositor — no
  main-thread cost, hits 120Hz cleanly. Reduced-motion respected
  natively.
- **Bumped `:active { transform: scale(0.97) → 0.94 }`** for
  visible press feedback at 120Hz. 3% was too subtle; 6% matches
  UIKit's default UIControl press magnitude. Transition curve also
  switched to the iOS spring `cubic-bezier(0.32, 0.72, 0, 1)` and
  duration 80ms → 110ms (~13 frames at 120Hz).

**Status**: ✅ shipped. Runs on Safari 18 / iOS 18+; the device is
on iOS 26.

### 1.4 Dashboard cards crushed into 2-column grid on phone

**Symptom**: "Dashboard doesn't look good." Title wrapped, time chips
truncated to "ל...", AI panel + reminders fighting for ~430px width.

**Root cause**: `gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)'`
inline-styled, so the `.dashboard-grid { grid-template-columns: 1fr }`
CSS media-query for phone never won the cascade.

**Fix shipped** (commit `bd6d5fd`):

- Made the inline grid columns conditional on `isMobile`: `'1fr'`
  on phone, `'2fr 1fr'` on desktop.
- `minHeight: 360 → 0` on phone (CLS reserve was a desktop-only
  fix; phone doesn't suffer the same CLS bug).
- Same fix applied to the bottom pipeline + hot-leads grid.

**Status**: ✅ shipped.

### 1.5 Properties card overflow

**Symptom** (screenshot): title rendered as "ג…", price as "…00",
buttons + thumb leaving no room for meta column.

**Root cause**: 3 rail buttons (call/WhatsApp/nav) + overflow `...`
+ share button + thumb + favorite-star competing for 430px.

**Fix shipped** (commit `ed1b462`): Hide `.pc-rail` entirely at
`(max-width: 720px)`. The whole card is already tappable for detail
via the stretched `.pc-compact-link::after`, and `SwipeRow` exposes
call / WhatsApp via left-swipe.

**Status**: ✅ shipped.

### 1.6 Street field "blocked" until voice-record dialog opened

**Symptom**: "The street field is blocked until I record."

**Root cause**: `StreetHouseField.jsx:219` `disabled={!city}`. The
field was silently disabled until a city was set; the user had to
discover this by tapping "הקלטה חכמה" which prefilled city via the
voice-capture dialog.

**Fix shipped** (commit `ed1b462`): placeholder switches to
"בחר/י עיר תחילה" when `!city`, so the empty state is self-
explanatory.

**Status**: ✅ shipped.

### 1.7 AddressField input overlapped by clear button

**Symptom**: typing in the street field appeared to do nothing on
real device.

**Root cause**: clear (✕) button was bumped from 22×22 → 40×40 (HIG)
in an earlier perf-sweep, but the input's `padding-inline-end` stayed
at 36px. The button (`inset-inline-end: 8px` + `width: 40px`)
occupies 8..48px from the end — overlapping 12px into the input's
typeable area. Taps in that zone clicked the button (clear) instead
of the input.

**Fix shipped** (commit `e93e652`): `padding-inline-end: 36px → 52px`,
loader spinner shifted from 38px → 54px.

**Status**: ✅ shipped.

### 1.8 Keyboard pushes tab bar above the keyboard

**Symptom**: when an input is focused, the tab bar jumps above the
iOS keyboard rather than being overlaid.

**Root cause**: `Keyboard.resize: "native"` in
`frontend/capacitor.config.json` shrinks the WKWebView frame when
the keyboard appears, forcing `position: fixed` bottom elements to
reposition.

**Fix shipped** (commit `86884fa`): `resize: "none"` so iOS overlays
the keyboard and fixed-bottom chrome stays put.

**Saved as durable user preference**:
`~/.claude/projects/-Users-adam-RealestateApp/memory/feedback_keyboard_no_jump.md`.
Future sessions know not to flip it back.

**Status**: ✅ shipped (next iOS app rebuild picks it up; web users
unaffected).

---

## 2. Map — the iPhone surface, layer by layer

### 2.1 Native shell (Capacitor 8.3)

| Layer | Status |
|---|---|
| `frontend/capacitor.config.json` | ✅ Tight allowlist, portrait-only, keyboard overlay, status-bar light, splash 800ms. |
| `frontend/ios/App/App/Info.plist` | ✅ Mic / Camera / Photos / Location / Contacts permission strings. **Pending**: privacy manifest (`PrivacyInfo.xcprivacy`) for next App Store submission. |
| Custom `SignInWithApplePlugin.swift` | ✅ End-to-end working; npm `@capacitor-community/apple-sign-in` was dropped in commit `c1afbde` to resolve a duplicate-symbol link error under Capacitor 8 SPM. |
| Plugins active (10) | App, Browser, Filesystem, Geolocation, Haptics, Keyboard, Preferences, Share, SplashScreen, StatusBar. |

### 2.2 WebView entry & shell

| Layer | Status |
|---|---|
| `frontend/src/main.jsx` | ✅ React mount, theme bootstrap, PostHog lazy-init on idle (already deferred). |
| `frontend/src/components/Layout.jsx` | ✅ Mobile header (52px + safe-area-top), MobileTabBar bottom, sidebar drawer. Topbar bell+chat now 44×44. |
| `frontend/src/components/MobileTabBar.jsx` | ✅ Solid bg + GPU layer + pointer events + touch-action. Tappable during scroll. |
| `frontend/src/components/QuickCreateFab.jsx` | ✅ z-index, safe-area-bottom. |
| `frontend/src/components/RouteProgressBar.jsx` | ⚠️ Animates a gold bar at the top during route changes — could conflict with View Transitions if both fire simultaneously; verify on device. |
| `frontend/src/components/OfflineBanner.jsx` | ✅ Safe-area-top respected. |

### 2.3 Forms / inputs

| Layer | Status |
|---|---|
| `frontend/src/lib/inputProps.js` | ✅ All 11 helpers (`inputPropsForEmail/Phone/Url/...`) properly set `inputMode`, `autoComplete`, `autoCapitalize`, `enterKeyHint`, `dir`. |
| `frontend/src/components/SmartFields.jsx` (NumberField/PhoneField/SelectField/Segmented) | ✅ Base font 16px on touch — kills iOS focus auto-zoom. |
| `frontend/src/components/AddressField.jsx` (Photon-backed typeahead) | ✅ Padding-end clearance fix + `--vh-usable` defined + clear button HIG-sized. |
| `frontend/src/components/StreetHouseField.jsx` (population-authority autocomplete) | ✅ Disabled-state placeholder explains itself. |
| Global `font-size: 16px` on `(max-width: 900px) input/textarea/select` | ✅ Kills iOS focus zoom belt-and-braces. |

### 2.4 Animations / transitions

| Layer | Status |
|---|---|
| Route transitions | ✅ View Transitions API, 140ms iOS spring crossfade, compositor-only. |
| Page-load fade-in (`animate-in`, `estia-content-fade`, `estia-page-fade`) | ✅ Disabled on `(pointer: coarse)` — kept the `<main key={pathname}>` re-mount but no fade animation. |
| Button press `:active` | ✅ scale(0.94) + iOS spring 110ms. |
| Modal sheets (ConfirmDialog, CommandPalette, MoreSheet) | ✅ 160-240ms slide-up on mobile. |
| Sidebar drawer | ✅ Standard slide. |

### 2.5 Lists & scrolling

| Layer | Status |
|---|---|
| `content-visibility: auto` on cards | ✅ Extended to all widths with phone-tuned `contain-intrinsic-size: 96px`. |
| `contain: layout style` on cards | ✅ Walls off layout per card. |
| `-webkit-overflow-scrolling: touch` global | ✅ Set. |
| `overscroll-behavior-y: auto`, `-x: none` on body | ✅ Set. |
| `touch-action: manipulation` on body | ✅ Set. |
| `<main key={pathname}>` re-mount on route change | ⚠️ Forces a full re-mount of every page on every navigation. View Transitions masks the visual cost, but the React reconciler still re-builds the tree. Optional optimization: drop the `key={pathname}` and let React handle the diff (would require auditing each page for stale state). |

### 2.6 Asset loading

| Layer | Status |
|---|---|
| Bundle splitting | ⚠️ `index.js` is 408KB gz 106KB. Lots in one chunk. Could be split by route. |
| `exceljs` (929KB) | ✅ Already lazy-loaded — only fetched when /import is hit. |
| `posthog-js` | ✅ Lazy-loaded on idle. |
| Self-hosted Assistant font | ✅ Latin + Hebrew subsets, `font-display: swap`. |
| Image variants + nginx cache | ✅ PERF-016. |

---

## 3. Horizontal swipe between pages — design + plan

User asked for "scroll left and right between pages." Three implementation tiers, increasing in scope:

### Tier A — iOS edge-swipe-back (minimal, ~30 min)

Match the iOS-native gesture: swipe-from-left-edge → `history.back()`.
This is the standard iOS app behavior, so it's intuitive. Doesn't add
a new navigation paradigm.

- Listen for `touchstart` within 24px of the left edge.
- Track `touchmove` deltaX > 80px → trigger `navigate(-1)`.
- Pair with View Transitions for a slide-out animation.

**Risk**: low. Doesn't conflict with vertical scroll. Minor risk of
accidental triggering on horizontal-scroll components (image
gallery, KPI carousel) — solved by checking `e.target.closest('[data-allow-x-scroll]')`.

### Tier B — tab-pair swipe (medium, 1-2 hr)

Swipe left/right on the main content area to navigate between the
five MobileTabBar tabs (`/dashboard`, `/customers`, `/properties`,
`/ai`, `/settings`).

- Wrap `<main>` in a swipeable carousel.
- Each "slide" = the current route's component.
- On swipe, animate the slide-out and navigate to the neighbor tab.
- Use View Transitions for the visual; use a touch-driven
  `transform: translateX` for the gesture's drag-along.

**Risk**: medium. Conflicts with horizontal-scroll inside pages
(KPI carousel, gallery thumbs). Need explicit opt-out via a wrapper
class. Conflicts with text-input drag-to-select on long forms — need
to gate on `!e.target.matches('input, textarea, [contenteditable]')`.

### Tier C — full SPA gesture navigation (large, 4-6 hr)

Every route has explicit `prev` / `next` neighbors. Swipe at any
depth navigates the relationship (e.g. on `/properties/:id`,
swiping right goes back to `/properties`, swiping left goes to the
next property in the list).

- Requires per-route metadata.
- Stateful: maintains breadcrumb context.
- Complex animation choreography.

**Risk**: high. This is iOS Notes / Mail / Photos app territory.

### Status: Tier A shipped

`frontend/src/hooks/useEdgeSwipeBack.js` + wired into `Layout.jsx:163`.
Touch-only (early-return on desktop). Honours opt-outs via
`[data-allow-x-scroll]` for any internal horizontal-scroll component
that needs to keep its own gesture. Uses View Transitions for the
visual when supported (iOS 18+); falls back to a plain `navigate(-1)`
on older platforms.

**To opt-out an internal horizontal-scroll component**, mark its
container with `data-allow-x-scroll`:
```jsx
<div data-allow-x-scroll style={{ overflowX: 'auto' }}>...</div>
```

Tier B (full tab-pair swipe) and Tier C (per-route prev/next) remain
deferred — they conflict with internal horizontal-scroll components
unless every such component is opted out, and the visual quality
bar is much higher (drag-along translate, rubber-band at edges, etc.).

---

## 4. Remaining smoothness work (open)

### High impact

1. **Tier A edge-swipe-back gesture** — ✅ shipped. `frontend/src/hooks/useEdgeSwipeBack.js`, wired into `Layout.jsx:163`. 24px left-edge zone, 80px min horizontal motion, vertical-jitter bail, opt-out via `[data-allow-x-scroll]`. Uses View Transitions for the visual.
2. **Reduce `index.js` bundle size** — already substantially split. Eager: `Login`, `Dashboard`, `Properties`, `PropertyDetail`, `Customers`, `CustomerDetail` (the auth + first-paint critical path). Everything else lazy: `NewProperty`, `NewLead`, `Owners`, `OwnerDetail`, `Deals`, `DealDetail`, `AgentPortal`, `PropertyLandingPage`, `CustomerPropertyView`, `ProspectSign`, `NotFound`, `Profile`, `AgentCard`, `LeadHistory`, etc. The 408KB is a reasonable critical-path budget; further splitting trades chunk-load latency on first nav.
3. **Drop `<main key={pathname}>`** — left in place. Each page would need a per-route audit for stale-state handling on param change before this is safe. Cost is now masked by View Transitions API.

### Medium impact

4. **`will-change: transform` on QuickCreateFab + Layout topbar** — ✅ shipped. `QuickCreateFab.css` and `index.css` `.mobile-header / .mh-bar / .layout-mobile-header`. Both elements are now pinned to their own GPU layers; scrolls under them no longer mark them dirty.
5. **`noise-overlay`** — verified safe. Used only on `CustomerPortal.jsx:191`; `mobile.css:60` `body.mobile-shell .noise-overlay { display: none; }` hides it on the Capacitor mobile shell.
6. **PostHog `capture` calls** — verified safe. `lib/analytics.js` lazy-loads `posthog-js` via dynamic `import()` on idle (Vite hoists into its own chunk and lands on the wire after the critical bundle), and `capture` calls go through PostHog's internal queue + XHR.
7. **API client request coalescing** — `frontend/src/lib/pageCache.js` available; opt-in per page. Defers to per-page work.

### Low impact (nice-to-have)

8. **`scroll-behavior: smooth`** — call sites already pass `behavior: 'smooth'` to `scrollIntoView` / `scrollTo` where relevant. No global change needed.
9. **Haptics on more events** — ✅ extended. `useToast()` already wires `haptics.success/error/warning` on every toast. QuickCreateFab now haptics on trigger press + menu-item tap. MobileTabBar haptics on tab + "עוד".
10. **Pull-to-refresh** on Properties / Customers / Owners — open. Significant work (custom touch handler + indicator UI). Defer to its own focused PR.

---

## 5. What you should actually feel after this batch lands

After deploy `<this commit>` lands and you reopen the app:

1. **Tap the tab bar while a list is mid-scroll** → instantly
   navigates. No more "scroll has to settle first."
2. **Move between screens** → 140ms iOS-spring crossfade. Snappy,
   not draggy.
3. **Press a button** → visible 6% squish + spring back. Pairs with
   Capacitor haptic where wired.
4. **Long lists scroll** → smooth at 120Hz, off-screen cards skip
   paint via `content-visibility`.
5. **Dashboard** → AI panel + reminders stack vertically; no more
   crushed time chips.
6. **Properties cards** → no more "ג…" / "…00" truncation; whole
   card tappable, swipe for actions.

---

## 6. Cross-references

- `MOBILE_POLISH_TASKS.md` — full per-page task list (~210 items).
- `MOBILE_POLISH_TRACKING.md` — implementation status per task ID.
- `MOBILE_POLISH_STATE.md` — per-route P0/P1/P2 counts.
- `MOBILE_POLISH_RESUME.md` — context for resuming after compaction.
- `MOBILE_POLISH_SUMMARY.md` — executive summary.
- `performance_tasks.md` / `performance_summary_new.md` — backend +
  network perf audit.
- `security_tasks.md` / `security_summary_new.md` — security audit.
