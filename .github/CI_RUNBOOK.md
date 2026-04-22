# CI/CD Runbook — Estia

Quick reference for humans: how to read the pipeline, debug a failure, deploy, and roll back.

Companion to `CI_DISCOVERY.md` (design basis).

---

## 1. Shape at a glance

| Workflow | Trigger | Job summary | Budget | Blocking? |
|---|---|---|---|---|
| `fast.yml` | push (not main) + called by others | changes · lint · typecheck · unit (backend+frontend) · build | ≤ 5 min | Per-branch signal |
| `pr.yml` | pull_request | calls fast + integration + E2E (sharded ×4, Chromium) + audit | ≤ 12 min | PR signal |
| `main.yml` | push to main | calls fast + integration + E2E critical + issue-on-failure | ≤ 12 min | Post-merge safety net |
| `nightly.yml` | cron 02:17 UTC | E2E × {chromium, firefox, webkit} × 4 shards + flake rerun + deep audit | ≤ 45 min | Informational |
| `security.yml` | pull_request + weekly | CodeQL + gitleaks | ≤ 12 min | PR signal |
| `deploy-prod.yml` | manual dispatch only | ssh → rsync → compose build → migrate → smoke | ≤ 25 min | Manual |

No staging environment. No auto-deploy. Deploys are strictly manual (per the "deploy only when asked" rule).

---

## 2. Everyday flow

1. **Open a PR from a feature branch.**
   - `fast.yml` runs on every push to the branch (cancels stale runs).
   - `pr.yml` + `security.yml` run on every `pull_request` event.
   - Path filtering: docs-only changes skip everything except the `changes` job.
2. **Merge to `main`.**
   - `main.yml` re-runs the PR pyramid against the merged SHA.
   - If it fails, a GitHub issue is opened with label `ci-failure` — you get an email from GitHub's default issue notifications.
3. **Deploy when ready.**
   - Actions tab → **Deploy → production** → *Run workflow*.
   - Pick the ref (default `main`). Click run. Gated by the `production` environment (required-reviewer if configured).
4. **Nightly fires at 05:17 Asia/Jerusalem.** Critical failures open an issue labelled `nightly-failure`.

---

## 3. Debugging a failed run

### PR lane failed
1. Open the PR → Checks tab → pick the red job.
2. First look at the **step summary** (shown on the run page, no log scrolling).
3. If E2E failed, download the `playwright-html-report` artifact from the run's Artifacts list. Also check `e2e-traces-<shard>` for Playwright traces / video (only uploaded on failure, retained 14 days).
4. Integration test failed? `services.postgres` logs aren't exposed automatically — if the test output doesn't make the cause obvious, open a fresh PR that adds `run: sudo docker logs $(docker ps -aqf ancestor=postgres:16-alpine)` to the step and re-push.
5. Audit failed? Check which lockfile. Run `npm audit --audit-level=high --omit=dev` locally in that directory to see the advisory and decide: upgrade, vendor-fix, or (last resort) document a temporary override.

### main.yml opened a `ci-failure` issue
1. Click the issue → it links to the failed run.
2. Don't deploy while the issue is open. Fix-forward or revert; close the issue when the next main run goes green (manual — we don't auto-close yet).

### Nightly failure
1. Check the `nightly-failure` issue. Cross-browser failures are often WebKit-specific CSS issues that never show in Chromium.
2. Flake report is in the `flake-rerun` job's step summary.

### "It works locally, fails in CI"
- Check Node version: CI pins `.nvmrc` = 20.20.2. Use `nvm use` locally.
- Check lockfiles: CI uses `npm ci` (exact lockfile). Local `npm install` may have drifted.
- Check Prisma client freshness: CI runs `npx prisma generate` in setup; if you edited the schema without regenerating locally, runtime behavior can diverge.

---

## 4. Deploying to production

### Normal deploy
```
Actions → Deploy → production → Run workflow
  ref = main          (or the SHA you want)
  skip_migrations = false
```

Flow: checkout ref → typecheck + build on the runner (pre-deploy gate) → SSH to EC2 → rsync source → patch managed secrets into `.env` → `docker compose build --pull` → `up -d --remove-orphans` → `prisma migrate deploy` → write the SHA to `/home/ec2-user/estia-new/.deployed_sha` → 3-point smoke test against `estia.co.il`.

Smoke test asserts:
- `GET /api/health` → `{"ok":true}`
- `GET /` → 200
- `GET /api/auth/me` → 401 (proves app + auth + DB are up, non-destructive)

### Rolling back
Fast path — same workflow, with an older SHA:
```
Actions → Deploy → production → Run workflow
  ref = <older-sha-or-tag>
  skip_migrations = true     # if the older SHA predates the last migration
```

Finding the previous SHA:
```
ssh -i ~/Downloads/tripzio.pem ec2-user@ec2-13-49-145-46.eu-north-1.compute.amazonaws.com \
  'cat /home/ec2-user/estia-new/.deploy_history'
```
The file keeps the last 5 prior deploys with timestamps.

**On `skip_migrations`**: Prisma's `migrate deploy` only applies new migrations — it never reverses them. If the older SHA's schema is a strict subset of prod's current schema and the removed columns/tables don't break the older code, rolling back works *without* `skip_migrations`. If the rollback target predates a migration that broke compatibility, you need a schema rollback plan out-of-band — the workflow can't do this safely. When in doubt, `skip_migrations=true` + inspect.

**Target:** rollback completes in under 5 min. The heavy cost is the on-EC2 `docker compose build`; consider pre-warming a registry-based deploy if this becomes painful (see follow-ups).

### Smoke failure after deploy
The workflow exits non-zero and the step summary shows which probe failed. The app is left in the newly-deployed state — decide whether to roll back (above) or fix-forward. The `.deployed_sha` on the host reflects the failed deploy until the next successful run overwrites it.

---

## 5. Secrets

Currently required in repo **Settings → Secrets and variables → Actions**:

| Secret | Purpose | Rotation |
|---|---|---|
| `EC2_SSH_KEY` | Private SSH key for `ec2-user` deploys | Regenerate + update `~/.ssh/authorized_keys` on the host; replace the secret. |
| `EC2_USER` | `ec2-user` (stored as secret to avoid printing in logs) | n/a |
| `EC2_HOST` | `ec2-13-49-145-46.eu-north-1.compute.amazonaws.com` | Rarely |
| `GOOGLE_CLIENT_ID` | OAuth | Google Cloud console |
| `GOOGLE_CLIENT_SECRET` | OAuth | Google Cloud console |
| `PUBLIC_ORIGIN` | `https://estia.co.il` | n/a |
| `POSTHOG_PROJECT_API_KEY` | PostHog public project token | PostHog dashboard |
| `POSTHOG_HOST` | PostHog ingestion URL | n/a |
| `SLACK_WEBHOOK_URL` | Incoming webhook for CI notifications (see §5.1) | Regenerate in Slack, replace the secret. |

### 5.1 Slack integration

**One-time setup** (takes ~3 minutes):

1. In Slack, go to **Apps → Build → Your Apps → Create New App → From scratch**.
2. Name it `Estia CI` (or anything), pick the Slack workspace, create.
3. In the app settings, pick **Incoming Webhooks → activate**, click **Add New Webhook to Workspace**, select the channel (e.g. `#estia-ci`), authorize.
4. Copy the resulting URL (`https://hooks.slack.com/services/T…/B…/…`).
5. In GitHub: repo **Settings → Secrets and variables → Actions → New repository secret**, name = `SLACK_WEBHOOK_URL`, value = the URL, save.

That's it. All workflows now post there. The composite action `.github/actions/slack-notify` no-ops silently if the secret is missing, so forks / unconfigured repos won't fail.

**What pings what:**

| Workflow | When it posts |
|---|---|
| `fast.yml` | never (too noisy — every branch push would fire) |
| `pr.yml` | on completion: success + failure + cancelled (one message per PR run) |
| `main.yml` | on completion: success + failure + cancelled |
| `nightly.yml` | on completion: summary of cross-browser E2E + flake + deep audit |
| `security.yml` | on failure only (CodeQL / gitleaks findings) |
| `deploy-prod.yml` | 2 messages per run: *starting* + *finished (success/failure/cancelled)* |

**Tuning down** if noisy: edit the `notify` job's `if:` in each workflow — the simplest is `if: failure()` to only ping on red. Deploy notifications should stay verbose; those are the ones you actually want.

**Message format:** colored attachment (green/red/grey/blue), title line, and a context row with repo, ref, actor, short SHA (linked to the commit), and "open run" link. Failures include an extra details block.

Not in GitHub — live on the EC2 `.env`: `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET`. AWS credentials are handled by the EC2 instance profile (`estia-prod-app`), no keys needed.

**Rotate-when-you-get-a-chance** (flagged in memory): a specific IAM access key was pasted in an old chat — rotate at iam.aws.amazon.com. The exact key ID is in the memory file, not here. Independent of this pipeline.

---

## 6. Cost notes

Minutes burned per typical day (GitHub Linux minutes):

| Event | Minutes | Notes |
|---|---|---|
| Feature-branch push | ~5 (fast lane only) | Reduces to ~1 on docs-only pushes thanks to path filter |
| PR open / push | ~12 (fast + integration + 4 E2E shards + audit + CodeQL + gitleaks) | Shards run in parallel so wall-time is the bottleneck, not minutes |
| Merge to main | ~8 (fast + integration + E2E critical) | |
| Nightly | ~45 (12 E2E jobs) | 3 browsers × 4 shards |
| Weekly deep audit | ~1 | |

If nightly minutes become a problem, trim to Chromium + WebKit only; Firefox + Chromium catch almost the same set of issues. Keep WebKit because it surfaces iOS Safari issues.

**No macOS minutes are used anywhere.** iOS workflow is out of scope for now (follow-up).

---

## 7. Adding a new workflow

1. Copy the shape from `fast.yml` (composite setup + `actions/checkout` + explicit `permissions`).
2. Always set `concurrency` to cancel stale runs on the same ref.
3. Always use `./.github/actions/setup-project` for Node + install — don't hand-roll `setup-node` + `npm ci`.
4. Default to `permissions: contents: read`. Elevate explicitly when the job writes issues/comments/artifacts.
5. For E2E, reuse the Postgres service block + env from `pr.yml`. When test count grows, bump `--shard=4` to `8`.

---

## 8. Known gaps / follow-ups (by priority)

1. **Frontend/backend lockfile consolidation.** Three separate `package-lock.json` files (root + backend + frontend) is non-idiomatic for npm workspaces. Hoisting would simplify installs and Docker builds — separate task.
2. **Registry-based deploys (GHCR, free).** Moves image build off the t3.small, enables true tag-based rollback without rebuild, unblocks image signing (cosign) and SBOM (Syft). Adam asked to skip unless cheaper than current — GHCR private is free up to 500MB which we fit in; evaluating this is worth a half-day.
3. **OIDC to AWS.** Retire `EC2_SSH_KEY` long-lived key. Terraform stub already referenced in `infra/terraform/main.tf` header. Requires defining the role + trust policy in TF and switching `deploy-prod.yml` to `aws-actions/configure-aws-credentials`.
4. **Visual regression.** No snapshots today. Options: Playwright page screenshots with `toHaveScreenshot` + a stable baseline, or Chromatic (paid). Not blocking.
5. **Lighthouse CI.** Needs a stable URL (staging or prod). Against prod it's invasive (real analytics hits). Revisit once we have a safer target.
6. **Mutation testing (Stryker)** on pure-logic modules (calculator first). High-value, but requires a seed investment. Separate task.
7. **iOS workflow.** Capacitor build + TestFlight. `macos-latest` runner (10× cost), path-filtered to `ios/**`.
8. **`ci-failure` / `nightly-failure` labels must exist** in the repo for the issue-creation steps to succeed cleanly — if they don't, the step still runs but falls back to no label. Create them once in repo Settings → Labels.
9. **Auto-close `ci-failure` issue** when main next goes green. Currently manual.
10. **Flake tracking over time.** The nightly flake job reports per-run only. A weekly digest that reads the last N runs and names repeat offenders would be valuable.
