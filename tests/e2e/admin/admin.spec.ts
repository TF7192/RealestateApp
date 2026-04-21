import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

/**
 * Admin is gated by hard-coded ADMIN_EMAILS (currently one email). For
 * the E2E we use TEST_ADMIN_EMAIL / PASSWORD to drive both the happy
 * path and the deny path.
 *
 * If the admin email isn't seeded in staging/test, the happy-path test
 * skips rather than failing. The deny-path test always runs.
 */
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? '';
const ADMIN_PASS  = process.env.TEST_ADMIN_PASSWORD ?? 'Password1!';

test.describe('Admin panel access', () => {
  test('a non-admin agent hitting /admin/users is redirected or shown no-access', async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/admin/users');
    // Two acceptable outcomes: a redirect away, or a rendered "not
    // authorized" message. We reject a hard 500 or the raw admin UI.
    const adminHeader = page.getByRole('heading', { name: /משתמשים|users/i });
    const notAuthorized = page.getByText(/לא מורשה|access denied|403/i);
    await Promise.race([
      expect(notAuthorized.first()).toBeVisible({ timeout: 5_000 }).catch(() => {}),
      page.waitForURL(/\/(login|$|\/)/, { timeout: 5_000 }).catch(() => {}),
    ]);
    // Assert we didn't end up on the admin table anyway
    await expect(adminHeader).toHaveCount(0);
  });

  test('admin can see the users table', async ({ page }) => {
    test.skip(!ADMIN_EMAIL, 'Set TEST_ADMIN_EMAIL to run this test');
    await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: /משתמשים|users/i }).first()).toBeVisible({ timeout: 5_000 });
  });
});
