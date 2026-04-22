import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

// A-1 — delete-account end-to-end. Uses a dedicated test agent so we
// don't nuke the shared demo account other specs rely on. Skipped when
// the env vars aren't provisioned (CI supplies them; local devs can
// create a throwaway account and set them ad-hoc).
//
// The test flow:
//   1. log in as the throwaway agent
//   2. navigate to /profile, scroll to the danger zone
//   3. click "מחק חשבון" — confirm dialog opens
//   4. destructive button is disabled until the phrase is typed
//   5. type phrase, click "מחק לצמיתות"
//   6. redirected to /, session terminated
//   7. logging back in with the same creds fails

const DELETE_EMAIL = process.env.TEST_DELETE_AGENT_EMAIL ?? '';
const DELETE_PASS  = process.env.TEST_DELETE_AGENT_PASSWORD ?? 'Password1!';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('A-1 — delete account', () => {
  test('scary confirm gate + successful soft delete', async ({ page }) => {
    test.skip(!DELETE_EMAIL, 'Set TEST_DELETE_AGENT_EMAIL to run delete-account E2E');
    await loginViaUI(page, DELETE_EMAIL, DELETE_PASS);

    await page.goto('/profile');
    // Scroll to the danger zone so the button is in the viewport on mobile.
    const deleteBtn = page.getByRole('button', { name: /מחק חשבון/ });
    await deleteBtn.scrollIntoViewIfNeeded();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    const dialog = page.getByRole('dialog', { name: 'מחיקת חשבון' });
    await expect(dialog).toBeVisible();

    // Destructive CTA is disabled until the phrase matches.
    const destructive = dialog.getByRole('button', { name: /מחק לצמיתות/ });
    await expect(destructive).toBeDisabled();

    // Partial phrase still disabled.
    const input = dialog.getByRole('textbox', { name: /אישור מחיקה/ });
    await input.fill('מחק');
    await expect(destructive).toBeDisabled();

    // Exact phrase enables it.
    await input.fill('מחק את החשבון שלי');
    await expect(destructive).toBeEnabled();

    await destructive.click();

    // Landing page (full-page navigation on success).
    await page.waitForURL(/\/(login|)$/, { timeout: 10_000 });

    // Logging back in should fail — the account is gone from the user's POV.
    await page.goto('/login');
    const emailMethod = page.getByRole('button', { name: /כניסה עם אימייל וסיסמה/ });
    await emailMethod.click();
    await page.locator('input[type="email"]').fill(DELETE_EMAIL);
    await page.locator('input[type="password"]').fill(DELETE_PASS);
    await page.locator('form button[type="submit"]').first().click();
    // Stays on the login surface; error toast/line appears.
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('ESC closes the dialog without deleting', async ({ page }) => {
    test.skip(!DELETE_EMAIL, 'Set TEST_DELETE_AGENT_EMAIL to run delete-account E2E');
    await loginViaUI(page, DELETE_EMAIL, DELETE_PASS);
    await page.goto('/profile');
    const deleteBtn = page.getByRole('button', { name: /מחק חשבון/ });
    await deleteBtn.scrollIntoViewIfNeeded();
    await deleteBtn.click();
    await expect(page.getByRole('dialog', { name: 'מחיקת חשבון' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'מחיקת חשבון' })).toBeHidden();
  });

  test('ביטול cancels the destructive flow', async ({ page }) => {
    test.skip(!DELETE_EMAIL, 'Set TEST_DELETE_AGENT_EMAIL to run delete-account E2E');
    await loginViaUI(page, DELETE_EMAIL, DELETE_PASS);
    await page.goto('/profile');
    const deleteBtn = page.getByRole('button', { name: /מחק חשבון/ });
    await deleteBtn.scrollIntoViewIfNeeded();
    await deleteBtn.click();
    const dialog = page.getByRole('dialog', { name: 'מחיקת חשבון' });
    await dialog.getByRole('button', { name: /ביטול/ }).click();
    await expect(dialog).toBeHidden();
  });
});
