# Estia Test Coverage — Audit 2026-05-01

Snapshot of what is and isn't covered by automated tests, taken
right after the Phase-0 CI repair landed (commits `1c0a2b5`..`3154455`).
Local totals: **1,476 tests across 188 files green** (backend unit
112, frontend project 550, unit-frontend 314, integration 500), plus
the 23 Playwright `@critical`/full E2E specs and the 5 Playwright
perf specs.

This doc is a living deliverable for Phase 1 of the test plan in
`/Users/adam/.claude/plans/reflective-painting-wolf.md`. It exists to
make gaps visible so Phase 2 can target them; it is **not** a CI gate.

---

## 1 · Backend route → integration test matrix

48 route files in `backend/src/routes/`. The `Coverage` column flags:
✓ direct test file, △ indirect (covered as a side effect of another
file), ✗ uncovered.

| Route file | Endpoint count | Coverage | Test file(s) |
|---|---|---|---|
| activity.ts | 1 | ✓ | activity.test.ts |
| admin.ts | 5 | ✓ | admin.test.ts |
| adverts.ts | 4 | ✓ | adverts.test.ts |
| agents.ts | 1 (public) | △ | covered via public.test.ts |
| agreements.ts | 4 | △ | top-level `agreements-cross-agent.test.ts` |
| ai.ts | 8 | ✓ | ai-chat / ai-describe / ai-match / ai-meeting-brief / ai-offer (+ premium-gate) |
| auth.ts | 7 | ✓ | auth.test.ts, auth-reset.test.ts, auth-reset-rate-limit.test.ts, auth-mock-prod-guard.test.ts, account-delete-and-onboarding.test.ts |
| calendar.ts | 8 | ✓ | calendar.test.ts |
| chat.ts | 11 (incl. WS) | ✓ (REST), **✗ (WS)** | chat.test.ts (REST only) |
| contact.ts | 1 | ✓ | contact.test.ts |
| contracts.ts | 5 | ✓ | contracts.test.ts |
| dashboard.ts | 3 | △ | hit through marketing-overview.test.ts side effects |
| deals.ts | 5 | ✓ | deals.test.ts |
| documents.ts | 4 | ✓ | documents.test.ts |
| **geo.ts** | 2 | **✗** | — |
| **import.ts** | 4 | **✗** | — |
| leadSearchProfiles.ts | 4 | ✓ | lead-search-profiles.test.ts |
| leads.ts | 7 | ✓ | leads.test.ts, lead-filters.test.ts, lead-contact.test.ts |
| lookups.ts | 3 | △ | implicit in property/owner tests |
| **market.ts** | 5 | **✗** | — |
| marketDiscovery.ts | 7 | △ | covered partially in saved-searches-favorites.test.ts |
| marketing.ts | 3 | ✓ | marketing-overview.test.ts, marketing-promote-inquiry.test.ts |
| marketingTrack.ts | 1 | ✓ | track-view.test.ts |
| me.ts | 9 | △ | profile.test.ts hits the major paths |
| meetings.ts | 6 | ✓ | meetings-list.test.ts, meeting-summarize.test.ts |
| mlsSprint7.ts | 9 | ✓ | neighborhood-groups.test.ts + neighborhoods-admin-only.test.ts + saved-searches-favorites.test.ts (file is the neighborhoods/saved-searches/favorites bundle) |
| neighborhoodGroups.ts | 4 | ✓ | neighborhood-groups.test.ts, neighborhoods-admin-only.test.ts |
| notificationPreferences.ts | 2 | △ | indirect via notifications.test.ts |
| notifications.ts | 3 | ✓ | notifications.test.ts |
| oauth-apple.ts | 1 | △ | covered minimally via auth.test.ts |
| oauth-google.ts | 3 | △ | mock path in auth-mock-prod-guard.test.ts |
| office.ts | 12 | ✓ | office.test.ts, office-invites.test.ts |
| owners.ts | 9 | ✓ | owners.test.ts, owner-phones.test.ts |
| properties.ts | 25 | ✓ | properties.test.ts, property-assignees.test.ts, property-extras.test.ts, property-pipeline.test.ts |
| prospect-pdf.ts | 1 | ✓ | prospect-pdf.test.ts |
| prospects.ts | 5 | ✓ | prospect-public-token-no-pii.test.ts |
| public-matches.ts | 7 | ✓ | public.test.ts (alias) |
| public.ts | 9 | ✓ | public.test.ts |
| reminders.ts | 5 | ✓ | reminders.test.ts |
| reports.ts | 9 | ✓ | reports.test.ts |
| search.ts | 1 | ✓ | search.test.ts |
| **sitemap.ts** | 1 | **✗** | — |
| tags.ts | 7 | ✓ | tags.test.ts |
| team.ts | 3 | ✓ | team-stats.test.ts, team-scoreboard.test.ts |
| templates.ts | 3 | ✓ | templates.test.ts |
| transfers.ts | 6 | ✓ | transfers.test.ts |
| voice-ingest.ts | 1 | ✓ | ai-voice.test.ts |
| yad2.ts | 9 | ✓ | yad2.test.ts |

**Direct gaps**: `geo.ts`, `import.ts`, `market.ts`, `sitemap.ts`.

**Thin coverage** (covered indirectly only — would catch contract
drifts but not edge cases): `dashboard.ts`, `agents.ts`,
`notificationPreferences.ts`, `me.ts`, `oauth-apple.ts`,
`oauth-google.ts`, `lookups.ts`, `marketDiscovery.ts`.

**Surface size note**: `properties.ts` is 25 endpoints but only 4 of
the 7 mutation endpoints (offers, assignees, agreement, marketing-
actions, videos, images, ai-edit, duplicate) have direct tests — the
rest are happy-path-only via the integration smoke. Consider
expanding when one of those endpoints regresses.

---

## 2 · Frontend page → test matrix

63 page files in `frontend/src/pages/`. Tests live in
`tests/frontend/pages/` (component/MSW-mocked Vitest) and
`tests/e2e/` (Playwright). Coverage column: ✓ Vitest page test, ◯
E2E only, △ indirect via integration tests, ✗ none.

| Page | Coverage | Tests |
|---|---|---|
| ActivityLog | ✓ | ActivityLog.test.tsx |
| Admin | ◯ | admin.spec.ts |
| AdminChats | ✗ | — |
| AdminGrafana | ✗ | — |
| AdminMarketWatcher | △ | admin.test.ts (server side) |
| AdminMonitoring | ✗ | — |
| AdminUsers | △ | admin.test.ts |
| AgentCard | ✗ | — |
| AgentPortal | ✓ | AgentPortal.test.tsx |
| AgentTransferView | ◯ | transfers/agent-to-agent (todo) |
| Ai | ✗ | — (Estia AI chat surface) |
| Buyers | ✗ | — (replaced/legacy?) |
| Calendar | ◯ | calendar/calendar.spec.ts |
| Contact | ✗ | — |
| ContractDetail | △ | contracts.test.ts |
| Contracts | △ | contracts.test.ts |
| CustomerDetail | ✓ | CustomerDetail.test.jsx |
| CustomerPortal | ✗ | — |
| CustomerPropertyView | ✗ | — |
| Customers | ✓ | Customers.test.jsx |
| Dashboard | ✓ | Dashboard.test.tsx |
| DealDetail | ◯ | deals/create-deal.spec.ts |
| Deals | △ | deals.test.ts |
| Documents | △ | documents.test.ts |
| ForgotPassword | △ | auth-reset.test.ts |
| Help | ✗ | — |
| Import | ◯ | yad2/yad2-import.spec.ts (partial) |
| ImportPicker | ✗ | — |
| Inbox | ✗ | — (premium-only, "בקרוב") |
| LeadHistory | △ | leads.test.ts |
| Leads | △ | leads integration |
| Login | △ | auth.test.ts + login-google-signup unit |
| Map | ✗ | — |
| MarketDiscovery | △ | marketDiscovery integration |
| Marketing | △ | marketing-overview.test.ts |
| MeetingDetail | △ | meetings-list.test.ts |
| NeighborhoodAdmin | ✓ | NeighborhoodAdmin.test.tsx |
| NewLead | ✓ | NewLead.test.jsx |
| NewProperty | ✓ | NewProperty.test.tsx |
| NotFound | ✓ | NotFound.test.tsx |
| Notifications | △ | notifications.test.ts |
| Office | ✓ | Office.test.tsx |
| Onboarding | ✓ (unit) | account-delete-and-onboarding.test.ts + onboarding.test.js |
| OwnerDetail | ✓ | OwnerDetail.test.tsx |
| Owners | ✓ | Owners.test.jsx |
| Profile | ◯ | profile/profile.spec.ts |
| Properties | ✓ | Properties.test.jsx |
| PropertyDetail | ✓ | PropertyDetail.test.tsx |
| PropertyLandingPage | △ | public.test.ts |
| ProspectSign | △ | prospect-pdf.test.ts |
| PublicMatches | △ | public.test.ts |
| Reminders | ✓ | Reminders.test.tsx |
| Reports | ✓ | Reports.test.tsx |
| ResetPassword | △ | auth-reset.test.ts |
| SearchResults | △ | search.test.ts |
| SellerCalculator | ✓ | SellerCalculator.test.tsx |
| Settings | ✓ | Settings.test.tsx |
| SettingsNotifications | ✗ | — |
| TagSettings | ✓ | TagSettings.test.tsx |
| Team | △ | team-stats.test.ts |
| TeamAgentDetail | △ | team-stats.test.ts |
| Templates | ◯ | templates/templates.spec.ts |
| Transfers | ◯ | transfers/transfers.spec.ts |
| VoiceDemo | △ | ai-voice.test.ts |
| Yad2Import | ◯ | yad2/yad2-import.spec.ts |

**Pages with no Vitest + no E2E coverage**: AdminChats, AdminGrafana,
AdminMonitoring, AgentCard, Ai, Buyers, Contact, CustomerPortal,
CustomerPropertyView, Help, ImportPicker, Inbox, Map,
SettingsNotifications.

Most of these are admin-only, deprecated ("Buyers"), placeholder
("Help", "Inbox" — flagged "בקרוב"), or post-checkout views with no
mutating surface. The two worth covering are **Ai** (premium-gated
chat surface, currently exercised only at the API level) and
**Notifications / SettingsNotifications** (notification preferences
UI — currently no UI test, only the API contract via
`notifications.test.ts`).

---

## 3 · Worker / WebSocket / cron coverage

| Component | Source | Coverage | Notes |
|---|---|---|---|
| `notificationDelivery` | backend/src/workers/notificationDelivery.ts | **✗** | 60s setInterval; drains PendingNotificationDelivery → SES |
| `marketDiscoveryReactor` | backend/src/workers/marketDiscoveryReactor.ts (impl in lib/) | **✗** | 30s setInterval; scores listings vs LeadSearchProfile |
| `matchDigest` | backend/src/workers/matchDigest.ts | **✗** | 30min setInterval; consolidates dispatches |
| `purgeDeletedUsers` | backend/src/workers/purgeDeletedUsers.ts | **✗** | hourly; hard-deletes soft-deleted users + S3 blobs |
| `/api/chat/ws` | backend/src/routes/chat.ts | **✗** | 5-conn cap, 30 msg/min, in-process pub/sub |
| Cron equivalents (Yad2 quota window, sitemap regen, etc.) | various | △ | quota window covered indirectly via yad2.test.ts; sitemap regen has no test |

All four background workers have **zero** automated coverage. They run
on plain `setInterval` so the tests would import the worker's tick()
function, seed DB, invoke once, assert side effects. Phase 2.3 of the
plan addresses these.

---

## 4 · Cross-cutting flows

Multi-route flows that no single unit/integration test exercises end
to end. ✓ = E2E covers it; ◯ = partial; ✗ = none.

| Flow | Coverage | Notes |
|---|---|---|
| Signup → email verify → first login → onboarding → dashboard | ◯ | account-delete-and-onboarding.test.ts hits the API path; no E2E walks the full UI flow |
| Login → /customers → create lead → create deal | **✗** | Phase 2.2 adds `tests/e2e/deals/lead-to-deal.spec.ts` |
| Yad2 connect → preview → import → quota chip | ◯ | yad2-import.spec.ts hits the import; quota-chip post-import assertion missing |
| Google OAuth login + Calendar connect (separate consents) | **✗** | Phase 2.2 adds `tests/e2e/calendar/connect.spec.ts` |
| Public share link → prospect → promote-to-lead | **✗** | Phase 2.2 adds `tests/e2e/public/share-and-inquiry.spec.ts` |
| Property transfer A→B (initiate, accept, reassigned) | ◯ | transfers.spec.ts covers initiate; full A→B handoff missing — Phase 2.2 |
| Demo account login + behaviour-equivalent-to-real-agent | **✗** | Phase 2.2 adds `tests/e2e/auth/demo-login.spec.ts` |
| Lead-to-deal conversion → reports/deals shows it | **✗** | Same as #2; reports verification is part of the new spec |
| OAuth Apple native exchange | △ | covered minimally via integration; no E2E |
| Premium gate (free → upsell, premium → real surface) | ◯ | premium-gate.test.ts covers every guarded API; no UI assertion |
| WebSocket chat — user posts → admin sees in real time | **✗** | Phase 2.3 adds chat-ws integration test |

---

## 5 · Out of scope (deliberate non-coverage)

The following are intentionally not tested and shouldn't be added:

- **Real Yad2 against prod** — Yad2's anti-scrape WAF would 429 us
  in seconds. Use the dev-mode crawler stub.
- **Real Anthropic Claude** — every AI-touching test mocks at the
  SDK/helper boundary (commit `972f10f`). CI has no
  `ANTHROPIC_API_KEY` and shouldn't.
- **Real Google OAuth** — the mock route + native-exchange surfaces
  are gated behind explicit env opt-ins; tests use those.
- **Real S3** — `meetingAudio` + `storage` helpers mock at the
  helper boundary. AWS calls don't fly in CI.
- **Real SES** — same pattern. The notification delivery worker's
  test (Phase 2.3) will mock at the SES boundary.
- **Real PostHog** — analytics is best-effort and mocked at the
  helper boundary.
- **Visual regression / screenshot diff** — explicit choice in the
  plan; revisit later if needed.
- **Mutation testing budget** — explicit choice; revisit later.
- **Coverage-threshold gate on PRs** — explicit choice; the gate is
  pass/fail, not coverage-percent.
- **iOS Capacitor smoke E2E in CI** — local-only; CI overhead
  isn't worth it yet.

---

## 6 · Phase 2 plan (this doc's payoff)

In order of risk reduction:

1. **Worker integration tests** (4 files) — these have zero coverage
   and would catch real bugs (a SES outage, Decimal-math drift in
   the digest scheduler, a misconfigured S3 region in the purge
   worker). Phase 2.3.
2. **WebSocket chat integration** — single file. Phase 2.3.
3. **5 critical-path E2E specs** — lead-to-deal, calendar connect,
   public share, transfers full A→B, demo login. Phase 2.2.
4. **Uncovered route integration tests** — geo, import, market,
   sitemap (~4 files); confirm mlsSprint7 is dead and delete it.
   Phase 2.1.
5. **Indirect-only routes** (dashboard, oauth-google, me, etc.) —
   one happy-path + one auth-negative each; nice-to-have.

Items 1–3 are the highest-leverage; item 5 only matters when the
indirect coverage breaks.

---

## 7 · Snapshot of test counts (2026-05-01)

| Project | Files | Tests |
|---|---|---|
| Backend unit | 10 | 112 |
| Frontend (jsdom + happy-dom + MSW) | 81 + 31 = 112 | 550 + 314 = 864 |
| Integration (real Postgres + Fastify) | 66 | 500 |
| **Total** | **188** | **1,476** |

Plus **23 Playwright `@critical`/full E2E specs** + **5 Playwright
perf specs** (separate config under `tests/perf/`).
