import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

/**
 * RTL smoke: verifies that the top-level pages render with `dir="rtl"`
 * on <html>, and that the standard viewport has no horizontal scrollbar
 * (a common RTL regression when margin-left leaks in from an LTR sweep).
 */
const PAGES = ['/', '/properties', '/customers', '/owners', '/calculator'];

for (const path of PAGES) {
  test(`RTL: ${path} has <html dir="rtl"> and no horizontal overflow`, async ({ page }) => {
    await loginViaUI(page);
    await page.goto(path);
    await page.waitForLoadState('networkidle');

    // 1. root direction
    const dir = await page.evaluate(() => document.documentElement.dir);
    expect(dir).toBe('rtl');

    // 2. no horizontal overflow on a standard desktop viewport
    const overflowX = await page.evaluate(() => {
      const { scrollWidth, clientWidth } = document.documentElement;
      return scrollWidth - clientWidth;
    });
    // 1–2px tolerance for sub-pixel rendering.
    expect(overflowX).toBeLessThanOrEqual(2);
  });
}

test('No untranslated i18n.key placeholders visible anywhere on the dashboard', async ({ page }) => {
  await loginViaUI(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const body = await page.locator('body').textContent();
  // Heuristic: any literal i18n.foo.bar string is a bug — there's no
  // such key shape in the app's UI copy.
  expect(body).not.toMatch(/\bi18n\.[a-z_.]+/i);
});
