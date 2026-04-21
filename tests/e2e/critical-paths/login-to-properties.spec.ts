import { test, expect } from '@playwright/test';

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
 *   TEST_AGENT_PASSWORD=Password1!
 * (the seeded demo agent; see backend/prisma/seed.ts).
 */
const EMAIL = process.env.TEST_AGENT_EMAIL ?? 'agent.demo@estia.app';
const PASSWORD = process.env.TEST_AGENT_PASSWORD ?? 'Password1!';

test.describe('Critical path @critical', () => {
  test('login → dashboard → /properties without hitting the ErrorBoundary', async ({ page }) => {
    await page.goto('/');

    // Unauth — the app catchall renders Login. Assert we're there.
    await expect(page.getByRole('textbox', { name: /אימייל|email/i })).toBeVisible();

    // Fill + submit the login form.
    await page.getByRole('textbox', { name: /אימייל|email/i }).fill(EMAIL);
    await page.getByRole('textbox', { name: /סיסמה|password/i }).fill(PASSWORD);
    // Login button label per Login.jsx: "התחבר" / "Sign in"
    await page.getByRole('button', { name: /התחבר|כניסה|sign in|log in/i }).click();

    // Arrived on dashboard.
    await expect(page).toHaveURL(/\/$/);

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
    await expect(page.getByRole('textbox', { name: /אימייל|email/i })).toBeVisible({
      timeout: 10_000,
    });
  });
});
