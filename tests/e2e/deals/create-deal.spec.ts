import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

// E-1 — "צור עסקה" creation flow.
//
// Quick surface check: the primary button exists on /deals, opens an
// accessible dialog (role="dialog" + aria-modal="true"), and exposes
// buyer / seller / property / commission / status controls. We don't
// assert that the deal actually persists — that's the integration
// test's job. This spec guards the UX plumbing against regressions.
test.describe('Deals — create dialog', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('opens a dialog with the expected fields', async ({ page }) => {
    await page.goto('/deals');
    const cta = page.getByRole('button', { name: /צור עסקה/ }).first();
    await expect(cta).toBeVisible();
    await cta.click();

    const dialog = page.getByRole('dialog', { name: /צור עסקה/ });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    // Core field labels.
    await expect(dialog.getByLabel('נכס')).toBeVisible();
    await expect(dialog.getByLabel('קונה (ליד)')).toBeVisible();
    await expect(dialog.getByLabel('מוכר (בעלים)')).toBeVisible();
    await expect(dialog.getByLabel('סטטוס')).toBeVisible();
    await expect(dialog.getByLabel('עמלה')).toBeVisible();
  });

  test('E-2 — "פעילות" / "נחתמו" chips render the count before the label', async ({ page }) => {
    await page.goto('/deals');
    // Active tab chip reads "N פעילות" (count first). We assert the
    // visible text contains both the Hebrew word AND a leading digit.
    const activeTab = page.getByRole('button', { name: /פעילות/ }).first();
    await expect(activeTab).toBeVisible();
    const text = (await activeTab.innerText()).trim();
    expect(text).toMatch(/^\d/);
    expect(text).toContain('פעילות');
  });
});
