import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

test.describe('Templates editor', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('renders the page header + at least one kind tab', async ({ page }) => {
    await page.goto('/templates');
    await expect(page.getByRole('heading', { name: /תבניות/ }).first()).toBeVisible();
    // The kind selector has at least a BUY_PRIVATE / מכירה פרטית entry.
    // We check for the Hebrew label of the default kind family.
    await expect(page.getByText(/פרטי|מכירה|השכרה/).first()).toBeVisible();
  });
});
