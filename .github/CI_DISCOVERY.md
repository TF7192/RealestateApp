# CI/CD Discovery — Estia

> Point-in-time snapshot of the repo and deploy infrastructure, used as the design basis for the state-of-the-art pipeline described in `CLAUDE.md`. Verified against current tree on 2026-04-21.

---

## 1. Repo shape

- **Layout**: npm workspaces monorepo, two workspaces declared in root `package.json`:
  - `backend` — Fastify 5 + Prisma 5 + Postgres, TypeScript, ESM (`"type": "module"`).
  - `frontend` — Vite 8 + React 19 + Capacitor 8 (iOS/Android wrappers), JS (no TS in frontend).
- **Package manager**: **npm** (single `package-lock.json` at repo root, `npm ci` used everywhere). No pnpm / yarn.
- **Node**: no `.nvmrc`, no `engines` field. Current CI pins `node-version: '20'`. Production EC2 runs Node 20.20.2. Backend Dockerfile uses `mcr.microsoft.com/playwright:v1.59.1-noble` (Node 20). Frontend Dockerfile uses `node:20-alpine`.
- **No Turborepo / Nx.** No remote build cache infra in place.
- **No `engines`, no `packageManager` field.** Consider pinning both — it's table stakes for CI determinism.

### Build tooling
- Frontend: `vite build` → static assets → served by nginx in a container.
- Backend: `tsc -p tsconfig.json` → `dist/` → `node dist/server.js`.
- Prisma generate runs as part of both backend build and CI.

---

## 2. Test suite inventory

Already scaffolded (see git status — many `tests/**` files added on this branch, not yet committed to main):

### Vitest — `vitest.workspace.ts` with 3 projects
- `unit` — backend pure logic (`tests/unit/backend/**/*.test.ts`, Node env).
- `unit-frontend` — React/RTL (`tests/unit/frontend/**/*.test.{js,jsx}`, jsdom env).
- `integration` — backend + real Postgres (`tests/integration/**/*.test.ts`, forks pool, single fork, 15s timeout). Root is `backend/` so native modules (argon2) resolve correctly.

### Playwright — `playwright.config.ts`
- `testDir: tests/e2e`, Chromium by default, Firefox/WebKit/mobile-safari gated on `PLAYWRIGHT_FULL_MATRIX=1`.
- Locale he-IL / Asia/Jerusalem — RTL-first.
- Shared `storageState` produced by `tests/e2e/global-setup.ts` (single login at startup, reused).
- `@critical` tag exists for the fast-lane smoke subset.
- In CI: `retries: 1`, `workers: 2`, `forbidOnly: true`, reporters `[github, html]`, `trace/video/screenshot: retain-on-failure`.

### E2E surface area (folders present)
`a11y`, `admin`, `auth`, `calculator`, `calendar`, `chat`, `critical-paths`, `customers`, `owners`, `profile`, `public`, `rtl`, `security`, `templates`, `transfers`, `yad2`. This is a wide matrix — sharding is mandatory.

### Integration surface area
`tests/integration/api/` — `admin`, `auth`, `calendar`, `chat`, `leads`, `owners`, `profile`, `properties`, `yad2`.

### Root scripts
```
test               npm run test:unit && npm run test:integration
test:unit          vitest run --project=unit
test:integration   vitest run --project=integration
test:e2e           playwright test
test:e2e:critical  playwright test --grep @critical
test:coverage      vitest run --coverage
```
**Gap**: no root-level `lint`, `typecheck`, `build`. Frontend has `lint` (`eslint .`). Backend has `build` only. No single command to run everything.

---

## 3. Existing CI

Two workflows at `.github/workflows/`:

### `test.yml` (push to main + PR)
- 3 jobs, concurrency cancels stale runs on same ref.
- **`unit`** — `npm ci`, `npm run test:unit`. 5 min timeout. Uses `cache: 'npm'` on `setup-node`.
- **`integration`** — Postgres service on port 54329, runs root + backend installs, prisma generate, `npm run test:integration`. 10 min timeout.
- **`e2e-critical`** — same Postgres service, builds backend + frontend, starts servers in background via `(node dist/server.js &) && sleep 3`, runs `test:e2e:critical`. 10 min timeout. Uploads HTML report on failure.

**What it does well**
- Concurrency cancellation is in place.
- npm cache is enabled.
- Integration tests run against real Postgres, not mocks (aligns with CLAUDE.md policy).
- Playwright trace/video retained on failure.
- Critical-path E2E on every push is a healthy safety net.

**Gaps / smells vs the target architecture**
- **No lint job. No typecheck job.** Typecheck happens only inside the deploy workflow and the Docker build — too late for PR feedback. Broken TS lands in `main` unless the deploy tag is cut.
- **No path filtering.** Docs-only pushes run the full pipeline. Frontend-only PRs still spin up Postgres.
- **No E2E sharding.** Single runner runs all @critical tests serially, and there is no PR-lane job that runs the *full* E2E — it's only critical. The full matrix is explicitly marked `TODO` in the file.
- **No matrix for unit-frontend.** The `unit-frontend` Vitest project exists but `npm run test:unit` only runs the `unit` project. Frontend RTL tests **are not exercised in CI**. This is a real gap.
- **No security lane at all.** No CodeQL, no gitleaks, no dep audit, no Trivy on the images.
- **No Docker image build in CI.** Production builds happen on the EC2 at deploy time (see below) — the CI has never seen the container that ships.
- **No coverage reporting** despite `test:coverage` existing.
- **No reusable workflows or composite actions.** `npm ci` + `setup-node` repeated across jobs. The Postgres service block is duplicated between `integration` and `e2e-critical`.
- **No nightly lane.** No cross-browser, no visual, no Lighthouse, no mutation, no flake detection.
- **Playwright browsers not cached.** `npx playwright install --with-deps chromium` re-downloads every run.
- **TypeScript incremental / ESLint cache not persisted** across runs.
- **Secrets on E2E**: `TEST_AGENT_PASSWORD: Password1!` is hard-coded in the workflow but the seeded dev/prod account uses `estia-demo-1234` — if the CI test DB ever drifted away from its fresh seed this would bite.
- **No required-checks aggregator.** Branch protection has to list each job individually; adding a new required job means updating protection rules.
- **`vitest.workspace.ts` default run includes the `integration` project**, which needs a live DB. If someone runs plain `vitest run` on the unit job box, it would try to hit Postgres — the current CI avoids it by always naming the project, but the footgun is there.

### `deploy.yml` (tag `v*` or manual dispatch)
- SSH → rsync source → docker compose build on EC2 → `prisma migrate deploy` → healthcheck.
- Pre-deploy gate: backend typecheck + frontend build run on the GitHub runner before touching EC2.
- Managed-secrets patch: selectively rewrites `GOOGLE_CLIENT_ID/SECRET`, `PUBLIC_ORIGIN`, `POSTHOG_*` lines in `/home/ec2-user/estia-new/.env`; leaves `DATABASE_URL`, `JWT_SECRET`, etc. untouched.
- Concurrency group `estia-prod` with `cancel-in-progress: false` — deploys serialize, no mid-flight kills. Good.
- Healthcheck polls `https://estia.tripzio.xyz/api/health` 5× with 5s between.

**What it does well**
- Pre-deploy typecheck/build gate is the right instinct.
- Secrets never hit CI logs (patch file is built locally, `umask 077`, scp'd, shredded on server).
- `--remove-orphans` keeps EC2 in lockstep with compose file.

**Gaps / smells vs the target architecture**
- **No image-based deploy.** Builds run *on the production host* (`docker compose build --pull`). This means:
  - The t3.small runs a Docker build on every deploy — slow, disk-pressure-prone (the compose build even runs `sudo docker builder prune -af` first because the 8 GB root fills up).
  - No registry. No signed images. No rollback by retagging an image — rollback means `git revert` and another full rebuild.
  - The image the CI's pre-deploy gate validated is not the image that ships (CI typechecks with host Node 20; prod builds inside a Playwright-noble image).
- **No approval gate on `workflow_dispatch`.** `manual` is a button anyone with write access can press. GitHub Environments with required reviewers are not configured.
- **No rollback workflow.** `CLAUDE.md` calls for `rollback_to: <sha>` dispatch input with <5-min rollback — not present.
- **Long-lived SSH key in GitHub secrets** (`EC2_SSH_KEY`). OIDC to AWS is mentioned in `infra/terraform/main.tf` header as planned but not implemented — we're still in the long-lived-credential model the `CLAUDE.md` explicitly flags as the #1 leak vector.
- **No staging environment.** Prod is the first environment a change hits after merge → tag.
- **No smoke E2E after deploy.** Healthcheck is `curl /api/health` only; none of the seeded Playwright `@critical` tests run against the deployed URL.
- **No post-deploy notification** (Slack/Discord). Success/failure is silent.
- **`rsync --delete`** is scoped to included paths but the interaction with the include/exclude list has bitten people before. Worth an audit when we move to image-based deploys anyway.
- **`DEPLOYMENT_RUNBOOK.md` referenced by memories is now deleted** (git status shows `D DEPLOYMENT_RUNBOOK.md`). Runbook content will need to be re-established at `.github/CI_RUNBOOK.md`.

### Baseline timings
Cannot read the Actions tab from here. Flag for the first draft: **measure current `test.yml` duration before/after refactor** so we can report a real delta.

---

## 4. Deployment target

- **Single-host** EC2 in eu-north-1 (`i-07a8a9deb68cd1ff6`, t3.small, public IP 13.49.145.46).
- nginx (1.28) terminates TLS (Certbot / Let's Encrypt, auto-renew via systemd timer) and reverse-proxies:
  - `/api/` → `127.0.0.1:6002` (backend container)
  - `/uploads/` → `127.0.0.1:6002/uploads/`
  - `/` → `127.0.0.1:3001` (frontend container, nginx serving Vite dist)
- Domain `estia.tripzio.xyz` (A record → the EIP).
- Shared host with the sibling `tripzio.xyz` Tripzio API (port 8000) — CI/CD changes should be careful not to disrupt it.
- **Database**: AWS RDS Postgres 16, `db.t4g.micro`, single-AZ, not publicly accessible; SG lets only the EC2 SG in on 5432. Backups 7d retention.
- **Uploads / DB backups**: S3 `s3://estia-prod` in eu-north-1. IAM instance profile `estia-prod-app` grants scoped access — no keys on disk.
- **DB backups**: nightly pg_dump cron on the EC2 → S3 prefix `db-backups/`, 14-day S3 lifecycle expiry.
- **Budget**: `estia-monthly-40usd` budget, 80% alert to `talfuks1234@gmail.com`.

### Environments that exist today
- **prod** — live, `estia.tripzio.xyz`.
- **No staging.** No preview environments. No dev environment in AWS (dev is local `npm run dev` + docker-compose.test.yml).

### Terraform
- `infra/terraform/main.tf` provisions only the S3 bucket + EC2's IAM role + lifecycle. The EC2, EIP, SG, Route 53 record are pre-existing (not imported). File header notes a **GitHub Actions OIDC deploy role is planned** but the resource is not actually defined in the 136-line file.

---

## 5. Secrets currently in GitHub Actions

Referenced by the existing workflows:
- `EC2_SSH_KEY` — long-lived private key for `ec2-user` on the EC2.
- `EC2_USER`, `EC2_HOST` — not really secrets, but stored as such.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — OAuth creds.
- `PUBLIC_ORIGIN` — base URL (`https://estia.tripzio.xyz`).
- `POSTHOG_PROJECT_API_KEY`, `POSTHOG_HOST` — PostHog frontend telemetry.

**Not in GitHub** (kept on the EC2 `.env`):
- `DATABASE_URL` (with the RDS master password from `~/.estia_rds_pw`).
- `JWT_SECRET`, `COOKIE_SECRET`.
- AWS_* (handled by instance profile — none needed).

**Rotate-me flag from memory**: a specific IAM access key ID was pasted in chat history 3 days ago — exact key ID lives in the auto-memory file, not here. Memory says "rotate at iam.aws.amazon.com" — still a live action item independent of this work.

**Secret manager**: not in use. AWS Secrets Manager could hold `DATABASE_URL` / `JWT_SECRET` via the instance profile, but today they live plaintext in `.env` on the EC2.

---

## 6. Application inventory (what CI must protect)

- **Web app** (frontend, Vite React 19, Hebrew RTL) — primary UI.
- **Backend API** (Fastify 5 REST + Prisma 5, with `@fastify/websocket` for chat).
- **Admin panel** — served as part of the same web app (E2E folder `admin` confirms routed UI).
- **Public customer-facing pages** — E2E folder `public` + shared links workflow.
- **Yad2 integration** — scraping via `playwright` inside the backend container (explains the Playwright-base-image choice for the backend).
- **iOS / Android wrappers** — Capacitor 8, `frontend/capacitor.config.json`. **No native CI workflow yet.** Xcode build is local on Adam's Mac.
- **Hebrew/RTL + i18n** — baked into Playwright locale defaults; dedicated E2E folder `rtl`.
- **Accessibility** — `@axe-core/playwright` + jest-axe scaffolded; `tests/e2e/a11y` folder present.
- **Security-sensitive surfaces** — `tests/e2e/security/{auth-bypass, xss}.spec.ts`, admin routes, auth/JWT/Argon2 login, Google OAuth.
- **File uploads** — images/videos/signed agreements → S3 via presigned URLs.

---

## 7. Gaps summary — what the new pipeline must add

Blocking gaps (fix in the first refactor slice):
1. **Lint + typecheck jobs on every push** — currently unchecked until deploy.
2. **Frontend unit tests (`unit-frontend` project) actually running in CI.**
3. **Reusable setup composite action** — kill the `setup-node` / `npm ci` duplication.
4. **Playwright browser cache** + **TS incremental** + **ESLint cache**.
5. **Path filtering** so docs-only / backend-only / frontend-only PRs don't pay full cost.
6. **E2E sharding** (4 shards minimum) with merged HTML report.
7. **Required-checks aggregator job** so branch protection gates on one name.
8. **Coverage reporting** to PRs.

Security lane (second slice):
9. **CodeQL** SAST, **gitleaks** secret scan, **`npm audit --audit-level=high`** gate, **Trivy** image scan (once we build images in CI).
10. **Dependabot** with grouping + auto-merge on patch/minor.

Deploy modernization (third slice, after Adam approves since it changes the prod deploy shape):
11. **Build Docker images in CI**, push to a registry (ECR in the same eu-north-1 account), deploy by image tag. Removes on-host builds entirely — fixes the "disk prune before build" code-smell and unlocks true image-tag rollback.
12. **OIDC role for GitHub Actions** to AWS — retire `EC2_SSH_KEY` long-lived key, use IAM role + `aws-actions/configure-aws-credentials`. Terraform stub is already referenced in `main.tf` header.
13. **Staging environment** — option A: a second compose stack on the same EC2 on different ports; option B: a second t3.micro (~$7–10/mo extra). Either way, merges to `main` auto-deploy to staging, smoke E2E run against staging URL, then a manual-approval prod deploy.
14. **GitHub Environment protection** on `production` with required reviewer.
15. **Rollback workflow** — `workflow_dispatch` with `rollback_to: <image-tag>` input; <5 min target.
16. **Post-deploy smoke E2E** — `@critical` Playwright subset against the deployed URL, non-destructive.
17. **Notifications** — Slack webhook or Discord webhook for deploy success/failure and main-branch CI failures.

Nightly (fourth slice):
18. Cross-browser Playwright (Firefox + WebKit) via `PLAYWRIGHT_FULL_MATRIX=1`.
19. Lighthouse CI against staging with a budget file.
20. Mutation testing (Stryker) on pure-logic modules, calculator first.
21. Visual regression — defer decision (Chromatic vs Playwright screenshots) to its own slice; the E2E folder has no `*.snap` or screenshot fixtures today.
22. Flake detection job — re-run full E2E twice, diff results.

Out of scope for this engagement (flag for follow-up):
- **iOS workflow** — Capacitor build, CocoaPods, TestFlight upload. `macos-latest` runner, path-filtered. Apple Developer Team ID `WV9WGBW3AG` is in memory.
- **Remote build cache** (Turborepo / Nx). Probably not worth it at this repo size yet.
- **Self-hosted runners** — not near break-even.

---

## 8. Assumptions / decisions to confirm with Adam before writing YAML

1. **Keep npm, or migrate to pnpm?** The `CLAUDE.md` prefers pnpm. Migrating is a separate task with non-trivial blast radius (lockfile, Docker builds, workspace resolution). Default: **stay on npm** unless Adam wants to spend a day on the migration. Pin `.nvmrc` to `20.20.2` and add `"packageManager": "npm@10.x"` to root `package.json` either way.
2. **ECR vs GHCR** for image registry. ECR is natural given the AWS footprint and pairs with OIDC. Default: **ECR in eu-north-1**.
3. **Staging on the same EC2 or a second instance?** Default proposal: **same EC2, second compose stack on ports 6003/3002, `staging.estia.tripzio.xyz` subdomain, separate RDS database (or a schema) for test data isolation.** Cheapest; revisit if test data starts contaminating prod patterns.
4. **Notifications channel.** Slack? Discord? Plain email to `talfuks1234@gmail.com`? Default: assume Slack if a webhook URL is provided; otherwise email-only until asked.
5. **Adam's deploy-only-when-asked rule** (memory) — the new pipeline must **NOT auto-deploy to prod on tag push** by default. Staging auto-deploy from `main` is fine. Prod deploy stays gated behind `workflow_dispatch` with an approver. The existing `tags: [v*]` trigger on `deploy.yml` should be removed or changed to push-to-staging-only.
6. **Branch protection** is currently unknown (can't introspect from here). Assumption: none configured, or only loose. The new pipeline's required checks need to be turned on in GitHub settings after the PR lane lands green once.
7. **Secrets migration**: after OIDC lands, `EC2_SSH_KEY` gets deleted. `GOOGLE_CLIENT_SECRET` and `POSTHOG_PROJECT_API_KEY` could move to AWS Secrets Manager with the EC2 instance profile fetching at boot — nice-to-have, not blocking.
8. **Test DB password drift**: either align `TEST_AGENT_PASSWORD` env in `test.yml` with the seed (`estia-demo-1234`), or ensure the seed uses `Password1!` for CI. The divergence is a latent bug.

---

## 9. Tracked deltas (measure these when the new pipeline is live)

| Metric | Today (baseline — to measure) | Target |
|---|---|---|
| Push → green on typical change | ≈ 10–12 min (unit + integration + e2e-critical, no caching wins) | ≤ 5 min |
| PR lane full run | doesn't exist | ≤ 12 min |
| Tag → prod healthy | ≈ 10–15 min, disk-pressure-bound | ≤ 15 min, image-based, rollbackable in < 5 min |
| Frontend unit coverage reported on PR | 0 | > 0 |
| Cross-browser coverage | 0 | nightly, all 3 browsers |
| Images signed / SBOM | none | cosign + Syft on every prod image |
| Long-lived cloud creds in secrets | yes (`EC2_SSH_KEY`) | none (OIDC) |

---

## 10. Open questions before writing YAML

1. Slack webhook URL (or explicit "email-only for now")?
2. Green light to add an ECR repo + OIDC role via Terraform as part of this work, or keep infra changes separate?
3. Staging-on-same-EC2 acceptable, or stand up a second small instance?
4. Can we flip branch protection to require the new aggregator check the moment the PR lane lands, or do you want a grace period?
5. Should docs-only PRs still trigger a "docs" label check (e.g., markdown lint), or skip CI entirely?

Once these are answered, proceed to slice 2 (setup composite action + fast lane).
