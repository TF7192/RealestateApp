# Discovery — Punch List Engagement

Session: 2026-04-22. Principal: Adam (TF7192).

## Stack map

- **Frontend**: React 19 + Vite, React Router 7, JS + JSX (no TS on web).
  i18n is `react-i18next` in mid-migration; most copy still inline.
  Forms live on top of `SmartFields` (NumberField, PhoneField, SelectField,
  Segmented, AddressField, DateQuickChips). CSS custom properties;
  lucide-react icons.
- **Backend**: Fastify 5, Prisma 5, Postgres (RDS). Auth is JWT in a
  SIGNED httpOnly cookie. Google OAuth present (used by
  `/auth/google/native-exchange`). Playwright for scraping.
- **State**: no React Query; no Redux. Module-level stores (e.g.
  `yad2ScanStore.js`, `marketScanStore.js`) with sessionStorage
  rehydration + pub-sub. `useAuth()` for the auth context.
- **Native**: Capacitor 8 iOS over the prod URL in WKWebView.
- **Deploy**: GH Actions → rsync → docker compose on EC2. Cloudflare in
  front of the apex domain (100s edge cap is load-bearing on the
  job-queue decisions below).

## Routes (from `App.jsx`)

Landing, `/login`, `/signup`, `/dashboard`, `/properties`, `/properties/:id`,
`/customers` (leads), `/customers/:id`, `/owners`, `/owners/:id`,
`/deals`, `/reminders`, `/reports`, `/activity`, `/integrations/yad2`,
`/calculator`, `/profile`, `/office`, admin tree. Public portals at
`/a/:slug`, `/p/:id`, `/agents/:slug`.

## Tests already in place

- Vitest workspace (`vitest.workspace.ts`) with frontend (happy-dom) +
  backend (node) + integration lanes.
- MSW for API mocks in frontend unit tests.
- Playwright E2E under `tests/e2e/` — a11y, admin, login, calculator,
  customers, rtl, security (auth-bypass, xss), yad2 import.
- Policy captured in memory: "fix the app, not the test" / "never
  export *" / workspace uses happy-dom.

## Paths worth remembering

- Left-side Yad2 scan banner: `frontend/src/components/Yad2ScanBanner.jsx`
  + its CSS peer. Global toasts: `frontend/src/lib/toast.jsx`.
  Market scan banner: `frontend/src/components/MarketScanBanner.jsx`
  (just shipped, no persistent surface — toast only).
- Floating `+` FAB: `frontend/src/components/MobileAddFab.*` (or
  similar — to confirm during F-group work).
- Yad2 flow: `frontend/src/pages/Yad2Import.jsx` +
  `frontend/src/lib/yad2ScanStore.js` +
  `backend/src/routes/yad2.ts`.
- Print: to audit — no centralized helper yet, print call sites are
  scattered.
- Auth rehydration: `useAuth()` + `/api/me`, mounted in `App.jsx`.
- Logout: `api.logout()` + context reset.

## Clarifying answers from product (captured 2026-04-22)

1. **SEC-1**: The left-side Yad2 scan banner AND other scan-derived
   notifications are persisting across users. Root cause likely: module-
   level state + sessionStorage rehydration is NOT user-scoped; on
   logout we clear cookies but not `yad2ScanStore` / `marketScanStore` /
   toast buffers. Auth user B sees the tail-end of user A's scan.
2. **D-6 reload redirect**: From `/dashboard`, refresh redirects to
   landing `/`. Rehydrate on mount is broken. Likely cause: the SPA
   fallback serves `/landing.html` for `/`, and something in the auth
   probe bounces there before `/me` resolves.
3. **Y-1/Y-2 durable import**: "Rehydrate from sessionStorage on reload,
   drop on server restart" is acceptable. We already have part of this
   via `yad2ScanStore`. Need to tighten the server-side contract so the
   client can always re-attach to an in-flight job via jobId (we DO have
   `/jobs/:id` — store just needs to persist jobId across reload).
4. **P-2/P-3 agreement PDF**: pick up the PDF agent's uncommitted work
   (`backend/src/routes/prospect-pdf.ts`, pdfkit, Noto fonts) and
   complete the UI glue (PropertyDetail link + lead-link picker +
   MSW + api.js methods).
5. **A-1 delete account**: SOFT delete under the hood, scary popup on
   the surface — agent must not realize it's reversible. Shared
   properties remain visible to the co-owner agents. Implement
   `deletedAt` timestamp, add a 30-day purge job later (out of scope
   for first ship — flagged).
6. **A-2/A-3 Google signup**: Google OAuth handler already exists.
   A-2/A-3 are UI-only — add the Google button to the signup page and
   give the existing login button a subtle background.
7. **D-2 meetings**: today + next 7 days, cap 5, link to full list.
8. **N-3 duplicate asset**: metadata + images (server-side image copy
   under new property id).
9. **O-6 owner bulk**: match properties (delete, tag, export) + bulk
   reassign to another agent.
10. **E-1 deals**: add `Deal` Prisma model with buyer (lead), seller
    (owner), property, commission, close date, status
    (`negotiating|signed|closed|cancelled`).
11. **L-1/N-17 street cache**: cache server-side. Short TTL acceptable;
    keyed by `(normalized-query, city)`.
12. **N-11/L-A advanced filter**: product call — pick the best
    experience, make sure nothing overrides it. Decision: take the
    properties-page filter shape as the baseline (tags + price range +
    area + rooms + status), port to leads with lead-specific
    substitutions (rooms desired, category desired, seriousness). One
    shared component, two configs.
13. **N-16 voice gate**: existing gate in `VoiceCaptureFab` does NOT
    cover both new-lead and new-asset entry points — gate is missing
    from at least one. Audit call sites and apply the existing premium
    dialog everywhere a voice-capture trigger renders.
14. **Visual baselines**: match the Yad2 playwright/visual style (it
    already has Playwright tests in the suite). Add baselines for LP-1,
    N-5, N-8, N-15, P-4, U-1.
15. **License format**: 6–8 digits, numeric only.
16. **Priority**: SEC-1 ABOVE ALL OTHER WORK. Current async-job deploy
    (commit `e24a39f`) stays in place. SEC-1 fix will layer on top.

## License format (codified)

```js
/^\d{6,8}$/
```

Validation message: `מספר רישיון חייב להיות 6 עד 8 ספרות`.

## Open scope items flagged to product

- **Y-1 background job system**: we're staying on "in-process + polling
  + rehydrate from jobId" for now. Upgrading to BullMQ/etc is a
  follow-up engagement.
- **A-1 30-day purge**: soft-delete ships now; cron that hard-deletes at
  day 30 is follow-up work. Flagged, not shipped in this cycle.

## Next actions (sequence)

1. SEC-1 main thread, alone. Tests first. New regression tests include
   login-A → scan → logout → login-B → banner absent.
2. X-1 (print), X-2 (phone), X-3 (placeholder tokens), X-4 (mutation
   invalidation audit) — serial, main thread.
3. Audit test infra for gaps (fixtures for login-as-A, login-as-B).
4. Subagent wave per plan in CLAUDE.md.
5. Final verification → `fixes/VERIFICATION.md`.
