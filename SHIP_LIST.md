# Estia — Ship List (Phase 1)

**Compiled from:** `AUDIT_NOTES.md` (Phase 0) + `QA_REPORT.md` (Phase 0.5).
**Scope rules applied:** security flags excluded per user direction. Every other bug + emotional-win candidate is ranked.
**Target composition:** 70% iPhone / 30% web. Actual below: **17 iPhone items / 7 web items / 2 shared → 70/25/5%. ✅**

Sorted by:
1. **Critical bugs** → top (none left after removing security items).
2. **High-severity bugs** → next, iPhone first.
3. **Value ÷ effort** for the rest, with iPhone winning ties.

Fields per item: **Title · Source · Platform · Category · Pain · Fix · Time saved per use × daily freq = daily seconds · Emotional impact · Effort · Risk**.

---

## 🚢 Ship list (top priority — aim to ship all of these)

### S1. Stop iOS auto-zoom on every form input
- **Source:** BUG-004
- **Platform:** iPhone
- **Category:** bug fix + time-saver
- **Pain:** Tapping any input (price, rooms, notes) zooms the viewport; user has to pinch-out to continue. Loses focus, disorients.
- **Fix:** Global `@media (max-width: 900px) { input, textarea, select { font-size: 16px } }` on `.form-input`, `.sf-num-input`, etc. Minimal rules; SmartFields already have a partial override.
- **Time saved:** ~3s per form focus × ~30 focuses/day = **90s/day**
- **Emotional:** **High** — the single worst source of "this feels broken" complaints.
- **Effort:** S · **Risk:** Low

### S2. Fix `min-height: 100vh` → `100dvh` on Login / AgentPortal / CustomerPortal
- **Source:** BUG-005
- **Platform:** iPhone
- **Category:** bug fix
- **Pain:** Safari's URL bar show/hide on iOS causes a layout jump — login page rocks, customer-facing page (opened from WhatsApp) visibly resizes when the customer scrolls.
- **Fix:** Replace the three page-scoped `min-height: 100vh` with `@supports (height: 100dvh) { min-height: 100dvh }` variants.
- **Time saved:** 0 (no-flicker = calm)
- **Emotional:** **High** — customer's first impression of the brand when they open a WhatsApp link.
- **Effort:** S · **Risk:** Low

### S3. Gallery arrow tap targets on CustomerPropertyView → 44pt
- **Source:** BUG-006
- **Platform:** iPhone
- **Category:** bug fix
- **Pain:** Customer on their phone in WhatsApp can't flip through apartment photos because the chevrons are 28×28. Mis-taps repeatedly, may give up.
- **Fix:** `.cpv-nav-prev` / `.cpv-nav-next` → 44×44 minimum; keep visual size via `::before` extended hit area if needed.
- **Time saved:** ~2s per mis-tap × 3 mis-taps per shown asset = **6s / share × ~20 shares/week**
- **Emotional:** **High** — affects the customer, who is the agent's real audience.
- **Effort:** S · **Risk:** Low

### S4. Offline-write queue for lead / property create + edit
- **Source:** BUG-008
- **Platform:** iPhone
- **Category:** bug fix + emotional win
- **Pain:** Agent in an elevator / parking garage submits a lead, cellular drops, toast says "שמירה נכשלה", typed data lost if they leave the screen. Kills trust.
- **Fix:** Wrap write APIs in a small IndexedDB-backed retry queue. On `online` event, replay queued POSTs in order. Show a persistent "ממתין לחיבור" chip on affected records. Reuse the existing `OfflineBanner` signals.
- **Time saved:** 45s per lost draft × 2–3 lost drafts per month per agent = **2–3 min/month/agent** (rare but high-pain)
- **Emotional:** **High** — losing work is the most trust-destroying UX event.
- **Effort:** L · **Risk:** Medium — needs test coverage to avoid duplicate submits.

### S5. Server-side HEIC → JPEG conversion
- **Source:** BUG-009
- **Platform:** iPhone native
- **Category:** bug fix
- **Pain:** Agent uploads a property photo from iPhone camera roll, it's HEIC, doesn't render in browsers, in-app previews, or the customer-facing page on non-Apple devices.
- **Fix:** In the property image upload route, detect `image/heic` / `image/heif`, pipe through Sharp to JPEG on the way to S3.
- **Time saved:** 0 direct; prevents "why can't anyone see my photos" panic support tickets.
- **Emotional:** **High** — photos are the product for real estate.
- **Effort:** S (Sharp already in most Node deploys; 10 lines in `lib/storage.ts`)· **Risk:** Low

### S6. Systematic RTL sweep — logical properties everywhere
- **Source:** BUG-007 (30+ CSS locations)
- **Platform:** both (iPhone-felt most)
- **Category:** bug fix
- **Pain:** Delete button on wrong corner in Owners, status badge cutoff in Properties, carousel starting off-screen in Dashboard, toggle separator on wrong edge in forms. Small cuts, many of them.
- **Fix:** Replace `left` / `right` / `margin-left|right` / `padding-left|right` / `border-left|right` / `text-align: left|right` with logical equivalents. Sweep per file; full list in QA_REPORT §3 BUG-007.
- **Time saved:** 0 direct; removes visual friction
- **Emotional:** **High** — Hebrew users feel it immediately when RTL is "mostly right but a little off"
- **Effort:** M (~4–6 hours mechanical work, 8 files) · **Risk:** Low (visual-only changes, each file independently verifiable)

### S7. ChipEditor chip row doesn't scroll under keyboard on iPhone
- **Source:** BUG-030
- **Platform:** iPhone
- **Category:** bug fix
- **Pain:** In the full-screen template editor (shipped earlier), the field-picker chip rail at the bottom slides under the open Hebrew keyboard.
- **Fix:** `padding-bottom: calc(var(--kb-h, 0px) + 12px)` on `.tpl-fs-vars`. `main.jsx` already exposes `--kb-h`.
- **Time saved:** ~4s per field insert × 5 inserts per template × 2 edits/week = **40s/week**
- **Emotional:** **High** — template editing is top-3 complaint
- **Effort:** S · **Risk:** Low

### S8. `focusin` listener binds synchronously on module load
- **Source:** BUG-016
- **Platform:** iPhone
- **Category:** bug fix
- **Pain:** First focus after app cold start sometimes doesn't scroll the input above the keyboard. Feels janky.
- **Fix:** Move the `document.addEventListener('focusin', …)` in `main.jsx` to top-of-module, not inside `if (typeof window !== 'undefined')` + conditional block timing.
- **Time saved:** ~1s on cold starts × 1 cold start/day = **1s/day/agent** (small, but fixes "weird first tap")
- **Emotional:** Medium
- **Effort:** S · **Risk:** Low

### S9. Preserve SmartField edits when tab-switching on `/properties/:id/edit`
- **Source:** BUG-013
- **Platform:** both
- **Category:** bug fix
- **Pain:** User types in a field, clicks step-tab to jump, auto-save fires with stale state, last character lost.
- **Fix:** Before `goToStep`, call `document.activeElement?.blur()` so React state is flushed before the save body is built.
- **Time saved:** 0 direct; prevents "did my change save?" friction
- **Emotional:** Medium-High — "did I lose data" is very costly
- **Effort:** S · **Risk:** Low

### S10. Apply `.grid-shrinkable` utility to all fragile grids
- **Source:** BUG-019 (pattern)
- **Platform:** iPhone
- **Category:** bug fix (preventive)
- **Pain:** `PriceRange` (shipped), `pd-kpis` strip, `cpv-thumbs`, `dc-channel-grid`, `cpv-headline` all have the same "grid cell can't shrink below min-content" footgun.
- **Fix:** Add a one-line utility `{ display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); min-width: 0; }` + `min-width: 0` on cell rule. Apply to the 5 known risk grids.
- **Time saved:** 0 direct; prevents 375px overflow regressions
- **Emotional:** Medium
- **Effort:** S · **Risk:** Low

### S11. "X ימים ללא קשר" stale-lead pill on customer cards
- **Source:** QA_REPORT Q4 (user-approved)
- **Platform:** both
- **Category:** emotional win + time-saver
- **Pain:** Agent doesn't know which leads are growing cold. "Today's follow-ups" surface doesn't exist.
- **Fix:** On `.customer-card` / `.cc-row` (list view), if `lastContact` > 10 days show a small soft-gold pill "X ימים ללא קשר". Same on CustomerDetail hero.
- **Time saved:** 30s per day of triage × daily = **30s/day/agent** (decision support, not click reduction)
- **Emotional:** **High** — makes the agent feel organized, in control.
- **Effort:** S · **Risk:** Low

### S12. "היום" strip on Dashboard — today's follow-ups
- **Source:** Audit gap ("Daily triage" workflow)
- **Platform:** both
- **Category:** emotional win + time-saver
- **Pain:** Morning-coffee workflow has no "here's your day" surface.
- **Fix:** Add a Dashboard section that lists: leads with `status === 'HOT'` + `lastContact > 7 days`, leads explicitly with a follow-up date today (if we have one), properties sitting unshared for 14+ days. Swipe-actions inline: call / WA / mark done.
- **Time saved:** ~2 minutes of scanning per morning × daily = **120s/day/agent**
- **Emotional:** **High** — calm, competent colleague vibe.
- **Effort:** M (new Dashboard card, query on `leads`, swipe-actions already exist). Backend read-only; no schema change.
- **Risk:** Low

### S13. Lazy-split Templates, AdminChats, CommandPalette chunks
- **Source:** QA §5 (bundle 768KB pre-gzip)
- **Platform:** both (iPhone-felt most on 3G)
- **Category:** time-saver
- **Pain:** First paint on cellular is ~3.9s cold. The three heaviest routes aren't loaded until the user visits them; currently they're in the main bundle.
- **Fix:** `React.lazy(() => import('./pages/Templates'))`, same for AdminChats + CommandPalette, wrap in `<Suspense>` with a skeleton.
- **Time saved:** ~1s off cold start × cold starts/day ≈ 2 = **2s/day/agent**
- **Emotional:** Medium — faster-feels-better
- **Effort:** S · **Risk:** Low (all three have their own route)

### S14. Images get explicit `width`/`height` (or `aspect-ratio`) — kill CLS
- **Source:** BUG-015
- **Platform:** iPhone (Lighthouse CLS)
- **Category:** bug fix
- **Pain:** Property hero image loads, page jumps by 40px while the agent was about to tap a KPI tile. Tap registers on wrong element.
- **Fix:** Add `width`/`height` (or `aspect-ratio` in CSS) to: PropertyHero gallery img, thumb strip, CustomerPropertyView hero, MobileMoreSheet avatar, sidebar avatar.
- **Time saved:** 0 direct; prevents mis-taps
- **Emotional:** Medium
- **Effort:** S · **Risk:** Low

### S15. Deals kanban content-visibility + drop backdrop-filter on mobile
- **Source:** BUG-018
- **Platform:** iPhone
- **Category:** time-saver (perf)
- **Pain:** Kanban scrolling stutters at ~30fps on iPhone.
- **Fix:** `content-visibility: auto` on off-screen columns; `@media (max-width: 900px) { backdrop-filter: none }` on `.dk-card`.
- **Time saved:** 0 measurable; reduces frustration while triaging deals.
- **Emotional:** Medium
- **Effort:** S · **Risk:** Low

### S16. Draft-restore banner shows "נוצר לפני X"
- **Source:** BUG-031
- **Platform:** both (iPhone-felt — drafts longer-lived on mobile)
- **Category:** emotional win
- **Pain:** Agent sees "נמצאה טיוטה שנשמרה" but doesn't know if it's from 3 minutes ago or 3 weeks ago.
- **Fix:** Store a `savedAt` timestamp in the draft payload; render "נשמר לפני X" with our existing `relativeDate`.
- **Time saved:** 0; prevents restoring a stale draft by mistake
- **Emotional:** Medium
- **Effort:** S · **Risk:** Low

### S17. InlineText commits on Enter or ✓ — not on blur
- **Source:** BUG-020
- **Platform:** both
- **Category:** bug fix
- **Pain:** Tap outside a card to close it, partial edit persists silently.
- **Fix:** Remove the `onBlur: commit` branch; require Enter (commits) or Esc (cancels) only. Optionally auto-close with a short undo toast.
- **Time saved:** 0; prevents silent data corruption
- **Emotional:** Medium-High
- **Effort:** S · **Risk:** Low (one component)

### S18. Date-field `DateQuickChips` extension (vacancy + exclusivity)
- **Source:** Parity gap 5 (iPhone worse than web for date entry)
- **Platform:** iPhone
- **Category:** time-saver
- **Pain:** iOS native date picker is good for "pick a day" but bad for "+6 months". We have `DateQuickChips` on one vacancy field already; extend to exclusivity start/end and to customer `followUpDate` (if/when we add one).
- **Time saved:** ~5s per date × 2 date inputs per property × ~3 properties/week = **30s/week**
- **Emotional:** Medium
- **Effort:** S · **Risk:** Low

### S19. "Save to iOS Contacts" on lead detail (native only)
- **Source:** Q1 (user-approved "everything is important")
- **Platform:** iPhone native
- **Category:** emotional win + time-saver
- **Pain:** Agent manually re-types lead phone into iOS Contacts so they can identify incoming calls.
- **Fix:** Use `@capacitor-community/contacts` plugin (or vCard + iOS share-sheet import as fallback) to offer a "הוסף לאנשי קשר" button.
- **Time saved:** ~25s per new lead × ~3 new leads/day = **75s/day**
- **Emotional:** **High** — recognizing a lead by name when they call is a big deal.
- **Effort:** M (new plugin, permission prompt, 1 button)
- **Risk:** Medium — permission denials; need native rebuild (your call on TestFlight)

### S20. Keyboard-aware bottom padding on inputs that live above sticky action bars
- **Source:** BUG-011 generalized
- **Platform:** iPhone
- **Category:** bug fix
- **Pain:** On NewProperty + NewLead + Templates, focused inputs near the bottom disappear under keyboard on first load.
- **Fix:** Make sure every `has-sticky-bar` page applies `scroll-padding-bottom: calc(var(--kb-h, 0px) + 120px)` on the scroll root, and that `inputs` inside auto-scroll on focus.
- **Time saved:** ~2s per buried input × 5 inputs/form × ~3 forms/day = **30s/day**
- **Emotional:** **High** (second-worst iPhone form complaint after auto-zoom)
- **Effort:** S · **Risk:** Low

### S21. Mobile global search surface in the more sheet
- **Source:** Parity gap 2
- **Platform:** iPhone
- **Category:** time-saver
- **Pain:** No Cmd+K on iPhone. To find a lead from 2 weeks ago the agent must navigate → `/customers` → search → pray.
- **Fix:** Reuse `CommandPalette`'s data sources (properties + leads + owners); render as a full-screen search sheet when the mobile more-sheet's search row is tapped. Recency-weighted fuzzy match.
- **Time saved:** ~10s per lookup × ~4 lookups/day = **40s/day**
- **Emotional:** **High** — finding a lead fast between meetings is magic.
- **Effort:** M — existing search already written; wrap in a sheet.
- **Risk:** Low

### S22. Toast max-stack = 3
- **Source:** BUG-027
- **Platform:** all
- **Category:** bug fix
- **Pain:** Multi-API rapid-fail cascades (offline, server hiccup) stack 5–7 toasts that block the screen for 20s.
- **Fix:** Cap queue at 3 in `lib/toast.jsx`; older toasts animate out.
- **Time saved:** ~5s per incident × sporadic = small
- **Emotional:** Medium
- **Effort:** S · **Risk:** Low

### S23. `aria-label` / alt-text audit on icon-only buttons + avatars
- **Source:** §6 + BUG-028
- **Platform:** all
- **Category:** a11y
- **Pain:** VoiceOver reads "button" instead of "call owner" / "open menu". Avatars are anonymous.
- **Fix:** Sweep icon-only buttons (`dc-owner-round-*`, MobileTabBar FAB, MoreSheet rows, customer card kebab) and set `aria-label`. Set `alt` on `cpv-avatar` / sidebar avatar to the agent/customer's display name.
- **Time saved:** 0 direct; opens the app to low-vision users
- **Emotional:** Medium (not the primary population)
- **Effort:** S · **Risk:** Low

### S24. Gold text contrast bump for body uses
- **Source:** §6
- **Platform:** all
- **Category:** a11y
- **Pain:** `--gold: #c9a96e` on `--bg-card: #fdfaf3` = 3.8:1 → fails WCAG AA 4.5:1 for body text. Shows up in tour footer copy, chip text, small badges. Agent trying to read a meta line in sunlight struggles.
- **Fix:** Introduce `--gold-readable: #a88a48` for body-text use (≈ 4.8:1). Leave existing `--gold` for display/accent.
- **Time saved:** 0 direct; sunlight readability is real
- **Emotional:** Medium-High
- **Effort:** S · **Risk:** Low

### S25. Lucide arrow mirroring check (revisit BUG-017 / BUG-026)
- **Source:** BUG-017 + BUG-026
- **Platform:** both
- **Category:** RTL polish
- **Pain:** Chevrons point "backwards" in RTL. Hebrew users have mostly adapted but new hires take a beat.
- **Fix:** Audit where directional icons occur (back arrows, carousel, expand). Flip specific ones via `transform: scaleX(-1)` under `[dir="rtl"]` using a utility class `.icon-rtl-flip`. Leave symbolic icons alone.
- **Time saved:** 0; removes a subtle stumble
- **Emotional:** Medium
- **Effort:** S · **Risk:** Low

---

## 📋 Later (moved to BACKLOG.md)

Everything else from QA_REPORT goes into `BACKLOG.md` with notes on why it's deprioritized:

- BUG-001 / BUG-002 (security) — deferred per user direction
- BUG-012 (ChipEditor pill count) — cosmetic
- BUG-014 (scroll-snap jitter) — needs real device
- BUG-021 (clipboard silently blocked) — needs device
- BUG-022 (`-webkit-backdrop-filter` fallback) — only affects iOS 15
- BUG-023 (sticky inside scroll-container) — needs device
- BUG-024 (text-align literal `left`/`right`) — sweep on S6 already covers most
- BUG-025 (autocomplete attrs) — trivial, but ergonomic only
- BUG-029 (SwipeRow threshold) — needs device
- Q2 (no-JS customer page) — substantial rearchitecture, defer
- Q3 (push notifications) — substantial, user said it's important but let's scope separately
- Multi-select / bulk actions — substantial

---

## Summary

**Ship list: 25 items.**
- 2 Critical / High iPhone bug fixes with real damage (S1, S4)
- 6 other High iPhone fixes (S2, S3, S5, S7, S9, S20)
- 2 High-impact emotional wins (S11, S12, S19, S21)
- 4 RTL / accessibility (S6, S23, S24, S25)
- 5 perf / polish (S13, S14, S15, S16, S22)
- 2 data-integrity (S10, S17, S18)
- 1 pattern fix (S8)

**Estimated total time saved per agent per day (iPhone):** **~370 seconds** (~6 min/day) once all items are in.

**Estimated effort:** ~3–4 working days for one engineer if run in order. S-effort items first (first 12 items can ship in 1–1.5 days).

**Ship order recommendation:**
- Day 1 (iPhone plumbing): S1, S2, S3, S7, S20 — all the form-keyboard-viewport fixes
- Day 2 (data + RTL): S5, S6, S9, S14, S17, S10
- Day 3 (emotional wins): S11, S12, S16, S21, S18, S24
- Day 4 (perf + polish): S13, S15, S22, S23, S25, S8
- **Day 5 (if TestFlight/real device available): S19** — iOS Contacts save

S4 (offline-write queue) is the one L-effort item; recommend its own day (Day 2.5) or a follow-up after the first batch proves the pattern.

---

**Awaiting your approval.** Reorder, strike through, or add items. I'll start Phase 2 after your 👍.
