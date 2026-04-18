# Estia — Mobile-First Polish Audit

Audit surface: the whole web app as it runs on iPhone (Capacitor WKWebView loading `estia.tripzio.xyz`). Verified against the source tree; items marked **(sim)** were confirmed on the iPhone 17 simulator against production. Items marked **(src)** are observed in code and still need a final simulator confirmation during fix-time.

Findings are ranked **H / M / L** by impact on the "reach for this tool 50 times a day" feel. Each has a concrete fix and an effort tag (S / M / L).

---

## 1 · Performance & responsiveness

| ID  | Item | Impact | Effort | Where it hurts |
|---- |------|--------|--------|----------------|
| P-1 | `transition: all` appears **69 times across 25 files**. Every one of them triggers full-property style diff on state changes; on a dense screen (Deals kanban already fixed in S15, but Customers / Properties / Templates / Dashboard / Login / Forms still have it) this measurably tanks scroll and tap-feedback framerates on iPhone 12-class hardware. | **H** | M | Customers.css ×10, Templates.css ×8, Login.css ×6, CustomerPortal.css ×5, AgentPortal.css ×4, Properties.css ×4, Dashboard.css ×3 |
| P-2 | Server-side images have **no `srcset` / responsive variants anywhere** (zero matches). Customers downloading the full 2400×2400 mozjpeg from the share page on LTE is the single biggest cost on that surface. | **H** | M | Customer pages, property gallery, dashboard thumbs |
| P-3 | Only **8 files** use `loading="lazy"` and only Properties + CustomerPropertyView set `fetchpriority`. Thumbs inside Dashboard + Owner list + Customer card all load eagerly with no priority hint. | M | S | Dashboard.jsx, CustomerDetail.jsx, OwnerDetail.jsx |
| P-4 | Zero `content-visibility: auto` outside the Deals card I fixed in S15. Long Customers list (100+ rows) paints every row every scroll-frame. | M | S | Customers.css list rows, Owners.css cards |
| P-5 | `will-change:` appears **7 times**. A couple are legit (SwipeRow transform) but it's also sitting statically on `.toast-item` in `toast.css`, promoting toasts to their own compositor layer at all times — small but pointless overhead. | L | S | toast.css, Layout.css |
| P-6 | Dashboard currently fires **4 parallel API requests** at mount (`dashboard`, `properties`, `leads`, `owners`). On a cold LTE load that's ~3s total before first paint. We already have `pageCache` for a warm seed — the cold-path just needs a smaller first-paint call (dashboard summary only) and lazy-hydrate the rest. | M | M | Dashboard.jsx load() |

## 2 · Buttons, tap targets, thumb zone

| ID  | Item | Impact | Effort |
|-----|------|--------|--------|
| T-1 | `.cl-btn` (Customers table action icons) is **30×30 px** — below Apple HIG's 44pt minimum. Same for `.pd-chip` dismiss × on property-detail chips, and most `.mpk-chip` number-pads. Tap accuracy on the customers row is the #1 source of "I keep tapping the wrong thing" reports in the empathy log. | **H** | S |
| T-2 | Sticky bottom action bar on `NewProperty` / `NewLead` has the **primary save on the visual-left in RTL** (which lands on the thumb for a right-hander in LTR, but on the pinky in RTL — inverted reachability). Need a reachability audit + swap where helpful. | M | S |
| T-3 | No `:active` scale-down feedback on standard `.btn` — only `.btn-primary` + `.tour-btn` have it. The rest feel dead on tap. | M | S |
| T-4 | Several icon-only buttons across Owners / Customers / Properties have no `aria-label`. 76 matches exist but spot-check shows lots of missing ones (e.g., the overflow `⋯` button in `Owners.jsx` — verify). | L | S |

## 3 · Animation — the "subtle" rule

| ID  | Item | Impact | Effort |
|-----|------|--------|--------|
| A-1 | `prefers-reduced-motion` only honoured in 2 files (`index.css`, `CustomerPropertyView.css`). Everywhere else — `.animate-in`, page fades, toast slides, sheet opens — keeps animating even when the user has Reduce Motion on. **Accessibility regression** + many iPhone users keep Reduce Motion on for battery. | **H** | S |
| A-2 | No page-transition animation at all between routes. Feels snappier than a bad animation, but the cost is that pages *appear* identically instantly — there's no directional cue for "forward" vs. "back". Could add a <150ms slide-from-trailing-edge at the route level, respecting Reduce Motion. Optional polish. | L | M |
| A-3 | Toast/stack animates in from the bottom, but the exit animation is a plain `opacity` fade — janky against the slide-in. Should match slide-in-reverse on dismiss. | L | S |
| A-4 | `.animate-in` uses `animation: fade-in 0.4s ease-out` — 400ms is too slow for a list of items. Feels laggy on dashboards with 6+ stat cards each staggered 80ms. Cap at 220ms. | M | S |

## 4 · Haptics

| ID  | Item | Impact | Effort |
|-----|------|--------|--------|
| H-1 | Haptics are wired in **30 files** — good baseline. But `haptics.success()` is never called on save (`NewProperty`, `NewLead`, `CustomerDetail.patchLead`, `OwnerDetail.patch`). Every save is visually silent. | **H** | S |
| H-2 | No `haptics.error()` on validation failures or failed saves. Failed toasts just slide in silently. | M | S |
| H-3 | `haptics.press()` is used on the tab-bar + button — good. But missing from destructive confirmations (delete property/customer/owner). "I'm about to delete something" deserves a medium-weight beat. | M | S |

## 5 · Form ergonomics on iPhone

| ID  | Item | Impact | Effort |
|-----|------|--------|--------|
| F-1 | Zero use of **`enterkeyhint`** anywhere. Phone keyboards show a generic "return" on every input. Could show "next" on chained fields, "search" on the search input, "done" on last fields. Big usability win. | **H** | S |
| F-2 | Several number-like fields use `type="text"` rather than `type="number"` or `inputMode="numeric"`. E.g. budget fields in `NewLead.jsx`, price ranges in `NewProperty.jsx` if any are un-migrated. Triggers full QWERTY instead of numeric pad. | **H** | S |
| F-3 | iOS auto-zoom on form focus: **fixed** in S1 globally, but verify none of the newer `input` styles slipped below 16px. Spot-check Profile, OwnerEditDialog. | L | S |
| F-4 | "Done" button on number pads — iOS doesn't include one. Sticky-toolbar trick (floating "סיום" above the keyboard) would fix this; currently users dismiss by tapping outside the field, which sometimes also commits on blur (fixed by S17 `InlineText` but not elsewhere). | M | M |
| F-5 | Hebrew inputs correctly use `direction: rtl` via CSS, but date inputs (`type="date"`) show the native iOS picker which is LTR. Hard to fix cross-platform; acceptable as-is. | L | — |
| F-6 | `autoComplete=""` / `autoCapitalize=""` hints are missing on most inputs. Phone → should be `autoComplete="tel"`, name → `"name"`, email → `"email"`. iOS's AutoFill dance gets noisy without these. | M | S |

## 6 · Navigation

| ID  | Item | Impact | Effort |
|-----|------|--------|--------|
| N-1 | No swipe-back gesture on iOS. WKWebView doesn't handle this for SPA routes — needs a custom implementation or `allowsBackForwardNavigationGestures` native-side. **Known open gap** — logged here for awareness, fix is in S19 territory. | M | L |
| N-2 | Tab bar (`MobileTabBar.jsx`) is reachable and clear — ✅. Active states are visible. No issues. | — | — |
| N-3 | Back button in page headers is positioned with physical `left` in a couple of screens (`PropertyDetail`, `CustomerDetail`) — need logical-property sweep. Will check during Task 6 exec. | L | S |
| N-4 | **Mobile global search** (S21, still pending) — no way to jump straight from the Customers tab to a property, or from Dashboard to a specific owner. Desktop has CommandPalette; mobile has no equivalent. | **H** | M |

## 7 · Copy

| ID  | Item | Impact | Effort |
|-----|------|--------|--------|
| C-1 | Empty states vary widely in warmth. Dashboard's "עוד אין לך נתונים" — ✅. But Customers-empty, Owners-empty, Deals-empty are three different tones, and Transfers-empty is technical ("אין העברות לטיפול"). Consolidate voice. | M | S |
| C-2 | Error toasts default to generic "שגיאה" in several places. `NewProperty.jsx` error branch says literally "שגיאה" if the server call throws. Every error should tell the user **what failed and what to try next**. | **H** | S |
| C-3 | Button labels are mostly excellent ("שתף את הנכסים שלי"). Checked — no obvious issues. ✅ | — | — |

## 8 · Consistency

| ID  | Item | Impact | Effort |
|-----|------|--------|--------|
| K-1 | Spacing scale is mostly consistent — tokens are in `index.css`. No major violations spotted. | — | — |
| K-2 | **517 hardcoded font-sizes** in 58 files. Many are `11px`, `12px`, `13px`, `14px` for small meta text. There's a `--font-size-*` scale in tokens but it's rarely used in consequence. Refactoring all is out of scope, but a readability-pass of the most-visible screens (Customers, Properties, Dashboard) wouldn't hurt. | L | L |
| K-3 | `.btn-primary` / `.btn-secondary` / `.btn-ghost` are used consistently — ✅. | — | — |

---

## Proposed polish shipping order (for approval)

Group A — **ship first** (highest impact, low/medium effort, pure polish):

1. **A-1** — honour `prefers-reduced-motion` app-wide (one audit, 10-minute fix) **[H/S]**
2. **H-1, H-2, H-3** — haptics on save/error/destructive (one PR, ~15 touch-sites) **[H/S]**
3. **T-1** — bump all `cl-btn`, `.mpk-chip`, small icon buttons to 44×44pt tap area (`padding` or `min-width/min-height`). Visual size can stay the same — use invisible padding. **[H/S]**
4. **F-1** — add `enterkeyhint="next|done|search"` on form inputs. **[H/S]**
5. **F-2** — replace `type="text"` with `inputMode="numeric" | "decimal" | "tel"` on number/money/phone inputs. **[H/S]**
6. **P-1** — sweep remaining `transition: all` to named props on the top 5 offenders (Customers, Templates, Dashboard, Properties, Login). **[H/M]**
7. **C-2** — replace bare "שגיאה" toasts with actionable copy. **[H/S]**
8. **T-3** — universal `:active { transform: scale(0.97) }` on `.btn` so every button feels alive. **[M/S]**
9. **A-4** — cap `.animate-in` durations at 220ms. **[M/S]**

Group B — **after A is shipped**:

10. **P-2** — responsive `srcset` on property/customer images. Needs a small backend hook (serve variants from `/uploads/.../w=<n>.jpg` on-demand via sharp). **[H/M]**
11. **P-3** — `loading="lazy"` + decoding="async" on all image call sites. **[M/S]**
12. **F-6** — `autoComplete` / `autoCapitalize` sweep. **[M/S]**
13. **A-3** — toast exit animation to match entry. **[L/S]**
14. **C-1** — consolidate empty-state voice. **[M/S]**

Group C — **defer to backlog** (L effort or architectural):

- **P-6** — Dashboard cold-path split. Needs thinking about cache invalidation per-screen.
- **N-1** — Swipe-back gesture. Needs native Capacitor plumbing; already tracked as S19.
- **K-2** — Font-size token sweep. Huge scope, low marginal value.
- **A-2** — Route transitions. Nice-to-have; bad ones are worse than none.

---

## What I want approval on

- **Group A** — please confirm to ship as a single "polish day" batch (Day 4).
- **Group B** — please confirm to ship after A, or reprioritise.
- **Group C** — confirm we can move these to `BACKLOG.md`.

Once approved, I'll:
1. Execute Group A in one commit per item, with simulator screenshots before/after in `CHANGES.md`.
2. Run a full regression sweep (Dashboard → Customers → NewLead → NewProperty → PropertyDetail → Share → Customer page) on the iPhone 17 simulator before declaring Day 4 done.
3. Run the proposed Lighthouse delta on the customer-facing page one more time after B-10 lands, since responsive images are the big LCP lever.
