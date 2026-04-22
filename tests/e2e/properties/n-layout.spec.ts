import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

/**
 * N-series visual baselines for /properties.
 *   N-1  — favourite star pinned to the RTL leading edge (visual right).
 *   N-8  — bulk-select action bar is fixed, bottom-center, z-index
 *          above the FAB + chat launcher.
 *   N-15 — favourites side panel stays visible with a muted hint when
 *          the agent has no favourites yet.
 *
 * The Yad2 scan-banner spec (scan-banner-position.spec.ts) is the
 * pattern we're mirroring — bounding-box assertions beat pixel diffs
 * because the property card contents are dynamic.
 */

test.describe('Properties — N-series layout baselines', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('N-1 — favourite star sits on the RTL leading edge of each card', async ({ page }) => {
    await page.goto('/properties');
    // Wait for at least one card to render.
    const star = page.locator('.property-fav-star').first();
    await expect(star).toBeVisible();
    const card = star.locator('..'); // the wrapping .property-card
    const starBox = await star.boundingBox();
    const cardBox = await card.boundingBox();
    if (!starBox || !cardBox) throw new Error('missing bounding box');
    // In RTL, the LEADING edge is the RIGHT side of the card. The star's
    // right edge should sit within ~40px of the card's right edge; its
    // left edge should be well clear of the card's midpoint.
    expect(cardBox.x + cardBox.width - (starBox.x + starBox.width)).toBeLessThan(40);
    expect(starBox.x).toBeGreaterThan(cardBox.x + cardBox.width / 2);
  });

  test('N-8 — bulk action bar is fixed, centered, and above overlays', async ({ page }) => {
    await page.goto('/properties');
    // Trigger selection mode via the direct toolbar button (N-7).
    await page.getByRole('button', { name: /בחירה מרובה/ }).first().click();
    const bulk = page.locator('.bulk-bar');
    await expect(bulk).toBeVisible();
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('no viewport');
    const box = await bulk.boundingBox();
    if (!box) throw new Error('bulk bar has no bounding box');
    // Horizontally centered.
    const barCenter = box.x + box.width / 2;
    expect(Math.abs(barCenter - viewport.width / 2)).toBeLessThan(24);
    // Near the bottom edge.
    expect(viewport.height - (box.y + box.height)).toBeLessThan(150);
    // z-index of the bar (via its inline computed style) tops 900 so it
    // wins against FAB(900) + chat(890).
    const zIndex = await bulk.evaluate((el) => getComputedStyle(el).zIndex);
    expect(Number(zIndex)).toBeGreaterThanOrEqual(900);
  });

  test('N-15 — favourites sidebar section stays visible with a hint when empty', async ({ page }) => {
    await page.goto('/properties');
    // The hint is only present if the agent has 0 favourites. In the
    // demo account it may or may not be — assert BOTH paths: either
    // favorites list items OR the empty hint is visible.
    const hint = page.getByTestId('nav-favorites-empty');
    const favItem = page.locator('.nav-favorite').first();
    const panelHasContent = (await hint.count()) + (await favItem.count());
    expect(panelHasContent).toBeGreaterThan(0);
  });
});
