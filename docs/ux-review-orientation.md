# Estia — UX Review Orientation

**Date:** 2026-04-22 (revised from 2026-04-21)
**Reviewer:** Claude Opus 4.7 (senior UX review stance)
**Purpose:** Ground-truth sheet before producing the full findings doc. Not for distribution.

## Product map (routes the review walks)

| Route | Job | Who uses it | Daily use? |
|---|---|---|---|
| `/` | Dashboard — KPIs + hot leads + marketing progress | Agent | Yes (start of day) |
| `/properties` | Property inventory + filters | Agent | Yes (heavy) |
| `/properties/:id` | Property dashboard | Agent | Yes (heavy) |
| `/properties/new` · `/:id/edit` | Two-step property wizard | Agent | Few times/week |
| `/customers` | Lead inventory + filters + inline edit | Agent | Yes (heavy) |
| `/customers/:id` | Lead profile + activity timeline | Agent | Yes (follow-up moments) |
| `/customers/new` | Single-page lead intake | Agent | Every call |
| `/owners` | Owner address book | Agent | A few times/week |
| `/owners/:id` | Owner detail + their properties | Agent | Weekly |
| `/deals` | Kanban pipeline + signed grid | Agent | Weekly |
| `/integrations/yad2` | Scrape + select + import | Agent | Occasional (batch) |
| `/calculator` | Seller fee calc | Agent | Per listing chat |
| `/templates` | Message template editor | Agent | Setup + tweak |
| `/transfers` | Property hand-off inbox | Agent | Rare |
| `/profile` | Profile + Google Calendar | Agent | Setup |
| `/admin/chats` · `/admin/users` | Admin support | Admin | Internal |
| `/agents/:slug` · `/agents/:slug/:prop` | Public portal (customers see this) | Agent's leads | Many/day |
| `/public/p/:token` | Public prospect-sign page | Prospect | Rare kiosk use |

## Top-5 most-used screens (my read)

1. **`/properties` — property list.** Agents live here. Search, filter, cards, WhatsApp handoff.
2. **`/properties/:id` — property detail.** The agent's control panel per listing.
3. **`/customers` — lead inventory.** Daily follow-up driver.
4. **`/customers/:id` — lead profile.** The "I'm about to call this person" screen.
5. **`/` — dashboard.** Morning glance; KPI tiles + today strip.

## Day in the life — what the agent's day looks like through this app

- **Morning:** Opens `/`. Scans KPI tiles, hot leads, stale-follow-up strip.
- **Mid-morning:** A call comes in → `/customers/new`. Pastes a phone number from WhatsApp. Fills minimal fields.
- **Late morning:** Visits a seller's apartment. Back at their desk (or on the iPhone app): `/properties/new`, fills Step 1 address + owner, takes photos later on Step 2.
- **Afternoon:** Buyer calls with criteria. `/customers/:id` → edit. Finds matching properties via match pill. Opens `/properties/:id` → WhatsApp → sends.
- **Afternoon:** Schedules a showing via the lead page → Google Calendar.
- **End of day:** `/deals` — updates one deal's stage. `/properties` — marks a few marketing actions as done.

This review walks **exactly** that path, not random corners of the app.

## Top 10 workflows, ranked by daily importance

1. **Share a property with a lead via WhatsApp** (10–40× / day). The single most common outbound action.
2. **Add a new lead from an inbound call** (2–8× / day).
3. **Find a lead and update status or notes** (5–15× / day).
4. **Find a property by filters** (5–20× / day).
5. **Create a new property listing (2 steps + photos)** (3–10× / week).
6. **Edit an existing property's price / status / notes** (3–10× / day).
7. **Schedule a meeting with a lead** (1–3× / day).
8. **Mark a marketing action done on a property** (3–10× / day).
9. **Dashboard morning scan** (1× / day, eyes-only).
10. **Import from Yad2 in batch** (occasional, setup-time mostly).

**Implication for prioritization:** a 5-second friction in #1 (WhatsApp handoff) costs more per day than a 2-minute friction in #10 (Yad2 import). The review leans hard on #1–#4.

## What I am NOT reviewing

- New features (brief explicitly forbids it).
- Backend, DB, deploy, observability (covered in `docs/audit-2026-04-21.md`).
- The iPhone app's distinct surfaces (different product, separate review).
- Competitor comparison.

## Review stance

Senior critic, not polite. Every finding has a code reference, a productivity cost, and an actionable rec. No "might consider".
