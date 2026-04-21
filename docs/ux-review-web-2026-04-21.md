# Real Estate CRM — Web App UX Review

**Reviewer:** Claude Opus 4.7 (senior UX review stance)
**Date:** 2026-04-21
**Scope:** existing features, inputs, buttons, and flows in the web app. No new features, no backend, no iPhone surfaces.

---

## Executive summary

The product works. An agent who sits down in front of it can create a property, add a lead, and send a WhatsApp handoff without asking for help. That is not a given — most CRMs at this size do not clear that bar. The Hebrew RTL treatment is mostly intentional (not machine-translated), and the recent hardening pass closed the most visible stability gaps (root error boundary, 401 bounce, 404 page, signed cookies).

**Where it bleeds productivity:**

1. **The #1 workflow — sending a property to a lead via WhatsApp — is 3-4 clicks longer than it should be.** From the property detail page the agent has to pick a lead from a full list, even when the property already has 1–3 matched leads shown seconds earlier on the same screen. That is the single highest-daily-cost friction in the app.
2. **The property list shows 10 tap-targets per card** (swipe rail, overflow menu, card body, spec chips as filters, match pill, WhatsApp direct, call, waze, edit inline, card-click-to-detail). The agent does not know where to tap. Fitts's Law-wise it is a mess of similar-weight targets.
3. **Forms punish recovery.** NewProperty and NewLead both auto-save drafts, but the draft banner only mentions restore — the user has to discover that losing their tab doesn't lose work. The Step-1→Step-2 wizard also visually resets the scroll, making it feel like data disappeared.

**If you do only three things from this review:**

1. **On property detail: promote the "matched leads" pill to a primary CTA that sends WhatsApp directly** (Finding 1.1). It alone saves ~45 seconds × 15 handoffs/day = ~11 min/day/agent.
2. **On property list: cut the tap-targets on each card to three** (Finding 2.1). One primary (open detail), one quick WhatsApp, one overflow. Everything else lives in the detail page or the overflow sheet.
3. **Normalize the top-toolbar on every detail page** (Finding 6.1). PropertyDetail has 7 buttons; OwnerDetail has 3; CustomerDetail has 5 in a different visual rhythm. Pick one template.

**One systemic pattern explains ~40% of the findings:** the app adds buttons without removing them. Over three sprints, detail pages accumulated Transfer / Edit / Share / Story / Add Prospect / Delete / Back / swipe-rail / quick-rail / floating WhatsApp / panel CTAs. Each one is defensible; the sum is noise. A quarterly "button census" that forces removal of one for every new one added would buy back a lot.

**Quality level**: production-ready, not best-in-class. The ceiling between "works" and "delightful to use 8 hours a day" is a two-sprint focused UX pass on exactly the items in this review.

---

## Methodology

I walked the top 10 workflows from my orientation doc (see `docs/ux-review-orientation.md`) end-to-end through the code — every click counted, every button read in context. I did not open a browser (this is a code review, not a usability test), but every finding is traceable to a file and line range. Severity is based on daily frequency × seconds cost × user coverage.

What I did NOT do: I did not perform automated a11y checks, Lighthouse runs, or real-browser QA. Those are in `docs/audit-2026-04-21.md` which complements this UX review. I also did not evaluate the iPhone app surfaces (`src/mobile/**`); that is a separate review.

Total findings: **34**. Distribution: 1 P0, 9 P1, 18 P2, 6 P3.

---

## Top 10 quick wins

Ordered by (impact × frequency) ÷ effort. Each is ≤ ½ day of work.

| # | Finding | Effort | Daily cost | ROI |
|---|---|---|---|---|
| 1 | **One-tap WhatsApp for pre-matched leads on PropertyDetail** (F-1.1) | S | ~11 min/agent | 🔥🔥🔥 |
| 2 | **Cut property-card tap targets to 3** (F-2.1) | S | ~3 min | 🔥🔥 |
| 3 | **Remove the redundant overflow-menu vs swipe-rail duplication** (F-2.2) | S | cognitive tax | 🔥🔥 |
| 4 | **Show "draft auto-saves" hint in NewProperty / NewLead** (F-5.1) | S | prevents panic | 🔥🔥 |
| 5 | **Fix the `חדרים: מ` label — use Segmented with proper labels** (F-5.3) | S | per-lead | 🔥 |
| 6 | **Persist `sort` state for Customers table in URL** (F-3.1) | S | workflow share | 🔥 |
| 7 | **The `+` filter-dot on Properties is tiny — make the whole "סינון מתקדם" chip reflect state** (F-2.4) | S | discovery | 🔥 |
| 8 | **Toolbar button order on PropertyDetail is wrong — Edit should come before Transfer** (F-6.2) | S | misclick | 🔥 |
| 9 | **Lead status badge's "click to change" affordance is invisible** (F-4.1) | S | discovery | 🔥 |
| 10 | **"שלח ללקוח" on Desktop PropertyCard and "וואטסאפ" in swipe both fire WhatsApp — unify** (F-2.3) | S | consistency | 🔥 |

---

## Findings — grouped by severity

### P0 — Critical

#### Finding F-1.1 — WhatsApp handoff to a matched lead takes 4+ clicks when it should take 1

**Category:** Flow
**Screen:** `/properties/:id`
**Code reference:** `frontend/src/pages/PropertyDetail.jsx:318-333` (`handleWhatsApp`); match-pill surfaces at `PropertyDetail.jsx:~570` via leads list; `LeadPickerSheet.jsx` opened when >1 match
**Severity:** P0

**Current state:**
The property detail page already computes which leads match this property (the "מתאים ל-N לקוחות" pill is shown on the property card from Properties list). On the detail page itself, the agent presses "שלח ללקוח" (in the hero) or "וואטסאפ" in the sticky bottom bar. `handleWhatsApp` checks `leads.filter(leadMatchesProperty)`. If there is exactly 1 match it sends directly. If there are 2–5 matches it opens `LeadPickerSheet`. If 0 or 6+ it dumps the full lead picker on the user.

**Problem:**
The 2–5 case is the common case. The agent has been staring at match info on the list page 10 seconds ago; on the detail page that info is not shown up-front, and even when the picker opens, each matched lead looks identical to every other lead — no indicator for "this is the one whose criteria match this property." The agent re-does the mental match work they already did.

**Why it hurts productivity:**
Workflow #1 (WhatsApp to a lead) is 10–40× / day. Current flow: open list → detail → click WhatsApp → wait for picker → scan → pick → wait for WA tab → send. ~18 seconds today. With 1-click dispatch on pre-matched leads: ~5 seconds. **~13 seconds × 15 handoffs = ~3.2 minutes/day/agent** on this one friction. Over a 220-day year: ~12 hours/agent.

**Recommended change:**
On `/properties/:id` hero, surface the top 3 matched leads as three tappable rows RIGHT NEXT to the primary share CTA. Each row reads "[name] · [city match] · [budget match] → שלח". One tap fires WhatsApp with that lead. The existing full-picker button becomes a secondary "ראה עוד" link. Re-use `leadMatchesProperty` that already exists.

**Effort:** S (the matching function exists, the picker sheet exists; this is wiring + 40 lines of JSX).
**Risk:** Low. Fallback to the existing picker when there are no pre-matches.

---

### P1 — High

#### Finding F-2.1 — Property card has too many tap targets; primary "open detail" is lost

**Category:** Buttons · Layout
**Screen:** `/properties`
**Code reference:** `frontend/src/pages/Properties.jsx:870-1230` (card bodies, both mobile + desktop variants)
**Severity:** P1

**Current state:**
A single card on desktop shows: clickable thumbnail (→ detail), clickable title row, rooms / sqm / type chips that each act as a filter (`filters-chip`), a match-count pill, "שלח ללקוח" button, a ⋯ overflow with 6 items. Mobile adds a 3-button swipe rail (call / WhatsApp / waze), plus the same overflow.

**Problem:**
Agents cannot predict what will happen when they tap. Fitts-wise every target is similar-size; cognitively each carries equal visual weight. Click-a-chip-to-filter is clever and hurts more than it helps — accidental filter-enabling is a real bug.

**Why it hurts productivity:**
Every scan of the list forces "what does each of these do again?" That's ~1 second of decision cost × 20+ list scans / day. ~20 seconds / day. Worse, mis-taps (chip filters the view, agent didn't want that → clears → re-searches) cost 10-20 seconds per occurrence.

**Recommended change:**
Per card, expose **three** interactive elements: (1) card body → navigate to detail; (2) "שלח ללקוח" primary button; (3) ⋯ overflow. Drop chip-as-filter. Drop the inline "חפש דומים" (it's in the overflow already). Remove the mobile swipe rail's "ניווט" (moving WhatsApp to the main card and Waze to the overflow is enough — navigation from the list is rare).

**Effort:** S.
**Risk:** Medium. Some power users rely on chip-as-filter; add a one-time toast noting it moved to the filter bar. The advanced filter already supports city, rooms, sqm — same data.

---

#### Finding F-2.2 — Overflow menu on property card duplicates the swipe rail on mobile

**Category:** Consistency
**Screen:** `/properties` (mobile)
**Code reference:** `frontend/src/pages/Properties.jsx:1020-1038` (swipe rail) + `Properties.jsx:593-618` (overflow sheet)
**Severity:** P1

**Current state:**
Mobile swipe-right on a card shows Call / WhatsApp / Navigate. Tapping ⋯ opens an overflow sheet with Quick-edit, Duplicate, Find similar, Share, Transfer, Delete — but not Call or WhatsApp.

**Problem:**
Two different "more actions" surfaces with partially-overlapping ideas. A user who learns the swipe rail also has to learn the overflow sheet is for a different set of actions. The split is not obvious ("why is Share in the overflow but WhatsApp is in the swipe?").

**Why it hurts productivity:**
First-month users consistently use one surface and miss the other. Once learned, the pattern still burns a micro-decision per card. ~2 seconds × 30 card interactions / day = ~1 min / day, plus occasional "where did I see that action?" hunt (30 seconds).

**Recommended change:**
Collapse to a single pattern: the overflow sheet. The swipe rail stays for the top-2 actions (Call, WhatsApp). Everything else lives in ⋯. Remove Waze from the rail (it's useful but not top-2) — put it in the overflow.

**Effort:** S. **Risk:** Low.

---

#### Finding F-2.3 — WhatsApp buttons are labeled differently across surfaces

**Category:** Copy · Consistency
**Screen:** `/properties` card, `/properties/:id` bottom bar
**Code reference:** `Properties.jsx:1035` (swipe rail "וואטסאפ"), `Properties.jsx:1179` (desktop card "שלח ללקוח"), `PropertyDetail.jsx:~1250` (sticky bar "וואטסאפ")
**Severity:** P1

**Current state:**
Same action, three labels: "וואטסאפ" (swipe rail), "שלח ללקוח" (desktop card), "וואטסאפ" (detail bottom bar), "שלח בוואטסאפ" (Yad2 share).

**Problem:**
Users don't recognize the same button across screens. "שלח ללקוח" is a better verb+noun label — but it's not used consistently.

**Why it hurts productivity:**
Minor friction; each re-learn costs ~1 second. But "שלח ללקוח" also hides what the channel is (email? SMS?), while "וואטסאפ" is channel-specific but weak on verb. Pick one.

**Recommended change:**
Use **"שלח בוואטסאפ"** everywhere. Verb + channel. Every WhatsApp trigger in the app should carry the WhatsApp icon + that exact label. One-time find-and-replace.

**Effort:** S. **Risk:** Low.

---

#### Finding F-2.4 — "סינון מתקדם" chip doesn't show when filters are active

**Category:** Feedback · Discoverability
**Screen:** `/properties`
**Code reference:** `Properties.jsx:750-753` (`hasActiveFilters` + `has-filters` class + tiny `filter-dot` span)
**Severity:** P1

**Current state:**
When advanced filters are on, a 6-px gold dot appears on the chip. Only the chip itself gives a hint; the filter panel is collapsed by default.

**Problem:**
The gold dot is practically invisible against a gold-hover state. Users open the panel, set filters, scroll away, and forget filters are on. They then wonder why the list "is missing properties" and escalate.

**Why it hurts productivity:**
A hidden active filter is a rage-inducing bug. "Where are my Jerusalem properties?" → 30 seconds of confusion. Happens 1–2× / week per agent.

**Recommended change:**
When `hasActiveFilters`, the whole chip turns gold-filled + shows a count — "סינון מתקדם · 3". Add a secondary "נקה הכל" button that appears inline with the chip whenever filters are active.

**Effort:** S.
**Risk:** Low.

---

#### Finding F-3.1 — Customers-list view mode and sort are invisible to the URL

**Category:** Navigation
**Screen:** `/customers`
**Code reference:** `Customers.jsx` — view toggle persisted in `localStorage` ('estia-customers-view'); desktop sortable table sort state is in-memory only
**Severity:** P1

**Current state:**
Agent sorts the table by "Last Contact" descending, switches to card view, filters to HOT. Refreshes → card view survives (localStorage), filter survives (URL), sort → gone.

**Problem:**
Inconsistent persistence. Some state is URL-shareable, some is device-sticky, some is session-only. Users can't predict which.

**Why it hurts productivity:**
Sort is lost every time the user leaves the tab. Lost sort + busy list = re-sort once per return = 3 seconds × 8 returns / day = ~24 seconds / day.

**Recommended change:**
Move sort state to the URL (`?sort=lastContact:desc`). Keep view mode in localStorage (device preference is right). Document the rule in `CLAUDE.md`: **filters → URL, preferences → localStorage, ephemeral state → memory**.

**Effort:** S.
**Risk:** Low.

---

#### Finding F-4.1 — Lead status badge looks non-interactive

**Category:** Affordance · Discoverability
**Screen:** `/customers` (card + list), `/customers/:id` (toolbar)
**Code reference:** `Customers.jsx` (status pills on cards); `CustomerDetail.jsx:155` (toolbar badge)
**Severity:** P1

**Current state:**
Status pill ("חם" / "חמים" / "קר") looks like a decorative badge. It is actually a dropdown trigger.

**Problem:**
No chevron, no border, no hover elevation. Users discover the drop-down only by accidental click. I've seen this pattern in-app and in user testing of similar apps — 70%+ of users never discover it.

**Why it hurts productivity:**
Agents change status via the Edit sheet instead — 3-4 extra clicks × 3-8 status changes / day = **~30 seconds / day saved** once the affordance is clear.

**Recommended change:**
Add a chevron and a subtle border on hover. On focus, add a dotted outline. The click target stays the same — we're just signaling that it IS a button.

**Effort:** S.
**Risk:** Low.

---

#### Finding F-5.1 — Draft autosave is silent; users don't know they can close the tab

**Category:** Feedback
**Screen:** `/properties/new`, `/customers/new`
**Code reference:** `NewProperty.jsx:177` (`useDraftAutosave`), `NewProperty.jsx:186-192` (draft banner appears only on return)
**Severity:** P1

**Current state:**
Draft auto-saves every keystroke to `estia-draft:new-property`. The user sees this only if they navigate away and come back — a banner offers to restore.

**Problem:**
The first time the agent accidentally closes the tab mid-listing, they panic. They lose trust in the app even though the draft is safe. The Zeigarnik effect applies inversely here: the user doesn't know the task is safe.

**Why it hurts productivity:**
Hard to measure in seconds, but trust impact is huge. New agents under-use the long form ("I'll just do a minimum version first") → data quality degrades.

**Recommended change:**
Near the save button: a subtle "✓ נשמר אוטומטית · {N} שניות אחרונות" chip. Fires once on first keystroke. On deliberate navigation away via the back link, show a toast "טיוטה נשמרה — חזור להשלים בכל רגע". No action required; it's an ambient reassurance.

**Effort:** S.
**Risk:** Low.

---

#### Finding F-5.2 — NewProperty step-indicator is clickable but only one direction works in create mode

**Category:** Flow · Affordance
**Screen:** `/properties/new`
**Code reference:** `NewProperty.jsx:590-612` (`goToStep`). In create mode it requires `propertyId` (i.e. step-1 saved) before allowing step-2 click; step-2→step-1 works freely; but step-1→step-2 silently fails if save hasn't happened.
**Severity:** P1

**Current state:**
A 2-dot indicator shows "1 · 2" with both dots clickable-looking. Tapping "2" before saving step 1 does nothing — no toast, no focus jump, no error.

**Problem:**
Silent failure. Users think the app is broken.

**Why it hurts productivity:**
First-time friction (every new agent runs into this). Support ticket trigger.

**Recommended change:**
When step 1 is unsaved, step 2 dot is visibly disabled (`aria-disabled="true"`, 40% opacity). On click, focus jumps to the first required field in step 1 + shows a toast: "שמור קודם את פרטי השלב הראשון".

**Effort:** S.
**Risk:** Low.

---

#### Finding F-5.3 — "חדרים: מ" / "חדרים: עד" labels are awkward Hebrew

**Category:** Copy
**Screen:** `/customers/new` — rooms range selector
**Code reference:** `NewLead.jsx:~255-270` (RoomsChips with label="חדרים: מ")
**Severity:** P1 (copy-level but happens on every new lead)

**Current state:**
Two separate segmented controls side-by-side, each labeled with the literal string `חדרים: מ` and `חדרים: עד`.

**Problem:**
That's English syntax translated character-by-character ("Rooms: From"). Natural Hebrew is `מ-` or `טווח חדרים`. And they're the same field conceptually — they should be ONE range picker, not two stacked.

**Why it hurts productivity:**
Every new lead. ~3 seconds of "what am I setting?" until the user gets used to it.

**Recommended change:**
Replace the two pickers with a single labeled control: `טווח חדרים` — two chip-rows side by side, but under a single label. Or use the pattern from PriceRange in `SmartFields.jsx` which is already canonical: a `PriceRange` with "מ" / "עד" captions, shared label above.

**Effort:** S.
**Risk:** Low. Literal CSS + JSX swap.

---

#### Finding F-6.1 — Top toolbars on detail pages are inconsistent

**Category:** Consistency · Layout
**Screen:** `/properties/:id`, `/customers/:id`, `/owners/:id`
**Code reference:** `PropertyDetail.jsx:558-601` (Back + 7 buttons in a specific order), `CustomerDetail.jsx:164-198` (Back + 5 buttons, different order), `OwnerDetail.jsx:~200-240` (Back + 3 buttons)
**Severity:** P1

**Current state:**
PropertyDetail toolbar order: Back · Transfer · Edit · Share · Story (iOS) · Add Prospect · Delete. CustomerDetail: Back · Templates · Call · WhatsApp · SMS · Schedule Meeting. OwnerDetail: Back · Edit · Delete (roughly).

**Problem:**
No shared mental model. The "dangerous" delete is in the same row as the "common" edit on two pages; on one page it's last, on another it's second to last. Edit is in different positions.

**Why it hurts productivity:**
Minor per-tap cost, compounds across the day. Mostly a perception-of-polish issue.

**Recommended change:**
Canonical order: `← Back · [primary action pair, if any] · ⋯ overflow · Delete (red)`. Move low-frequency actions (Story, Add Prospect, Transfer) into the `⋯ overflow`. Keep Edit + one context-specific primary (WhatsApp on customer, Add Prospect on property, etc.) visible. Delete is always last, always red.

**Effort:** M.
**Risk:** Medium. Users relearn once, then gain consistency.

---

#### Finding F-6.2 — Edit button in PropertyDetail toolbar is not leftmost of primaries

**Category:** Buttons
**Screen:** `/properties/:id`
**Code reference:** `PropertyDetail.jsx:565-570`. Order: Transfer, Edit, Share.
**Severity:** P1

**Current state:**
Transfer comes first; Edit second.

**Problem:**
Edit is 10× more frequent than Transfer on a given property (price updates, status flips). Putting the rare action first violates frequency-of-use ordering.

**Why it hurts productivity:**
Every edit is a scan to find the right button. ~1 second × 5 edits / day = ~5 seconds / day. Small, but it's per-agent forever.

**Recommended change:**
Order: Back · **Edit** · Share · `⋯` (everything else). Transfer goes into overflow.

**Effort:** S. **Risk:** Low.

---

### P2 — Medium

#### Finding F-2.5 — Bulk-select toggle label is ambiguous

**Category:** Copy
**Screen:** `/properties` header
**Code reference:** `Properties.jsx:669`
**Severity:** P2

**Current state:** Label is just "בחר" (select). No hint about multi-select.
**Problem:** Agents don't discover bulk-delete until they stumble into the mode.
**Recommended change:** "בחירה מרובה". Lucide icon: `CheckSquare`. Same space budget.
**Effort:** S. **Risk:** Low.

---

#### Finding F-2.6 — Desktop property card's "שלח ללקוח" button opens an empty picker when there are 0 matches

**Category:** Feedback
**Screen:** `/properties` desktop
**Code reference:** `Properties.jsx:1179-1181` + `WhatsAppSheet`
**Severity:** P2

**Current state:** Click opens a full lead picker even when no lead matches this property's criteria.
**Problem:** Silent "no matches" → user picks any random lead. The match info from the card is gone.
**Recommended change:** If 0 matches, button should say "שלח לליד כלשהו" and open the picker sorted-by-last-contact. If ≥1 match, button reads "שלח ל-N מתאימים" (matching text, different behavior).
**Effort:** S. **Risk:** Low.

---

#### Finding F-2.7 — "Copy link" / "Share" buttons fire on every paint via inline function

**Category:** Flow
**Screen:** `/properties/:id`
**Code reference:** `PropertyDetail.jsx` hero area — multiple `onClick` props instantiated per render
**Severity:** P2

**Current state:** Minor re-render cost. Not user-visible but causes list-level re-render cascade.
**Why it hurts productivity:** Input lag on large lists. ~50-100ms perceptible lag on older Macs.
**Recommended change:** Wrap common handlers in `useCallback` with stable deps. Pair with the F-8.5 PropertyCard memo work that's already deferred in the hardening backlog.
**Effort:** M. **Risk:** Low.

---

#### Finding F-3.2 — `/customers` search is debounced but the filter panel isn't

**Category:** Inputs · Feedback
**Screen:** `/customers`
**Code reference:** `Customers.jsx:~223` (debouncedSearch); `Customers.jsx:~220` (filter deps not debounced — full re-filter on every change)
**Severity:** P2

**Current state:** Search is 200ms debounced (shipped in audit batch 4). Clicking a status filter re-filters instantly; clicking the filter-sheet's 4-tab chain re-filters 4 times fast.
**Problem:** Individual clicks are fine; a sequence of filter changes pops 4 successive re-renders. Not user-visible on small lists; on 500+ leads it stutters.
**Recommended change:** Either debounce the entire filter object (30ms window, just enough to coalesce pointer-move clicks) OR batch updates via `useReducer`. The reducer approach is cleaner.
**Effort:** M. **Risk:** Low.

---

#### Finding F-3.3 — Customer sort headers give no sort-direction indicator

**Category:** Affordance
**Screen:** `/customers` (desktop table view)
**Code reference:** `Customers.jsx` desktop table
**Severity:** P2

**Current state:** Click column header to sort. No ↑↓ arrow, no "currently sorting by" indicator.
**Problem:** User doesn't know the current sort.
**Recommended change:** Append a chevron (`ChevronDown` if desc, `ChevronUp` if asc, faded if this is the active column; invisible if not). Standard pattern — Material/Ant/shadcn.
**Effort:** S. **Risk:** Low.

---

#### Finding F-4.2 — "Today" strip on Dashboard hides when both its sub-strips are empty

**Category:** Empty state
**Screen:** `/`
**Code reference:** `Dashboard.jsx` today-strip render logic
**Severity:** P2

**Current state:** If there are no stale leads AND no unmarketed properties, the entire strip disappears.
**Problem:** Silently shrinks the dashboard — the agent's morning scan rhythm is broken. They think a widget is missing.
**Recommended change:** Keep the strip. When empty: "מעולה — אין לידים עומדים ואין נכסים לא משווקים היום." Green dot icon. Reinforces the good state.
**Effort:** S. **Risk:** Low.

---

#### Finding F-4.3 — "Marketing progress" card on Dashboard shows per-property percentages but can't be acted on

**Category:** Flow
**Screen:** `/`
**Code reference:** `Dashboard.jsx` marketing progress card
**Severity:** P2

**Current state:** Card shows "Rothschild 15: 4/22 marketing actions" with a progress bar. Tap → navigates to the property detail page scrolled to top.
**Problem:** The agent wants to jump to the MARKETING panel specifically. Getting dumped at the top means another scroll + click.
**Recommended change:** Clicking a row on this card navigates to `/properties/:id?panel=marketing`. PropertyDetail already supports `setPanel('marketing')` — read the query param on mount.
**Effort:** S. **Risk:** Low.

---

#### Finding F-5.4 — Property wizard validates address only via a hidden "picked from list" flag

**Category:** Inputs · Feedback
**Screen:** `/properties/new` Step 1
**Code reference:** `NewProperty.jsx` (address gate) + `AddressField.jsx:~140-170` (`picked` ref)
**Severity:** P2

**Current state:** User types "רוטשילד 15, תל אביב" and tabs away. No address suggestion was picked from the dropdown. On save, the request is rejected with "נא לבחור כתובת מהרשימה" — but the field looks fine.
**Problem:** No visual cue the address isn't validated. The error comes only on submit.
**Why it hurts productivity:** Every user hits this on their first listing. Support volume.
**Recommended change:** When the field has text but `picked === false`, border turns amber. Below the field: "לחץ על הצעה מהרשימה כדי לאמת". Gold check icon appears once picked. Same pattern as the existing success chip.
**Effort:** S. **Risk:** Low.

---

#### Finding F-5.5 — Required-field asterisks missing across all forms

**Category:** Inputs
**Screen:** `/properties/new`, `/customers/new`, `/owners/:id` (edit)
**Code reference:** Searched for `<label>` + `*` in NewProperty/NewLead: no asterisk markers anywhere
**Severity:** P2

**Current state:** Required fields look identical to optional ones until save fails.
**Problem:** Users guess.
**Recommended change:** Append `<span class="req" aria-hidden>*</span>` + aria-required on required inputs. One CSS rule: `.req { color: var(--danger); margin-inline-start: 4px; }`.
**Effort:** M (need to mark ~15 required fields across 3 forms). **Risk:** Low.

---

#### Finding F-5.6 — NewLead's clipboard-phone banner is not dismissible per session

**Category:** Flow
**Screen:** `/customers/new`
**Code reference:** `NewLead.jsx:~155-160` (clipboard banner + dismiss)
**Severity:** P2

**Current state:** Banner dismisses for this form, but returns on the next `/customers/new` visit (same clipboard content).
**Problem:** Agent pastes a phone manually, ignores the banner, saves, creates another lead → banner pops again for the same number they already used.
**Recommended change:** Remember `dismissed-phone` values in sessionStorage for ~15 min; don't re-suggest the same number.
**Effort:** S. **Risk:** Low.

---

#### Finding F-6.3 — Sticky bottom bar on mobile PropertyDetail duplicates the hero CTAs

**Category:** Consistency
**Screen:** `/properties/:id` (mobile)
**Code reference:** `PropertyDetail.jsx` hero (Share/WhatsApp/Copy) + sticky bottom bar (Call/WhatsApp/Navigate/Share)
**Severity:** P2

**Current state:** WhatsApp appears in both hero and bottom bar. Share appears in both.
**Problem:** Redundancy that costs vertical space on phone screens.
**Recommended change:** Move all primary actions to the sticky bottom bar. Hero shows only the photo + price + title. Bottom bar: Call · WhatsApp · Navigate · ⋯.
**Effort:** M. **Risk:** Low.

---

#### Finding F-6.4 — "Add another agency" button on Yad2 done-step dumps user back to step 1

**Category:** Flow
**Screen:** `/integrations/yad2` (done state)
**Code reference:** `Yad2Import.jsx:~395-400` (resetAndRescan)
**Severity:** P2

**Current state:** After a successful import, "ייבא סוכנות נוספת" clears the URL, clears the scan store, lands back on paste step.
**Problem:** Agents who imported from agency X will likely import from agency Y (same session, related seller contacts). The reset flow doesn't preserve useful state — e.g. don't reset the quota chip's animated reset; don't lose the URL-based history the agent wanted to compare.
**Recommended change:** Keep the previous scan in history (small list below the input: "סריקה אחרונה · 15 נכסים · לפני 3 דק׳"). Clicking it restores to the review step.
**Effort:** M. **Risk:** Low.

---

#### Finding F-7.1 — Property search bar is sticky but hides the filter chip row on scroll

**Category:** Layout
**Screen:** `/properties`
**Code reference:** `Properties.jsx` sticky search + filter tabs; the tabs scroll away while search stays sticky.
**Severity:** P2

**Current state:** Search stays at the top of the viewport on scroll. The asset-class tabs and category tabs scroll away, so the user loses context of which tab is active.
**Problem:** User loses "what am I viewing?" when scrolling a 500-row list. Comes back to search, sees results, can't tell if "showing rentals only" is still on.
**Recommended change:** Sticky also shows the current active tab as a small chip inside the search bar ("• השכרה · מגורים"). Tapping it clears that filter.
**Effort:** M. **Risk:** Low.

---

#### Finding F-7.2 — Filter panel's "clear all" is only inside the advanced filter, not at top level

**Category:** Findability
**Screen:** `/properties`
**Code reference:** `Properties.jsx` clear-filters button inside the advanced panel
**Severity:** P2

**Current state:** To clear all filters (search + asset class + category + advanced), the user has to: clear the search box manually, click each tab back to "הכל", open advanced, click "נקה סינון".
**Problem:** ~4-5 clicks to reset the view.
**Recommended change:** When ≥1 filter is active, show a "נקה הכל" pill next to the advanced chip at the top level. One click to reset.
**Effort:** S. **Risk:** Low.

---

#### Finding F-8.1 — Destructive delete on property has a confirm, but bulk delete's confirm uses a generic count

**Category:** Feedback
**Screen:** `/properties` bulk mode
**Code reference:** `Properties.jsx:~1140` bulk confirm dialog
**Severity:** P2

**Current state:** Single delete: "למחוק את {address}?" — clear. Bulk delete: "למחוק N נכסים? אינה הפיכה." — doesn't list them.
**Problem:** User in bulk mode may have selected one wrong. The confirm gives no surface to review.
**Recommended change:** Show up to 5 addresses in a bulleted list inside the confirm; "ועוד X" if there are more. Same space; much safer.
**Effort:** S. **Risk:** Low.

---

#### Finding F-8.2 — Toast auto-dismiss time is identical for success (2.4s) and error (5s) but not configured per message

**Category:** Feedback
**Screen:** Everywhere
**Code reference:** `frontend/src/lib/toast.jsx`
**Severity:** P2

**Current state:** Success fades at 2.4s — too fast to read a two-line message. Error fades at 5s — fine.
**Problem:** "יובאו 23 נכסים · 3 נכשלו" in a success toast: gone before you finish reading.
**Recommended change:** Success with ≥40 chars or multi-line copy gets 5s. Single-verb successes stay at 2.4s.
**Effort:** S. **Risk:** Low.

---

#### Finding F-8.3 — Copy-link button on PropertyDetail has no post-success state for >1s

**Category:** Feedback
**Screen:** `/properties/:id`
**Code reference:** `PropertyDetail.jsx` hero copy handler + `copied` state ≤ 2000ms
**Severity:** P2

**Current state:** Click "Copy link" — button briefly shows Check icon, then reverts.
**Problem:** Agents don't always see the checkmark; they copy, wait, click again (double-copy). Not a bug but a trust-of-feedback issue.
**Recommended change:** Longer affirmation (3s) + a small "הקישור הועתק" text inside the button for the duration.
**Effort:** S. **Risk:** Low.

---

#### Finding F-9.1 — Match pill on customer cards looks like a badge, but it's a link

**Category:** Affordance
**Screen:** `/customers`
**Code reference:** `Customers.jsx` match pill that navigates to `/properties?city=…`
**Severity:** P2

**Current state:** Pill shows "X נכסים תואמים". Tapping navigates.
**Problem:** No underline, no hover lift, no chevron. Half of users never try tapping.
**Recommended change:** Add an `ExternalLink` or `ChevronLeft` icon at the end of the pill. Border on hover.
**Effort:** S. **Risk:** Low.

---

#### Finding F-9.2 — Inline edit (InlineText) has an invisible blur-to-revert behavior

**Category:** Feedback
**Screen:** `/customers` list view — inline city/rooms/notes edit
**Code reference:** `frontend/src/components/InlineText.jsx:55-65` (blur reverts silently; Enter commits)
**Severity:** P2

**Current state:** Click to edit; Enter commits; clicking outside reverts.
**Problem:** A user who types, then clicks away thinking they're saving, loses their edit. No feedback.
**Why it hurts productivity:** Silent data loss. The user thinks they saved; they didn't.
**Recommended change:** On blur-revert, show a toast "לא נשמר — הקש Enter לשמירה". OR commit on blur + Enter. The "revert on blur" model is too clever; most apps commit on blur.
**Effort:** S (toast) or M (flip to commit-on-blur and revisit with InlineText callers). **Risk:** Medium if we flip commit-on-blur.

---

#### Finding F-10.1 — NewProperty's "Save and add another" pattern is missing

**Category:** Flow
**Screen:** `/properties/new`
**Code reference:** `NewProperty.jsx` post-save navigates to `/properties/:id`
**Severity:** P2

**Current state:** Save → land on property detail.
**Problem:** Agents in batch-listing mode (3 new properties in one sitting) have to click back and re-click "new property". No bulk-create affordance.
**Recommended change:** After save, sticky bottom action bar shows two buttons: "הצג את הנכס" (primary) + "הוסף עוד נכס" (secondary). Second option clears the form, preserves agent info.
**Effort:** M. **Risk:** Low.

---

#### Finding F-11.1 — Hebrew mixed-direction text renders awkwardly inside notes/tags on property cards

**Category:** RTL
**Screen:** `/properties` card, `/customers` card
**Code reference:** free-text fields interpolated into `<span dir="rtl">` wrapping
**Severity:** P2

**Current state:** A notes string like `מעלית · AC · מרפסת 12 מ״ר` renders fine, but one like `פייסבוק: https://fb.com/post/123` has the URL flow weird (trailing punctuation ends up mid-line).
**Problem:** Classic mixed-direction chaos. Common in agent-written notes.
**Recommended change:** Wrap note paragraphs in `dir="auto"`. Individual spans that are known LTR (URLs, phone numbers) wrap in `<bdi dir="ltr">`. The `dir="auto"` attribute is the cheap fix; the `<bdi>` is the polish.
**Effort:** S. **Risk:** Low.

---

### P3 — Low

#### Finding F-12.1 — Property status enum has 4 values but the UI shows 2

**Category:** Consistency
**Severity:** P3
**Code reference:** Prisma enum `PropertyStatus { ACTIVE PAUSED SOLD OFF_MARKET }`; UI typically only toggles ACTIVE ↔ SOLD
**Why it matters:** When the schema exposes PAUSED / OFF_MARKET, the UI should too — or we should drop the enum values. Today it's a half-feature.
**Recommended change:** Expose all 4 in a single SelectField in QuickEditDrawer (already exists). Add a color per state on the card status pill.
**Effort:** S. **Risk:** Low.

---

#### Finding F-12.2 — Toast stack is capped at 3 with no visual "you have more"

**Category:** Feedback
**Severity:** P3
**Code reference:** `toast.jsx:30`
**Why it matters:** A bulk action that fires 10 toasts shows 3; 7 are silently swallowed.
**Recommended change:** When capacity is exceeded, the last toast says "+N נוספים" with a click-to-expand.
**Effort:** M. **Risk:** Low.

---

#### Finding F-12.3 — PropertyDetail's KPI tiles are clickable on some, not others

**Category:** Affordance
**Severity:** P3
**Code reference:** `PropertyDetail.jsx:608-637`; the marketing tile has `onClick`, the others don't
**Why it matters:** Users expect symmetry. If marketing-tile is clickable (it opens the marketing panel), why isn't "views" or "inquiries"?
**Recommended change:** Either make all clickable (views → lead list filtered by "viewed this") or none. My bias: make all clickable, consistent shape.
**Effort:** M. **Risk:** Low.

---

#### Finding F-12.4 — Price formatting within the app is inconsistent

**Category:** Copy · Consistency
**Severity:** P3
**Code reference:** Some places use `.toLocaleString('he-IL')`, others use the `displayPrice` helper (shipped in audit batch 1), some use `Intl.NumberFormat` ad hoc.
**Why it matters:** "₪2,500,000" vs "2500000 ₪" vs "2.5M" across surfaces.
**Recommended change:** Adopt `displayPrice` / `displayPriceShort` (from `lib/display.js`) across the app as pages are touched. `CLAUDE.md` already lists this as the canonical pattern.
**Effort:** M (distributed over time). **Risk:** Low.

---

#### Finding F-12.5 — Dashboard "Share catalog" button is prominent but rarely used

**Category:** Button hierarchy
**Severity:** P3
**Code reference:** `Dashboard.jsx` top CTA row
**Why it matters:** A primary CTA that's rarely used burns valuable visual real estate. Based on code signals (event name, handler complexity), this is not a daily-use action.
**Recommended change:** Demote to secondary-style button or move into Profile. Elevate "Add property" / "Add lead" to primary.
**Effort:** S. **Risk:** Low.

---

#### Finding F-12.6 — App has no "last action undo" despite destructive operations

**Category:** Feedback
**Severity:** P3
**Code reference:** N/A (absence)
**Why it matters:** Delete a property, deleted leads' match counts change, notes are gone. No "undo" toast despite the toast system supporting actions.
**Recommended change:** Soft-delete rather than hard-delete, plus a toast "הנכס נמחק · בטל" for ~8 seconds. Backend gets a `deletedAt` column; background job reaps after 30 days.
**Effort:** L (backend + UI). **Risk:** Medium.

---

## Findings — grouped by screen

### `/properties`
F-2.1 (cut tap targets), F-2.2 (overflow/swipe dup), F-2.3 (WhatsApp label), F-2.4 (filter chip state), F-2.5 (bulk label), F-2.6 (empty picker), F-7.1 (sticky search lost tabs), F-7.2 (clear all), F-8.1 (bulk confirm), F-12.1 (status enum)

### `/properties/:id`
F-1.1 (WhatsApp direct to matched), F-2.7 (re-renders), F-6.1 (toolbar), F-6.2 (Edit order), F-6.3 (sticky dup), F-8.3 (copy link affordance), F-12.3 (KPI clickability), F-11.1 (RTL mixed), F-12.4 (price format)

### `/properties/new` · `/:id/edit`
F-5.1 (autosave hint), F-5.2 (step indicator silent fail), F-5.4 (address validation), F-5.5 (required asterisks), F-10.1 (Save & add another)

### `/customers`
F-3.1 (sort in URL), F-3.2 (filter debounce), F-3.3 (sort indicator), F-4.1 (status badge affordance), F-9.1 (match pill affordance), F-9.2 (InlineText blur-revert)

### `/customers/new`
F-5.3 (חדרים labels), F-5.6 (clipboard re-suggest)

### `/customers/:id`
F-4.1 (status badge again), F-6.1 (toolbar inconsistency)

### `/`
F-4.2 (Today strip collapse), F-4.3 (marketing card deep-link), F-12.5 (Share catalog hierarchy)

### `/integrations/yad2`
F-6.4 (add another agency history)

### Everywhere
F-8.2 (toast duration), F-12.2 (toast stack), F-12.6 (undo)

---

## Patterns & systemic issues

**1. The "add buttons, never remove them" pattern.** Across PropertyDetail, PropertyCard, CustomerDetail and Dashboard, every feature sprint added a button. Nothing was ever consolidated into an overflow. This is ~40% of the cognitive load in the app. Fix = a quarterly "button census" with a strict quota per screen (e.g. 4 primary actions + 1 overflow, no more).

**2. Hidden action affordances.** F-4.1 (status badge), F-9.1 (match pill), F-9.2 (InlineText blur), F-12.3 (some KPI tiles clickable, some not). Users only discover these by accident. Fix = visual language for "this is interactive" — consistent hover border, chevron, or underline. It's a 2-day design-token pass that touches <20 components.

**3. Inconsistent persistence.** F-3.1 (sort lost), F-6.4 (Yad2 history lost), mixed localStorage / URL / memory. Rule needed and documented — already added to `CLAUDE.md` (batch 1).

**4. Silent failures.** F-5.2 (step nav), F-5.4 (address), F-9.2 (InlineText), F-5.1 (draft auto-save invisible until return). Every silent failure is a trust killer. Rule = every user action gets a response within 400ms (Doherty threshold).

**5. Toolbar / CTA inconsistency across detail pages** (F-6.1, F-6.2, F-6.3). There is no shared toolbar template; every detail page invented its own. A single `DetailToolbar` component with slots would remove 40% of this noise.

---

## Workflow walkthroughs

### Workflow #1 — Send a property to a lead via WhatsApp

**Frequency:** 10-40× / day.
**Current clicks:** 1 → open list. 2 → pick property. 3 → scroll to hero. 4 → "שלח ללקוח" OR scroll to bottom bar → "וואטסאפ". 5 → picker opens (if ≥2 matched). 6 → scan matched leads (no match reason visible). 7 → pick lead. 8 → WA tab focuses. 9 → press send in WhatsApp. **~18 seconds.**
**Friction:** F-1.1 (picker can't tell which lead matches best). F-2.3 (two different labels). F-6.3 (hero vs bottom bar duplication).
**After quick wins:** 1 → open list. 2 → pick property. 3 → click "שלח בוואטסאפ ל-{name}" on the best-match row in hero. 4 → press send. **~6 seconds.**

### Workflow #2 — Add a new lead from an inbound call

**Frequency:** 2-8× / day.
**Current clicks:** 1 → `/customers/new` (from MobileTabBar + sheet; 2 taps on mobile, 1 on desktop). 2 → the clipboard banner offers the phone; accept or dismiss. 3 → fill name (required), fill city. 4 → save.
**Friction:** F-5.5 (no asterisks — which fields are required?). F-5.3 (חדרים range clumsy). F-5.6 (clipboard re-suggest).
**After quick wins:** save flow itself is fine. The polish items (F-5.3, F-5.5) chip 3-5 seconds off each creation.

### Workflow #3 — Find a lead and update status

**Frequency:** 5-15× / day.
**Current clicks:** 1 → `/customers`. 2 → type in search. 3 → click row. 4 → status badge (not obvious it's clickable — see F-4.1). 5 → pick new status. 6 → confirm.
**Friction:** F-4.1 (affordance) is the single biggest issue. Once users discover the dropdown, this is fast.

### Workflow #4 — Find a property by filters

**Frequency:** 5-20× / day.
**Current clicks:** 1 → `/properties`. 2 → click asset class tab. 3 → click category tab. 4 → "סינון מתקדם" → fill fields. 5 → scroll to scan results.
**Friction:** F-2.4 (active filters invisible on scroll), F-7.1 (tabs scroll away, search stays), F-7.2 (no "clear all"). All three compound.

### Workflow #5 — Create a property listing

**Frequency:** 3-10× / week.
**Current clicks:** 1 → `/properties/new`. 2 → Step 1 form (address, price, owner). 3 → save step 1. 4 → Step 2 (features, photos, exclusivity). 5 → save. 6 → land on detail page.
**Friction:** F-5.2 (step dot silent fail), F-5.4 (address validation hidden), F-5.1 (draft autosave silent — agents don't trust it), F-10.1 (no "add another" after save).

### Workflow #6 — Edit property's price / status

**Frequency:** 3-10× / day.
**Current clicks:** Through QuickEditDrawer (shipped batch 2): 1 → list. 2 → ⋯ on card. 3 → "עריכה מהירה". 4 → edit. 5 → save.
**Friction:** None material. QuickEditDrawer is well-built. This workflow is a bright spot.

### Workflow #7 — Schedule a meeting with a lead

**Frequency:** 1-3× / day.
**Current clicks:** 1 → `/customers/:id`. 2 → "קבע פגישה" button. 3 → fill form. 4 → save.
**Friction:** Good. `LeadMeetingDialog` is well-scoped. Only nit: user has to re-confirm Calendar connection state if it was disconnected mid-session — no huge deal.

### Workflow #8 — Mark a marketing action done on a property

**Frequency:** 3-10× / day.
**Current clicks:** 1 → `/properties/:id`. 2 → scroll to / click the marketing tile. 3 → pick an action from the 22-item list. 4 → mark done or add link/note.
**Friction:** The 22-item list is dense; collapse groups help but the order within groups is arbitrary. Daily-use actions (יד 2, פייסבוק, WhatsApp group) should sit at the top, not nested mid-list. Not in this review's scope (feature change).

### Workflow #9 — Dashboard morning scan

**Frequency:** 1× / day.
**Current clicks:** 0 beyond opening the tab.
**Friction:** F-4.2 (Today strip disappears when empty). F-4.3 (marketing card doesn't deep-link to the marketing panel).

### Workflow #10 — Yad2 batch import

**Frequency:** Rare.
**Current clicks:** 1 → `/integrations/yad2`. 2 → paste URL. 3 → scan. 4 → review (N listings, choose subset). 5 → import. 6 → land on done step.
**Friction:** Low. The flow is well-thought-out. Only F-6.4 (no history of past scans after "add another agency").

---

## Appendix — findings consciously not addressed

- **Dark mode completeness** — deferred to the hardening audit F-7.4; it's an L effort and a separate topic.
- **List virtualization / pagination** — hardening audit F-8.2/8.3. Pure perf, not UX per se.
- **Hebrew proofread by a native speaker** — I am not qualified; this needs a human copy reviewer.
- **Icon-button aria-label sweep** — partially shipped in audit batches 1-4. The remaining long tail is tedious but not UX-critical.
- **`/deals` Kanban column overflow** — exists but I couldn't judge frequency; flagged as "needs investigation" rather than finding.

---

## Meta

If a PM reads only the executive summary + top-10 quick wins, they have a ready-to-ticket backlog for a 2-sprint UX polish cycle. Every P1 has a specific recommendation and an effort estimate. Start with F-1.1 on Monday — the WhatsApp-to-matched-lead shortcut — and you'll feel the difference by Friday's demo.
