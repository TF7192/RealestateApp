# Estia CRM — Mobile UX Audit

> Live walkthrough of **https://estia.tripzio.xyz** at iPhone 14 Pro
> viewport (390×844, actual clamped render 500×723) performed on
> 2026-04-17. This audit is about **the agent-in-the-field experience**
> — speed to act on a lead, speed to send a property, tap-target safety.
>
> Each task is written so a future Claude session can pick it up and
> close it without re-exploration.
>
> Legend: **🐞 bug** · **🧭 flow/UX** · **🪄 automation** · **✍️ user input**
> · **♿ accessibility** · **⚡ perf/polish** · **📱 mobile-only**
>
> Companion file: `ESTIA_UX_AUDIT.md` (desktop + shared items).
> Anything duplicated there is omitted; mobile-specific items live here.

---

## Context: how the agent actually uses this on mobile

An Israeli real-estate agent picks up the phone ~30× a day, and is
often holding the phone in one hand while walking a street, driving, or
standing outside a building with a client. The phone is the CRM during
work hours. That means every screen is judged by:

1. **Tap count to primary action** — WhatsApp a property, call the owner,
   mark a lead "חם".
2. **Thumb reach** — does the agent have to reach the top-right of the
   screen one-handed?
3. **Tap safety** — can a wrong tap destroy data?
4. **Glanceability** — if the agent glances for 2 seconds at a red light,
   can they see what matters today?
5. **Context preservation** — navigating back restores where I was.

The biggest pattern right now: the mobile site is *the desktop site
squeezed into 390 px*. The tab bar is mobile-aware; everything above it
is not. The "App" shell (`src/mobile/*`) I scaffolded earlier on the
Capacitor branch is **not** what's shipping in prod. Prod renders the
same React cards just narrower. That's the single biggest fix below.

---

## Priority 0 — Safety + speed-critical

### P0-M1 🐞📱 Property card has `"מחיקת נכס"` on every row — no confirm
On desktop this is already P0-2 in the companion file. On mobile it
is **much worse**: the button sits directly under `"שלח ללקוח"` and
within the `48 px` finger-hit zone. One scroll-fumble = lost listing.

- Fix: shared confirm sheet echoing address + owner.
- Better mobile fix: **remove** the delete button from the list card
  entirely. Move it into a `⋯` overflow sheet inside the property
  detail page only. On desktop it stays hidden behind the same overflow
  menu — consistent.

### P0-M2 🐞📱 Property detail has **no sticky action bar**
The single most important mobile screen in the CRM — scroll height is
**4.2 screens** (measured 3,059 px / 723 px viewport). The primary
actions (`שלח בוואטסאפ`, `העתק קישור`, `צפה כלקוח`, `העבר נכס`,
`עריכה`) all live above the fold. To act on the property from the
bottom of the page (e.g. after confirming details), the agent must
scroll to top.

- Fix: sticky bottom action bar on mobile ≤ 820 px:
  `[ניווט (Waze)] [התקשר לבעלים] [שלח ללקוח (WhatsApp, filled gold)]`.
- This is the exact pattern the Capacitor `MobilePropertyDetail`
  already uses — port the component to the main app.
- Backdrop-blur so it sits over the marketing grid without obscuring.

### P0-M3 🐞📱 Inline filter chips on property cards unreachable on touch
`הצג נכסים בגודל דומה` / `בעיר X` / `עם חדרים זהים` are implemented as
`<button>` *inside* the card's `<a>` wrapper. On touch, the card's
navigation wins before the button handler fires. The buttons also only
appear on hover, which doesn't exist on touch.

- Fix: on viewport ≤ 820 px, collapse the three filter chips into a
  single `⋯ חפש דומים` button that opens a bottom sheet with the
  three options. Or simply render them as always-visible tiny pills
  under the specs, with `e.stopPropagation()` on click.

### P0-M4 🐞📱 "מחיקת נכס" / "עריכה" / "שלח ללקוח" stacked vertically = very tall card
Each property card on mobile is ~360 px tall. 4 cards = 1,440 px of
vertical before you see anything else. The page becomes mostly deletes
and owner names.

- Fix: collapse the card to a 96 px row on mobile — image thumbnail
  on the right, address + price + spec chips in the middle, single
  `WhatsApp` icon-button on the left. Everything else moves to the
  detail page. Tap anywhere to open.

### P0-M5 🐞📱 Page-level scroll is lost on back-navigation
From `/properties` → tap card → scroll property detail → tap `חזרה
לנכסים` → lands at scroll 0 of the list. On mobile with 4+ cards this
is real pain.

- Fix: wrap `RouterProvider` with scroll restoration (React Router v7:
  `<ScrollRestoration getKey={(location) => location.pathname}/>`).
  Preserves scroll per path; resets for first-visit.

### P0-M6 🐞📱 Save button on every form is `position: static`
New-Customer form is **3.4 screens tall** (2,434 px). New-Property
wizard step 1 is **2.1 screens**. The `שמור` submit button sits at the
bottom of each form. An agent filling out a form mid-call has to scroll
all the way down to save.

- Fix: sticky bottom action bar identical to P0-M2 — a single
  full-width `שמור` / `שמור והמשך` button pinned above the tab bar,
  enabled only when required fields are filled.

### P0-M7 🐞📱 WhatsApp share doesn't target a specific lead
Tapping `שלח בוואטסאפ` on property detail builds a message with
`wa.me/?text=…` — no recipient. iOS/Android WhatsApp then asks the
agent to pick a contact manually. Two extra taps + scroll through 200
contacts.

- Fix: bottom-sheet "שלח ל…" lead picker shown *before* opening
  WhatsApp — filter defaults to leads whose criteria match this
  property. On tap, open `wa.me/<phone>?text=…`.
- Pre-sorting by `matches-criteria > hot > last-contacted` brings the
  right person to the top 95% of the time.

---

## Priority 1 — High-impact daily comfort

### P1-M1 🧭📱 Top header shows only "Estia" logo — no breadcrumb
On every page the banner is `[← back?] [Estia] [menu]`. The agent loses
context of "which screen am I on" once scrolling past the page
heading.

- Fix: replace the banner title with the current section name
  (`נכסים` / `לקוחות` / `עסקאות`) when inside a list, and the
  property/lead name when inside a detail. "Estia" logo moves to the
  menu button slot or the sidebar only.

### P1-M2 🧭📱 Customers page is 4.4 screens for 6 leads
Each card renders every spec (עיר · חדרים · תקציב · קירבה · אישור
· הסכם תיווך · notes · phone · 5 action buttons) expanded. 57
buttons total on the page. At 20 leads = ~15 screens and hundreds of
buttons. The "אני רוצה לחפש את דני" workflow becomes "scroll, scroll,
scroll, scroll".

- Fix: collapsed-by-default card on mobile — show name + status dot +
  city + budget + one primary action (WhatsApp). Tap card to expand
  details inline, or open a sheet with full info.
- Sticky search bar at top of customers page (not just static).

### P1-M3 🧭📱 No swipe actions on lead or property cards
The single biggest mobile-app speed pattern: swipe left to reveal Call
/ WhatsApp / Waze. My Capacitor shell already has it
(`MobileProperties.jsx` uses `SwipeCard.jsx`). Port to production.

- Fix: on touch devices, every lead card and property card reveals
  3 actions on swipe-left (RTL: reveal trailing):
  - Lead: Call · WhatsApp · SMS
  - Property: Call-owner · WhatsApp-to-client · Waze-to-property
- Tapping anywhere else on the card still opens detail.

### P1-M4 🧭📱 Dashboard vertical density
Everything on the dashboard stacks vertically on mobile: greeting,
2 quick-action buttons, 5 KPI cards, 2 nudges ("4 לידים ללא קשר 30
ימים", "תבניות הודעה"), marketing progress list, hot-leads strip.
~2.5 screens tall.

- Fix: horizontal KPI scroller on mobile (already implemented in my
  `MobileDashboard.jsx`). Ship it here.
- Collapse marketing progress to a single summary row by default;
  tap to expand per-property list.

### P1-M5 🧭📱 Property detail gallery has arrow buttons, no swipe
Prev/next are tiny arrow buttons at image edges. On touch, swipe is
native. Also only 2 of 5 images are visible; the rest only reachable
by tapping the tiny arrows.

- Fix: horizontal `scroll-snap` container (`scroll-snap-type: x
  mandatory; overflow-x: auto`). Dots at bottom show position. Arrows
  hidden on touch (can stay on desktop).
- Also: pinch-to-zoom, full-screen mode on tap.

### P1-M6 🧭📱 "העתק קישור" on property detail has no visible feedback
Current: tap → clipboard write → no toast, no haptic, no color flip.
Agent doesn't know it worked.

- Fix: on success, animate the button to `✓ הועתק`, 1.5 s; on
  Capacitor also fire a `haptics.success()`.

### P1-M7 🧭📱 Top-right menu button unclear
`"תפריט וחשבון"` button is top-right. Where a burger icon sits.
Tapping it doesn't visibly open anything (my click test returned no
drawer) — may rely on native touch events. Either way, the label is
ambiguous: is this a menu or an account switcher?

- Fix: use a pure burger icon on mobile → opens the sidebar as a slide-
  in drawer (existing `<complementary>` content). Also: ensure the
  drawer closes on outside-tap and ESC.

### P1-M8 🧭📱 Customer card action buttons overflow horizontally
Each card has 5 action buttons (tel · WhatsApp · ניהול הסכם ·
עריכה · מחיקה). At 390 px, they wrap to 2 rows or shrink so text
labels become unreadable.

- Fix: pick ONE primary action (WhatsApp) as full-width button; move
  the rest to a `⋯` overflow sheet.

### P1-M9 🧭📱 Tab bar FAB center has 5 slots but only 4 tabs
`[בית · נכסים · + · לקוחות · עסקאות]` works. But:
- There's no hint that the middle `+` is the primary create action.
- On long pages (properties/customers), the tab bar disappears on some
  scroll-hiding behaviors depending on the browser; ensure it stays
  pinned.

- Fix: make the `+` visually distinct — gold filled circle floating
  above the bar (already in my `MobileLayout`), not just a plain tab.
- Add a short label `"חדש"` under the icon.

### P1-M10 🧭📱 No pull-to-refresh
Agents expect to swipe down on any list to refresh. Currently nothing
happens. They may close + reopen the app instead, losing state.

- Fix: `overscroll-behavior: contain` + a small pull-to-refresh hook
  at the top of lists (`/properties`, `/customers`, `/deals`,
  `/transfers`, dashboard).

---

## Priority 2 — Quality of life

### P2-M1 🧭📱 Share via iOS/Android Share Sheet, not just copy-link
`העתק קישור` exists. On native (iOS/Android) `navigator.share()` or
Capacitor's `Share` plugin gives the OS share sheet (WhatsApp, AirDrop,
Messages, Mail). Much faster than copy → switch app → paste.

- Fix: prefer `navigator.share({title, text, url})` on mobile with
  a `copy` fallback. The `shareSheet()` helper already exists in
  `src/native/share.js`; import it.

### P2-M2 🧭📱 Sticky search on list pages
`/properties` and `/customers` search inputs scroll away. Agents are
searching *after* seeing the list.

- Fix: `position: sticky; top: <header-height>` on search bar so it
  stays at top of viewport.

### P2-M3 🧭📱 Input ergonomics — per-field keyboard hints
Confirm each input uses `inputmode` so iOS opens the right keyboard:
- Price → `inputmode="numeric"` + `type="number"`
- Rooms → `inputmode="decimal"`
- Phone → `inputmode="tel"` + `autocomplete="tel"`
- Email → `type="email"`
- Full-name → `autocomplete="name"`
- Address → `autocomplete="street-address"`

Currently `שם בעל הנכס` and `מחיר שיווק` lack these — iOS shows
generic alphabet and ₪ is behind a `123` shift. Small but constant.

### P2-M4 🧭📱 Date pickers
Brokerage `מועד חתימה` / `מועד סיום` use `type="date"` → iOS native
wheel. Good. But dates show as `DD/MM/YYYY` locale-dependent; confirm
it's `DD.MM.YYYY` matching the rest of the app, or at least explicit
"החל מ… עד…" copy.

### P2-M5 🧭📱 Number input direction
Hebrew is RTL; number inputs in some RTL contexts confuse (cursor
starts on wrong side, digits push from wrong side). Force
`direction: ltr; text-align: right` on `type="number"` and `type="tel"`
inputs.

### P2-M6 🧭📱 "מספר חדרים" text input encourages "4-5"
Desktop P6-2. On mobile even worse — typing hyphens is two extra
keystrokes on the Hebrew keyboard.

- Fix: replace with a chips picker (`2 · 3 · 3.5 · 4 · 5 · 5+`).
  One-tap entry.

### P2-M7 🧭📱 Templates page on 390 px
Templates page has template list + live-preview side-by-side on desktop.
On 390 px that stack is probably not gracefully vertical. Confirm:
- List of 5 templates on top
- Variable pills grid legible, each pill tappable
- Editor and preview stack vertically
- Preview panel pin to top or bottom so the agent can see their edits

### P2-M8 🧭📱 Customer inline `"לחץ לעריכה"` on touch
Inline edit pattern (עיר / חדרים / תקציב / הסכם תיווך) works on
desktop hover. On touch, the tap *enters* the edit mode — the visible
text doesn't announce it's editable. Add a pencil glyph on each
editable value.

### P2-M9 🧭📱 Long list virtualization
With 50+ customers the DOM will have 500+ nodes. Mobile browsers
(especially older iPhones) scroll-lag.

- Fix: `react-virtuoso` for the customer list on `/customers` and the
  property list on `/properties`.

### P2-M10 🧭📱 Landscape-orientation audit
Phones flip. Tab bar bottom + sidebar left might clash on landscape
(600 px tall, 844 px wide). Confirm layouts still work, or force
portrait only in the Capacitor config (easier + aligned with the
single-hand workflow).

### P2-M11 🧭📱 Offline awareness
Service worker is registered. On reconnection after being offline,
does the user see a "חזר חיבור — סנכרון אוטומטי" toast? Probably not.
Today offline edits get lost silently.

- Fix (scoped): banner when `navigator.onLine === false`; queue PUT/POST
  requests to localStorage; flush on online event.

---

## Priority 3 — Automation & proactive suggestions on mobile

### P3-M1 🪄📱 Auto-bump `lastContact` when app regains focus after `tel:` / `wa:` link
iOS Safari emits `visibilitychange` when the user returns from a tel/
WhatsApp link. If the last event before leaving was a tel:/wa: click on
a lead, optimistically set `lead.lastContact = now`.

- Fix: `document.addEventListener('visibilitychange', ...)` in the
  lead detail component; store `pendingContactBump = leadId` in
  `sessionStorage` before the external tap.

### P3-M2 🪄📱 Auto-paste phone number from clipboard on `/customers/new`
If the clipboard has a valid Israeli phone number when the New Lead
form mounts, show a one-tap chip: `"050-1234567 מהלוח — הוסף"`.
`navigator.clipboard.readText()` requires a user gesture, so bind it
to the form's first `touchstart`.

### P3-M3 🪄📱 Geolocation-prefilled `/properties/new`
Agent standing in front of a building opens "נכס חדש". First step —
offer `"הוסף מיקום נוכחי"` chip that calls `Geolocation` + a reverse-
geocode (Nominatim / Google Places) to pre-fill רחוב + עיר.

- Fix: the `native/geolocation.js` helper already exists; add a
  reverse-geocode call (Nominatim free, 1 req/sec) with a fallback
  when offline.

### P3-M4 🪄📱 Draft autosave on every form
Agents type ½ of a lead → a call comes in → they switch apps → drafts
are gone. Save every keystroke to `sessionStorage` under the route
key; offer "שחזר טיוטה" when they return.

### P3-M5 🪄📱 "שלח ללקוח" pre-selects a matching lead
On mobile property detail, tapping `שלח ללקוח` should *not* go
straight to WhatsApp. First show a 200 ms sheet: top of the list is
the 1–3 leads whose criteria match this property; one tap fires
`wa.me/<phone>?text=<template>`.

### P3-M6 🪄📱 Push notification on a new hot lead (Capacitor only)
When running in the Capacitor shell, a server-side condition
(`status transitions to HOT` or `lastContact > 30d for existing
HOT`) fires an APNs/FCM notification the agent can tap to jump
straight to the lead card.

---

## Priority 4 — User input comfort

### P4-M1 ✍️📱 Autocomplete on city / street everywhere
Desktop P6-1. On mobile doubly important — typing Hebrew on a touch
keyboard is slow.

- Keep existing `cityNames` / `streetNames` source lists.
- Replace `<datalist>` (buggy on iOS Safari) with a custom
  touch-friendly dropdown: tap field → bottom sheet of 10–20 matching
  cities; tap to select.

### P4-M2 ✍️📱 Voice dictation cue on textareas
Hebrew voice-dictation works on iOS. Add a `🎙` button to every
textarea (notes fields) that focuses the textarea and shows a hint
"לחץ ארוך על הרווח במקלדת כדי להכתיב". Doesn't need new code, just
copy.

### P4-M3 ✍️📱 Contact picker on `/customers/new`
iOS + Android expose a Contact Picker API (`navigator.contacts.select`
on Android Chrome; `ContactsFull` plugin for Capacitor on both).
Agent taps → picks a contact from their phone → name + phone filled
in.

- Fix: feature-detect and show the "מתוך אנשי הקשר שלי" button only
  when available. Fall back silently.

### P4-M4 ✍️📱 Camera upload on `/properties/new` step 2
Images field should offer `capture="environment"` to open the camera
directly, in addition to gallery picking. One tap, one photo.

### P4-M5 ✍️📱 Date picker quick-chips
Brokerage sign date is almost always "today"; end date is "+6
months". Add a one-tap chip next to each date field: `"היום"`,
`"+6 חודשים"`.

---

## Priority 5 — Pixel + polish specific to mobile

### P5-M1 ⚡📱 Tap target ≥ 44×44 audit
Gallery arrows and filter-chip icons are <32×32. Apple HIG + Material
spec both require 44×44.

### P5-M2 ⚡📱 Button label truncation
On 390 px, `"יצירת קישור לשיתוף עם הלקוח — כולל כל הסינונים הפעילים"`
(tooltip) is fine but the visible button label `"קישור ללקוח"` is
already 3 words. On `/properties` header, the row is button + New
property — at 390 px it either wraps or the buttons shrink weirdly.
Audit.

### P5-M3 ⚡📱 Status / auto-status chip readability
The compound chip `"קר: לא היה קשר או פעילות לאחרונה. נתונים: קשר
אחרון לפני 369 ימים · יש אישור עקרוני"` is readable on desktop
tooltip, illegible on mobile 390 px. Wrap into a bottom sheet on tap.

### P5-M4 ⚡📱 Safe-area insets on native
Capacitor shell already honours `env(safe-area-inset-*)`. Confirm
production mobile web (Safari, Chrome) also leaves room for the home
indicator + address bar by applying the same `padding-bottom` on the
tab bar container.

### P5-M5 ⚡📱 Theme toggle in sidebar only
Agents on mobile don't see the sidebar by default — the toggle is
locked behind the menu button. Add a quick toggle in the Profile page,
which IS reachable on mobile (via sidebar avatar link).

### P5-M6 ⚡📱 `/p/:id` sticky footer on mobile
Public property page has `התקשר` / `וואטסאפ` as sticky bottom actions
on mobile (good!). But on very tall scroll (gallery + specs + agent
card) the footer and the in-page agent card duplicate the same phone
number. Hide the duplicate when the footer is visible.

### P5-M7 ⚡📱 WhatsApp button icon
Mobile users recognise the green WhatsApp icon instantly. Use the
official 1-bit glyph + green `#25d366` fill (already in mobile shell
CSS). Makes it scannable in a list of cards.

---

## Priority 6 — Shared with desktop (see ESTIA_UX_AUDIT.md for full text)

These items matter equally on mobile and desktop; they're in the
sister file with full reasoning. Noting them here so mobile-focused
work doesn't skip them:

- **P0-1** (desktop): reseed dates — on mobile the stale "לפני 369
  ימים" label is 3 lines tall inside a narrow chip; visual damage is
  worse.
- **P0-3**: integer-ID `/properties/1` 404 — on mobile, a broken link
  tapped from WhatsApp has no way back (no desktop tab history).
- **P0-4**: `?selected=` deep-link — a tap-from-dashboard on a lead card
  dropping into `/customers` unselected is particularly jarring.
- **P1-1**: relative timestamps — label length matters more on mobile
  where columns are narrow.
- **P1-3**: theme toggle persistence.
- **P5-3**: auto-bump lastContact on tel/wa click — symbiotic with
  P3-M1 above (visibility-change heuristic).

---

## Quick-win mobile sprint

One-day PR focused on **felt speed**, zero backend:

1. **P0-M2** sticky action bar on property detail (reuse
   `MobilePropertyDetail` component)
2. **P0-M6** sticky `שמור` on New Lead + New Property wizard
3. **P0-M5** `<ScrollRestoration/>` on the router
4. **P0-M1** remove delete from list card on mobile (desktop unchanged
   if you're being conservative; or push to ⋯ menu both places)
5. **P1-M3** swipe actions on lead + property cards (port `SwipeCard`
   from the Capacitor shell)
6. **P1-M7** burger icon + working drawer
7. **P2-M2** sticky search bars

Half-day follow-ups:

8. **P1-M2** collapsed customer card default on mobile
9. **P0-M7 / P3-M5** WhatsApp lead-picker sheet
10. **P3-M1** `visibilitychange` auto-bump lastContact
11. **P2-M1** `navigator.share()` everywhere a share link exists
12. **P1-M5** swipe + pinch gallery on property detail
13. **P2-M6** `מספר חדרים` as chips picker

---

## Verification checklist for mobile work

When closing any item above:

- Resize Chrome to 390×844 AND 500×723 AND iPad mini (768×1024).
- Test on actual iPhone (not just responsive mode) via the Capacitor
  shell — `cd frontend && npm run cap:run:ios` (this branch).
- Tap each primary action with one thumb reach.
- Turn phone sideways — does it still work?
- Test with iOS zoom-in (3-finger-tap on accessibility); does text
  wrap instead of overflowing?
- Test with iOS "Reduce Motion" on — do any animations fail?
- Tag the commit with `"closes P0-M# per ESTIA_MOBILE_UX_AUDIT.md"`.
- Delete closed items from this file so it stays the live backlog.
