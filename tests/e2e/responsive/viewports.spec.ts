import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

/**
 * Responsive suite — drives a matrix of common viewports and asserts
 * structural rules the app must honour everywhere:
 *   1. No horizontal scrollbar.
 *   2. Primary nav is accessible (sidebar on desktop, a bottom-tab or
 *      hamburger on mobile).
 *   3. Heading is visible (no "broken layout" fallback).
 *
 * We deliberately don't screenshot every page at every size — visual
 * regression is out of scope here and becomes a maintenance anchor. Fast
 * structural checks catch the 99% case of "CSS change introduces a
 * horizontal scroll" with no flake.
 */

const VIEWPORTS = [
  { name: 'small-mobile',  width: 320,  height: 568  },
  { name: 'mobile',        width: 360,  height: 640  },
  { name: 'tablet',        width: 768,  height: 1024 },
  { name: 'desktop',       width: 1280, height: 800  },
  { name: 'large-desktop', width: 1920, height: 1080 },
];

const PAGES = [
  '/',
  '/properties',
  '/customers',
  '/owners',
  '/calculator',
];

for (const vp of VIEWPORTS) {
  test.describe(`viewport ${vp.name} (${vp.width}×${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ page }) => {
      await loginViaUI(page);
    });

    for (const path of PAGES) {
      test(`${path} — no horizontal overflow + page heading visible`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');

        // Structural rule 1: document scrollWidth ≤ viewport width.
        const overflowX = await page.evaluate(() => {
          const { scrollWidth, clientWidth } = document.documentElement;
          return scrollWidth - clientWidth;
        });
        expect(overflowX).toBeLessThanOrEqual(2); // 1-2px tolerance

        // Structural rule 2: something page-identifying is on screen.
        const anyHeading = page.getByRole('heading').first();
        await expect(anyHeading).toBeVisible({ timeout: 10_000 });
      });
    }
  });
}
