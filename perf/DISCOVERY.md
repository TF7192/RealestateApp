# Estia — Performance Discovery

> Point-in-time map of the system for the perf engagement. Inputs for the load-test scenarios and the target budgets in `BUDGETS.md`. Verified against the repo and prior auto-memory as of 2026-04-21.

---

## 1. Traffic model (best available estimate)

No server-side analytics / APM is in place today. PostHog is wired client-side (`frontend/src/lib/analytics.js`, `posthog-js`) but captures page events, not request counts or latencies. **Baseline traffic figures below are estimates from product context — they need to be confirmed or replaced once we run against real data.**

- **Actors:** real-estate agents (primary), their property customers (read-only public links), one admin (Adam). Hebrew/RTL primary locale.
- **Peak shape:** business-hour bursts on weekdays (08:00–19:00 Asia/Jerusalem), tapering evenings. Saturday quiet. Seller-calculator + new-lead flows spike Sunday–Monday (Israeli work-week start).
- **Estimated live scale (today):** tens of active agents, each with up to a few hundred properties + leads; the demo agent (`agent.demo@estia.app`) sees most of our load.
- **Realistic 6–12 month target:** 200–500 active agents, ~50 CCU at peak, ~15–25 RPS sustained. Not a startup-scale traffic wave — this is a CRM.
- **Read vs. write ratio:** heavily read-skewed. Property list + detail + lead list are the workhorses; mutations concentrate in new-lead, new-property, marketing-action toggles.

---

## 2. Critical endpoints (80/20 candidates)

Surfaced by reading `backend/src/server.ts` (31 registered route prefixes) + the frontend API client (`frontend/src/lib/api.js`). Ranked roughly by expected hit frequency × cost.

| # | Path | Method | Class | Expected hit rate | Risk |
|---|---|---|---|---|---|
| 1 | `/api/me` | GET | auth+read | every page load (SPA re-mount + refetches) | Hot path; blocks first paint of any authed page |
| 2 | `/api/properties` | GET | list | every properties-grid render | N+1 risk: property + imageList + owner + tags + pipeline stage |
| 3 | `/api/leads` | GET | list | every customers-grid render | Same N+1 shape; matched-property precompute is nested |
| 4 | `/api/properties/:id` | GET | detail | per open property | Fans out to images, videos, marketing actions, viewings, transfers, prospects |
| 5 | `/api/leads/:id` | GET | detail | per open lead | Fans out to meetings, agents, matched properties |
| 6 | `/api/reports/*` | GET | aggregation | dashboard load | Aggregations; likely full-scan-prone without proper indexes |
| 7 | `/api/search/*` | GET | search | global palette / cmd-K + mobile search | Backend registered but behavior not yet profiled; likely Postgres ILIKE |
| 8 | `/api/auth/login` | POST | auth | spiky (mornings, redeploys) | argon2 is deliberately CPU-expensive; 10/15m per IP rate limit in front |
| 9 | `/api/public/og/property/:agent/:slug` | GET | public | bot traffic from WhatsApp/FB/Twitter | Runs without auth; every shared link preview hits it |
| 10 | `/api/owners`, `/api/tags`, `/api/reminders`, `/api/activity` | GET | list | dashboard + detail panels | Newer sprint-1 routes; un-profiled |
| 11 | `/api/integrations/yad2/*` | POST | external | manual agent action | Playwright crawl per call (60–120 s); already quota-limited 3/h/agent |
| 12 | `/uploads/*` | GET | file | image views on property detail + public pages | 302-redirects to S3 presigned (no bandwidth on our EC2) |
| 13 | `/api/chat/ws` | WS | realtime | in-app support chat | WebSocket — separate cost model from request-response |

**Critical user journeys (end-to-end flows):**
- Agent cold-start: login → dashboard → properties list → property detail.
- Agent lead flow: new lead form submit → lead detail → matched properties → WhatsApp handoff.
- Public-link view (no login): hit `/agents/:agentSlug/:propertySlug` → frontend loads → `/api/public/og/property/...` for bots.

---

## 3. Infrastructure snapshot

From `reference_aws_prod.md` + terraform + live inspection:

- **Region:** eu-north-1 (Stockholm). No multi-AZ for compute.
- **App host:** single EC2 `i-07a8a9deb68cd1ff6`, **t3.small** — 2 vCPU burstable + **2 GB RAM**. Shared with a sibling Tripzio API on the same box. **This is the primary capacity ceiling.**
- **Disk:** 8 GB root (gp2). Historically hits ~80% full; we moved Docker's data-root to `/data` (40 GB EBS) to fix build-time pressure. After the 2026-04-21 CI/CD redesign, images are built in GHCR — EC2 no longer builds.
- **Reverse proxy:** nginx 1.28 on the host terminating TLS (Certbot, Let's Encrypt, systemd-timer renewal). Routes `/api/` → `127.0.0.1:6002` (backend container), `/` → `127.0.0.1:3001` (frontend nginx container, static-served build).
- **Containers:** backend + frontend via `docker-compose.prod.yml` pulling from `ghcr.io/tf7192/estia-{backend,frontend}:${ESTIA_TAG}`. No Redis, no queue worker, no autoscaler.
- **Database:** AWS RDS Postgres 16 `estia-prod-db`, **db.t4g.micro** — 1 vCPU Graviton, **1 GB RAM**, 20 GB gp3, 7-day backup retention, **single-AZ**, not publicly reachable (SG-locked to the EC2 SG). Master creds at `~/.estia_rds_pw` + `.env` on host.
- **Connection pool:** Prisma default. No PgBouncer. With ~30 Prisma model defaults × occasional burst, pool pressure is a known unknown.
- **Cache layer:** **none at app level**. No Redis, no in-process memoization of hot reads. This is flagged as the cheapest first fix in `FINDINGS.md`.
- **CDN:** **none.** nginx serves `/assets/*` with a 30-day cache header from the frontend container, but there's no edge cache in front. Geographic latency for users outside Scandinavia is the EC2's round-trip.
- **File storage:** S3 `s3://estia-prod` (uploads + DB backups), same region. Backend issues 302-presigned-url redirects for `/uploads/*` so bytes leave S3 directly, not via our EC2 bandwidth.
- **Cost:** ~$32/month total (EC2 $13 + RDS $15 + S3/EBS $4). Budget alert at $32 (80% of $40).

---

## 4. External dependencies (latency wildcards)

- **AWS S3** (eu-north-1, same region): presigned GETs; no egress via our host.
- **Yad2 crawl** (via `playwright` inside the backend container): ~60–120 s per full crawl. Rate-limited to 3/rolling-hour per agent + serialized internally. Not a load-test target — already bounded.
- **Google OAuth** + **Google Calendar** (OAuth tokens persisted per agent): low-frequency.
- **PostHog** (us.i.posthog.com — **cross-Atlantic**): client-side ingestion + server-side `captureException`. Server-side sends are fire-and-forget but still hit the network.
- **Photon / OSM proxy** via `/api/geo/search`: the `AddressField` typeahead hits this on every keystroke (debounced 200ms). Not our server's cost, but latency reads as our app being slow to users.
- **Email / SMS:** not integrated today.

---

## 5. Backend surface details

- **Stack:** Fastify 5 + `@fastify/jwt` (signed cookies, `@fastify/cookie` with signing secret) + `@fastify/rate-limit` + `@fastify/multipart` (100 MB cap) + `@fastify/websocket` + `@fastify/helmet`.
- **Rate limit:** **global 300/min per IP** (`RATE_LIMIT_MAX_PER_MIN` env-overrideable). Per-route auth caps: signup 3/h, login 10/15 min (disabled in tests via `AUTH_RATE_LIMIT_DISABLED=1`). `/api/health` exempt.
- **Body limit:** 10 MB (`bodyLimit` on the Fastify instance).
- **Logger:** pino. Production level `info`. No trace-id propagation; no OpenTelemetry.
- **Startup guard:** fails fast on missing JWT_SECRET / COOKIE_SECRET in production.
- **Password hashing:** argon2 (via the native `argon2` module, hence it can't be hoisted to the repo root in workspaces mode). Intentionally CPU-expensive; load-testing login will saturate one vCPU faster than any other endpoint.
- **WebSocket:** `/api/chat/ws`. Long-lived connections — capacity is bounded by file-descriptor and memory, not RPS.
- **Data shape:** **36 Prisma models** (Office, User, AgentProfile, CustomerProfile, Property, Owner, Lead, LeadAgent, Deal, Agreement, PropertyImage, PropertyVideo, MarketingAction, PropertyViewing, PropertyInquiry, PropertyTransfer, Tag, TagAssignment, Reminder, Neighborhood, SavedSearch, Favorite, Advert, PropertyAssignee, ActivityLog, LeadSearchProfile, Prospect, LeadMeeting, Conversation, Message, Session, Yad2ImportAttempt, CityLookup, StreetLookup, UploadedFile, MessageTemplate). **71 indexes/uniques** declared. Recently-added sprint-1 models (Tag, Reminder, etc.) have not been stress-profiled.

---

## 6. Frontend surface details

- **Stack:** Vite 8 + React 19 + react-router 7. No TS on the frontend (JS + JSX). Capacitor 8 wrapping the same bundle as an iOS app.
- **Routing:** `App.jsx` route table. **Route-level code-splitting already in place** for Templates, AdminChats, AdminUsers, SellerCalculator, Yad2Import, Reports, ActivityLog, Reminders, Office, TagSettings, CommandPalette (lazy + Suspense). Dashboard / Properties / PropertyDetail / Customers / CustomerDetail / Owners / OwnerDetail / Deals are in the main bundle.
- **Bundle analysis:** not yet run. `rollup-plugin-visualizer` or `vite build --mode analyze` would produce one.
- **Data fetching:** hand-rolled `fetch` via `frontend/src/lib/api.js` (timeouts, GET retry, 401-bounce, Hebrew error envelope). No SWR / react-query — each page component manages its own loading state. **No request deduplication or background revalidation.**
- **Caching:** `frontend/src/lib/pageCache.js` — an in-memory per-page cache (seeds lists on tab return to avoid empty-state flash). No HTTP cache on API responses.
- **Images:** property photos + videos, served via S3 presigned `/uploads/*` redirects. No `srcset`, no AVIF/WebP automatic variants.
- **Fonts / icons:** lucide-react. React-joyride for onboarding.
- **Analytics:** posthog-js + session-replay; PostHog project-key baked in at build time.
- **Mobile header/chat:** dedicated mobile components under `frontend/src/mobile/`.

---

## 7. Current known pain

From operator notes + prior debugging + the 22-file lint-cleanup pass:

- **Builds on EC2** historically saturated the t3.small (pre–GHCR migration, now fixed).
- **Disk pressure on EC2 root** (8 GB) — Docker data-root moved to the 40 GB `/data` volume; still one of the watched metrics.
- **RDS db.t4g.micro is 1 GB RAM / 1 vCPU.** Any aggregation + N+1 issue will show up as DB CPU pegged before the app container notices.
- **No APM.** We have zero server-side visibility into per-endpoint latency or DB query time distribution. `pg_stat_statements` is not enabled (standard RDS parameter-group flip — small risk, high reward).
- **No request-level log aggregation** (CloudWatch for the EC2, per-container json logs with rotation, but no search UI).
- **Rate-limit observability is zero.** If a user hits 429, we log it but don't track rate.
- **Password login** goes through argon2 — a login-heavy morning (every agent opening the app) saturates one vCPU. Caching the JWT for >10 minutes partially mitigates; we still redirect-login the moment a token expires.
- **Marketing-action toggles** on the property-detail page do many small mutations in a row. Each one round-trips the DB + refetches the property. A batch endpoint was never built.

---

## 8. Blocker — where do we load test?

The perf doc is explicit: "If discovery reveals no staging environment with production-like data volumes — pause." We have:

- **No staging env.** Per the 2026-04-21 CI/CD discussion, Adam confirmed "only local and production."
- **The EC2 shares a host with Tripzio API.** Load tests that saturate the box will impact an unrelated product.
- **The backend has a hard 300/min IP rate limit** (plus per-route auth caps). Any meaningful load-test run would either (a) break against the rate-limit and not measure real capacity, or (b) require flipping `RATE_LIMIT_MAX_PER_MIN` to a high number in the live container — which also lifts the protection against abusive real traffic for the test duration.
- **The RDS has no replica.** Writes under load test go to the same instance real users read from.
- **RDS is db.t4g.micro** — 1 vCPU, 1 GB RAM, not sized for synthetic load. A proper stress test will almost certainly max out the DB long before the app container does, and we'd be measuring the DB ceiling rather than the app's.

**Options to present** (detailed in `perf/WHERE_TO_RUN.md`):

1. **Spin up a second compose stack on the same EC2** on ports 6003/3002, `staging.estia.tripzio.xyz` subdomain, separate Prisma schema on the *same* RDS. Cheapest (~$0 more). Downside: noisy-neighbor contention with prod during tests.
2. **Stand up a dedicated staging t3.small + `db.t4g.micro`** in eu-north-1. Clean isolation. ~$28/mo extra ($13 EC2 + $15 RDS). Worth it if perf work continues past this engagement.
3. **Load-test locally** against `docker-compose.test.yml` + the disposable Postgres. Fast, free, but measures only code paths — not infra, not the t3.small ceiling.
4. **Load-test production at off-hours** with `RATE_LIMIT_MAX_PER_MIN=100000` set, using a dedicated synthetic test agent. High risk; blocked by default.

Recommended default: **(1) for the initial baseline + load scenarios**, **(3) for developer iteration**. (2) becomes attractive if perf work persists. (4) is a last resort.

---

## 9. Tooling plan

Already in repo:
- Playwright (already CI-wired; usable for E2E-style user-flow perf checks via Lighthouse).
- Vitest + MSW (useful for micro-bench of pure functions, not load).

Proposed additions (wired in follow-up slices, not this discovery):
- **k6** for HTTP load tests. Run locally or from a disposable t3.medium in eu-north-1 for higher-volume tests. Scripts live in `perf/load-tests/scenarios/`.
- **Lighthouse CI (`lhci`)** in a nightly workflow, budgets per critical page.
- **`pg_stat_statements`** enabled on RDS via parameter-group change. One-shot operator action; surfaces the top-N slowest queries immediately.
- **`rollup-plugin-visualizer`** in the Vite build to produce a bundle-size report on every main build.
- **OpenTelemetry** on the backend, exporting to a cheap self-hosted Tempo/Grafana — optional, weighs the value of visibility vs. the op-cost. Revisit once we know what's slow.

---

## 10. Open questions before running any load

1. **Which of the four "where to run" options do you want for the initial baseline?** Nothing runs until this is answered.
2. **Are you OK enabling `pg_stat_statements` on the prod RDS?** Zero app-side risk; gives us the top-N slowest queries to decide what to optimize before we even load-test.
3. **Is there a preferred next bottleneck to attack**, or should I report whatever the profiling surfaces? (I'd recommend the latter — the app will tell us where it hurts.)
4. **Capacity target for the engagement's headline number**: what's "enough" for you? 500 CCU? 1,000? The load scenarios are parameterized; the number just tells us when to stop adding load.

---

## 11. What's captured vs. what's still pending

**Captured in this doc** (from repo + memory):
- Traffic model sketch + actor list
- Critical-endpoint inventory (13 top candidates, ranked)
- Infrastructure inventory (compute, DB, S3, nginx, containers)
- External-dependency list
- Backend + frontend surface details
- Known pain from prior debugging

**Pending** (gated on the questions above):
- `BASELINE.md` — can't be filled until we can run against *something*.
- `BUDGETS.md` — starter draft exists with the `CLAUDE.md` defaults; needs per-endpoint calibration against our traffic model.
- `FINDINGS.md` — empty; filled as we profile.
- Load-test scripts under `perf/load-tests/` — skeleton stubs exist; target URL + auth flow finalized after Q1 answered.
- `pg_stat_statements` output — gated on Q2.
- Bundle analyzer report — can run any time; doesn't need infra.
