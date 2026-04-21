import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

/**
 * The agent public portal is SEO-critical and must render without a
 * login. We log in once to discover the demo agent's id, then clear
 * cookies and hit /a/:id as an unauth visitor.
 */
test.describe('Public agent portal', () => {
  test('GET /a/:agentId renders the portal with the agent\'s name — unauth', async ({ page, context }) => {
    await loginViaUI(page);
    const me = await page.request.get('/api/me');
    expect(me.ok()).toBeTruthy();
    const agentId = (await me.json()).user.id as string;

    await context.clearCookies();

    await page.goto(`/a/${agentId}`);
    // Portal heading is the agent's display name (seeded as יוסי כהן).
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 10_000 });
    // Negative: the login chooser must NOT render on a public portal.
    await expect(
      page.getByRole('button', { name: /כניסה עם אימייל וסיסמה/ })
    ).toHaveCount(0);
    // Positive: the display name shows somewhere on the page.
    await expect(page.getByText('יוסי כהן').first()).toBeVisible({ timeout: 6_000 });
  });

  test('GET /p/:id renders a customer-facing property view — unauth', async ({ page, context }) => {
    await loginViaUI(page);
    const list = await page.request.get('/api/properties?mine=1');
    expect(list.ok()).toBeTruthy();
    const items = (await list.json()).items;
    test.skip(!items?.length, 'No demo properties seeded');

    await context.clearCookies();
    await page.goto(`/p/${items[0].id}`);
    // The customer view always renders the agent's name on a sticky
    // contact bar; assert it shows up.
    await expect(page.getByText('יוסי כהן').first()).toBeVisible({ timeout: 10_000 });
  });
});
