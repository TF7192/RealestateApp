import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

/**
 * The calculator is pure client-side. We sanity-check that the hero
 * number changes as the user types — the math itself is covered
 * exhaustively by the unit suite (tests/unit/backend/sellerCalc.test.ts).
 *
 * This E2E protects against regressions in the React wiring: the input
 * → debounced state → memoized calc → animated display chain.
 */
test.describe('Seller calculator', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('entering a sale price produces a non-zero net number (desktop)', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) < 820, 'Desktop calc renders only ≥820px; mobile has its own.');
    await page.goto('/calculator');
    // Input labeled "מחיר מכירה (₪)" per SellerCalculator.jsx:138.
    const priceInput = page.getByLabel(/מחיר מכירה/);
    await priceInput.fill('2500000');
    // Hero label for forward mode: "הסכום שיישאר לבעלים".
    const hero = page.getByText(/הסכום שיישאר לבעלים/).first();
    await expect(hero).toBeVisible();
    // The net amount is rendered with RTL marks interleaved:
    // "‏2,426,250 ‏₪". Just assert that a 7-digit number (≥1M ₪)
    // appears near the hero — that covers any punctuation order.
    await expect(page.getByText(/\d,\d{3},\d{3}/).first()).toBeVisible();
  });
});
