# Estia CRM — Desktop UX Audit (v2)

> Live walkthrough of **https://estia.tripzio.xyz** at 1440×900
> performed 2026-04-17 after the first desktop audit. This pass
> grades what's changed, what's still broken, and new issues visible
> only after round-1 fixes landed.
>
> Scope: the agent on a **14"/15" laptop, Chrome/Safari, one tab most
> of the day** — keyboard-heavy, two-hand capable, needs density and
> speed. Different tradeoffs than mobile; most changes here are about
> keyboard shortcuts, layout density, and context preservation.
>
> Legend: **🐞 bug** · **🧭 flow/UX** · **🪄 automation** · **✍️ user input**
> · **♿ accessibility** · **⚡ perf/polish** · **🖥️ desktop-only**
>
> Sister files:
> - `ESTIA_UX_AUDIT.md` (round 1, shared items)
> - `ESTIA_MOBILE_UX_AUDIT.md` / `_V2.md` (mobile)

---

## What clearly improved since round 1

| Round-1 item | Status | What shipped |
| --- | --- | --- |
| Sidebar not collapsible | ✅ closed | `"כווץ סרגל"` button, `estia-sidebar-collapsed` in localStorage. |
| Page title missing in top bar | ✅ closed | Banner shows current route: `לוח בקרה` / `הנכסים שלי` etc. |
| Marketing-actions flat list of 22 | ✅ closed | Grouped: `פרסום דיגיטלי 8/8 · שטח ופרינט 9/9 · פעילות סוכנים 4/5`. |
| Theme toggle unlabelled/direction | ✅ closed | Label flips (`"מעבר למצב כהה"` / `"מעבר למצב בהיר"`); persists via `estia-theme`. |
| `/profile` / `/transfers` / `/templates` | ✅ shipped | Three new pages doing real work. |
| New property flat form | ✅ closed | 2-step wizard (יסודות → חבילת שיווק). |
| Dashboard nudges | ✅ added | Two proactive cards ("4 לידים ללא קשר 30 ימים" + "תבניות הודעה"). |
| Dashboard density | ✅ closed | 1.33 screens (was ~2.5). |
| "Deal" page "list" | ✅ partial | Four stage sections visible; not yet a horizontal kanban. |

Dashboard and list pages now comfortably fit on one ~900 px viewport.
The remaining desktop work is mostly about **keyboard ergonomics**,
**horizontal layout density**, and **detail-page right-rail behavior**.

---

## Priority 0 — Must fix

### P0-D1 🐞🖥️ `Cmd+K` / `Ctrl+K` does nothing
Tested both modifiers + the `cmdk` / command-palette selectors — no
dialog opens, no component in the DOM. This is the single biggest
desktop productivity feature in any modern B2B SaaS; the muscle memory
is universal. Typing three characters of a client's name and hitting
Enter should jump straight to their card.

- **Fix:** bundle `cmdk` (3 kB), register `mod+k` via a hotkey hook,
  mount a palette with entities: Properties (by address/owner),
  Customers (by name/phone/city), Deals (by address), static navigation
  targets ("לוח בקרה", "לידים חמים", "תבניות הודעה"). Up/Down + Enter.

### P0-D2 🐞🖥️ No global keyboard shortcuts
Confirmed zero shortcuts wired. Agents on desktop expect:
- `N` → new property, `L` → new lead
- `/` → focus list search
- `G L` → go to leads, `G P` → go to properties (Vim-style)
- `?` → show a cheatsheet
- `Esc` → close any sheet / cancel inline-edit

- **Fix:** one hook (`useGlobalShortcuts`) mounted in `App.jsx`; map
  keys to `navigate()` / focus / open-sheet. Ship with a `?` help
  overlay.

### P0-D3 🐞🖥️ `"חשבון וצ׳אט"` button — no chat feature
Same as mobile P0-M12; visible on every page. Word promises an inbox;
there isn't one. Erosion-of-trust level: medium.

- **Fix:** rename to `"חשבון"` until the chat feature exists.

### P0-D4 🐞🖥️ Inline customer-card editing regressed
The `"לחץ לעריכה"` pattern on עיר / חדרים / תקציב / הסכם תיווך is
gone (0 matches this round). Agents loved it — it was the fastest way
to update a lead during a call.

- **Fix:** verify whether the pattern was replaced by the overflow
  "עריכה" modal. If yes, keep both: let-me-click-field-to-edit
  + full edit form. If no, restore.

### P0-D5 🐞🖥️ No `/customers/:id` detail route
Everything on `/customers` is still list-based. Can't bookmark a
customer, can't send a URL to a colleague that says "look at this
client's page", can't see a per-client timeline / history / messages.
Desktop users bookmark things.

- **Fix:** add `/customers/:id` rendering the same card full-width
  + an activity timeline column (events already derivable:
  property-viewed, agreement-signed/expired, last-contact, status
  transitions). `?selected=` on the list can also redirect here on
  desktop.

---

## Priority 1 — High-impact desktop comfort

### P1-D1 🧭🖥️ Property detail is 2.7 screens; agent can't see actions + marketing simultaneously
Hero 300 px + spec chips + owner block + exclusivity + 22 marketing
actions (grouped) + notes = scroll-heavy. 1440×900 has plenty of width
for a real 2-column layout.

- **Fix:** `grid-template-columns: 1fr 360px` on the property-detail
  route at `≥ 1100 px`.
  - **Left column:** hero, specs, notes, marketing actions (grouped).
  - **Right column (sticky, `top: 96px`):** owner card (tel + wa
    buttons), exclusivity countdown, ↗ `צפה כלקוח`, share actions
    (WhatsApp + copy link + share sheet), עריכה / מחיקה / העבר נכס.
  - Everything the agent actually acts on stays visible while
    scrolling the left column.

### P1-D2 🧭🖥️ Deal page still a list of stage sections, not a horizontal kanban
Stages stack vertically; empty stages ("אין עסקאות") still consume
full-width rows. 1180 px main area could easily host 4 columns of
280 px.

- **Fix:** `display: grid; grid-template-columns: repeat(4, 1fr)` on
  `≥ 1000 px`. Drag-drop between columns (`react-beautiful-dnd` or
  `@dnd-kit/core`). Empty columns collapse to a slim label pill at top.

### P1-D3 🧭🖥️ No sticky search on list pages
All three list pages (`/properties`, `/customers`, `/deals`) have
search inputs that scroll off. Even though each list is ≤2 screens
today, at real data volumes they'll be 10+ screens.

- **Fix:** `position: sticky; top: 64px` on search container.
  Add `<ScrollRestoration/>` so back-navigation preserves scroll.

### P1-D4 🧭🖥️ No multi-select / bulk actions
Can't shift-click 3 properties and "send as catalog", can't select 5
leads and tag them "follow-up today". These are core desktop patterns.

- **Fix:** checkbox on each card (appears on hover); sticky action bar
  at top of selected state with: "שלח כקטלוג (WhatsApp)", "ייצא",
  "שלח לסוכן", "סמן כ…". Shift+click for ranges.

### P1-D5 🧭🖥️ Inline filter chips on property cards — same bubbling issue as mobile
`חיפוש נכסים דומים` is a `<button>` inside the card's `<a>` wrapper.
Hover-reveal on desktop; clicking still might bubble.

- **Fix:** `e.stopPropagation()` on those chips (same fix as mobile
  P1-M2). Also: make them visible all the time at desktop widths —
  there's plenty of horizontal room.

### P1-D6 🧭🖥️ Right-click context menu missing
Standard desktop pattern: right-click a property → menu: `צפה כלקוח`,
`שלח ללקוח`, `ערוך`, `העבר`, `מחק`. Saves mouse travel to the `⋯`
menu button.

- **Fix:** ship a small `ContextMenu` component; wire on property /
  lead / deal cards. Keyboard equivalent: `Menu` key or
  `Shift+F10`.

### P1-D7 🧭🖥️ Double-click card to open
Currently one click navigates to detail; agents conditioned by
spreadsheets expect **double-click to edit**. At minimum: double-click
opens inline edit on whichever field was the click target, or opens
the edit form.

### P1-D8 🧭🖥️ Templates page doesn't use its horizontal space
2.88 screens tall on desktop because editor + variables + preview
stack vertically. At 1180 px available there's room for a proper
3-column layout.

- **Fix:**
  - Left column (240 px): template list.
  - Middle column (fluid, min 420 px): editor + variable pills.
  - Right column (sticky, 360 px): live preview that updates as you
    type — the value prop of the page.

### P1-D9 🧭🖥️ `/properties` grid caps at 3 columns even at wide viewports
Grid-template-columns uses fixed 356 px tracks. On 1920 px monitors
(24"), this leaves two columns of blank space beside 3 cards.

- **Fix:** `repeat(auto-fill, minmax(320px, 1fr))` — natural reflow to
  4–6 columns as viewport grows. Also add a `max-width: 1600px;
  margin: 0 auto` on the list page so ultra-wide monitors don't
  overwhelm.

### P1-D10 🧭🖥️ Sidebar quick-action duplicates the "+" in the header
Both `ליד חדש` and `נכס חדש` exist under sidebar "פעולות מהירות"
AND as full-width buttons on the dashboard. Agents click the nearest
one; there's no wrong answer, but maintenance of two entry points means
styling drifts.

- **Fix:** one `+` dropdown in the header: new property · new lead
  · new deal · new transfer. Sidebar section renamed to "פעולות
  נפוצות" with genuinely different entries (e.g. "לידים חמים",
  "עסקאות לסגירה", "נכסים לעדכון").

---

## Priority 2 — Quality of life

### P2-D1 🧭🖥️ Page-title tab indicator
`document.title` is always `"Estia — ניהול נכסים ולידים"`. With 3
tabs open (hot leads list, new property, specific customer), the
agent can't tell them apart from the OS taskbar.

- **Fix:** set `document.title` per route:
  - `/` → "Estia · דשבורד"
  - `/properties` → "Estia · 4 נכסים"
  - `/properties/:id` → "Estia · הרצל 28"
  - `/customers?filter=hot` → "Estia · 3 לידים חמים"
  - and so on.

### P2-D2 🧭🖥️ Right rail on property detail isn't sticky
The owner panel + exclusivity dates scroll away as the agent inspects
marketing actions. Primary contact info gone at the moment of
marketing-action context.

- **Fix:** `position: sticky; top: 96px` on the right rail container.

### P2-D3 🧭🖥️ Empty kanban stages occupy full-height rows
`לקראת חתימה · אין עסקאות` and `לא יצאו לפועל · אין עסקאות` take
~80 px each of dead vertical. Until P1-D2 (horizontal kanban) lands,
at least collapse empty stages to a slim header row (24 px).

### P2-D4 🧭🖥️ Toast position / style unconfirmed
Verify where success/error toasts land (bottom-right for desktop is
standard). If they're currently centre-bottom (mobile convention),
move them for desktop.

### P2-D5 🧭🖥️ No drag-to-upload images on New Property step 2
Desktop users drag from Finder/Explorer directly onto web pages. The
existing upload affordance should accept dropped files.

- **Fix:** `onDragOver` / `onDrop` handlers on the image upload
  container; visible drop-target glow on drag-enter.

### P2-D6 🧭🖥️ Clipboard-image paste on property detail
Agents screenshot Yad2 listings, tab into Estia, and want to paste
the image as a property photo. Today paste is ignored.

- **Fix:** global paste listener on property detail; accept clipboard
  images → upload to active property.

### P2-D7 🧭🖥️ Focus rings inconsistent
Same as round 1; some buttons have `outline: none`. 2 px gold
`:focus-visible` on every interactive element.

### P2-D8 🧭🖥️ `/transfers` has two tabs (`נכנסות` / `יוצאות`) — verify empty states for both
Didn't re-walk outgoing tab. Needs a sentence + call-to-action when
zero.

### P2-D9 🧭🖥️ "4 לידים ללא קשר 30 ימים" nudge on dashboard links unfiltered
Same as mobile P2-M19 — link goes to `/customers` without the
`?filter=inactive30` query. Fix once; applies everywhere.

### P2-D10 🧭🖥️ Relative dates still absolute
Lead last-contact, agreement expiry, deal update-date, property
exclusivity end date — all still `D.M.YYYY`. Relative-time helper
would make every list page glanceable.

### P2-D11 🧭🖥️ Status chip tooltips — confirm discoverability
Round 1 mentioned customer status chips with an aria-label explaining
the auto-status. On desktop, confirm a real tooltip fires (hover for
~400 ms → popup with the reason). If not, ship one.

### P2-D12 🧭🖥️ Sidebar "שיתוף הקטלוג שלי" doesn't open a preview
Click → copy, no visible confirmation beyond a possible toast. Same
fix as mobile P1-M6 but desktop gets a small popover.

### P2-D13 🧭🖥️ Views toggle on `/customers` (`כרטיסים` / `רשימה`)
The list view should be optimized for the desktop workflow of scanning
many leads at once — table with sortable columns (name, city, budget,
status, last-contact, agreement). Today the list view is likely just
thinner cards. Verify; if so, build a proper table.

### P2-D14 🧭🖥️ Customers page filter chips take 3 rows
At 1180 px width there's plenty of horizontal room to fold all three
groups (interest type · asset type · status) into one scrollable row.

### P2-D15 🧭🖥️ Gallery on property detail has arrows, no keyboard nav
On desktop, `←` / `→` should cycle images. `F` to full-screen.
`Esc` to exit.

---

## Priority 3 — Automation suggestions (desktop leverage)

### P3-D1 🪄🖥️ Matching-lead hint on property cards (mirror of P3-M8)
Desktop: a small badge `"3 לידים תואמים →"` that opens a side-sheet
with the matching leads when the agent is browsing `/properties`. One
click → pre-filled WhatsApp.

### P3-D2 🪄🖥️ `tel:` / `wa.me` anchor fix from mobile — same on desktop
If the quick-action buttons are `<button>` (same code), they also
break on desktop (right-click > copy link won't work, middle-click
won't open in a new tab for agents who like to keep logs).

### P3-D3 🪄🖥️ Clipboard listening on `/customers/new`
If the clipboard has `050-1234567` when the form mounts, show a chip
"050-1234567 בלוח — הוסף". Same behavior as mobile; desktop browsers
support `navigator.clipboard.readText()` too.

### P3-D4 🪄🖥️ Auto-save drafts (desktop tabs close, too)
Agent types half a New Property form, a call comes in, they close the
tab. Drafts gone. `sessionStorage` per route.

### P3-D5 🪄🖥️ Smart defaults in New Property wizard
- `מחיר שיווק` empty → suggest median of comparable listings (same
  city, same asset class, same rooms).
- `תחילת בלעדיות` empty → default to today.
- `סיום בלעדיות` → default to signed-date + 6 months.
- `שם בעלים` → offer chips of existing-owner names (re-listing).

### P3-D6 🪄🖥️ Send-to-client right-click menu
Right-click a property → "שלח ל…" → cascading submenu of matching
leads with their quick details. Fastest possible "I need to send this
to Rina" workflow.

---

## Priority 4 — User input (desktop conventions)

### P4-D1 ✍️🖥️ Tab order audit
Walk every form with Tab only — confirm the order is logical
(top-to-bottom, section-by-section). Fix any inputs skipped or
back-ordered.

### P4-D2 ✍️🖥️ `Enter` submits single-field rows
Inline edit: Enter should save, Esc cancel. Currently likely buggy.

### P4-D3 ✍️🖥️ Dropdown vs chips
Agents on desktop can use dropdowns faster than chips (keyboard
navigable with Tab + arrows). Confirm the customer-form `קירבה
לבית ספר` select is accessible via keyboard — it probably is since
it's a native `<select>`.

### P4-D4 ✍️🖥️ Number input formatting
`מחיר שיווק` shows raw numbers (`1350000`). At desktop width there's
room to format as `₪ 1,350,000` while editing — use an input mask
(e.g. `react-number-format`) so commas appear as typed.

### P4-D5 ✍️🖥️ Currency input direction
Hebrew layout + number keyboard — confirm cursor behavior is sensible
(most Israeli apps do `direction: ltr; text-align: right` on number
fields).

### P4-D6 ✍️🖥️ Autocomplete on owner name
Reusing an existing owner across multiple listings is common (same
family owns 3 units). `שם בעל הנכס` should suggest existing owner
names from the agent's database.

### P4-D7 ✍️🖥️ Saved filter presets (carryover from round 1 P6-7)
Let agents save `"רמלה · 3 חד׳ · עד 1.5M"` as a named preset.
Accessible from sidebar + from `⌘K`.

---

## Priority 5 — Accessibility & polish

### P5-D1 ♿🖥️ Sidebar collapse — icon-only rail
Collapsed state should show icons with tooltips on hover. Confirm;
if not, the sidebar becomes just a 40 px wide blank column.

### P5-D2 ♿🖥️ `aria-current="page"` on active nav item
Confirm the current page's nav link gets `aria-current="page"` not
just a visual bold. Screen reader users rely on this.

### P5-D3 ♿🖥️ Color-only status signalling (carryover)
Hot/warm/cold uses red/yellow/blue dots. Add glyphs (🔥/🌤️/❄️).

### P5-D4 ⚡🖥️ Dark-mode contrast pass
Light mode is now default. Verify every component has a light-mode
variant with AA contrast — especially:
- Gold chips on white background
- Muted text on light card
- Focus rings visible on both themes

### P5-D5 ⚡🖥️ Hover states on cards — inconsistent
Property cards vs customer cards vs deal cards each have different
hover treatments (raise / shadow / border-gold / nothing). Unify.

### P5-D6 ⚡🖥️ Print styles
Desktop users occasionally print property details for file folders.
A single-page print CSS for `/properties/:id` and `/p/:id` (no
sidebar, no nav, clean typography) is low-effort.

### P5-D7 ⚡🖥️ 1440 px the biggest supported width?
Many agents have 24" 1920 × 1080 screens at home. Content max-width
should be 1600–1680 px with symmetric margins; right now the main
content is flush-right after the sidebar, leaving a lot of cold
space.

---

## Priority 6 — Carryover from round 1 (still open)

- **P0-1** stale seed dates
- **P0-2** destructive delete confirmation modal
- **P0-3** `/properties/:integer-id` 404
- **P0-4** `?selected=` scroll + highlight
- **P0-5** placeholder-as-submitted-value on New Lead `מקור`
- **P1-1** relative timestamps everywhere
- **P1-3** theme persistence (check — appears closed but verify across page navigations)
- **P1-8** `/חודש` suffix on all rent listings (carryover from round 1)
- **P4-4** unify share-button copy across sidebar + dashboard + detail

---

## The desktop workflows that matter most

Time these round-trips before/after any fix:

| Workflow | Round 1 clicks | Round 2 clicks | Target |
| --- | --- | --- | --- |
| Home → open a specific customer card | 2 (dashboard link) | 2 | 1 (`⌘K` + type name) |
| Customer detail → WhatsApp them | N/A (no detail page) | 1 (on card) | 1 |
| Property → send to a matching lead | ~4 | ~4 | 1 (right-click → submenu) |
| Open 3 different customer pages in tabs | impossible (no `/:id`) | impossible | middle-click on name |
| Filter properties to 3-rm in רמלה, save as preset | no presets | no presets | 3 (filter + `⌘S` + name) |

These are the benchmarks the next sprint should move. `⌘K` alone cuts
3 of them by 50–75%.

---

## Suggested round-2 desktop sprint

Day 1 (quick wins, frontend-only):

1. **P0-D3** rename "חשבון וצ׳אט" → "חשבון"
2. **P2-D1** `document.title` per route (5 lines)
3. **P2-D2** sticky right rail on property detail
4. **P2-D10** relative dates everywhere
5. **P1-D3** sticky search on list pages
6. **P1-D9** auto-fill grid on `/properties`
7. **P2-D14** single-row filter chips on customers
8. **P2-D5** drag-to-upload images

Days 2–3 (higher leverage):

9. **P0-D1** `⌘K` command palette
10. **P0-D2** global keyboard shortcuts + help overlay
11. **P0-D5** `/customers/:id` detail page + redirect from `?selected=`
12. **P1-D1** 2-column property detail layout
13. **P1-D2** horizontal kanban for deals
14. **P1-D4** multi-select + bulk actions on `/properties` and `/customers`

Week 2 (bigger patterns):

15. **P1-D6** right-click context menus
16. **P1-D7** double-click to edit
17. **P1-D8** 3-column templates layout
18. **P3-D1/D6** matching-lead sidebar + right-click-send
19. **P4-D4** formatted currency inputs
20. **P4-D7** saved filter presets

---

## Verification checklist when closing a task

- Resize Chrome to **1280 × 800** (small laptop) + **1440 × 900**
  (typical) + **1920 × 1080** (24" desktop).
- Test with sidebar collapsed AND expanded.
- Test every hotkey in both light AND dark mode.
- Run Lighthouse accessibility on each modified page (target ≥ 95).
- Print one property detail page (Chrome print preview) — readable?
- Tag commit `"closes P0-D# per ESTIA_DESKTOP_UX_AUDIT_V2.md"`.
- Delete closed items from this file so it stays a live backlog.
