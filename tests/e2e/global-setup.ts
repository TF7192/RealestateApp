import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { chromium, request as apiRequest } from '@playwright/test';

/**
 * Playwright global-setup.
 *
 * 1. Re-seed the test DB so loginViaUI has a known-good account.
 *    Integration tests truncate between tests, so the demo agent may
 *    be missing by the time the E2E suite runs.
 * 2. Log in once and dump the browser state to tests/e2e/.auth/state.json
 *    so each test can reuse the session instead of hammering POST /login
 *    in parallel (which raced and caused flakes with many workers).
 *
 * Gated by PLAYWRIGHT_SKIP_SEED=1 for CI pipelines that seed externally.
 */
export default async function globalSetup(config: any) {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const backendDir = path.join(root, '..', '..', 'backend');
  const statePath = path.join(root, '.auth', 'state.json');

  if (process.env.PLAYWRIGHT_SKIP_SEED !== '1') {
    execSync('npm run db:seed', {
      cwd: backendDir,
      stdio: 'inherit',
      env: { ...process.env },
    });
  }

  // Log in once via the real backend and persist the cookie jar.
  const baseURL =
    (config?.projects?.[0]?.use?.baseURL as string | undefined) ||
    process.env.PLAYWRIGHT_WEB_URL ||
    'http://127.0.0.1:5174';
  const email = process.env.TEST_AGENT_EMAIL || 'agent.demo@estia.app';
  const password = process.env.TEST_AGENT_PASSWORD || 'Password1!';

  const req = await apiRequest.newContext({ baseURL });
  const res = await req.post('/api/auth/login', {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(
      `globalSetup: login failed (${res.status()}). ` +
      `Check TEST_AGENT_EMAIL / TEST_AGENT_PASSWORD and the seed.`
    );
  }
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  await req.storageState({ path: statePath });
  await req.dispose();

  // Tell Playwright the common use.storageState path via env so
  // individual specs don't have to pass it.
  process.env.E2E_STORAGE_STATE = statePath;
}
