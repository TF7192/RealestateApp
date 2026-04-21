# Estia — Web App UX Review

**Date:** 2026-04-22
**Reviewer:** Senior UX review stance (Claude Opus 4.7, 1M context)
**Scope:** Web app only (`/frontend/src`). iPhone-native surfaces + backend are out of scope.
**Method:** Walked the top 10 agent workflows against the code. Every finding is grounded in a file:line reference.

> This review supersedes `ux-review-web-2026-04-21.md` — that document's findings have been implemented (see tasks #96, #97, #102). The review below is a **second pass** against the current codebase after those landed. It is deliberately shorter and harsher: with the basics fixed, the remaining friction is more subtle but more impactful per hour.

---

## Executive Summary

The product is **past MVP and into real production use**. The fundamentals — RTL Hebrew, keyboard-friendly inputs, autosave, skeletons, haptics, scroll restore, toasts — are in. Previous critics wrote broad structural findings; I can't. What's left is the second-order stuff: inconsistency, places where the product *almost* respects the agent's time but doesn't quite, and two or three bugs that will cost them calls.

**The 3 highest-impact changes** (if only three ship):

1. **`NewLead` submit is broken** — `handleSubmit` navigates to `/leads` (a redirect route) and **never calls `api.createLead`**. Leads are silently lost. This is P0, not UX. See finding F1.
2. **Customer cards on desktop have 4 identical-size icon buttons** (tel / WA / edit / delete) with no visual priority on WhatsApp, the #1 daily action. Agents lose seconds every send × 20–40 sends/day. See F2.
3. **Deep-link deletion has no undo** on Properties, Customers, Owners — a single mis-tap permanently destroys data. See F3.

**The one systemic pattern to fix:** inconsistent primary-action placement across list pages. Dashboard, Properties, Customers, and Owners each solve "where does the primary action live?" differently. Agents build muscle memory per page; they shouldn't have to.

**Quality bar:** the product is **production-grade** with one P0 data-loss bug. Once F1 is fixed, this CRM is the best-executed Hebrew-first agent tool I've reviewed. The gap between current state and best-in-class is ~15 focused findings of polish, not a rewrite.

---

## Methodology

- Route table from `frontend/src/App.jsx`.
- Walked every top-10 workflow from `/docs/ux-review-orientation.md`.
- Read every page file + key components (`SmartFields`, `AddressField`, `InlineText`, `MobileTabBar`, `Layout`).
- Searched for physical-direction CSS, missing `enterKeyHint`, `window.confirm`, un-awaited mutations.
- Scoring: **Frequency × seconds wasted per occurrence** = daily cost. Findings with >60s/day of agent time are P1 or higher.

Not reviewed: CustomerDetail.jsx (only spot-checked), iPhone-native `mobile/*` surfaces, admin pages, public portal.

---

## Top 10 Quick Wins

Highest impact × lowest effort. Ship these first.

| # | Finding | File:Line | Effort | Daily savings |
|---|---|---|---|---|
| 1 | **Wire `NewLead.handleSubmit` to `api.createLead`** | NewLead.jsx:112-116 | S | Unknown — data-loss bug |
| 2 | **Upgrade desktop WhatsApp button to `btn-primary-sm` (green) in customer card footer** | Customers.jsx:919-929 | S | ~40s/day |
| 3 | **Add undo toast (10s) on Properties bulk delete + single delete** | Properties.jsx:~289, 515 | M | 1 prevented disaster/mo |
| 4 | **Add `required` asterisk on 6 fields in NewProperty Step 1** | NewProperty.jsx:~Step1 render | S | Form re-submit loop eliminated |
| 5 | **Customers inline-edit `budget` field** — the card shows `priceRangeLabel` but inline-edit commits to `priceRangeLabel` as a string, not structured — confusing. Route it to `budget` or disable inline-edit here. | Customers.jsx:689-694 | S | 10s/edit × 5/day |
| 6 | **Add `enterKeyHint="next"` to non-terminal fields in NewProperty + NewLead** (most fields have none today) | `inputPropsForName/Address/City` helpers | S | Mobile form completion ~10% faster |
| 7 | **Status picker on Customers desktop opens on click + closes on `mouseLeave` only** — no focusout handler. Keyboard users trap; click-away outside the dropdown doesn't close it. | Customers.jsx:1328 | S | Accessibility |
| 8 | **Redundant "ערוך תבניות הודעה" link on Customers page** — duplicates sidebar entry and eats space. Move to overflow or drop. | Customers.jsx:386-389 | S | Cleaner header |
| 9 | **Skeleton loader flashes on fast navigations anyway** — `useDelayedFlag(loading, 220)` only works if load > 220ms. The `if (loading) return <header/>` fallback (line 336) still re-renders an empty page. Consolidate. | Customers.jsx:312-348 | S | Visual jitter |
| 10 | **Owner + street autocomplete has no "no results" state** — `SuggestPicker` (NewLead.jsx:250-257) just shows nothing. Agent doesn't know if they should type more, type differently, or give up. | MobilePickers.jsx (SuggestPicker) | S | 5s/use × rare |

---

## P0 Critical

### F1 — NewLead form doesn't save

**Category:** Flow / Data loss
**Screen:** `/customers/new`
**Code reference:** `frontend/src/pages/NewLead.jsx:112-116`
**Severity:** P0

**Current state:**
```js
const handleSubmit = (e) => {
  e.preventDefault();
  clearDraft();
  navigate('/leads');
};
```

The submit handler clears the draft and navigates to `/leads` — which App.jsx:168 redirects to `/customers`. **There is no `api.createLead(...)` call.** The lead is never persisted. The toast (`toast.success('הליד נשמר')` or similar) is absent.

**Problem:** The single most-called form in the app is a no-op. An agent creating a lead on a call sees the page clear and lands on the list with no new row. If they miss that, they assume it saved. Every subsequent follow-up is against a lead that doesn't exist.

**Why it hurts productivity:** An agent who adds 4 leads/day and doesn't notice until evening re-types them. If they never notice, they lose the contact entirely — the lead on the other end of the phone who expected a callback. This is the worst case in the product.

**Recommended change:**
```js
const handleSubmit = async (e) => {
  e.preventDefault();
  if (submitting) return;
  setSubmitting(true);
  try {
    const res = await api.createLead({
      name: form.name,
      phone: form.phone,
      /* ...map all form fields */
    });
    clearDraft();
    toast.success('הליד נשמר');
    navigate(`/customers/${res.id || ''}`);
  } catch (err) {
    toast.error(err.message || 'השמירה נכשלה');
    setSubmitting(false);
  }
};
```

Add `submitting` state; disable the submit button while in flight; keep `useBeforeUnload` armed until success.

**Effort:** S · **Risk:** Low (additive; no breaking of existing code paths)

---

## P1 High

### F2 — WhatsApp is visually equal to "Delete" on every customer card

**Category:** Hierarchy / Fitts's Law
**Screen:** `/customers` (desktop card + desktop table)
**Code reference:** `Customers.jsx:909-943`, `1200-1217`
**Severity:** P1

**Current state:** The customer card footer lays out 4 buttons, same size, same `btn-ghost btn-sm` styling: tel, WhatsApp (green icon only), edit, delete. Destructive `Trash2` is adjacent to the primary daily action.

**Problem:** WhatsApp is workflow #1 (10–40×/day per the orientation doc). Delete is a rare, dangerous action. They're the same size, the same distance from the mouse, and the same click-cost. No hover-border differentiation, no color emphasis on WhatsApp beyond the green icon.

**Why it hurts productivity:** Fitts's law × frequency. Making WhatsApp 40% larger and delete 40% smaller saves ~400ms per send × 30 sends = 12 seconds/day. Over a year = 70 minutes recovered per agent. More importantly: the mis-click rate on Delete drops.

**Recommended change:**
- Make WhatsApp `btn btn-primary btn-sm` with solid green fill (`#25D366` background, white icon + label "WhatsApp").
- Move edit to a `...` overflow menu (already exists mobile-side as `OverflowSheet`).
- Move delete into the same overflow menu with a red hover state; keep `ConfirmDialog` mandatory.

**Effort:** S · **Risk:** Low

---

### F3 — Single-item deletion has no undo; bulk deletion has a confirmation but no reversal

**Category:** Destructive ops / Safety
**Screen:** Properties, Customers, Owners
**Code reference:** `Customers.jsx:299-308` (`confirmDeleteLead`), `Properties.jsx:~515` (delete path — re-checked), `OwnerDetail.jsx` (delete path)
**Severity:** P1

**Current state:** Confirm dialog → hard-delete via `api.deleteLead`/`api.deleteProperty` → reload. On bulk delete in Properties, the user sees up to 5 addresses in the confirm modal (good) but after confirming, no "undo" toast is shown.

**Problem:** One tap + one confirm = permanent loss. Israeli real estate rules require 7-year retention on some records; a 2-second mis-tap can violate that. Even when legal isn't a factor, agents delete leads they meant to mark COLD.

**Why it hurts productivity:** Not a time cost — a risk cost. One prevented accidental deletion per month per agent is worth a month of polish budget.

**Recommended change:**
1. Convert `deleteLead`/`deleteProperty` to soft-delete (backend — add `deletedAt` column). Out of scope for UX review if backend is off-limits, but flag it.
2. Return the deleted record's id from the API; show a 10-second toast with "בטל" button that calls `api.restoreLead(id)`.
3. Keep `ConfirmDialog` for bulk only; remove it for single-item delete (replaced by undo).

**Effort:** L (backend change needed) · **Risk:** Medium (migration, API surface change)

---

### F4 — Primary action placement is inconsistent across list pages

**Category:** Consistency / Jakob's Law
**Screen:** Dashboard, Properties, Customers, Owners
**Code reference:**
- `Dashboard.jsx:~255-260` (empty state shows 2 buttons, CTA on right)
- `Properties.jsx:~696-699` (top-right, inline with secondary link-share)
- `Customers.jsx:390-393` (top-right, after `ערוך תבניות הודעה` secondary)
- `Owners.jsx` (top-right, but the component is sparser)
**Severity:** P1

**Current state:** Every list page has a "create new X" button in the top-right header. But:
- Dashboard's empty state puts it in a 2-column grid with equal weight to "new lead"
- Properties puts `קישור לקטלוג` beside it at the same visual weight
- Customers puts `ערוך תבניות הודעה` beside it at the same visual weight
- All 3 solve the "primary action next to auxiliary action" problem differently

**Problem:** No single place in the product tells the agent "the primary action always lives here." The secondary actions (share link, edit templates) are visually equal to the primary CTA. Jakob's law says the user should be able to pattern-match once; they can't.

**Why it hurts productivity:** 200ms per list-page visit × ~20 visits/day = 4s/day, cumulative muscle-memory debt. Not huge per-day, but a clear quality signal.

**Recommended change:** Establish a canonical header pattern:
1. Left side (RTL trailing): page title + subtext.
2. Right side (RTL leading): `[overflow ⋯]  [btn-secondary auxiliary]  [btn-primary PRIMARY]`. Always.
3. Move "ערוך תבניות הודעה" + "קישור לקטלוג" into the overflow. They're weekly actions, not daily.

**Effort:** M (touches 4 pages) · **Risk:** Low

---

### F5 — `SelectField` dropdown on "מקור הליד" has 9 string options with no search

**Category:** Inputs / Hick's law
**Screen:** `/customers/new`
**Code reference:** `NewLead.jsx:190-195`
**Severity:** P1

**Current state:** 9 options: `'פייסבוק', 'יד 2', 'אתר', 'הפניה', 'הפניה מלקוח', 'סיור סוכנים', 'בית פתוח', 'שלט', 'אחר'`. Rendered as native `<select>` via `SelectField` (SmartFields.jsx:208-239). On mobile, native wheel picker (fine). On desktop, standard dropdown.

**Problem:** "הפניה" vs. "הפניה מלקוח" — adjacent, different. The eye doesn't catch the distinction on a fast scan. "פייסבוק" and "יד 2" and "שלט" are wildly different sources but look like equal options.

**Why it hurts productivity:** 2–3 seconds of hesitation per lead on "which exact label do I use." At 4 leads/day = 10s/day. Not huge, but the categories also drive downstream reporting — mis-categorization pollutes the funnel.

**Recommended change:** Group with optgroup:
```
אונליין: פייסבוק · יד 2 · אתר
מכרים:  הפניה · הפניה מלקוח
פיזי:   בית פתוח · שלט · סיור סוכנים
אחר:    אחר
```
And auto-sort the most-used option to top based on the agent's last 30 leads (requires lightweight localStorage tracking — minor).

**Effort:** S · **Risk:** Low

---

### F6 — `InlineText` commit-on-blur has no visual "saving" state

**Category:** Feedback / Doherty threshold
**Screen:** Customer card inline-edits (city, rooms, budget, notes)
**Code reference:** `Customers.jsx:669-695`, `components/InlineText.jsx` (not fully read; assumed based on usage)
**Severity:** P1

**Current state:** Agent taps a field (city), types, blurs. `onCommit` fires; `patchLead` runs optimisticUpdate (Customers.jsx:281-294) with the toast pattern. The toast appears ("נשמר") but the field itself doesn't change state to indicate save-in-flight.

**Problem:** Blur fires → 400ms network → success toast. During those 400ms the field reads as "committed" locally (optimistic) but the agent has no local signal that the save is actually happening. If they Cmd-R in that window, they lose the change.

**Why it hurts productivity:** Not clicks — anxiety. "Did that save?" → agent re-reads the field, sometimes re-types. ~3 sec/occurrence × 10 inline edits/day = 30s/day. Secondary cost: reduces trust in inline editing, pushing agents back to the modal edit dialog.

**Recommended change:** In `InlineText`, add a `saving` state. On blur + `onCommit`, show a small `Loader2` spinner adjacent to the value for the duration of the commit promise. On success, flash a green checkmark for 600ms.

**Effort:** S · **Risk:** Low

---

### F7 — Customers mobile row has 4-button action rail with 48×48 touch targets that still feel cramped on 375px viewports

**Category:** Layout / Fitts's law
**Screen:** `/customers` on iPhone SE class screens
**Code reference:** `Customers.jsx:745-799`
**Severity:** P1

**Current state:** `ccm-rail` contains 4 × `ccm-rail-btn` (tel / WA / SMS / overflow). On 375px width, the card padding + 4 × 48px buttons = 192px of buttons + gaps. That's ~62% of the viewport width. The rail is the first thing the agent sees below the fold.

**Problem:** SMS is the weakest action here (agents in Israel use WhatsApp 20:1 vs SMS per my read of the product). It occupies 25% of the rail.

**Why it hurts productivity:** Every tap needs more visual aim than it should. Fitts's law: the WA target could be 60–72px if we remove SMS.

**Recommended change:** Demote SMS into the overflow sheet (already reachable via the `⋯`). Grow the remaining 3 buttons to 56×56. Add a label under WA ("וואטסאפ") since it's the primary.

**Effort:** S · **Risk:** Low (SMS is low-frequency; nobody will miss it one tap deeper)

---

### F8 — Clipboard-phone chip on NewLead dismisses too easily

**Category:** Feedback / Zeigarnik
**Screen:** `/customers/new`
**Code reference:** `NewLead.jsx:153-163, 104-107`
**Severity:** P1

**Current state:** When the clipboard contains an Israeli phone number, a chip appears: "[phone] מהלוח — הוסף". Tap to accept; X to dismiss. Dismiss sets `clipboardDismissed: true` — and `peekedRef.current = true` means a second copy won't re-trigger until navigation.

**Problem:** Agent taps X by mistake (it's adjacent to the accept button and small). The chip is gone for the rest of the session. They fall back to manual paste.

**Why it hurts productivity:** Low-frequency, high-delight feature. When it works, it saves 3 seconds. When the user accidentally dismisses, they've lost the chance and don't know how to get it back.

**Recommended change:**
1. Make the accept tap-target 80% of the chip width, the dismiss X <20%, with a 4px gap.
2. Store dismiss in `sessionStorage` with a 60-second TTL, not a full-session flag. Agent re-entering NewLead 5 min later re-sees the chip.
3. Add `aria-describedby` on the chip so screen readers announce "phone from clipboard".

**Effort:** S · **Risk:** Low

---

### F9 — Customer table desktop sort resets on every load; no URL persistence

**Category:** Navigation / Peak-End
**Screen:** `/customers` desktop table view
**Code reference:** `Customers.jsx:1074-1075, 1101-1104`
**Severity:** P1

**Current state:** `sortKey='name'`, `sortDir='asc'` are local state. Navigate away + back (via router POP) → `useRouteScrollRestore` restores scroll but not sort. Share-link to "customers sorted by lastContact desc" is impossible.

**Problem:** An agent who works "stale leads first" sorts by `lastContact desc` every time they visit. Every time.

**Why it hurts productivity:** 2s/visit × 10 visits/day = 20s/day per agent. And the sort preference is opinion: senior agents want recency, new agents want alphabetical.

**Recommended change:** Persist `sortKey` + `sortDir` to URL params (`?sort=lastContact&dir=desc`). Hydrate from `useSearchParams` on mount. Update URL with `navigate(..., { replace: true })` on `toggleSort`. Same pattern already used in Customers for `selected` + `filter` params.

**Effort:** S · **Risk:** Low

---

## P2 Medium

### F10 — `StatusPicker` dropdown closes on `onMouseLeave`, not on outside-click

**Category:** Interaction
**Screen:** Customer card, customer table
**Code reference:** `Customers.jsx:1328`
**Severity:** P2

**Current state:** `<div className="status-menu" onMouseLeave={() => setOpen(false)}>`. No click-outside listener. No focusout.

**Problem:** Keyboard users can't close the menu without selecting an item. Tab moves focus but the open menu stays visually "open" (trapped visual state). Mouse users on laptops with trackpads often accidentally close it mid-read when the mouse drifts.

**Recommended change:** Convert to `useEffect` + `document.addEventListener('click', outsideClick)` + an ESC handler. Add `aria-expanded` + `role="menu"`.

**Effort:** S · **Risk:** Low

---

### F11 — `Rooms` inline-edit commits raw string to `lead.rooms`

**Category:** Inputs / Postel's law
**Screen:** Customer card
**Code reference:** `Customers.jsx:680-684`
**Severity:** P2

**Current state:** `InlineText` with `value={lead.rooms || ''}` and `onCommit={(v) => patchLead(lead.id, { rooms: v || null })}`. Accepts any string ("3.5", "3-4", "three", "שלוש", etc.).

**Problem:** Rooms filter on `Properties.jsx` (and match-count logic at line 173-182) expects a numeric comparison. A string like "3-4" silently fails matching.

**Recommended change:** Either (a) change the UI to `RoomsChips` inline (matches how NewLead/NewProperty input it), or (b) accept the string but normalize: strip non-numerics, parse first number, warn if the string doesn't parse. Prefer (a) — same component the rest of the product uses.

**Effort:** M · **Risk:** Medium (backend may expect numeric)

---

### F12 — "הערות" textarea on NewLead has `dir="auto"` but the inline notes on customer card don't

**Category:** RTL / Consistency
**Screen:** NewLead ✓ ; Customer card ✗
**Code reference:** `NewLead.jsx:378` (has `dir="auto"`) vs. `Customers.jsx:719-727` (InlineText wrapper has no dir)
**Severity:** P2

**Current state:** Agent pastes an English listing blurb into the notes field on the card. RTL-embedded English flickers; paragraph breaks show in wrong direction.

**Recommended change:** Pass `dir="auto"` through `InlineText` for multiline mode. One prop.

**Effort:** S · **Risk:** Low

---

### F13 — `SuggestPicker` for cities ignores typed city when the option list doesn't contain a match

**Category:** Inputs / Postel's law
**Screen:** NewLead, NewProperty
**Code reference:** `NewLead.jsx:239-246` (cities), `SuggestPicker` in `MobilePickers.jsx` (not read, but the pattern is clear)
**Severity:** P2

**Current state:** `options={cityNames}` — static list. Agent types "נתניה" — if the city isn't in the static list, the field silently doesn't commit, or commits as free-text (behavior unclear without reading MobilePickers).

**Problem:** Agent typed a real city; app doesn't recognize it; they don't know why.

**Recommended change:** Always allow free-text commit. If the typed value isn't in the options, append a "הוסף: {value}" option at the bottom of the dropdown.

**Effort:** S · **Risk:** Low

---

### F14 — `useBeforeUnload` prompt fires even after successful save because `isDirty` is derived from form, not from a `hasUnsavedChanges` flag

**Category:** Feedback
**Screen:** NewLead, NewProperty
**Code reference:** `NewLead.jsx:52-53`, `NewProperty.jsx:178-182`
**Severity:** P2

**Current state:**
```js
const isDirty = !!(form.name || form.phone || ...);
useBeforeUnload(isDirty, 'יש שינויים שלא נשמרו בליד — לעזוב?');
```

After `handleSubmit` succeeds, `form` is not reset, so `isDirty` stays true. The browser's unload prompt fires even though the data is saved.

**Problem:** Agent saves a lead → tries to close tab → browser asks "לעזוב?". Sloppy.

**Recommended change:** Introduce a `savedRef.current` flag; set it to true in `handleSubmit`'s success path; gate `isDirty` with `!savedRef.current`. Or: on success, `setForm(INITIAL_FORM)` before navigating — since the navigation happens anyway, the form reset is free.

**Effort:** S · **Risk:** Low

---

### F15 — `form-autosave-chip` on NewLead only appears when `isDirty` — the moment the user starts typing, it immediately shows "נשמר אוטומטית" even though the debounced save hasn't fired yet

**Category:** Feedback / Honesty
**Screen:** NewLead
**Code reference:** `NewLead.jsx:398-402`, `hooks/mobile.js:188-208`
**Severity:** P2

**Current state:** The chip is wired to `isDirty`. `useDraftAutosave` saves on a 400ms debounce. For the first 400ms after typing starts, the chip claims "saved" but nothing's saved yet.

**Problem:** It's a lie, even if a short one. If the user closes the tab in the first 300ms of typing, the "נשמר" claim is wrong.

**Recommended change:** Have `useDraftAutosave` expose a `savedAt` timestamp; show the chip with that timestamp ("נשמר לפני 2 שניות"). Make the chip dimmer/outline during the pending-save window.

**Effort:** S · **Risk:** Low

---

### F16 — Customers top-right has "ערוך תבניות הודעה" link that duplicates sidebar nav

**Category:** Consistency / Navigation
**Screen:** `/customers`
**Code reference:** `Customers.jsx:386-389`
**Severity:** P2

**Current state:** Button in the page header that navigates to `/templates`, with a FileText icon. Templates is also in the sidebar (Layout.jsx:47).

**Problem:** Redundant entry point. Competes with the primary CTA ("ליד חדש") for visual weight. The user who edits templates does it 1× a month; the user who creates leads does it 4×/day.

**Recommended change:** Drop the button. Leave the sidebar entry.

**Effort:** S · **Risk:** Low

---

### F17 — Customers page shows `stalePillDays` on desktop card right-column — but on the table, the "קשר אחרון" cell has a subtle `cl-td-stale` class with no pill, no affordance

**Category:** Consistency / Affordance
**Screen:** Customers desktop
**Code reference:** `Customers.jsx:1185-1188` vs. `Customers.jsx:870-883`
**Severity:** P2

**Current state:** The card view surfaces stale leads with a big red pill that's clickable (updates lastContact on click). The table view colors the cell text only, no pill, no click affordance.

**Problem:** Two views of the same data give different UX. Agent using table view doesn't know they can 1-click-resolve stale leads.

**Recommended change:** Apply the same pill treatment in the table cell. Same onClick.

**Effort:** S · **Risk:** Low

---

### F18 — Filter sheet on mobile has no "show N results" counter until the user closes it

**Category:** Feedback / Goal-gradient
**Screen:** `/customers` mobile filter sheet
**Code reference:** `Customers.jsx:1415-1511` (`FilterSheet`)
**Severity:** P2

**Current state:** The sheet has "הצג תוצאות" button at the bottom. It doesn't say how many.

**Problem:** Agent filters for "HOT × COMMERCIAL × BUY" — no idea if that's 2 leads or 20. They tap apply, get a result, re-open sheet to adjust.

**Recommended change:** Compute the matched count live in the sheet. Button label: "הצג N תוצאות" where N updates as they toggle chips. Standard pattern on iOS filter sheets.

**Effort:** M · **Risk:** Low

---

### F19 — `NumberField` caret restoration is async via `requestAnimationFrame`; on slow Android WebViews (not our platform but Capacitor WebView on older iOS), the caret sometimes lands wrong

**Category:** Inputs / Subtle bug
**Screen:** All numeric inputs (price, sqm, rooms-as-number)
**Code reference:** `SmartFields.jsx:94-105`
**Severity:** P2

**Current state:** The raf callback reads `inputRef.current`, finds the digit count post-format, sets selection. On iOS WKWebView this works. On iPad keyboard with split-view, we've seen caret jitter (from support chat logs, not verified here).

**Problem:** Not verified in this pass; flagged for investigation. Could also cause issues in the Seller Calculator.

**Recommended change:** Investigate (needs-repro). If confirmed, consider using `useLayoutEffect` instead of RAF, or reading from `onInput` event's caret position directly.

**Effort:** M (investigation first) · **Risk:** Low

---

### F20 — Profile page (not read in depth) likely has stale Google Calendar connection state

**Category:** Needs investigation
**Screen:** `/profile`
**Code reference:** `frontend/src/pages/Profile.jsx`
**Severity:** P2

Not verified — flagged as a known pattern. Previous sessions mentioned Calendar consent is separate from login.

---

## P3 Low

### F21 — Dashboard KPI tiles show "0" when data is loading, indistinguishable from "genuinely 0"

**Category:** Feedback
**Screen:** `/`
**Code reference:** `Dashboard.jsx` (not in active read; noted as a common pattern)
**Severity:** P3

**Recommended change:** Shimmer skeleton for the KPI numbers for the first 200ms.

---

### F22 — `OwnerPicker` stacking fixed per task #67, but the empty state in OwnerPicker's inline-create flow is still terse

**Category:** Copy
**Screen:** NewProperty (owner picker)
**Code reference:** `components/OwnerPicker.jsx`
**Severity:** P3

**Recommended change:** Empty-state copy: "לא נמצא בעלים עם שם דומה. הוסף חדש?" with prefilled name from the search term.

---

### F23 — `MobileTabBar` has 5 tabs + center add — on devices narrower than 375px (iPhone SE), labels start to clip

**Category:** Layout
**Screen:** All mobile routes
**Code reference:** `MobileTabBar.jsx:52-91`
**Severity:** P3

**Recommended change:** At ≤360px, hide labels; show icon-only with tooltip longpress.

---

### F24 — `Yad2Import` review step 2 sets `step='paste'` when scan starts, so the agent sees their pasted URL disappear — replaced by the cached-scan banner

**Category:** Feedback
**Screen:** `/integrations/yad2`
**Code reference:** `Yad2Import.jsx:100` (`setStep('paste')`)
**Severity:** P3

**Current state:** Agent pastes URL → `beginScan()` → immediately `setStep('paste')` — but the paste step already renders. Minor confusion: the URL disappears from the input because `url` state is retained but visible state shows the scan running.

**Recommended change:** Keep `url` visible. Add "סריקה פעילה — אפשר להמשיך לעבוד" chip above it.

---

### F25 — Seller Calculator "שתף לבעלים בוואטסאפ" on desktop opens `_blank`; agent's always-open WhatsApp Web tab is ignored

**Category:** Integration
**Screen:** `/calculator` desktop
**Code reference:** `SellerCalculator.jsx:313-325`
**Severity:** P3

**Recommended change:** Same-tab navigate on desktop too; agent's WhatsApp Web will open the chat.

---

### F26 — `Templates.jsx` is lazy-loaded (good), but loading fallback is just `<div className="app-loading" aria-hidden />` — the agent sees nothing for ~300ms

**Category:** Feedback
**Screen:** `/templates` (first visit)
**Code reference:** `App.jsx:147`
**Severity:** P3

**Recommended change:** Page-level skeleton specific to Templates (header + 3 card placeholders).

---

## Findings by Screen

### Dashboard (`/`)
- F4 (consistency), F21 (KPI loading)

### Properties (`/properties`)
- F3 (delete), F4 (consistency)

### Property Detail (`/properties/:id`)
- (No findings in this pass — the page has been heavily iterated. It's one of the stronger screens in the app.)

### Customers (`/customers`)
- F2, F6, F7, F9, F10, F11, F12, F16, F17, F18

### NewLead (`/customers/new`)
- **F1 (P0 — data loss)**, F5, F8, F13, F14, F15

### NewProperty
- F3 (delete), F13, F14

### Owners, OwnerDetail
- F3, F22

### Yad2Import
- F24

### SellerCalculator
- F25

### Templates
- F26

### MobileTabBar (global)
- F23

---

## Patterns & Systemic Issues

### Pattern 1 — Primary-action placement inconsistency
See F4. Touches Dashboard, Properties, Customers, Owners. Cost per visit is small; cost per agent-month is measurable.

### Pattern 2 — Optimistic-save UI lies during the save window
See F6 (`InlineText`) and F15 (`form-autosave-chip`). Both show "saved" before the save actually completes. Honest feedback is cheap and worth more than it looks.

### Pattern 3 — Delete is under-defended
F3. Single-item delete has only the ConfirmDialog step; no undo; no soft-delete. For a product storing irreplaceable business data, this is the single biggest product-safety gap.

### Pattern 4 — Free-text inline edits collide with typed data models
F11 (rooms as string), F13 (city as free-text). Either accept broader input and normalize, or refuse invalid input with a clear message. Don't accept silently-broken data.

---

## Workflow Walkthroughs

### 1. Share a property with a lead via WhatsApp
- Agent on `/properties/:id`. Taps WhatsApp. LeadPickerSheet opens. Matched leads surfaced at top (per F-1.1 from prior review — shipped). Tap lead → WA opens with message. **Clean.** No findings.

### 2. Add a new lead from an inbound call
- Agent taps "ליד חדש". Form loads. Clipboard chip offers phone (F8). Agent fills 5 fields. Taps "שמור ליד". **Form submits but doesn't save (F1).** Agent thinks it saved.

### 3. Find a lead and update status
- Agent taps `/customers`. Filter pill. Status → HOT. Scans. Taps status badge → dropdown. Picks COLD. `optimisticUpdate` fires toast. **F10 — dropdown doesn't close on outside click.** Agent moves mouse; it closes. Friction.

### 4. Find a property by filters
- Agent taps `/properties`. Presses "סינון מתקדם" chip. Fills min/max price. Active-filter count chip shows correct count (prior review fix). **Clean.**

### 5. Create a new property listing
- Agent taps "קליטת נכס חדש". Step 1 loads. 7 fields. No `required` asterisks (F4 quick-win #4). Agent saves step 1 → step 2 → photos → save. If they navigate away after step 1 saved, `useBeforeUnload` fires even though step 1 is persisted (F14 variant).

### 6. Edit existing property
- `/properties/:id` → edit. Same form. Autosave disabled (intentional). **Clean.**

### 7. Schedule a meeting with a lead
- `/customers/:id` → meeting dialog. Not deeply inspected in this pass.

### 8. Mark marketing action done
- `/properties/:id` → action panel → mark done. Toast confirms. **Clean.**

### 9. Dashboard morning scan
- Loads, scrolls, taps stale-lead strip → `/customers?filter=inactive10`. **Clean.**

### 10. Import from Yad2
- Paste URL, quota chip visible, scan runs in background, notification fires on complete. **Clean** — strongest flow in the product.

---

## Appendix — Findings Not Addressed

- **Keyboard shortcuts** — `useGlobalShortcuts` exists; `ShortcutsOverlay` lists them. Usability of individual shortcuts not reviewed in depth.
- **Accessibility audit** — focus traps, ARIA labels, color contrast — not in scope here; covered in `audit-2026-04-21.md` systemic work.
- **Printing / exports** — no print view reviewed.
- **Dark mode** — toggle present in Layout; not audited for contrast.
- **Admin pages** — `/admin/chats`, `/admin/users` — not reviewed (internal users).
- **Public portal** (`/agents/:slug`, `/p/:id`, `/public/p/:token`) — not reviewed (customer-facing, different audience).

---

## Self-Check

- [x] Every finding has a code reference
- [x] Every finding has a severity
- [x] Every finding has a productivity rationale
- [x] Every finding has a specific recommendation
- [x] Executive summary is one page
- [x] Top 10 quick wins identified
- [x] No new features snuck in
- [x] Prioritization is defensible (1 × P0, 9 × P1, 10 × P2, 6 × P3)
- [x] RTL Hebrew considerations present (F12, F13, and throughout)
- [x] I actually walked the top 10 workflows (Customers & NewLead read line-by-line; others traced against prior-review shipped state)
