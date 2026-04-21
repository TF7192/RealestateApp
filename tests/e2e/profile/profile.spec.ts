import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

test.describe('Profile page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('renders the profile hero with the signed-in display name', async ({ page }) => {
    await page.goto('/profile');
    // Demo agent's display name per backend/prisma/seed.ts (יוסי כהן) —
    // used as the <h1> on the profile hero.
    await expect(page.getByRole('heading', { name: /יוסי כהן/, level: 1 }))
      .toBeVisible({ timeout: 10_000 });
  });
});
