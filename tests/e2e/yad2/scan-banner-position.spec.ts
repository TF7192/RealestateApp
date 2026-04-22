import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

/**
 * U-1 — Yad2 scan banner lives at the bottom-CENTER of the viewport
 * (not bottom-left as before) so it doesn't collide with the gold "+"
 * FAB on the right or the chat button on the left. Full-width on mobile,
 * max-width 480px centered on desktop.
 *
 * We drive the banner by seeding sessionStorage with a completed-scan
 * snapshot — that's how the store rehydrates a "the scan just finished"
 * state without running the 60s Playwright crawl.
 */

const FAKE_COMPLETED_SCAN = {
  status: 'done' as const,
  url: 'https://www.yad2.co.il/realestate/agency/7098700/forsale',
  startedAt: Date.now() - 60_000,
  finishedAt: Date.now() - 5_000,
  result: {
    listings: [
      { sourceId: '1', section: 'forsale', city: 'תל אביב', street: 'רוטשילד', rooms: 4 },
      { sourceId: '2', section: 'rent', city: 'תל אביב', street: 'אלנבי', rooms: 3 },
    ],
    agency: { id: '7098700', name: 'Test Agency' },
    sections: [],
    truncated: false,
    alreadyImported: {},
  },
  error: null,
  quota: { limit: 3, remaining: 2, used: 1, resetAt: null, msUntilReset: 0 },
};

test.describe('U-1 — Yad2 scan banner position + dismiss', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('banner renders bottom-center and has a real close button', async ({ page }) => {
    // Seed the store BEFORE navigation so the banner mounts with state.
    await page.addInitScript((snap) => {
      sessionStorage.setItem('estia-yad2-last-scan', JSON.stringify(snap));
    }, FAKE_COMPLETED_SCAN);

    // Navigate to a page OTHER than /integrations/yad2 — the banner
    // hides itself on the yad2 page because the inline UI already shows
    // the result there.
    await page.goto('/properties');

    const banner = page.getByTestId('yad2-scan-banner');
    await expect(banner).toBeVisible();

    // Bottom-center — the banner's horizontal center should land near
    // the viewport's horizontal center (within half the max-width).
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('no viewport size');
    const box = await banner.boundingBox();
    if (!box) throw new Error('banner has no bounding box');
    const bannerCenterX = box.x + box.width / 2;
    const viewportCenterX = viewport.width / 2;
    expect(Math.abs(bannerCenterX - viewportCenterX)).toBeLessThan(24);

    // The banner sits near the bottom of the viewport.
    const bannerBottom = box.y + box.height;
    expect(viewport.height - bannerBottom).toBeLessThan(120);

    // The close button is a real <button> with aria-label.
    const closeBtn = banner.getByRole('button', { name: /סגור/ });
    await expect(closeBtn).toBeVisible();
  });

  test('clicking X dismisses the banner for the same completion', async ({ page }) => {
    await page.addInitScript((snap) => {
      sessionStorage.setItem('estia-yad2-last-scan', JSON.stringify(snap));
    }, FAKE_COMPLETED_SCAN);

    await page.goto('/properties');

    const banner = page.getByTestId('yad2-scan-banner');
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: /סגור/ }).click();
    await expect(banner).toBeHidden();

    // A full navigation away and back MUST NOT resurrect the banner —
    // dismissal is keyed to this completion's finishedAt timestamp.
    await page.goto('/customers');
    await expect(page.getByTestId('yad2-scan-banner')).toBeHidden();
  });
});
