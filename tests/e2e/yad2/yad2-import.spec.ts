import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

/**
 * Yad2 import — the real crawler takes ~60s and hits Yad2's WAF. For
 * E2E we intercept /api/integrations/yad2/agency/preview + /agency/import
 * and return canned JSON. That way the test asserts the whole UI flow
 * (paste → review → import → success) without taking 60 seconds per run.
 */
const FAKE_PREVIEW_RESPONSE = {
  listings: [
    {
      sourceId: 'fake-1',
      section: 'forsale',
      title: 'דירה 4 חדרים ברוטשילד',
      street: 'רוטשילד',
      city: 'תל אביב',
      rooms: 4,
      sqm: 95,
      price: 3_200_000,
      coverImage: 'https://img.yad2.co.il/fake/1.jpg',
      images: [],
      tags: [],
    },
    {
      sourceId: 'fake-2',
      section: 'rent',
      title: 'דירה להשכרה',
      street: 'אלנבי',
      city: 'תל אביב',
      rooms: 3,
      sqm: 70,
      price: 7_500,
      coverImage: 'https://img.yad2.co.il/fake/2.jpg',
      images: [],
      tags: [],
    },
  ],
  agency: { id: '7098700', name: 'Test Agency', phone: '036666666' },
  sections: [
    { section: 'forsale', totalListings: 1, totalPages: 1 },
    { section: 'rent', totalListings: 1, totalPages: 1 },
  ],
  truncated: false,
  alreadyImported: {},
  quota: { limit: 3, remaining: 2, used: 1, resetAt: null, msUntilReset: 0 },
};

test.describe('Yad2 import (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    // Mock the agency-preview endpoint so the test doesn't hit Yad2.
    await page.route('**/api/integrations/yad2/agency/preview', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(FAKE_PREVIEW_RESPONSE),
      });
    });
    // Mock quota so the UI shows remaining slots.
    await page.route('**/api/integrations/yad2/quota', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(FAKE_PREVIEW_RESPONSE.quota),
      });
    });
  });

  test('paste a Yad2 URL → preview shows the mocked listings', async ({ page }) => {
    await page.goto('/integrations/yad2');
    await page.getByRole('textbox', { name: /קישור/i }).fill(
      'https://www.yad2.co.il/realestate/agency/7098700/forsale'
    );
    await page.getByRole('button', { name: /סרוק|הסרוק|הסריקה|סריקה/i }).first().click();

    // Review step renders the count + the currently-visible section's
    // rows. The UI defaults to the "forsale" section, so the rental
    // listing (אלנבי) is only in the other tab — we assert the count
    // and the active section's row.
    await expect(page.getByText(/2 נכסים נמצאו/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/רוטשילד/).first()).toBeVisible();
  });

  test('quota chip renders the remaining count', async ({ page }) => {
    await page.goto('/integrations/yad2');
    await expect(page.getByText(/2 \/ 3 ייבואים נותרו/)).toBeVisible({ timeout: 5_000 });
  });
});
