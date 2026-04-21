import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

/**
 * Chat widget — floating bubble on desktop, opens a panel with an
 * input. We assert the widget opens and sends a message end-to-end.
 */
test.describe('Chat widget', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('desktop bubble is present on the dashboard', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) < 820, 'Chat bubble is desktop-only');
    await page.goto('/');
    await expect(page.getByRole('button', { name: /פתח צ׳אט/ })).toBeVisible();
  });

  test('opens the panel on click and sends a message', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) < 820, 'Uses the desktop bubble');
    await page.goto('/');
    await page.getByRole('button', { name: /פתח צ׳אט/ }).click();
    // Panel dialog renders with the header copy.
    await expect(page.getByText(/שיחה עם המפתחים/).first()).toBeVisible();
    // Type + send.
    const input = page.getByRole('textbox').last();
    const unique = `ping ${Date.now()}`;
    await input.fill(unique);
    await page.getByRole('button', { name: /שלח$/ }).click();
    // Our own message appears in the transcript.
    await expect(page.getByText(unique).first()).toBeVisible({ timeout: 6_000 });
  });
});
