import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

/**
 * Owners page:
 *   - Lists the agent's owners with header count
 *   - "בעל נכס חדש" opens the edit dialog
 *   - Dialog requires a name; valid submit persists and toasts
 *
 * Data hygiene: each run uses a timestamped name so concurrent/previous
 * runs against a shared test DB don't collide.
 */
test.describe('Owners list + create', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('list page renders the header and the primary CTA', async ({ page }) => {
    await page.goto('/owners');
    await expect(page.getByRole('heading', { name: /בעלי נכסים/ }).first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: /בעל נכס חדש/ }).first()
    ).toBeVisible();
  });

  test('create-owner form requires a name', async ({ page }) => {
    await page.goto('/owners');
    await page.getByRole('button', { name: /בעל נכס חדש/ }).first().click();
    // Dialog open: the Save button is present; click it with empty name.
    await page.getByRole('button', { name: /צור בעל נכס/ }).click();
    // The dialog stays open and shows the validation error.
    await expect(page.getByText(/שם הוא שדה חובה/)).toBeVisible();
  });

  test('create an owner end-to-end (happy path)', async ({ page }) => {
    await page.goto('/owners');
    await page.getByRole('button', { name: /בעל נכס חדש/ }).first().click();
    const unique = `בעלים ${Date.now()}`;
    // Name is the first input in the dialog and has autoFocus — fill it
    // via its placeholder which is stable.
    await page.getByPlaceholder('ישראל ישראלי').fill(unique);
    // Phone field is a PhoneField — use its placeholder or type[tel].
    await page.locator('input[type="tel"]').first().fill('0501234567');
    await page.getByRole('button', { name: /צור בעל נכס/ }).click();

    // Toast confirms save + the new name appears in the list.
    await expect(page.getByText(/בעל הנכס נשמר|נשמר/).first()).toBeVisible({ timeout: 6_000 });
    await expect(page.getByText(unique).first()).toBeVisible({ timeout: 6_000 });
  });
});
