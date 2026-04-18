# Estia — Changes Shipped (Phase 2)

All items trace back to the Ship list in `SHIP_LIST.md`. iPhone-first.

---

## Day 1 — iPhone plumbing

### S1 · Kill iOS auto-zoom on form focus
- **Source:** BUG-004
- **Files:** `frontend/src/index.css`
- **Change:** Added `@media (max-width: 900px)` rule forcing `font-size: 16px` on every `input` / `textarea` / `select` (excluding checkbox/radio/hidden/range/color). Belt-and-braces for dialog inputs, LeadPickerSheet search, TransferPropertyDialog search, MarketingActionDialog notes that weren't covered by Forms.css / SmartFields' own mobile overrides.
- **iPhone re-test:** Tapped every form input type on Chrome iPhone 15 emulation; viewport no longer zooms on focus.
- **Time saved:** ~3s × ~30 focuses/day = **~90s/day/agent**

### S2 · `100dvh` fallback on Login / AgentPortal / CustomerPortal
- **Source:** BUG-005
- **Files:** `frontend/src/pages/Login.css`, `pages/AgentPortal.css`, `pages/CustomerPortal.css`
- **Change:** Each page-level rule now carries `min-height: 100vh` + `min-height: 100dvh` in sequence. Modern iOS reads dvh (updates with URL bar); old browsers keep the vh fallback.
- **iPhone re-test:** Scrolled Login + CustomerPortal on Chrome iPhone 15; URL bar hide/reveal no longer jumps the layout.
- **Time saved:** 0; removes the "brand looks unstable" first impression for customers opening WA links.

### S3 · Gallery arrows on CustomerPropertyView — verified already 44×44
- **Source:** BUG-006 (audit agent stale read)
- **Files:** none changed
- **Note:** `.cpv-nav` is already 44×44 in `CustomerPropertyView.css:256–274`. Closed as already-good.

### S7 · ChipEditor chip row keyboard-safe on iPhone
- **Source:** BUG-030
- **Files:** `frontend/src/pages/Templates.css`
- **Change:** `.tpl-fs-vars` now `position: sticky; bottom: 0` with `padding-bottom: calc(12px + env(safe-area-inset-bottom) + var(--kb-h, 0px))`. Chip rail sits above the keyboard instead of under it.
- **iPhone re-test:** Opened fullscreen template editor, focused textarea; Hebrew keyboard opens, chip rail tracks above it. Saves ~8s/template edit of fumbling.

### S8 · `focusin` listener — verified synchronous at module top
- **Source:** BUG-016 (audit false positive)
- **Files:** none changed
- **Note:** `main.jsx` binds the focusin listener at top-level synchronously. No delayed-mount issue. Closed.

### S9 · Preserve SmartField edits on step tab switch
- **Source:** BUG-013
- **Files:** `frontend/src/pages/NewProperty.jsx`
- **Change:** `goToStep` now `document.activeElement.blur()` + one `requestAnimationFrame` tick before reading form state for the PATCH. Last keystroke no longer lost on rapid tab-jump in edit mode.
- **Re-test:** Typed "שרה" in לקוח name field, tapped step-2 tab mid-"ה"; server received "שרה" correctly.

### S10 · `min-width: 0` on cpv-headline (grid-shrinkable pattern)
- **Source:** BUG-019
- **Files:** `frontend/src/pages/CustomerPropertyView.css`
- **Change:** `.cpv-headline` now uses `repeat(auto-fit, minmax(min(80px, 100%), 1fr))` with `min-width: 0` on cells. Prevents the class of "grid cell can't shrink below min-content" bug that caused the original PriceRange overflow.
- **Re-test:** Rendered with 4-room / 180 מ״ר / קומה 7/9 / גיל הבניין חדש at 320px wide — row fits cleanly.
- **Note:** `pd-kpis` and `dc-channel-grid` were already correct; no change needed.

### S14 · Image dimensions — verified already-sized
- **Source:** BUG-015
- **Files:** none changed
- **Note:** Every avatar (`mh-avatar`, `agent-avatar`, `mms-avatar`, `cpv-avatar`, `ap-agent-avatar`) has fixed CSS `width`/`height`. Every gallery thumbnail is inside a container with `aspect-ratio`. No CLS risk from `<img>` loads. Closed.

### S16 · Draft banner shows "נשמר לפני X"
- **Source:** BUG-031
- **Files:** `frontend/src/hooks/mobile.js`, `pages/NewProperty.jsx`, `pages/NewLead.jsx`, `pages/Forms.css`
- **Change:** `useDraftAutosave` now persists `{ value, savedAt }` in sessionStorage. `readDraft` returns the same shape (with backwards-compat for legacy raw-object drafts). `NewProperty` + `NewLead` banners append `{relLabel(savedAt)}` ("נשמר לפני 3 דקות") so the agent knows how fresh the draft is before restoring.
- **Re-test:** Left a partial property for 15 min, came back — banner reads "נמצאה טיוטה שנשמרה · לפני 15 דקות".

### S17 · InlineText no longer silently commits on blur
- **Source:** BUG-020
- **Files:** `frontend/src/components/InlineText.jsx`
- **Change:** `onBlur` now *reverts* the draft instead of committing. User must press Enter (single-line) or Cmd/Ctrl+Enter (multiline) to save. Esc still cancels as before. Accidental tap-outside no longer writes partial state to the server.
- **Re-test:** Started editing a customer's עיר inline, tapped outside — value returned to original. Pressed Enter — saved.

### S20 · Keyboard-aware bottom padding on sticky-action-bar pages
- **Source:** BUG-011 generalized
- **Files:** `frontend/src/pages/Forms.css`
- **Change:** `.intake-form` scroll-padding-bottom and `.form-page.has-sticky-bar` padding-bottom now include `var(--kb-h, 0px)`. Focused inputs on NewProperty / NewLead / OwnerDetail always land above the keyboard+sticky-bar stack.
- **Re-test:** Focused on בעל הנכס field at bottom of NewProperty at 375px with keyboard open — field is visible, sticky bar above keyboard.

### S22 · Toast stack capped at 3
- **Source:** BUG-027
- **Files:** `frontend/src/lib/toast.jsx`
- **Change:** `push()` now evicts overflow toasts + clears their timers. Rapid-fire API errors no longer block the screen with 5–7 stacked toasts.
- **Re-test:** Simulated 6 consecutive error pushes — only 3 most-recent rendered; older auto-cleared.

### S24 · `--gold-readable` token added
- **Source:** §6 accessibility (3.33:1 gold-on-white fails WCAG AA)
- **Files:** `frontend/src/index.css`
- **Change:** New `--gold-readable: #7a5c2c` (~4.9:1 vs white) for any small body-text use. `--gold` kept for display/accent (headlines pass as large text at 3:1).
- **Follow-up:** Individual sites of body-text gold will migrate incrementally as we touch them. No forced global swap to avoid visual regressions.

---

## Day 2 — iPhone fixes + bundle weight

---

## Day 3 — emotional wins + flow + Lighthouse

### HOTFIX · Lighthouse-flagged load perf issues
- **Source:** user Lighthouse run (2026-04-18) — render-blocking fonts ~290ms, LCP image lazy-loaded, PostHog dominating 3.3s critical path, missing meta description, invalid robots.txt
- **Files:** `frontend/index.html`, `frontend/src/main.jsx`, `frontend/src/pages/Properties.jsx`, `frontend/public/robots.txt` (new)
- **Change:**
  - `index.html`: Google Fonts CSS switched to preload+swap (`rel="preload" as="style" onload="this.rel='stylesheet'"` + `<noscript>` fallback) so it fetches in parallel without blocking first paint. Lighthouse est. savings ≈290 ms.
  - `index.html`: added `<meta name="description">` in Hebrew for SEO.
  - `main.jsx`: `initAnalytics()` now fires inside `requestIdleCallback` (2s timeout fallback) instead of at bootstrap. PostHog was sitting in the critical path for 3.3s per Lighthouse; deferring to idle lets the first paint + /me + dashboard fetches win bandwidth. Session replay still starts automatically once init runs.
  - `Properties.jsx`: first card's image (LCP candidate) gets `loading="eager"` + `fetchpriority="high"` + `decoding="async"`. Rest stay lazy as before.
  - `public/robots.txt` (new): allow only the public customer-facing catalog paths (`/agents/*`, `/a/*`, `/p/*`), disallow authenticated surfaces (`/customers`, `/deals`, `/owners`, etc).
- **Expected deltas (next Lighthouse run):** FCP/LCP improvement from fonts (~290ms) + PostHog defer (up to 3.3s main-thread relief), SEO fix from meta description + robots, LCP image discovery with fetchpriority.



### S11 · Stale-lead pill on customer cards
- **Source:** SHIP_LIST S11 + empathy log ("I've gone quiet on leads and don't notice until the week is over")
- **Files:** `frontend/src/pages/Customers.jsx`, `frontend/src/pages/Customers.css`
- **Change:** `stalePillDays(lead)` helper returns the day count when a HOT/WARM lead has had no contact in ≥10 days (COLD already has its own "X ימים ללא קשר" suffix, so we skip it to avoid double-signaling). Pill renders on all three list paths:
  - Mobile card name-row: amber pill next to status reason / preapproval — tap bumps lastContact to now (fix affordance, not just a warning).
  - Desktop v2 card right rail: same, scaled up.
  - Desktop table + mobile list row: the existing "last contact" cell paints amber so the row gets a passive glance-cue without adding a chip to an already-dense row.
- **iPhone re-test:** Seeded 3 HOT leads with lastContact 12-18 days ago; all rendered the pill. Tap → "קשר אחרון עודכן" toast → pill vanished.
- **Emotional impact:** High — agents consistently describe "going quiet on a warm lead" as their most recurring regret.

### S12 · Dashboard "היום" strip
- **Source:** SHIP_LIST S12 + "morning-coffee workflow" from Phase 0
- **Files:** `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Dashboard.css`, `frontend/src/pages/Customers.jsx`, `frontend/src/pages/Properties.jsx`
- **Change:**
  - New `TodayStrip` component renders between Welcome and KpiScroller. Three tiles, in priority order: hot leads untouched ≥1d (danger tone), stale leads ≥10d (warn), unmarketed properties (gold). Tile only renders if its underlying count > 0; the whole strip hides on a quiet day so there's no "0 לידים ממתינים!" cheerleader copy.
  - Tiles link directly to filtered views: `/customers?filter=hot`, `/customers?filter=inactive10`, `/properties?filter=unmarketed`. Wired the two new filters into the target pages so the deep-links actually narrow the list.
  - Mobile: the rail becomes a scroll-snapping horizontal lane at ≤820px with a peek of the next tile, so the strip stays one-glance even at 375px.
- **iPhone re-test:** Dashboard at 375px shows three tiles scroll-snapping horizontally; tapping "X לידים חמים ממתינים" navigates to `/customers?filter=hot` with status badge correctly set to HOT.
- **Emotional impact:** High — the morning-coffee workflow now has a specific artifact to answer "what do I need to do today?".

### S18 · DateQuickChips now covers backdated fields
- **Source:** BUG-018 + empathy log ("recording a signing after the fact took 6–8 taps through the iOS date picker")
- **Files:** `frontend/src/components/MobilePickers.jsx`, `frontend/src/components/MobilePickers.css`, `frontend/src/pages/Deals.jsx`
- **Change:**
  - `DateQuickChips` learned three new options: `-1d` (אתמול) and `-7d` (לפני שבוע) for backdating, plus a `sel` state that visually highlights the chip whose resolved date equals the current value — agents can see at a glance what's picked instead of re-reading the ISO date.
  - Chip rendering is now table-driven (`CHIP_LABELS`, `chipToDate`) so adding another chip later (e.g. `+1w`) is a one-line addition.
  - Wired into the Deals "תאריך חתימה" field (only rendered when status = SIGNED). Agents typically record contract signings 1–7 days after they actually happened; one tap on "אתמול" or "לפני שבוע" replaces the seven-tap dance through iOS's native `<input type="date">` picker.
- **iPhone re-test:** Updated a deal to SIGNED with signedAt = yesterday: 1 tap vs. 7 previously. `sel` highlight shows the right chip filled-gold.
- **Time saved:** ~5s per deal-closure × ~2 closures/week/agent = **~10s/week/agent**. Small absolute number but high frequency during a hot week.

### S15 · Deals kanban scrolls smoothly on iPhone with many cards
- **Source:** BUG-023 (frame drops on kanban scroll with >20 deals per column)
- **Files:** `frontend/src/pages/Deals.css`
- **Change:**
  - `.dk-card` and `.deal-card` now use targeted `transition: border-color, box-shadow, transform` instead of `transition: all`. `all` forced the browser to diff every computed property on every hover/state change — even properties that never animate — which on a long kanban meant re-evaluating h5 font / chip backgrounds / price colors on every interaction.
  - `.dk-card` gets `content-visibility: auto; contain-intrinsic-size: 120px` so off-screen cards skip layout+paint entirely. The intrinsic-size hint keeps the scrollbar stable as cards hydrate.
  - New `@media (hover: none) and (pointer: coarse)` block neutralises `:hover` styles on touch devices so the phantom-hover on first tap doesn't fire a shadow/border restyle mid-scroll.
- **iPhone re-test:** 50-deal column on iPhone 15 emulation — scroll felt 60fps smooth after the change (was stuttering into the 30s before on first scroll past a dense column).

### HOTFIX · PostHog events showed up without a Person
- **Source:** live user report ("some API requests that I see in posthog come without an identification, it doesnt have the PERSON in them")
- **Files:** `frontend/src/lib/analytics.js`
- **Root cause:** posthog-js 1.369 defaults `person_profiles` to `'identified_only'`, which means any event fired *before* `identify()` is called — initial `$pageview`, autocapture clicks during the /me round-trip, `$exception` from bootstrap errors — never creates a Person. Those events are still recorded, but they show up in PostHog with no Person attribution, exactly what the user was seeing.
- **Fix:**
  - `person_profiles: 'always'` on init: every event creates / attaches to a Person. Anonymous captures get an anon Person, which `identify()` then aliases onto the real one when auth resolves — so nothing is orphaned.
  - `identify()` now also calls `posthog.register({ user_id, user_role })`. Registering those as *super-properties* means every subsequent capture (autocapture, pageviews, session-replay) carries the identity even if the call site forgets to pass it — e.g. errors in setTimeout handlers or third-party callbacks.
  - `resetIdentity()` unregisters both super-props before `posthog.reset()` so a previous agent's `user_id` can't leak onto the next anonymous session's events (`reset()` clears distinct_id but registered props survive).
- **Verification plan:** next PostHog session should show every event under a Person — including the initial pageview that previously rode on an anon distinct_id.

### HOTFIX · "דלג על הסיור" didn't collapse the tour
- **Source:** live user report ("After I click on 'דלג על הסיור' it still persists and doesn't collapse the tutorial")
- **Files:** `frontend/src/lib/tourKill.js`, `frontend/src/components/tour-tooltip.css`
- **Root cause:** react-joyride v3 renders its portal as `#react-joyride-portal` (an ID, not a class) and uses `.react-joyride__floater` / `.react-joyride__tooltip` BEM selectors. The CSS escape-hatch in `tour-tooltip.css` was written against pre-v3 selectors (`.react-joyride-portal`, `.__floater`) so the `body.tour-dead` rule matched nothing — which left Joyride DOM visible for the frame between click and React re-render. When network was slow or the device was under load, that frame stretched long enough to feel like the tour "didn't close".
- **Fix:**
  - `killAllTours()` now also *removes* every Joyride-owned DOM node synchronously on the Skip click (`document.querySelectorAll('#react-joyride-portal, .react-joyride__overlay, .react-joyride__spotlight, .react-joyride__floater, .react-joyride__tooltip, .react-joyride__beacon, .__floater, [data-floater-placement]').forEach(n => n.remove())`). The tour is gone on the same event loop as the click — React's subsequent re-render to `null` is just cleanup.
  - Dropped the `if (killed) return;` early-exit so a second press of Skip still yanks anything the first pass somehow missed.
  - CSS `body.tour-dead` selectors updated to cover both old (`.__floater`, `[data-test-id^="react-joyride"]`) and new (`#react-joyride-portal`, `.react-joyride__*`) DOM, plus `.react-joyride__tooltip` + `.react-joyride__beacon` which were never listed. Added `visibility: hidden` and `pointer-events: none` alongside `display: none` so no lingering element can catch a click or fade in.
- **iPhone re-test:** Logged in as new agent → tour launched → tapped "דלג על הסיור" → tour vanished instantly. Reloaded → tour stayed dismissed (server `hasCompletedTutorial` flag).
- **Emotional impact:** High — a tutorial you can't escape is the worst possible first impression.

---

## Pending (from Ship list)

Still to ship on day 2+: **S4** (offline-write queue — L effort, own day), **S5** (HEIC → JPEG conversion), **S6** (full RTL sweep), **S11** (stale-lead pill), **S12** (Dashboard "היום" strip), **S13** (lazy chunks), **S15** (kanban perf), **S18** (more DateQuickChips), **S19** (iOS Contacts save — needs device), **S21** (mobile global search), **S23** (aria-label sweep), **S25** (RTL icon mirroring).

**Commits stay local until you say ship.**
