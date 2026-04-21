import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginViaUI } from '../helpers/login.ts';

/**
 * Accessibility smoke across the top 5 most-used pages. We assert zero
 * `serious` or `critical` violations — `moderate` is logged as a warning
 * but does not fail the build. Tightened incrementally as the team
 * closes out findings.
 */
const PAGES = ['/', '/properties', '/customers', '/calculator', '/integrations/yad2'];

for (const path of PAGES) {
  test(`a11y: ${path} has no serious/critical axe violations`, async ({ page }, testInfo) => {
    await loginViaUI(page);
    await page.goto(path);
    await page.waitForLoadState('networkidle');

    const { violations } = await new AxeBuilder({ page })
      // Rules intentionally disabled today — each has a TODO against it:
      // - color-contrast: Hebrew gold-on-cream reports false positives
      //   in axe's contrast model; visual review covers it.
      // - aria-dialog-name: several role="dialog" wrappers (MobilePickers,
      //   LeadPickerSheet, tpl-sheet-back) lack aria-label. A11y backlog
      //   item — the test will re-tighten once those are labelled.
      // - meta-viewport: the app sets maximum-scale=1 to prevent iOS
      //   form-focus zoom; this is an explicit product decision that axe
      //   flags as an a11y regression. Enforced on the mobile spec only.
      .disableRules(['color-contrast', 'aria-dialog-name', 'meta-viewport'])
      .analyze();

    const severe = violations.filter((v) => ['serious', 'critical'].includes(v.impact || ''));
    const moderate = violations.filter((v) => v.impact === 'moderate');

    // Attach the full report to the run so regressions are debuggable.
    await testInfo.attach(`axe-${path.replace(/\//g, '_')}.json`, {
      body: JSON.stringify({ severe, moderate }, null, 2),
      contentType: 'application/json',
    });

    // Moderate violations are logged as a warning in the test output
    // but do NOT fail the build (intent per the test's doc comment).
    // `expect.soft` still fails, so emit via console.warn instead.
    if (moderate.length) {
      // eslint-disable-next-line no-console
      console.warn(`[a11y ${path}] moderate violations:`, moderate.map((v) => v.id));
    }
    expect(severe.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
}
