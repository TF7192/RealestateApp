# Estia CRM — UX & Bug Audit

> Live walkthrough of **https://estia.tripzio.xyz** performed on 2026-04-17.
> Scope: usability first, then bugs, then flow changes, then automated +
> user-input suggestions. No new features — only polish and fixes to
> what already exists.
>
> Each task is written so a future Claude session can pick it up and
> close it without more context. Paths are relative to the frontend
> repo root unless stated otherwise.
>
> Legend: **🐞 bug** · **🧭 flow/UX** · **🪄 automation** · **✍️ user input**
> · **♿ accessibility** · **⚡ performance/polish**

---

## Priority 0 — Must fix (data-correctness or destructive actions)

### P0-1 🐞 Seed uses absolute dates that are now ~1 year stale
Every customer's auto-computed status reads **"קר: קשר אחרון לפני 369 ימים"**
because seed rows carry `lastContact: '2025-04-12'` etc. while the app is
running in 2026. Result: every hot lead looks cold, every customer gets
the banner **"הצעה אוטומטית שונה מהסטטוס הנוכחי"**, and the system's
smartest feature (auto-status) is actively misleading.

- **Fix:** in `backend/prisma/seed.ts`, replace literal ISO strings with
  `const daysAgo = (n) => new Date(Date.now() - n * 86400_000)` and pass
  plausible offsets (hot: 1–5 days, warm: 7–21, cold: 45+).
- Same treatment for `exclusiveStart` / `exclusiveEnd` on properties and
  `signedAt` on deals so the pipeline looks alive.
- Reseed via `npx prisma db seed` (or add an idempotent update path if
  production has user data).

### P0-2 🐞 Destructive delete has no confirmation
**`/properties`** — each card has a **"מחיקת נכס"** button that sits
right next to **"שלח ללקוח"**. Fat-finger on mobile = silent listing
wipe. Same on property detail (**"מחיקה"** adjacent to **"עריכה"**).
No styling differentiates destructive from safe actions.

- **Fix:** wire a confirm sheet (mobile) / modal (desktop) with the
  property address and owner name echoed back before executing delete.
- Style destructive actions: red text + outline only; never solid-filled.
- Apply the same treatment to **customer "מחיקה"** (on `/customers`) and
  the property edit page.

### P0-3 🐞 `/properties/:integer-id` returns "הנכס לא נמצא"
IDs migrated to `cmo…` cuids but any old WhatsApp links, printed QR
codes, or customer bookmarks that used `/properties/1…9` now 404.
`/p/1` likely has the same issue.

- **Fix:** add a server redirect for numeric ids → the current cuid. If
  the mapping is unknown, render a branded "הנכס הועבר — לחץ כאן לחזרה
  לקטלוג" page instead of the generic error.

### P0-4 🐞 `?selected=<id>` on `/customers` is a no-op
Dashboard hot-leads links (`/customers?selected=cmo…`) land on the list
but don't scroll-to, highlight, or expand the target card. Deep-linking
intent is lost; the agent has to re-find the lead.

- **Fix:** on mount read `?selected`, scroll the card into view (`scrollIntoView({block:'center'})`), and give it a 2-second gold outline pulse.
- If views `כרטיסים`/`רשימה` don't surface the row when a filter hides
  it, auto-clear filters when coming from a direct link (with a dismissible banner: "ניווט ישיר לנועה אלון — נוקה סינון").

### P0-5 🐞 Source `<select>` submits the placeholder
`New customer → מקור הליד` defaults to `"בחר מקור..."` as a selected
option. Submitting without changing it stores the literal placeholder
string as the lead's source. Will pollute analytics later.

- **Fix:** make the placeholder a disabled option (`disabled hidden`),
  add `required`, and validate on submit.

---

## Priority 1 — High-impact usability

### P1-1 🧭 Relative timestamps everywhere
Still absolute in most places:
- Customer card last-activity button: `13.04.2025`, `15.04.2025` …
- Agreement dates: `2.4.2025 → 2.10.2025`
- Exclusivity dates on property detail: `1.2.2025 → 1.10.2025`
- Deals: `17.4.2026`

Meanwhile the auto-status tooltip already uses relative ("לפני 369 ימים")
so the code exists. Propagate it.

- **Fix:** `src/lib/time.ts` helper `relative(date)` returning "לפני 3
  ימים" / "היום" / "מחר" / "בעוד שבוע" in Hebrew, falling back to
  absolute ≥ 60 days out. Absolute date stays as a `title="…"`
  attribute + tap-to-reveal on mobile.
- Apply to: CustomerCard, DealCard, PropertyDetail exclusivity block,
  dashboard KPIs ("עמלות — חודש זה"), `lastContact` everywhere.

### P1-2 🧭 Property-card filter chips are unreachable on mobile
The clever `הצג נכסים בגודל דומה / בעיר X / עם חדרים זהים` buttons only
appear on hover on desktop; on touch devices they're effectively
invisible. Worse, they live *inside* the card's `<a>` tag so a tap
likely bubbles up to the card's own navigation.

- **Fix:** make the chips always visible as subtle inline text links
  under the specs, styled like a secondary link ("· דומים באותה עיר").
- `e.stopPropagation()` on their click handlers to prevent bubbling to
  the parent `Link`.
- On mobile, collapse to a single `⋯` menu with the 2–3 options.

### P1-3 🧭 Light/dark toggle still effectively one-way
`localStorage['estia-theme']` is being read (value `"dark"`), but
clicking the toggle button does not flip it; button text stays
"מצב בהיר". Either the handler is broken or the state isn't wired to
the provider.

- **Fix:** audit the toggle component — the click should call a setter
  that (a) updates the React context, (b) writes to localStorage, (c)
  flips `document.documentElement.dataset.theme`, and (d) relabels the
  button to "מצב כהה" when already light.
- On first visit honour `prefers-color-scheme` instead of defaulting
  to dark.
- Persist across full reloads.

### P1-4 🧭 Marketing actions are grouped — finish the job
The 3-group refactor (`פרסום דיגיטלי 8/8`, `שטח ופרינט 9/9`, `פעילות
סוכנים 4/5`) is live — excellent. Remaining small wins:
- Group headers are buttons but it's unclear they collapse. Add a
  chevron that rotates on expand + a hairline divider under the group.
- Completed groups (e.g. 8/8) should auto-collapse on page load so the
  agent's attention lands on the group with work left.
- Clicking an action still reloads the whole route. Make it
  optimistic: toggle UI state locally → fire the PUT → rewind + toast
  on failure. There are 22 items — each full-page round trip is felt.

### P1-5 🧭 "צפה כלקוח" on property detail is great — extend it
Only one button in the CRM takes the agent to the customer's view of
the listing. Customers page doesn't offer an equivalent "פתח כלקוח"
that shows the agent what the filtered catalog looks like to a
specific lead.

- **Fix:** on each customer card, add a "פתח קטלוג מותאם" button that
  opens `/a/:agentToken?filters=…` with filters derived from the
  customer's criteria.
- Same concept, no new data.

### P1-6 🧭 Action hierarchy on customer card is flat
A single card shows 5 equally-weighted buttons:
`tel:` | `שלח בוואטסאפ` | `ניהול הסכם תיווך` | `עריכה` | `מחיקה`.
Decision cost is high.

- **Fix:** promote **WhatsApp** to filled primary (used 80% of the time);
  demote `עריכה` / `מחיקה` to a `⋯` overflow menu; move `ניהול הסכם
  תיווך` to an icon-button with tooltip.

### P1-7 🧭 "תצוגה מקדימה ושיתוף" on dashboard needs a preview modal
Today: click → (nothing visible besides maybe a toast/clipboard copy).
The agent is sharing something that *represents them*. They should see
what the customer will see, once, before pasting.

- **Fix:** dropdown / small modal — show the catalog hero card with
  the agent's photo, bio excerpt, listing count; three buttons:
  **העתק קישור · שתף בוואטסאפ · פתח תצוגה מקדימה**.

### P1-8 🧭 Property card missing monthly suffix on some rent listings
- Card for "סוקולוב 12 · השכרה" shows `₪12,000` (no /חודש).
- Card for "בן גוריון 15 · השכרה" shows `₪4,500/חודש` (correct).
  Likely a threshold check (`< 10000` gets `/חודש` per `formatPrice`).

- **Fix:** use `category === 'rent'` as the branch instead of a price
  threshold. Apply `/חודש` for every rent listing regardless of value.

### P1-9 🧭 Dashboard "שלום, יוסי" — localize by time of day
The strip already says "סיכום פעילות יומי". The heading could alternate
with the time of day: `בוקר טוב`, `צהריים טובים`, `ערב טוב`, `לילה טוב`.
Mobile MobileLayout already does this — port the helper into the
desktop Dashboard.

---

## Priority 2 — Quality passes

### P2-1 🧭 Inline editing on customer cards — finish the pattern
`"לחץ לעריכה"` on עיר / חדרים / תקציב / הסכם תיווך is live. Remaining:
- No visible affordance (no pencil icon, no underline) — agents won't
  discover it without trial-and-error. Add a subtle dashed underline on
  hover + a pencil on focus.
- Escape does not cancel; Enter does not save. Wire both.
- When saving fails, the UI has no error toast — user thinks it saved.

### P2-2 🧭 New-property wizard says "7 שדות" but has 8
Step 1 copy claims `"7 שדות · שמירה יוצרת את הנכס"` but the form has 8
(סוג נכס, מכירה/השכרה, מחיר שיווק, רחוב, עיר, שטח, שם בעלים, טלפון).

- **Fix:** either trim to 7 (merge `סוג נכס` + `מכירה/השכרה` into one
  double-toggle row) or update the copy.
- While you're there: the empty `שם מלא` textbox has no placeholder —
  add `"שם פרטי ומשפחה"` for parity with the other fields.

### P2-3 🧭 `/customers` — add a `/customers/:id` detail view
Today the list shows cards inline. You can edit a field inline but
can't see a customer's timeline, the listings you've sent her, or the
WhatsApp message log.

- **Fix:** route `/customers/:id` rendering the card full-width plus
  an activity timeline (event feed already recommended elsewhere, keep
  scope tight: use existing data — property-views count, agreement
  history, last WhatsApp sent time).

### P2-4 🧭 Deal kanban — horizontal, not vertical
Four stages today stack as tall rows. An empty stage
(`לקראת חתימה · אין עסקאות`) consumes ~100px of dead scroll. Swap to a
4-column horizontal board whose columns widen/narrow by card count.
Empty columns collapse to a 56 px wide "אין עסקאות בשלב זה" pill.

- Include drag-to-move between columns (HTML drag-drop is fine for
  desktop; long-press on mobile).

### P2-5 🧭 "פרטי <action-name>" buttons on marketing actions
Today each marketing action has a sibling `פרטי` button — its visible
text is empty, only aria-label reveals the target (`פרטי on map`).
Non-sighted users and tooltip-less touch users see a naked icon.

- **Fix:** render a tiny action-name chip next to the icon on hover,
  or inline the details affordance as a chevron inside the action
  button itself.

### P2-6 🧭 Empty state copy passes
- `/transfers` empty state is good. Add a small "איך זה עובד?" link to a
  one-screen explainer so an agent knows what they can do here.
- `/customers` with 0 results after filter — currently just cards don't
  render (no explicit empty state seen). Add one.
- `/properties` with 0 results after filter — same.

### P2-7 🧭 Loading / skeleton states
Every navigation between pages shows a brief blank canvas. Add a
skeleton (shimmer card placeholders) matching the target layout for the
first 300ms. Perceived speed doubles at no real cost.

### P2-8 🧭 Activity feed (dashboard) was present earlier — reintroduce
The first walk saw "רינה שמעון ביקרה בנכס… · לפני שעתיים". The latest
version no longer shows it. If it was removed, re-add: right rail on
desktop, above-the-fold section on mobile. Consumes existing events.

### P2-9 🧭 "הכל" link on hot-leads strip should preserve filter
Dashboard "לידים חמים → הכל" goes to `/customers` unfiltered. The agent
expected `?filter=hot`.

- **Fix:** set `href="/customers?filter=hot"` on that specific link.

### P2-10 ⚡ Pagination / virtualization on long lists
`/customers` renders every card at once. At 100+ leads the page will
become sluggish.

- **Fix:** react-virtuoso or react-window; or paginate server-side
  with "טען עוד" infinite scroll.

---

## Priority 3 — Accessibility

### P3-1 ♿ Unlabelled gallery controls
Property detail gallery has four `button`s with empty accessible names:
prev, next, manage images, manage videos on the left; fullscreen/zoom on
the right. Screen readers announce "button".

- **Fix:** add `aria-label` to each (`תמונה קודמת`, `תמונה הבאה`,
  `מסך מלא`, etc.).

### P3-2 ♿ Status chip on customer card
The chip containing the "קר: …" explanation is a button (correct) but
its visible text is just the dot color; the sentence is only in
aria-label. Sighted users can't read it without a tooltip, and no
tooltip seems to render on hover.

- **Fix:** add a lightweight tooltip component that fires on hover AND
  focus, with a mobile long-press equivalent.
- Consider showing a short reason inline in muted text: `קר · 369 ימים ללא קשר`.

### P3-3 ♿ Focus rings
Audit every interactive element — several buttons have `outline: none`
with no replacement. Unify: 2px solid `var(--gold)` ring on
`:focus-visible` for every button, input, and link. Mobile keyboard
users (external keyboard on iPad, accessibility navigation) will
thank you.

### P3-4 ♿ Form labels vs placeholders
Some fields use the placeholder as the only label (customer search
input at the top of `/customers`). Screen readers will announce
"textbox" with no name.

- **Fix:** add a visible or visually-hidden `<label>` for every input.

### P3-5 ♿ Color-only status signalling
Customer status dot relies on red/yellow/blue. Add a glyph
(🔥/🌤️/❄️ — or icon equivalents) so color-blind users can read status.

---

## Priority 4 — Flow improvements

### P4-1 🧭 Back-navigation consistency
- After saving new property → lands on `/properties` list (good).
- After saving new customer → lands on `/customers` list (good).
- After editing a property → lands on `/properties` list (would prefer
  returning to the same property detail page, which is where the agent
  came from).
- After editing a customer inline → ?.

- **Fix:** use `navigate(-1)` for edit flows; keep create flows landing
  on the list.

### P4-2 🧭 Unify the "+ add" entry points
Header has two separate links: `קליטת נכס` and `ליד חדש`. Sidebar has
the same under "פעולות מהירות". Mobile bottom tab bar has a centre
`+` FAB. Desktop could pick the same pattern: one `+` button with a
popover; keyboard shortcuts (`P` for property, `L` for lead).

### P4-3 🧭 Customers: sub-tab `פניות חדשות / לקוחות פעילים` shows 0 vs 6
With all 6 leads lacking a signed-agreement-in-date, the "פעילים" tab
is empty. But the primary filter (the chip row underneath) doesn't
reset when switching sub-tabs — if you were filtered to `חם` you'll see
`0 · no cards` and it's unclear if that's "no actives" or "filter too
narrow".

- **Fix:** when switching sub-tabs, clear the primary filter chip row
  (or show a banner: "סינון 'חם' פעיל — נקה").

### P4-4 🧭 Consolidate CTA copy
- "העתק קישור שיתוף לקטלוג האישי" (sidebar)
- "תצוגה מקדימה ושיתוף" (dashboard)
- "העתק קישור" (profile, property detail, customer portal)
- "שתף בוואטסאפ" (profile)

Same basic action, 4 phrasings. Settle on: `שתף` (primary verb) +
icon; everything else is a secondary verb on hover (`העתק קישור`,
`וואטסאפ`, `תצוגה מקדימה`).

### P4-5 🧭 Customer public catalog — missing "איך מגיעים" suggestion
Public `/p/:id` has `פתח בגוגל מפות` as a link inline. It also fires
outside the app. On mobile, consider offering Waze alongside Google
Maps (Israeli buyers use Waze daily).

---

## Priority 5 — Automation suggestions (no new features, just behaviors)

These are behaviors the system should trigger *on its own*, using data
that already exists.

### P5-1 🪄 Auto-suggest status change when manual ≠ automatic
The "הצעה אוטומטית שונה מהסטטוס הנוכחי" banner already appears on
customer cards. Today it's informational.

- **Fix:** one-tap "החל הצעה" button on the banner that flips the
  manual status to the suggestion, with undo.

### P5-2 🪄 Auto-fill brokerage-agreement end date on sign-date change
Already implemented on the mobile flow (I saw it in the handler). Apply
the same on the desktop New Lead form so the `מועד סיום` date jumps to
+6 months whenever `מועד חתימה` is set.

### P5-3 🪄 Auto-bump `lastContact` when agent clicks tel: / wa:
Any click on a customer's `tel:` or `wa.me` link should optimistically
set `lastContact = now` on the lead. Recomputes auto-status, fixes
P0-1 drift over time.

### P5-4 🪄 Auto-suggest matching leads when a new property is saved
On property-create success, query leads where
`priceMin ≤ property.price ≤ priceMax AND rooms overlap AND city ==
property.city`. If the list is non-empty, show a toast "2 לידים
תואמים — פתח רשימה" with a direct link. No new feature — matching data
already exists.

### P5-5 🪄 Auto-suggest matching properties when a new lead is saved
Symmetric to P5-4 — on lead-create success, list the top 3 matching
portfolio properties on the confirmation screen.

### P5-6 🪄 Auto-alert 30/14/7/1 days before brokerage-agreement expires
`brokerageExpiresAt` is already in the schema. A nightly cron creates
an in-app notification; customer card gains a red ring + days-left
badge when within 30 days.

### P5-7 🪄 Auto-alert 30/14/7/1 days before property exclusivity expires
Same pattern, `exclusiveEnd` field.

### P5-8 🪄 Auto-collapse completed marketing-action groups (see P1-4)

### P5-9 🪄 Auto-scroll to `?selected=` on /customers (see P0-4)

---

## Priority 6 — User-input ergonomics

### P6-1 ✍️ City / street autocomplete everywhere
The New Customer form uses an autocomplete combobox on `עיר` / `רחוב`.
The New Property wizard step 1 has a plain textbox for `עיר` with only
placeholder `"רמלה"`. Same treatment, please — same dropdown lists
(`cityNames`, `streetCoords`).

### P6-2 ✍️ "מספר חדרים" is a textbox encouraging "4-5"
Customer form accepts any string. Leads end up with `4-5`, `ארבעה`,
`4.5` — inconsistent, breaks matching.

- **Fix:** replace with a dual-slider (min / max rooms 1–8 in 0.5
  steps) or a chips row (`2`, `3`, `3.5`, `4`, `5+`).

### P6-3 ✍️ Sector field — auto-suggest from city
`מגזר` today is a free dropdown. For `בני ברק` / `ירושלים / שכונות X`
it's almost always `חרדי`; for other places almost always `כללי`.
Keep the field editable but pre-select the common answer when the
agent picks a city.

### P6-4 ✍️ Phone-number formatting
Accept `050-1234567`, `0501234567`, `+972501234567` — normalise on
save. Display always as `050-123-4567`. Strips the ambiguity for
WhatsApp deep-links.

### P6-5 ✍️ Save-on-blur for inline edits (P2-1 extension)

### P6-6 ✍️ Drag-and-drop image upload
New Property wizard step 2 presumably shows an image upload. Make it
accept drag-and-drop from Finder/Files plus iOS Share Sheet on mobile.

### P6-7 ✍️ Saved filter presets on `/properties`
Let the agent save a filter set as "מגורים · 3 חד׳ · רמלה · עד 1.5M"
and re-apply with one click from the sidebar's "סינונים שמורים" list.
Data model: a tiny `SavedFilter` row per agent. Pure ergonomics.

### P6-8 ✍️ Keyboard shortcuts
- `⌘K` — command palette (planned but not shipped).
- `N` — new property, `L` — new lead (chord with current context on
  the list pages).
- `/` — focus the search box on the current list.

---

## Priority 7 — Visual consistency

### P7-1 ⚡ Status badge component
Property card shows `מגורים / מסחרי` + `מכירה / השכרה` as two separate
pills. Customer card shows `פרטי · פרטי` as plain text with a middle
dot. Deal card shows both as smaller pills. Ship one `<Badge>` primitive
and replace them all.

### P7-2 ⚡ Hero image gradient on `/p/:id` + property detail
When the hero image is bright, the floating price/address text becomes
illegible. Apply a 30% bottom-to-transparent gradient overlay so the
text is always readable.

### P7-3 ⚡ Price hierarchy on deal card
`₪3,200,000` (marketing) and `₪3,100,000` (offer) render at the same
weight and colour. Make marketing-price muted grey and offer gold so
the agent sees the offer instantly.

### P7-4 ⚡ Scrollbar styles
Custom `::-webkit-scrollbar` looks great on dark mode; audit it on
light mode once P1-3 ships.

### P7-5 ⚡ Favicon & apple-touch-icon
Confirm both include the Estia ◆ glyph on a dark square at
192×192 and 512×512, and that the light-mode favicon inverts correctly.

---

## Priority 8 — Micro-copy nits

### P8-1 ✍️ "מצב בהיר" → "עבור למצב בהיר" (or "☀ בהיר / 🌙 כהה")
Ambiguous imperative vs. declarative.

### P8-2 ✍️ "שמור ליד" → "שמור את הליד"
Reads more naturally.

### P8-3 ✍️ "ליד חדש" vs "לקוח חדש"
Header, sidebar, and customer list all say "ליד חדש" (lead). The page
title is "ליד חדש" but the section heading is "פרטי לקוח". Pick one —
either ליד or לקוח — and use it everywhere, or clarify when each applies
(ליד = pre-signed, לקוח = post-signed — if that distinction is
intentional, state it in a short hint).

### P8-4 ✍️ "פניות חדשות / לקוחות פעילים" sub-tab copy
The distinction is: signed agreement vs. not. Say it: `ללא הסכם תיווך` /
`עם הסכם תיווך בתוקף`.

### P8-5 ✍️ Public-catalog button copy
`"שלח הודעה לסוכן על הנכס הזה"` on every card is long. Shorten to
`"וואטסאפ לסוכן על נכס זה"` or just an icon button with tooltip.

---

## Quick-win sprint (what I'd merge first)

One-day PR, ~30 min each, all visual/polish, zero backend risk:

1. **P1-3** persist dark/light toggle (and fix the broken click handler)
2. **P1-1** relative timestamps via a single `relative()` helper
3. **P0-5** disable placeholder option on `מקור הליד`
4. **P0-2** destructive-action confirm modal (shared component)
5. **P1-8** `/חודש` suffix on all rent listings (one-line fix)
6. **P4-4** unify share-button copy
7. **P2-6** empty states for filtered-zero lists

Bigger follow-ups (half-day each):

8. **P0-1** reseed with relative dates
9. **P0-4** `?selected=` scroll + highlight
10. **P1-4** optimistic marketing-action toggle
11. **P1-2** mobile-accessible filter chips
12. **P5-3 / P5-4 / P5-5** matching auto-suggestions
13. **P2-4** horizontal deals kanban with drag

---

## Verification notes for the next Claude session

When closing any task above:

- Run the dev server (`cd frontend && npm run dev`) and verify the
  change at `http://localhost:5173`.
- For mobile-specific fixes, toggle DevTools responsive mode to
  390×844 (iPhone 14 Pro).
- After a backend change, `cd backend && npx prisma db seed` or the
  equivalent migration, then redeploy per `memory/reference_ec2.md`.
- Tag this file's line(s) in the commit message ("closes P0-4 per
  ESTIA_UX_AUDIT.md").
- Delete completed items from this file so it stays a living backlog.
