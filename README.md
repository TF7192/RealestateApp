# Estia

Production real-estate CRM for Israeli agents. Hebrew-first, RTL
throughout, ships as a web app + an iPhone app (Capacitor WebView).

## Quick facts

- **Backend**: Fastify 5 + Prisma 5 + Postgres, deployed as a Docker
  container on EC2. OAuth via Google, JWT sessions via signed cookies.
- **Frontend**: React 19 + Vite + React Router 7. Same bundle serves
  web and the Capacitor WKWebView. CSS custom properties for tokens;
  no CSS-in-JS.
- **Native**: Capacitor 8 (iOS). Live-reload from `https://estia.tripzio.xyz`
  in production; `http://localhost:5173` in dev.
- **Infra**: EC2 (eu-north-1) behind nginx + Let's Encrypt, Postgres
  on RDS, S3 for uploads, GitHub Actions for tag-triggered deploys.

## Local setup

Prerequisites:

- Node 20+
- A local Postgres (`brew install postgresql` or Docker) and an empty
  database you can connect to.

```bash
# 1. Backend
cd backend
cp .env.example .env           # then edit DATABASE_URL, JWT_SECRET, COOKIE_SECRET
npm install
npx prisma generate
npx prisma migrate deploy
npx tsx prisma/seed.ts         # optional — creates demo agent + data
npm run dev                    # → http://localhost:4000

# 2. Frontend (in another shell)
cd frontend
npm install
npm run dev                    # → http://localhost:5173
```

The Vite dev server proxies `/api/*` to the local backend, so you
browse `http://localhost:5173` as the single entry.

## Required env vars

See `backend/.env.example` for the canonical list. The production-
critical ones — the server refuses to start without them:

- `JWT_SECRET` — HS256 signing secret for session tokens. Rotating
  invalidates every live session.
- `COOKIE_SECRET` — separate from JWT_SECRET so one leak doesn't
  compromise both. Used to sign the cookie itself.
- `DATABASE_URL` — Postgres connection string.
- `PUBLIC_ORIGIN` — `https://estia.tripzio.xyz` in prod; used for
  OAuth callbacks, WhatsApp share URLs, OG meta.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — required for Google
  OAuth (login and Calendar). Set via GitHub Actions secrets.

## Testing

Unit tests: planned (see `docs/audit-2026-04-21.md`, F-19.1).
E2E tests: planned (F-19.1).

For now the pre-deploy gate in `.github/workflows/deploy.yml` runs:

- `npm ci && npx prisma generate && npx tsc --noEmit` (backend)
- `npm ci && npm run build` (frontend)

A broken type or a failing build blocks the deploy. Add tests when
you touch a new area.

## Deploying

Deploys are tag-triggered. Push a tag matching `v*`:

```bash
git tag -a "v$(date -u +%Y.%m.%d-%H%M)" -m "<what you shipped>" HEAD
git push origin main v2026.04.21-0900
```

GitHub Actions `deploy.yml` then:

1. Gates on backend typecheck + frontend build
2. rsyncs source to EC2
3. patches `.env` with managed secrets
4. `docker compose build --pull && up -d`
5. runs migrations
6. healthchecks `https://estia.tripzio.xyz/api/health`

## Production URLs

- Web: https://estia.tripzio.xyz
- API: https://estia.tripzio.xyz/api
- Liveness: `/api/health`
- Readiness: `/api/health/ready` (actually checks the DB)

## Architecture map

```
frontend/  React 19 + Vite + React Router 7 SPA
  public/yad2-extension/  (unused — Playwright in backend now)
  src/
    lib/            api client, auth, toast, display helpers, hooks
    components/     reusable UI (Dialog, SmartFields, SwipeRow, etc.)
    pages/          route-level screens
    mobile/         mobile-specific redesigns (tab bar, calculator)

backend/   Fastify 5 + Prisma 5
  src/
    server.ts            composition root (helmet, cors, jwt, rate limits)
    middleware/auth.ts   requireAuth / requireAgent / requireAdmin decorators
    routes/              one file per feature (properties.ts, leads.ts, …)
    lib/                 prisma, storage, analytics, slugs, yad2-crawler
  prisma/
    schema.prisma        DB schema
    migrations/          ordered, committed
    seed.ts              demo data seeding

docs/      engineering notes (audit, architecture)
```

## Conventions

- **Hebrew inline, no i18n library yet** — all user copy sits in JSX.
  English comments explain behavior for developers. See
  `docs/audit-2026-04-21.md` F-13.1 for the rationale.
- **Logical CSS properties** where practical — `margin-inline-start`
  over `margin-right`. Mostly done; work-in-progress sweep per F-7.3.
- **`.btn btn-primary / btn-secondary / btn-ghost`** is the canonical
  button system. New code uses these classes.
- **Icons via `lucide-react` only** — don't add another icon library.
- **No `console.log` in production code** (comments are fine, the
  server logger or PostHog event is the right place).
- **Don't push or tag without explicit go-ahead** — local commits are
  fine and encouraged.

## Where to look when something breaks

- Frontend error toasts: look at the Hebrew copy + grep the string
  in `frontend/src/lib/api.js` to find which status code produced it.
- Backend 500s: `sudo docker compose logs -f backend` on EC2; structured
  pino logs include `request_id`.
- Deploys: `gh run list --workflow=deploy.yml` then `gh run view <id>`.
- DB: connect with `backend/scripts/db-console.sh` (see `reference_aws_prod.md`).

More detail in `docs/audit-2026-04-21.md`.
