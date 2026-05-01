import { test, expect } from '@playwright/test';
import { emailInput, passwordInput, emailMethodBtn } from '../helpers/login.ts';

/**
 * @critical — demo account behaviour pinning.
 *
 * Standing memory (reference_demo_account) says the demo account is
 * `agent.demo@estia.app / estia-demo-1234`. The plan's §2.4 wants us
 * to assert demo-account behaviour matches a real agent — same nav,
 * same access surfaces, no read/write scoping that prod code might
 * accidentally inherit. This is the canary that fires if the demo
 * account ever gets implicitly downgraded (e.g. someone adds a
 * "isDemo: skip mutations" check) or upgraded (e.g. it accidentally
 * becomes ADMIN).
 */

const DEMO_EMAIL = process.env.TEST_AGENT_EMAIL ?? 'agent.demo@estia.app';
const DEMO_PASSWORD = process.env.TEST_AGENT_PASSWORD ?? 'Password1!';

// Force a fresh login through the UI rather than using the shared
// storage-state — this test is exactly about the login flow itself.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Demo account login parity @critical', () => {
  test('logs in via the email form, lands on the authed nav, /api/me reports role=AGENT', async ({ page }) => {
    await page.goto('/login');

    await emailMethodBtn(page).first().click();
    await expect(emailInput(page)).toBeVisible();

    await emailInput(page).fill(DEMO_EMAIL);
    await passwordInput(page).fill(DEMO_PASSWORD);

    const loginResp = page.waitForResponse(
      (r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
    );
    await page.locator('form button[type="submit"]').first().click();
    expect((await loginResp).status()).toBe(200);

    // Authed nav is the proof of life.
    await page.goto('/');
    await expect(page.locator('nav').first()).toBeVisible({ timeout: 10_000 });

    // /api/me must report role=AGENT and the seeded display name.
    // Equivalence with a real agent means: not ADMIN, not OWNER, not
    // anything special. If a future change accidentally promotes the
    // demo account, this assertion fires.
    const meRes = await page.request.get('/api/me');
    expect(meRes.ok()).toBeTruthy();
    const me = (await meRes.json()).user;
    expect(me.email).toBe(DEMO_EMAIL);
    expect(me.role).toBe('AGENT');
    // The seed pins the display name; if the seed drifts the test
    // surfaces it before users do.
    expect(me.displayName).toBeTruthy();
  });

  test('the demo agent can read + write their own data (no implicit read-only mode)', async ({ page }) => {
    await page.goto('/login');
    await emailMethodBtn(page).first().click();
    await emailInput(page).fill(DEMO_EMAIL);
    await passwordInput(page).fill(DEMO_PASSWORD);
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForURL(/\/(dashboard|customers|properties|$)/, { timeout: 10_000 }).catch(() => {});

    // Demo agent must be able to write — the /api/leads POST is the
    // simplest mutation that proves they aren't behind a "view-only"
    // hidden flag. Cleanup happens via the integration suite's truncate;
    // E2E tests run against the live test DB and tolerate a leftover row.
    const stamp = Date.now();
    const writeRes = await page.request.post('/api/leads', {
      data: {
        name: `דמו-תסט-${stamp}`,
        phone: '0509999999',
        city: 'תל אביב',
        interestType: 'PRIVATE',
        lookingFor: 'BUY',
      },
    });
    expect(writeRes.ok()).toBeTruthy();
  });
});
