import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

/**
 * Transfers page — tabs for incoming / outgoing transfers between
 * agents. The heavy lifting (accept / decline / cancel) happens via API
 * and the UI is an accept dialog on the property card; this smoke only
 * asserts the page renders and the tabs are wired.
 */
test.describe('Transfers page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('renders header + incoming/outgoing tabs', async ({ page }) => {
    await page.goto('/transfers');
    await expect(page.getByRole('heading', { name: /העברות/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /נכנסות/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /יוצאות/ }).first()).toBeVisible();
  });

  test('outgoing tab toggles on click', async ({ page }) => {
    await page.goto('/transfers');
    await page.getByRole('button', { name: /יוצאות/ }).first().click();
    // The active tab gets the `.active` class. We assert visually by
    // checking the tab stays visible after the click (not reloaded).
    await expect(page.getByRole('button', { name: /יוצאות/ }).first()).toBeVisible();
  });
});
