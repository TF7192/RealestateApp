import { test, expect } from '@playwright/test';
import { emailInput, passwordInput, emailMethodBtn } from '../helpers/login.ts';

/**
 * D-6 — reload on /dashboard must keep the user on /dashboard.
 *
 * Regression: before the AuthRedirect refactor the SPA rendered
 * <Login /> at path="*" for unauthenticated users. A reload on
 * /dashboard with an expired session silently painted the login
 * screen, then after the form submit the authed /login route
 * redirected to "/" — which nginx serves as the static landing
 * page — so the agent "landed on /" instead of going back to their
 * dashboard.
 *
 * The fix: unauthenticated visits to any protected route rewrite the
 * URL to /login?from=<pathname> via UnauthRedirect, and the authed
 * /login route bounces to the captured `from` via PostLoginRedirect.
 */
const EMAIL = process.env.TEST_AGENT_EMAIL ?? 'agent.demo@estia.app';
const PASSWORD = process.env.TEST_AGENT_PASSWORD ?? 'Password1!';

test.describe('D-6 dashboard reload @critical', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('authenticated reload on /dashboard stays on /dashboard', async ({ page }) => {
    await page.goto('/login');
    await emailMethodBtn(page).first().click();
    await emailInput(page).fill(EMAIL);
    await passwordInput(page).fill(PASSWORD);
    const loginResp = page.waitForResponse(
      (r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST'
    );
    await page.locator('form button[type="submit"]').first().click();
    expect((await loginResp).status()).toBe(200);

    await page.goto('/dashboard');
    // Sanity — dashboard greeting is present.
    await expect(page.getByRole('heading', { name: /שלום/ })).toBeVisible();

    // The actual regression: hit reload and make sure the URL stays.
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: /שלום/ })).toBeVisible();
  });

  test('unauthenticated visit to /dashboard redirects the URL to /login?from=%2Fdashboard', async ({ page }) => {
    await page.goto('/dashboard');
    // UnauthRedirect drops the original path into the `from` query
    // param so PostLoginRedirect can bounce back after login.
    await expect(page).toHaveURL(/\/login\?from=%2Fdashboard/);
  });
});
