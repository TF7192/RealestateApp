# Changelog

User-facing and operator-visible changes, newest first. Deploy
tags match the version suffixes (e.g. `v2026.04.21-0845`).

## [Unreleased] — hardening pass (audit-2026-04-21)

### Security
- **Backend refuses to start in production without `JWT_SECRET` +
  `COOKIE_SECRET`** — previous fallback to `'dev-only-change-me'`
  let a misconfigured deploy ship with a publicly-knowable key.
- **Upgraded `fastify` 4 → 5.8.5 and `@fastify/jwt` 9 → 10.** Closes
  5 CVEs in fast-jwt (algorithm confusion, claim cache collision,
  logical DoS) and 3 in Fastify (unbounded alloc on sendWebStream,
  Content-Type body bypass, X-Forwarded-Proto spoof).
- **Signed cookies** via `@fastify/cookie` + `COOKIE_SECRET`.
- **Stricter rate limits on `/auth/login` (10 / 15min) and
  `/auth/signup` (3 / 1h)** — previously shared the global 300/min
  with every other route.

### Error handling
- **Root React error boundary** — a render crash anywhere no longer
  blanks the app; agents see a recovery UI and a "try again" button.
- **Global 401 handler** — expired sessions now redirect to
  `/login?from=…` and return the agent where they were afterward.
- **API layer now has timeouts + GET retry** — 20s default (60s for
  writes), 3 attempts on 502/503/504/network for idempotent requests.
- **Hebrew error messages for every status code** — no more
  "HTTP 500" leaking to users.
- **404 page** replaces the silent redirect to dashboard.

### Accessibility
- `--text-muted` darkened from `#8b8574` (4.05:1) to `#6b6356`
  (~6:1) — helper / date / caption text now meets WCAG AA.

### Observability
- **Readiness probe** at `/api/health/ready` — actually queries the
  database. Rolling deploys gate on this; liveness stays cheap at
  `/api/health`.

### Developer experience
- **CI pre-deploy gate** — `npm ci + tsc --noEmit` (backend) and
  `npm ci + build` (frontend) must pass before we rsync to EC2.
  Caught-once-would-have-been-twice.
- **README, CLAUDE.md** written. Before: single-line "# RealestateApp".

### Polish
- `EmptyState` canonical component (F-4.5).
- `useDebouncedValue` hook to replace ad-hoc `setTimeout` patterns
  across search inputs (F-3.4).
- `display.js` helpers (`displayText`, `displayPrice`,
  `displayDate`, `displayPriceShort`, `displaySqm`, `displayDateTime`)
  — consistent null handling + IL locale formatting.

## Previous releases

Earlier releases tracked via git tags only. See
`git log --oneline --decorate` for the history.
