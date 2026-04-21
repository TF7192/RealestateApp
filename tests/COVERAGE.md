# Estia — Test Coverage

**Last updated:** 2026-04-21
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
| DB isolation | Per-test TRUNCATE CASCADE via Prisma | no leaked state, parallel-safe |
| Auth reuse | Playwright `storageState` — one login in global-setup, shared across workers | avoids login contention + flake |
| External mocks | Playwright `page.route()` at E2E boundary; `vi.mock()` at unit boundary | never hit real Yad2/Google from tests |

**No Cypress, no Jest.** Don't introduce either — Playwright + Vitest covers every case with one vendor.

---

## Running locally

```bash
# one-time: bring up the test Postgres
docker-compose -f docker-compose.test.yml up -d

# environment
export DATABASE_URL="postgresql://estia:estia@localhost:54329/estia_test"
export JWT_SECRET="test-jwt-secret-0123456789abcdef"
export COOKIE_SECRET="test-cookie-secret-abcdef0123456789"
export AUTH_RATE_LIMIT_DISABLED=1       # don't trip the auth limiter during E2E
export RATE_LIMIT_MAX_PER_MIN=10000     # raise global limiter for parallel workers
export FEATURE_YAD2_IMPORT=true

# apply schema, then seed
(cd backend && npx prisma migrate deploy && npm run db:seed)

# unit + integration
npm run test

# E2E (needs a test-backend + frontend running against the test DB)
# test backend
(cd backend && PORT=4100 HOST=127.0.0.1 PUBLIC_ORIGIN=http://localhost:5174 \
  CORS_ORIGIN=http://localhost:5174 npm run dev) &
# test frontend
(cd frontend && VITE_API_PROXY=http://127.0.0.1:4100 \
  npx vite --port 5174 --strictPort --host 127.0.0.1) &
# specs
PLAYWRIGHT_WEB_URL=http://127.0.0.1:5174 \
  TEST_AGENT_EMAIL=agent.demo@estia.app \
  TEST_AGENT_PASSWORD=estia-demo-1234 \
  npx playwright test
```

---

## Application inventory (discovered)

### Routes (authenticated unless noted)
Dashboard `/` · Properties `/properties` + detail + new/edit · Owners `/owners` + detail · Customers `/customers` + detail + new · Deals `/deals` · Transfers `/transfers` · Templates `/templates` · Calculator `/calculator` · Yad2 `/integrations/yad2` · Profile `/profile` · Admin `/admin/chats` + `/admin/users` · Public: Login `/*` (unauth catchall), Agent portal `/agents/:slug` + `/a/:agentId`, Customer property view `/p/:id`, Prospect sign `/public/p/:token`.

### Roles
`AGENT` (primary CRM user) · `CUSTOMER` (read-only portal) · Admin = AGENT whose email is in `ADMIN_EMAILS` (hard-coded: `talfuks1234@gmail.com`).

### API endpoints (prefixes, per `backend/src/server.ts`)
`/api/auth` · `/api/auth` (Google OAuth) · `/api/me` · `/api/properties` · `/api/leads` · `/api/deals` · `/api/agreements` · `/api/lookups` · `/api/reports` · `/api/agents` · `/api/transfers` · `/api/templates` · `/api/geo` · `/api/public` · `/api/owners` · `/api/chat` · `/api/admin` · `/api/integrations/yad2` · `/api/integrations/calendar` · `/api/health`, `/api/health/ready`.

### External integrations (must be mocked in tests)
Yad2 (Playwright crawler) · Google OAuth · Google Calendar · S3 uploads · OSM Photon (address autocomplete) · OSM Nominatim (reverse geocode) · WhatsApp wa.me (client-side deep link — no mock needed) · PostHog analytics.

### Critical user journeys
1. **Login → dashboard.** Most common entry point.
2. **Create a lead from a phone call.** `/customers/new` submits and lands on detail.
3. **Create a property.** Step 1 + step 2 + photos → `/properties/:id`.
4. **Share a property with a lead via WhatsApp.** From `/properties/:id` → lead picker → WA URL.
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
| Auth (signup/login/logout/refresh) | ⬜ | ✅ | ✅ | slices 1 + 5 + 7 |
| Calendar | ⬜ | ✅ | ✅ | slice 7 |
| Customers / Leads | 🟡 (waLink) | ✅ | ✅ (create happy path) | slices 3 + 5 |
| Properties (Assets) | 🟡 (formatFloor) | ✅ | ✅ (critical path) | slices 3 + 5 |
| Owners | ⬜ | ✅ | ✅ | slice 7 |
| Calculator | ✅ | N/A | ✅ | slices 2 + 5 |
| Yad2 Import | ⬜ | ✅ (quota, preview, 429, import V) | ✅ (mocked preview) | slices 3 + 5 + 7 |
| Chat / admin chat | ⬜ | ✅ | ✅ | slice 7 |
| Admin Panel (users) | ⬜ | ✅ | ✅ (deny path) | slices 3 + 5 |
| Public portal | ⬜ | ✅ | ✅ | slice 7 |
| Transfers | ⬜ | ✅ | ✅ | slice 7 |
| Templates | ⬜ | ✅ | ✅ | slice 7 |
| Profile / Calendar-connect | ⬜ | ✅ | ✅ | slice 7 |
| InlineText (F-6/F-12 regression) | ✅ | N/A | N/A | slice 4 |
| Display helpers | ✅ | N/A | N/A | slice 4 |
| formatFloor | ✅ | N/A | N/A | slice 4 |
| waLink (normalize/waUrl/telUrl) | ✅ | N/A | N/A | slice 4 |
| A11y (axe) — top 5 pages | N/A | N/A | ✅ | slice 6 |
| RTL + no horizontal overflow | N/A | N/A | ✅ | slice 6 |
| Auth-bypass smoke (14 protected routes) | N/A | N/A | ✅ | slice 6 |
| XSS escape on free-text fields | N/A | N/A | ✅ | slice 6 |

Legend: ✅ complete · 🟡 partial · ⬜ not started · N/A doesn't apply

---

## API endpoint matrix

Format: Happy / Auth / Validation / Authz / NotFound / Idempotency / Edge = 7 boxes per endpoint.

| Method | Path | H | A | V | Az | 404 | Idem | Edge |
|---|---|---|---|---|---|---|---|---|
| POST | /api/auth/login | ✅ | ✅ | ✅ | N/A | N/A | ⬜ | ⬜ |
| POST | /api/auth/signup | ✅ | N/A | ✅ | N/A | N/A | ✅ (409 dup) | ⬜ |
| POST | /api/auth/logout | ✅ | ✅ | N/A | N/A | N/A | N/A | N/A |
| GET | /api/me | ✅ | ✅ | N/A | N/A | N/A | ✅ (one-shot platform) | ✅ |
| PATCH | /api/me | ✅ | ✅ | ✅ | ✅ | N/A | N/A | N/A |
| POST | /api/me/tutorial/complete | ✅ | ✅ | N/A | N/A | N/A | ✅ | N/A |
| GET | /api/leads | ✅ | ✅ | ⬜ | ✅ | N/A | N/A | ✅ |
| GET | /api/leads/:id | ✅ | ⬜ | N/A | ✅ | ✅ | N/A | N/A |
| POST | /api/leads | ✅ | ✅ | ✅ | ⬜ | N/A | ⬜ | ⬜ |
| PATCH | /api/leads/:id | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | ⬜ |
| DELETE | /api/leads/:id | ✅ | ✅ | N/A | ✅ | ✅ | N/A | N/A |
| GET | /api/properties | ✅ | N/A (public) | ⬜ | ✅ | N/A | N/A | ⬜ |
| GET | /api/properties/:id | ✅ | N/A (public) | N/A | ⬜ | ✅ | N/A | N/A |
| POST | /api/properties | ✅ | ✅ | ✅ | ⬜ | N/A | ⬜ | ⬜ |
| PATCH | /api/properties/:id | ✅ | ✅ | ⬜ | ✅ | ✅ | N/A | ⬜ |
| DELETE | /api/properties/:id | ✅ | ✅ | N/A | ✅ | ✅ | N/A | N/A |
| GET | /api/owners | ✅ | ✅ | N/A | ✅ | N/A | N/A | ✅ |
| GET | /api/owners/:id | ✅ | ⬜ | N/A | ✅ | ✅ | N/A | N/A |
| POST | /api/owners | ✅ | ✅ | ✅ | ⬜ | N/A | N/A | N/A |
| PATCH | /api/owners/:id | ✅ | ⬜ | ✅ | ✅ | ✅ | N/A | ✅ (denorm sync) |
| DELETE | /api/owners/:id | ✅ | ⬜ | N/A | ✅ | ⬜ | N/A | ✅ (FK setNull) |
| GET | /api/owners/search | ✅ | ⬜ | N/A | ⬜ | N/A | N/A | ✅ (empty q) |
| GET | /api/admin/users | ✅ | ✅ | N/A | ✅ | N/A | N/A | ⬜ |
| GET | /api/integrations/yad2/quota | ✅ | ✅ | N/A | N/A | N/A | N/A | ✅ |
| POST | /api/integrations/yad2/agency/preview | ⬜ | ✅ | ✅ | ⬜ | N/A | ⬜ | ✅ (429 quota) |
| POST | /api/integrations/yad2/agency/import | ⬜ | ✅ | ✅ | ⬜ | N/A | ⬜ | ⬜ |
| GET | /api/integrations/calendar/status | ✅ | ✅ | N/A | N/A | N/A | N/A | ✅ |
| POST | /api/integrations/calendar/disconnect | ✅ | ✅ | N/A | N/A | N/A | N/A | N/A |
| GET | /api/integrations/calendar/leads/:id/meetings | ✅ | ⬜ | N/A | ✅ | N/A | N/A | N/A |
| POST | /api/integrations/calendar/leads/:id/meetings | ✅ | ⬜ | ✅ | ⬜ | N/A | N/A | N/A |
| DELETE | /api/integrations/calendar/meetings/:id | ⬜ | ⬜ | N/A | ✅ | N/A | N/A | N/A |
| GET | /api/transfers | ✅ | ✅ | N/A | ✅ (direction) | N/A | N/A | N/A |
| GET | /api/transfers/agents/search | ✅ | ✅ | N/A | ✅ (self) | ✅ (unknown email) | N/A | N/A |
| POST | /api/properties/:id/transfer | ✅ | ⬜ | ✅ | ✅ | N/A | N/A | ✅ (409 dup, 400 self) |
| POST | /api/transfers/:id/accept | ✅ | ⬜ | N/A | ✅ | N/A | ✅ (409 non-pending) | N/A |
| POST | /api/transfers/:id/decline | ✅ | ⬜ | N/A | ⬜ | N/A | N/A | N/A |
| POST | /api/transfers/:id/cancel | ✅ | ⬜ | N/A | ✅ | N/A | N/A | N/A |
| GET | /api/templates | ✅ | ✅ | N/A | ✅ | N/A | N/A | ✅ (default fallback) |
| PUT | /api/templates/:kind | ✅ | ⬜ | ✅ | ✅ (per-agent) | N/A | ✅ (upsert) | N/A |
| DELETE | /api/templates/:kind | ✅ | ⬜ | N/A | ⬜ | N/A | ✅ (no-op) | N/A |
| GET | /api/public/agents/:slug | ✅ | N/A (public) | N/A | N/A | ✅ | N/A | ✅ (non-ACTIVE filter) |
| GET | /api/public/agents/:slug/properties/:slug | ✅ | N/A (public) | N/A | ✅ (cross-agent) | ✅ | N/A | N/A |
| GET | /api/chat/me | ✅ | ✅ | N/A | N/A | N/A | ✅ (upsert) | N/A |
| POST | /api/chat/me/messages | ✅ | ✅ | ✅ | N/A | N/A | N/A | N/A |
| POST | /api/chat/me/read | ✅ | ⬜ | N/A | N/A | N/A | ✅ (no convo) | N/A |
| GET | /api/chat/admin/conversations | ✅ | ✅ | N/A | ✅ | N/A | N/A | N/A |
| POST | /api/chat/admin/conversations/:id/messages | ✅ | ⬜ | N/A | ✅ | N/A | N/A | N/A |
| POST | /api/chat/admin/conversations/:id/archive | ✅ | ⬜ | N/A | ⬜ | N/A | ✅ (roundtrip) | N/A |

Full enumeration continues to be added as each feature slice ships.

---

## Critical paths (`@critical` tag — CI blocker on failure)

- [x] User can log in (integration: auth.test.ts · E2E: critical-paths/login-to-properties.spec.ts)
- [x] Logged-in user sees the dashboard (`/`) (E2E critical path)
- [x] Logged-in user sees the properties list (`/properties`) without the ErrorBoundary (E2E @critical — covers the TDZ we fixed)
- [x] Logged-in user can create a lead (E2E customers.spec.ts)
- [x] Admin can see the admin users table (integration + E2E)
- [x] Unauth user hitting `/` redirects to login (security/auth-bypass.spec.ts × 14 routes)
- [x] Agent A cannot see agent B's lead (integration: auth.test.ts + leads.test.ts IDOR)
- [x] Calculator hero number matches the formula for a canonical input (unit: sellerCalc — 13 tests)
- [x] Unauth visitor to `/a/:agentId` or `/p/:id` sees the public portal, not the login page (regression for the /me 401-redirect bug, E2E public-portal.spec.ts)

---

## Totals (as of 2026-04-21)

- Unit (backend): 13
- Unit (frontend): 49
- Integration: 157 (across 12 files)
- E2E: 49 (chromium)

---

## What's intentionally NOT covered

- Third-party payment flows — none exist yet.
- Email-content rendering — mocked at the boundary, not visually asserted.
- Real WhatsApp send — we only assert the URL shape we hand off to `wa.me`.
- iPhone native (Capacitor) surfaces — separate test surface, out of scope for the web suite.
- Axe rules with unactionable findings today: `color-contrast` (ICU false positive on Hebrew gold-on-cream), `aria-dialog-name` (several dialog wrappers lack aria-label — backlog), `meta-viewport` (`maximum-scale=1` is an explicit product decision to prevent iOS focus-zoom). Re-enable as each is addressed.
- Google OAuth redirect against real Google. Calendar integration is covered by status/disconnect + meeting CRUD without `syncToCalendar`.
- Real Yad2 crawl. E2E mocks `/api/integrations/yad2/agency/preview` via `page.route()`.
