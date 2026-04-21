# Estia — Test Coverage

**Last updated:** 2026-04-22
**Owner:** QA

This is the living source of truth for what the suite covers. PRs that add tests update this doc in the same commit.

---

## Tooling

| Layer | Tool | Reason |
|---|---|---|
| Unit (backend) | Vitest | Fast, ESM-native, TS-first |
| Unit (frontend JS) | Vitest + jsdom + React Testing Library | matches Vite toolchain |
| Integration (API) | Vitest + Fastify `app.inject()` | real handlers + Prisma against a test DB, no HTTP round-trip needed |
| E2E | Playwright (already a prod dep for Yad2 crawler) | multi-browser, trace/video on fail |
| Data | `@faker-js/faker` + handwritten factories | deterministic seeds |
| DB isolation | Per-test transaction rollback using Prisma `$transaction` or per-test schema truncate | no leaked state, parallel-safe |
| External mocks | Playwright `page.route()` at E2E boundary; `vi.mock()` at unit boundary | never hit real Yad2/Google from tests |

**No Cypress, no Jest.** Don't introduce either — Playwright + Vitest covers every case with one vendor.

---

## Application inventory (discovered)

### Routes (authenticated unless noted)
Dashboard `/` · Properties `/properties` + detail + new/edit · Owners `/owners` + detail · Customers `/customers` + detail + new · Deals `/deals` · Transfers `/transfers` · Templates `/templates` · Calculator `/calculator` · Yad2 `/integrations/yad2` · Profile `/profile` · Admin `/admin/chats` + `/admin/users` · Public: Login `/*` (unauth catchall), Agent portal `/agents/:slug` + `/a/:agentId`, Customer property view `/p/:id`, Prospect sign `/public/p/:token`.

### Roles
`AGENT` (primary CRM user) · `CUSTOMER` (read-only portal) · Admin = AGENT whose email is in `ADMIN_EMAILS` (hard-coded: `talfuks1234@gmail.com`).

### API endpoints (prefixes, per `backend/src/server.ts:152-171`)
`/api/auth` · `/api/auth` (Google OAuth) · `/api/me` · `/api/properties` · `/api/leads` · `/api/deals` · `/api/agreements` · `/api/lookups` · `/api/reports` · `/api/agents` · `/api/transfers` · `/api/templates` · `/api/geo` · `/api/public` · `/api/owners` · `/api/chat` · `/api/admin` · `/api/integrations/yad2` · `/api/integrations/calendar` · `/api/health`, `/api/health/ready`.

### External integrations (must be mocked in tests)
Yad2 (Playwright crawler) · Google OAuth · Google Calendar · S3 uploads · OSM Photon (address autocomplete) · OSM Nominatim (reverse geocode) · WhatsApp wa.me (client-side deep link — no mock needed) · PostHog analytics.

### Critical user journeys
1. **Login → dashboard.** The single most common entry point.
2. **Create a lead from a phone call.** `/customers/new` form submits and lands on detail.
3. **Create a property.** Step 1 + step 2 + photos → `/properties/:id`.
4. **Share a property with a lead via WhatsApp.** From `/properties/:id` → lead picker → WA URL opened.
5. **Update a lead's status from the customer list.** Inline-edit flow.
6. **Import Yad2 agency → select + import.** Background scan, quota enforcement, image rehost.
7. **Calculator: sale price → net.** Pure client-side, must match formula exactly.
8. **Admin views the users table.** Admin-only access.
9. **Public agent portal loads for an unauth customer.** SEO-critical path.
10. **Agent can't see another agent's data.** Cross-tenant authorization.

---

## Features

| Feature | Unit | Integration | E2E | Status |
|---|---|---|---|---|
| Auth (signup/login/logout/refresh) | ⬜ | 🟡 in progress | 🟡 critical path | slice 1 |
| Calendar | ⬜ | ⬜ | ⬜ | queued |
| Customers / Leads | ⬜ | 🟡 | ⬜ | slice 3 |
| Properties (Assets) | ⬜ | ⬜ | 🟡 critical path | slice 3 |
| Owners | ⬜ | ⬜ | ⬜ | queued |
| Calculator | ✅ | N/A | ⬜ | slice 2 (done) |
| Yad2 Import | ⬜ | ⬜ | ⬜ | queued |
| Chat / admin chat | ⬜ | ⬜ | ⬜ | queued |
| Admin Panel (users) | ⬜ | ⬜ | ⬜ | queued |
| Public portal | ⬜ | ⬜ | ⬜ | queued |
| Transfers | ⬜ | ⬜ | ⬜ | queued |
| Templates | ⬜ | ⬜ | ⬜ | queued |
| Profile / Calendar-connect | ⬜ | ⬜ | ⬜ | queued |

Legend: ✅ complete · 🟡 partial · ⬜ not started · N/A doesn't apply

---

## API endpoint matrix

Format: Happy / Auth / Validation / Authz / NotFound / Idempotency / Edge = 7 boxes per endpoint.

| Method | Path | H | A | V | Az | 404 | Idem | Edge |
|---|---|---|---|---|---|---|---|---|
| POST | /api/auth/login | 🟡 | ⬜ | ⬜ | N/A | N/A | ⬜ | ⬜ |
| POST | /api/auth/signup | ⬜ | N/A | ⬜ | N/A | N/A | ⬜ | ⬜ |
| POST | /api/auth/logout | ⬜ | ⬜ | N/A | N/A | N/A | N/A | N/A |
| GET | /api/me | ⬜ | ⬜ | N/A | N/A | N/A | N/A | N/A |
| GET | /api/leads | 🟡 | ⬜ | ⬜ | ⬜ | N/A | N/A | ⬜ |
| GET | /api/leads/:id | ⬜ | ⬜ | N/A | ⬜ | ⬜ | N/A | N/A |
| POST | /api/leads | ⬜ | ⬜ | ⬜ | ⬜ | N/A | ⬜ | ⬜ |
| PATCH | /api/leads/:id | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | N/A | ⬜ |
| DELETE | /api/leads/:id | ⬜ | ⬜ | N/A | ⬜ | ⬜ | N/A | N/A |
| GET | /api/properties | ⬜ | N/A (public) | ⬜ | ⬜ | N/A | N/A | ⬜ |
| GET | /api/properties/:id | ⬜ | N/A (public) | N/A | ⬜ | ⬜ | N/A | N/A |
| POST | /api/properties | ⬜ | ⬜ | ⬜ | ⬜ | N/A | ⬜ | ⬜ |
| PATCH | /api/properties/:id | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | N/A | ⬜ |
| DELETE | /api/properties/:id | ⬜ | ⬜ | N/A | ⬜ | ⬜ | N/A | N/A |
| GET | /api/owners | ⬜ | ⬜ | ⬜ | ⬜ | N/A | N/A | ⬜ |
| POST | /api/owners | ⬜ | ⬜ | ⬜ | ⬜ | N/A | ⬜ | ⬜ |
| GET | /api/admin/users | ⬜ | ⬜ | N/A | ⬜ | N/A | N/A | ⬜ |
| GET | /api/integrations/yad2/quota | ⬜ | ⬜ | N/A | N/A | N/A | N/A | N/A |
| POST | /api/integrations/yad2/agency/preview | ⬜ | ⬜ | ⬜ | ⬜ | N/A | ⬜ | ⬜ |
| POST | /api/integrations/yad2/agency/import | ⬜ | ⬜ | ⬜ | ⬜ | N/A | ⬜ | ⬜ |
| GET | /api/integrations/calendar/status | ⬜ | ⬜ | N/A | N/A | N/A | N/A | N/A |
| ... (22 more endpoints) | | | | | | | | |

Full enumeration TBD as each feature slice ships.

---

## Critical paths (`@critical` tag — CI blocker on failure)

- [ ] User can log in (seed agent → POST /api/auth/login → cookie set → GET /api/me ok)
- [ ] Logged-in user sees the dashboard (`/`)
- [ ] Logged-in user sees the properties list (`/properties`) without the ErrorBoundary
- [ ] Logged-in user can create a lead (navigate to `/customers/new` → submit → land on detail)
- [ ] Admin can see the admin users table (`/admin/users`)
- [ ] Unauth user hitting `/` redirects to login
- [ ] Agent A cannot see agent B's lead (IDOR sanity)
- [ ] Calculator hero number matches the formula for a canonical input (pure unit, no browser)

---

## What's intentionally NOT covered

- Third-party payment flows — none exist yet.
- Email-content rendering — mocked at the boundary, not visually asserted.
- Real WhatsApp send — we only assert the URL shape we hand off to `wa.me`.
- iPhone native (Capacitor) surfaces — separate test surface, out of scope for the web suite.
