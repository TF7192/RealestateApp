import { test, expect } from '@playwright/test';
import { emailInput, passwordInput, emailMethodBtn } from '../helpers/login.ts';

const EMAIL    = process.env.TEST_AGENT_EMAIL    ?? 'agent.demo@estia.app';
const PASSWORD = process.env.TEST_AGENT_PASSWORD ?? 'Password1!';

// These tests exercise the real login form, so bypass the shared auth
// state from global-setup.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Auth flows', () => {
  test('wrong password — stays on login and shows an error', async ({ page }) => {
    await page.goto('/');
    await emailMethodBtn(page).first().click();
    await emailInput(page).fill(EMAIL);
    await passwordInput(page).fill('WrongPass1!');
    await page.locator('form button[type="submit"]').first().click();

    // Still on login (form still visible) + some error surface appears.
    // Backend returns "Invalid credentials" (401); Login.jsx falls back to
    // "התחברות נכשלה" if no message is set.
    await expect(passwordInput(page)).toBeVisible();
    await expect(
      page
        .getByText(/שגיאה|invalid|credentials|לא תקין|שגויים|נכשלה/i)
        .first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('logout returns to the login screen and blocks protected pages', async ({ page, context }) => {
    await page.goto('/');
    await emailMethodBtn(page).first().click();
    await emailInput(page).fill(EMAIL);
    await passwordInput(page).fill(PASSWORD);
    const loginResp = page.waitForResponse(
      (r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST'
    );
    await page.locator('form button[type="submit"]').first().click();
    expect((await loginResp).status()).toBe(200);
    await page.goto('/');
    await expect(page.locator('nav').first()).toBeVisible({ timeout: 10_000 });

    // Clear cookies = equivalent to "logout" for the next assertion.
    await context.clearCookies();
    await page.reload();

    // After logout: login chooser is shown again.
    await expect(emailMethodBtn(page)).toBeVisible();

    // Direct-hit a protected route → login prompt.
    await page.goto('/customers');
    await expect(emailMethodBtn(page)).toBeVisible({ timeout: 10_000 });
  });
});
