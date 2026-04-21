import { test, expect } from '@playwright/test';
import { emailInput, passwordInput, emailMethodBtn } from '../helpers/login.ts';

/**
 * @critical — if this fails, the product is effectively broken.
 *
 * Covers: unauth → login prompt; valid login → dashboard; nav to
 * /properties → no ErrorBoundary screen → Hebrew page title loads.
 *
 * This is the exact scenario that surfaced the /properties TDZ bug:
 * had we had this test, the prod bundle wouldn't have shipped with
 * a dead page.
 *
 * Test account comes from env:
 *   TEST_AGENT_EMAIL=agent.demo@estia.app
 *   TEST_AGENT_PASSWORD=estia-demo-1234  (matches backend/prisma/seed.ts)
 */
const EMAIL = process.env.TEST_AGENT_EMAIL ?? 'agent.demo@estia.app';
const PASSWORD = process.env.TEST_AGENT_PASSWORD ?? 'Password1!';

// Critical path runs the real login flow end-to-end.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Critical path @critical', () => {
  test('login → dashboard → /properties without hitting the ErrorBoundary', async ({ page }) => {
    await page.goto('/');

    // Login is two-step: pick email method, then fill the form.
    await emailMethodBtn(page).first().click();
    await expect(emailInput(page)).toBeVisible();

    await emailInput(page).fill(EMAIL);
    await passwordInput(page).fill(PASSWORD);
    const loginResp = page.waitForResponse(
      (r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST'
    );
    await page.locator('form button[type="submit"]').first().click();
    expect((await loginResp).status()).toBe(200);

    // Navigate to the dashboard (Login doesn't self-redirect) and verify
    // the authed Layout rendered.
    await page.goto('/');
    await expect(page.locator('nav').first()).toBeVisible({ timeout: 10_000 });

    // Go to the properties list — this was the TDZ-broken route.
    await page.goto('/properties');
    // Negative assertion first: the RootErrorBoundary's fallback copy
    // must NOT appear.
    await expect(page.getByText('משהו השתבש')).toHaveCount(0);
    // Positive assertion: we see the page header (one of the filter
    // tabs is always present when Properties mounts).
    await expect(page.getByRole('button', { name: /הכל/ }).first()).toBeVisible();
  });

  test('unauthenticated user gets redirected / shown login when hitting /properties directly', async ({ page }) => {
    await page.goto('/properties');
    await expect(emailMethodBtn(page)).toBeVisible({ timeout: 10_000 });
  });
});
