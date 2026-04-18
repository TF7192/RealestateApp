# Estia CRM — Mobile UX Audit (v2)

> Live walkthrough of **https://estia.tripzio.xyz** at iPhone 14 Pro
> (390×844, clamped render 500×671). Performed 2026-04-17 after the
> first mobile audit landed. This pass grades what changed, what's
> still broken, and what surfaced only after the first-round fixes.
>
> Legend: **🐞 bug** · **🧭 flow/UX** · **🪄 automation** · **✍️ user input**
> · **♿ accessibility** · **⚡ perf/polish** · **📱 mobile-only**
>
> Sister file: `ESTIA_MOBILE_UX_AUDIT.md` (round 1). Items closed in
> this round are listed first; remaining work is below.

---

## What's been fixed since round 1 — agent-felt wins

| Prior item | Status | What shipped |
| --- | --- | --- |
| P0-M1 delete on every list card | ✅ closed | Delete moved into `אפשרויות נוספות` (⋯) overflow per card. Zero `"מחיקה"` buttons on `/properties` list now. |
| P0-M2 property detail no sticky action bar | ✅ closed | `.sab` bar pinned above the tab bar with three actions: **ניווט · התקשר לבעלים · שלח ללקוח**. Massive time-save. |
| P1-M1 top banner had no page title | ✅ closed | Banner now reads `[תפריט] [שם עמוד] [חשבון]` — agent always knows which screen they're on. |
| P1-M2 customers page was 4.4 screens | ✅ closed | Customers collapsed to **1.91 screens** for 6 leads. Cards now compact-by-default with quick-action rail. |
| P1-M3 no swipe/tap actions on cards | ✅ partially | Quick-action rail per card — `Call · WhatsApp · SMS` on leads; `Call · WhatsApp · Navigate` on properties. Swipe not implemented; explicit buttons chosen instead. Valid tradeoff. |
| P1-M9 FAB center tab is visually distinct | ✅ closed | Center `+` is a labelled "חדש" button, not a plain nav tab. |
| P1-M4 dashboard density | ✅ partially | Dashboard now 1.88 screens (was 2.5). Two proactive nudge cards ("4 לידים ללא קשר 30 ימים", "תבניות הודעה"). KPIs still stack vertically though. |
| Theme toggle copy | ✅ closed | Label flips between `"מעבר למצב בהיר"` and `"מעבר למצב כהה"` — now correct imperative. |
| P1-9 time-of-day greeting | 🟡 partial | Desktop `"שלום, יוסי"` is static; mobile same. Greeting by time-of-day not yet ported from MobileLayout. |

**Net impression:** The prior audit's biggest pain — agent can't act without scrolling — is gone. Property detail is now usable one-handed. The next round is about **tap-target precision, chrome budget, and the still-missing tel: / share semantics**.

---

## Priority 0 — New bugs found in v2

### P0-M8 🐞📱 Call / WhatsApp buttons are `<button>`, not `<a href="tel:">`
`telLinks = 0` on `/customers`. The "התקשר" button on each lead card is
a plain `<button>` with a click handler — not a `tel:` anchor.

- Long-press to copy the number is broken
- "Add to contacts" native hint is absent
- Screen readers announce "button" instead of "call 050-…"
- Apple watch / CarPlay handoff won't work
- **Fix:** wrap as `<a href={telUrl(lead.phone)}>` styled like a button.
  Same for WhatsApp (`href={whatsappUrl(...)}`). The `native/actions.js`
  helpers already build these URLs.

### P0-M9 🐞📱 Duplicate WhatsApp on customer cards
Customer card exposes both **"שלח בוואטסאפ"** AND **"וואטסאפ"** quick-
action button — 18 WhatsApp buttons on a 6-lead page. Same target
action, two paths, identical icon.

- **Fix:** keep one. My recommendation: kill the primary row's
  "שלח בוואטסאפ" and keep only the compact icon in the quick-action
  rail. Saves 48–56 px per card.

### P0-M10 🐞📱 Tap-target spec violations per card
Measured on `/properties`:
- **`אפשרויות נוספות` (⋯)** = 28×28 px — **Apple HIG minimum is 44×44.**
- **`חיפוש נכסים דומים`** = 76×18 px — 18 px tall is unusable on touch.
- **`שלח ללקוח בוואטסאפ`** = 40×44 px — borderline.
- The three big buttons (`התקשר` / `וואטסאפ` / `ניווט`) are 92×150 px
  — **oversized the other way**, eating scroll budget.

- **Fix:** normalize the rail to **48×48 px square icons** (no text).
  Let the card breathe. If labels matter, show on long-press tooltip.

### P0-M11 🐞📱 Inline editing disappeared
Round 1 found the `"לחץ לעריכה"` pattern on customer spec fields
(עיר / חדרים / תקציב). This pass finds **zero** such buttons
(`button[aria-label*=עריכה]` = 0). Either the DOM renamed, or the
feature regressed.

- **Fix:** verify. If it regressed, restore — agents loved it per my
  earlier feedback. If selectors just changed, update docs.

### P0-M12 🐞📱 `"חשבון וצ׳אט"` button in top banner has nothing behind it
New button top-right. `"צ׳אט"` implies an inbox or WhatsApp sync —
doesn't exist.

- **Fix:** rename to just `"חשבון"` until a real chat feature ships.
  Words that promise things erode trust fastest.

### P0-M13 🐞📱 Form save buttons still `position: static`
Re-measured New Lead (3.4 screens) and New Property wizard step 1
(2.1 screens). `שמור` still at the bottom — agent scrolls the full
form to submit, on every create.

- **Fix:** sticky bottom bar on mobile forms with a single full-width
  primary save button + small cancel on the left. Matches the detail
  page's `.sab` pattern.

---

## Priority 1 — Chrome budget & thumb reach

### P1-M11 🧭📱 300 px of chrome before the first card on `/customers`
Stacked from top:

1. Fixed banner `[תפריט · לקוחות · חשבון]` — 56 px
2. Page toolbar with view-toggle (כרטיסים/רשימה) + "ליד חדש" — 56 px
3. Search box — 56 px
4. Filter row 1 (הכל/קונים/שוכרים) — 48 px
5. Filter row 2 (כל הסוגים/פרטי/מסחרי) — 48 px
6. Filter row 3 (הכל/חם/חמים/קר) — 48 px

= **~312 px of chrome** on a 671 px viewport. Agent sees half a card
before scrolling.

- **Fix A (aggressive):** collapse all 3 filter rows into one
  `"סנן (n)"` chip that opens a bottom sheet with all options. Saves
  96 px.
- **Fix B (conservative):** make the filter rows horizontally
  scrollable in a single row each, wrapped in one container that
  auto-collapses on scroll-down (show again on scroll-up).
- Either way: make search sticky at the top once filters collapse.

### P1-M12 🧭📱 Search bars still not sticky
Any scroll past the first card loses the search input. Worst on
`/customers` and `/properties` where searching is the normal flow.

- **Fix:** `position: sticky; top: 56px` on search container, with
  a thin divider when scrolled so it doesn't look glued to the banner.

### P1-M13 🧭📱 Property-detail sticky bar missing `שתף`
Three bottom actions are great (ניווט · התקשר · שלח ללקוח) but
"שתף קישור" lives only at the top of the page. Agents hitting
`.sab` want share at thumb reach too.

- **Fix:** either add a 4th action `[שתף]` (native share sheet via
  `navigator.share()`) or tuck share into the ⋯ overflow beside
  `עריכה` / `מחיקה` / `העבר נכס`.

### P1-M14 🧭📱 Large quick-action rail on property cards eats scroll
Three 92 px × 150 px buttons per card × 4 cards = ~1,100 px of buttons.
The rest of each card (image, price, address, specs) is the same
height. Cards are now button-heavy.

- **Fix:** keep the rail but shrink to 44×44 icon-only buttons in a
  single row. Text label only when the card is tapped (or on long-
  press).

### P1-M15 🧭📱 Fixed header + fixed tab bar = 120 px of fixed chrome
`header { position: fixed }` is new. Combined with the bottom nav,
~120 px of persistent chrome on a 671 px device = 18% of viewport
always unavailable.

- **Fix:** auto-hide the header on scroll-down, restore on
  scroll-up (the pattern iOS Safari uses with its own URL bar).
  Keep the tab bar — that's never in the way because it's the target.

### P1-M16 🧭📱 3 duplicate toolbars on every list
- Fixed banner (browser chrome-like)
- Page toolbar (`"הנכסים שלי 4/4"` + "קישור ללקוח" + "קליטת נכס")
- Filter rows

The page toolbar can fold into the banner: put **"4/4"** as the
banner subtitle, move **"קליטת נכס"** to the FAB (it already does the
same thing), move **"קישור ללקוח"** into a top-right ⋯ on the banner.

### P1-M17 🧭📱 Customers view toggle — default to list on narrow screens
`תצוגת כרטיסים` is the default. The רשימה view is far more
information-dense on narrow screens. On mobile it should be the
default; switch to cards on desktop / tablet.

---

## Priority 2 — Quality of life

### P2-M12 🧭📱 Pull-to-refresh still missing (carryover)
Agents expect `swipe down` to refresh any list. They don't get that.
Some close + reopen the app instead, losing state.

### P2-M13 🧭📱 No `navigator.share()` anywhere (carryover)
Every share still uses copy → switch app → paste. The API
(`navigator.share({title, text, url})`) is supported on all iOS
Safari and Chrome/Android. `src/native/share.js` helper exists.

### P2-M14 🧭📱 Property detail 4.78 screens tall
Sticky bar fixed P0, but the page itself is still 4.78 screens
(3,208 px / 671 px viewport). 22 marketing actions, image gallery,
owner card, exclusivity, notes, map.

- **Fix:** convert to a tabbed view on mobile: `[פרטים] [שיווק] [תמונות]
  [היסטוריה]`. Each tab is ≤1.5 screens. Tab label remembers state.

### P2-M15 🧭📱 Gallery still no swipe / pinch
Still arrow buttons at image edges. Expected pattern on touch is
horizontal `scroll-snap` + pinch-zoom + double-tap to zoom.

### P2-M16 🧭📱 No haptic feedback on key actions
On Capacitor native shell, `haptics.press()` / `haptics.success()`
make every tap feel native. Web browsers can't do this but the
Capacitor build can. The helper file exists; wire it on:
- FAB tap
- Form save success / error
- Marketing action toggle
- `.sab` action taps
- Swipe snap-end in gallery

### P2-M17 🧭📱 Status auto-suggest chip not visible on collapsed card
Round 1 found the customer auto-status chip with a tooltip explaining
"קר · 369 ימים ללא קשר". On the collapsed card now, that context is
hidden. Agents may not notice the auto-status.

- **Fix:** show status dot + 1-word reason inline on the collapsed
  card: `🔥 חם · לפני 2 ימים` / `❄️ קר · 30 ימים ללא קשר`.

### P2-M18 🧭📱 Date formats still absolute
Agreement end date `2.10.2025` — needs to be "בעוד 5 חודשים" or
"עוד 12 ימים" (with color warning in the last 30).

### P2-M19 🧭📱 "4 לידים ללא קשר 30 ימים" nudge — no way to act on it
The dashboard card nudges the agent, taps through to `/customers` —
but doesn't pre-filter the list to those 4 leads. Agent has to
re-derive the list manually.

- **Fix:** link to `/customers?filter=inactive30` (new filter) with the
  4 leads ready. If the filter doesn't exist yet, build it — it's just
  `WHERE lastContact < now - 30d`.

### P2-M20 🧭📱 Empty state for `/transfers` not reached on mobile
Didn't re-verify this round. If still good copy, confirm the
`יוצאות` tab renders a sensible empty state too.

---

## Priority 3 — Automations that save the most minutes/day

### P3-M7 🪄📱 Quick-action rail should also bump `lastContact`
Tapping "התקשר" or "וואטסאפ" in the rail should optimistically bump
the lead's `lastContact = now`. Today auto-status recomputes nightly
(?); that one tap should also re-evaluate the chip client-side.

- **Fix:** on `tel:` / `wa:` tap, fire `PATCH /leads/:id` with
  `lastContact: new Date()`. Update the chip locally first (optimistic
  UI).

### P3-M8 🪄📱 Matching-lead hint on property cards
When browsing `/properties`, each card could show a small badge:
`"2 לידים תואמים"` if any of the agent's leads match price+rooms+city.
One-tap → filter the lead picker for this property. Zero new feature;
just a computed badge.

### P3-M9 🪄📱 Auto-open the WhatsApp target picker when no clear match
The sticky `.sab` "שלח ללקוח" currently fires `wa.me/?text=…` (no
phone number). Instead:
- If **1** lead matches the property's price+rooms+city → pre-fill
  their phone.
- If **2–5** match → open a bottom-sheet picker of just those leads.
- If **0** → fall back to current behavior (pick a contact in WA).

### P3-M10 🪄📱 Draft autosave (carryover from round 1)
Still worth doing. Save every keystroke on new-lead/new-property forms
to `sessionStorage`.

---

## Priority 4 — Input polish for mobile

### P4-M6 ✍️📱 Confirm `inputmode`/`autocomplete` everywhere
Round 1 flagged this. Spot-check before closing:
- `מחיר שיווק` → `inputmode="numeric"` ✅/❌?
- `טלפון` → `inputmode="tel"` + `autocomplete="tel"` ✅/❌?
- `אימייל` → `type="email"` + `autocomplete="email"` ✅/❌?
- `שם בעלים` → `autocomplete="name"` ✅/❌?

Grep `input` in the form components; add missing hints.

### P4-M7 ✍️📱 `<datalist>` autocomplete on city/street unreliable on iOS
Safari's `<datalist>` often swallows taps or doesn't render on first
focus. Replace with a custom touch dropdown (bottom sheet of matching
cities).

### P4-M8 ✍️📱 `מספר חדרים` as chips picker (still open from round 1)
Text input + hyphen = `4-5` garbage. Chips row picks from a canonical
list.

---

## Priority 5 — Accessibility & polish

### P5-M8 ♿📱 Tap-target audit (see P0-M10)

### P5-M9 ♿📱 Focus ring visibility on touch-focus
When a button is focused by screen-reader swipe or keyboard, the ring
should be 2 px gold. Currently inconsistent — some buttons have
`outline: none`.

### P5-M10 ♿📱 Screen-reader labels on icon-only buttons
The ⋯ "אפשרויות נוספות" is labelled, but the quick-action rail
icons may not announce their target lead / property.

- **Fix:** `aria-label={\`התקשר ל${lead.name}\`}` per button, so VoiceOver
  announces "התקשר לנועה אלון" not just "התקשר".

### P5-M11 ⚡📱 `.sab` sticky bar appears on every scroll — should appear
after a scroll threshold
Optional polish: hide `.sab` when the user is still near the top (the
actions are visible in the hero), fade it in when the agent passes
`60%` of the gallery.

---

## The one measurement that matters

For an agent doing 30 calls/day on mobile, the question is
**"how many taps from home to 'sent listing to Rina'?"**. Test again
and time it:

| Step | Round 1 | Round 2 | Target |
| --- | --- | --- | --- |
| Home → find property | scroll + tap | FAB? or `/properties` tab | 1 tap |
| Property → tap WhatsApp | scroll to top + tap | `.sab` "שלח ללקוח" always visible | 1 tap |
| Pick recipient | switch to WA app, scroll 200 contacts | same — `wa.me/?text=…` (no target) | 1 tap (matching-lead sheet) |
| Send | tap "send" in WA | same | 1 tap |

Round 2 cut steps 1–2 to a total of 2 taps (from ~5+). Step 3 is
the next big one — **P3-M9** is the highest-ROI remaining mobile
task.

---

## Quick-win mobile sprint (round 2)

Order by ROI, all frontend-only:

1. **P0-M13** sticky save on mobile forms
2. **P0-M8** convert `התקשר` / `וואטסאפ` to `<a href>` semantics
3. **P0-M9** deduplicate card WhatsApp actions
4. **P0-M10** normalize quick-action tap targets to 44–48 px
5. **P1-M12** sticky search on list pages
6. **P1-M11 / P1-M16** collapse duplicate toolbars + horizontal filter rows
7. **P2-M13** `navigator.share()` on every share trigger
8. **P2-M17** inline status reason on collapsed customer card
9. **P2-M18** relative dates via `relative()` helper

## Half-day follow-ups

10. **P3-M9** matching-lead picker for "שלח ללקוח"
11. **P2-M14** tabbed property detail on mobile
12. **P2-M15** swipeable gallery + pinch zoom
13. **P2-M12** pull-to-refresh lists
14. **P3-M7** optimistic `lastContact` bump on tap
15. **P1-M15** auto-hide header on scroll-down

## Native-only (Capacitor shell)

16. **P2-M16** wire haptics on all primary actions
17. Contact picker plugin on `/customers/new`
18. Camera-capture on `/properties/new` step 2

---

## Verification when closing a task

- Resize Chrome to 390×844 + 500×671 + iPad mini 768×1024
- Test on real iPhone via Capacitor shell (`npm run cap:run:ios`)
- Time the "home → sent listing to matching lead" workflow before/after
- Test with iOS "Reduce Motion" on
- Confirm `.sab` / sticky save doesn't overlap with on-screen keyboard
  (this is a common iOS gotcha — `viewport-fit=cover` helps)
- Tag commit with `"closes P0-M# per ESTIA_MOBILE_UX_AUDIT_V2.md"`
- Delete closed items so this file stays the live backlog
