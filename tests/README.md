# Estia Test Suite

Three layers. Two runners. Zero flake tolerance.

| Layer | Runner | Where | What it tests |
|---|---|---|---|
| Unit | Vitest | `tests/unit/**` | Pure logic — calculators, parsers, formatters, components in isolation |
| Integration | Vitest (+ Fastify `.inject()`) | `tests/integration/**` | Real HTTP handlers against a real Postgres. Auth is real, DB is real. No third-party calls. |
| E2E | Playwright | `tests/e2e/**` | Real browser driving the real frontend against the real backend + test DB. |

Coverage matrix: see [`./COVERAGE.md`](./COVERAGE.md). Update it in the same PR as the tests it describes.

---

## Quick start

```bash
# One-time install (monorepo root)
npm install

# Unit suite — fast, no DB. Run on every save.
npm run test:unit
npm run test:unit:watch          # TDD mode

# Integration — needs a test Postgres
docker compose -f docker-compose.test.yml up -d
export DATABASE_URL="postgresql://estia:estia@localhost:54329/estia_test"
export JWT_SECRET="test-jwt-secret"
export COOKIE_SECRET="test-cookie-secret"
(cd backend && npx prisma migrate deploy)
npm run test:integration

# E2E — needs the web server running AND a seeded test DB
# In one shell:
cd backend && npm run db:seed && npm run dev
# In another:
cd frontend && npm run dev
# Then:
npm run test:e2e:critical        # smoke suite only (~1 min)
npm run test:e2e                 # full suite
npm run test:e2e:ui              # debug mode, Playwright inspector
```

---

## Writing tests — conventions

1. **Describe the behavior, not the implementation.**
   - Good: `it('returns 401 when the cookie is missing')`
   - Bad:  `it('handler calls reply.code(401)')`

2. **Selectors — role first, test-id never (unless semantic options are exhausted).**
   ```ts
   page.getByRole('button', { name: /שלח בוואטסאפ/i })  // ✅
   page.getByLabel(/אימייל/)                             // ✅
   page.locator('.btn-primary')                         // ❌ breaks on refactor
   ```

3. **No `sleep` / `page.waitForTimeout`.** Wait for the condition (`await expect(...).toBeVisible()` auto-polls). Playwright's defaults are sensible.

4. **Test data comes from factories.** Never hand-insert rows.
   ```ts
   const agent = await createAgent(prisma);
   const lead  = await createLead(prisma, { agentId: agent.id, status: 'HOT' });
   ```

5. **Hit the real boundary, mock everything beyond it.**
   - Unit test → mock HTTP with `vi.mock()` of `api.js`.
   - Integration test → use the real handler + real DB; mock third parties (Yad2, Google, S3) at the fetch/network boundary.
   - E2E → use `page.route()` to mock third parties; the local backend + frontend are real.

6. **Each test is independent.** `beforeEach` truncates the DB (integration) or cleans up the DOM (frontend). No "this test depends on that one".

---

## Adding a new test

### Unit
- Live next to the layer they cover: `tests/unit/backend/` for backend logic, `tests/unit/frontend/` for components.
- Name file `<thing>.test.ts`.
- Use `describe` → `it`. One concept per `describe`.

### Integration
- One file per resource under `tests/integration/api/`: `leads.test.ts`, `properties.test.ts`, etc.
- Every endpoint gets the 7-point matrix from COVERAGE.md (Happy / Auth / Validation / Authz / 404 / Idem / Edge).
- Use `loginAs(app, email, pw)` to get an auth cookie — never short-circuit by calling the JWT signer directly; that hides auth bugs.

### E2E
- `tests/e2e/<feature>/<flow>.spec.ts`.
- Tag critical paths with `@critical` — CI fails the build if any critical test fails.
- Use `page.getByRole/getByLabel/getByText` first. `data-testid` only when no semantic option exists.
- Capture trace + video on failure (already configured in `playwright.config.ts`).

---

## Debugging a failing test

### Vitest
- `npm run test:unit -- --reporter=verbose` for full output.
- `npm run test:unit:watch` + edit the test; it re-runs on save.
- Add `.only` to isolate, **remove before committing** (CI fails on `.only`).

### Playwright
1. Re-run with the inspector: `npx playwright test --debug <spec>`.
2. If it failed in CI, download the trace zip from the workflow artifacts, open with `npx playwright show-trace trace.zip`. Screenshots + video + DOM + network — everything is there.
3. Run headed: `npx playwright test --headed`.

---

## Flake policy

- **A flaky test is a broken test.** `retries: 1` in CI is there to survive transient infra issues (DB container slow start, network blip), **not** to mask real flake.
- If a test fails intermittently in CI: move it to `tests/quarantine/`, file an issue with the trace, fix or delete within a week. No tests live in quarantine longer than 7 days.
- **Never** use `test.skip` without a linked ticket and a remove-by date in a comment.

---

## Performance budgets (informational, enforced later)

- Unit suite: < 30s.
- Integration suite: < 90s.
- E2E critical: < 2 min.
- E2E full (chromium only): < 8 min.
- E2E full matrix (chromium + firefox + webkit): < 18 min.

If the suite crosses these thresholds: split into parallel workers, not `--retries`.
