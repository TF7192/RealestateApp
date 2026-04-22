# CLAUDE.md

Guidance for Claude sessions working in this repo. Match these
conventions; don't rediscover them every session.

## What this is

Estia — a Hebrew-first CRM for Israeli real estate agents. Web app +
iPhone app (Capacitor WKWebView hitting the same production URL).
Live at https://estia.co.il.

## Tech map

- **Backend**: Fastify 5, Prisma 5, Postgres (RDS). JWT in signed
  cookies. Google OAuth. Playwright for Yad2 scraping.
- **Frontend**: React 19, Vite, React Router 7. No TS on the frontend
  (JS + JSX). CSS custom properties; lucide-react for icons.
- **Native**: Capacitor 8 iOS; loads the prod web URL in WKWebView.
- **Deploy**: GitHub Actions tag-triggered → rsync → Docker compose
  on EC2. `docker` data-root moved to `/data` (40GB EBS volume).

## Conventions that matter

- **Hebrew UI copy lives inline** in JSX. No i18n library yet. Write
  English comments for developers.
- **RTL everywhere.** `dir="rtl"` on the root; use logical CSS
  properties (`margin-inline-start`) where you add new rules. Older
  files still have `margin-left` — sweep as you touch them.
- **`.btn btn-primary | btn-secondary | btn-ghost`** is the canonical
  button system. Don't invent new per-page button classes.
- **Use existing components** before building new ones:
  - Forms: `SmartFields` (NumberField, PhoneField, SelectField,
    Segmented). Address: `AddressField`. Date: `DateQuickChips`.
  - Dialogs: new ones should trap focus + use `role="dialog"` +
    `aria-modal="true"` (see F-6.4 in `docs/audit-2026-04-21.md` —
    systemic work still pending).
  - Empty states: `EmptyState` component.
  - Display helpers: `displayText / displayNumber / displayPrice /
    displayDate` in `frontend/src/lib/display.js` — use these so
    `undefined` never leaks to the UI.
- **API client** is `frontend/src/lib/api.js`. Every call goes through
  it. It handles timeouts, GET retry, 401 → login bounce, Hebrew
  error envelopes.
- **Toast system**: `useToast()` from `frontend/src/lib/toast.jsx`.
  `.success / .error / .info`. No `window.alert`.
- **Props pattern on forms**: `update(key, value)` destructures via
  `setForm((p) => ({ ...p, [key]: value }))`. Match existing forms.
- **iOS keyboard-friendly inputs** — see `frontend/src/lib/inputProps.js`.
  Spread `inputPropsForPrice()` / `inputPropsForPhone()` / etc. into
  inputs; never use `type="number"` for currency (iOS spinner jank).

## Rules Claude must follow

1. **Don't push to GitHub or tag without explicit go-ahead.** Local
   commits are fine. `git push` and `git tag` are the user's call.
   This is in the user's standing memory.
2. **Don't add new dependencies without justification.** Check if
   something equivalent already exists. Document why when adding.
3. **Don't introduce new `console.log` in shipped code.** The server
   has pino; the client has PostHog events. Comments are fine.
4. **Don't skip the audit when asked to do one.** The document is
   half the value; don't just jump to fixes.
5. **Prefer editing over rewriting.** Match the existing file's style
   even if you disagree — don't refactor neighbors for consistency.
6. **Keep commits scoped.** One topic per commit. Long commit
   messages explaining the why are welcome.

## Known gotchas

- **EC2 root partition is 8 GB** and is always at ~80% full. Docker's
  data-root was moved to `/data` (40 GB) — don't move it back.
- **nginx `map` directive must be at http-scope**, not inside a
  `server {}` block. The frontend `nginx.conf` puts it above the
  server block for this reason.
- **Playwright in production** ships via
  `mcr.microsoft.com/playwright:v1.59.1-noble` base image. Don't try
  to install Chromium at runtime — EC2 disk is too tight.
- **Cookies are now signed.** Production needs `COOKIE_SECRET` env
  var or the server refuses to start.
- **Yad2 scraping is rate-limited** to 3/rolling-hour per agent. The
  quota chip on `/integrations/yad2` surfaces the remaining count.
- **Google Calendar consent is separate from Google login.** Agents
  who logged in via email can still connect Calendar via
  `/profile → "חבר Google Calendar"`.
- **No E2E tests yet.** The pre-deploy gate is just typecheck +
  build. A broken type reaches prod if typecheck passes.

## Things NOT to touch casually

- Prisma migrations — always additive, never destructive. Don't edit
  past migrations; add a new one.
- `docker-compose.yml` — production-critical, changes need a deploy
  window.
- Google OAuth redirect URIs — whitelisted in Google Cloud Console.
  Changing the backend route requires a console update too.
- nginx routing for crawlers (`$is_social_bot` map) — WhatsApp/
  Twitterbot/FacebookExternalHit detection drives link-preview.

## Where to find things

- `docs/audit-2026-04-21.md` — production-readiness audit (~95 findings)
- `backend/prisma/schema.prisma` — data model
- `frontend/src/App.jsx` — route table
- `frontend/src/lib/api.js` — API client + error handling
- `frontend/src/components/` — reusable UI
- `.github/workflows/deploy.yml` — the deploy
