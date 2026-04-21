import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

test.describe('Customers list + create', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('list page renders the primary CTA and a filter chip bar', async ({ page }) => {
    await page.goto('/customers');
    // F-4 / F-16 — "ליד חדש" sits rightmost, the templates-edit link is
    // demoted out of the header.
    await expect(page.getByRole('link', { name: /ליד חדש/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /ערוך תבניות הודעה/ })).toHaveCount(0);
  });

  test('/customers/new form validation — name is required', async ({ page }) => {
    await page.goto('/customers/new');
    // F-1 regression — submit with empty name should NOT silently redirect.
    // The user should see an error (toast OR inline) and stay on the form.
    await page.getByRole('button', { name: /שמור ליד/i }).first().click();
    // Either we stay on /customers/new OR we see an explicit error.
    await expect(page).toHaveURL(/\/customers\/new/);
  });

  test('create a lead end-to-end — happy path (F-1)', async ({ page }) => {
    await page.goto('/customers/new');
    const unique = `Test ${Date.now()}`;
    // Labels aren't htmlFor-linked; target by stable placeholder / type.
    await page.getByPlaceholder('שם מלא').fill(unique);
    await page.locator('input[type="tel"]').first().fill('0501234567');
    await page.getByRole('button', { name: /שמור ליד/ }).first().click();

    // Success → toast "הליד נשמר" + navigation to /customers or
    // /customers/<id>.
    await expect(page.getByText(/הליד נשמר/)).toBeVisible({ timeout: 6_000 });
    await expect(page).toHaveURL(/\/customers(\/[^/]+)?$/);
  });
});
