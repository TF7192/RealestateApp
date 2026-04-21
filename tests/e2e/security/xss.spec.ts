import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

/**
 * XSS smoke: user-controlled text (lead name, etc.) must never execute.
 * React escapes by default; `dangerouslySetInnerHTML` in the wrong place
 * would bypass that. We submit a <script> payload as the lead name and
 * assert:
 *   1. The script never ran (window.__pwned stays undefined)
 *   2. The API stores and returns the payload verbatim (proving the
 *      server didn't pre-escape it, and the frontend must be the
 *      defender — which React is, by default)
 *   3. No <script> element with our sentinel is injected into the DOM
 */
test('lead name with HTML payload renders as text, not markup', async ({ page }) => {
  await loginViaUI(page);
  await page.goto('/customers/new');
  const payload = `<script>window.__pwned=${Date.now()}</script>`;
  await page.getByPlaceholder('שם מלא').fill(payload);
  await page.locator('input[type="tel"]').first().fill('0501234567');
  await page.getByRole('button', { name: /שמור ליד/ }).first().click();

  await page.waitForURL((u) => !u.pathname.endsWith('/customers/new'), {
    timeout: 10_000,
  });

  // The script must not have executed at any point.
  expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
  // No injected <script> containing our sentinel.
  expect(
    await page.evaluate(() =>
      Array.from(document.scripts).some((s) => s.textContent?.includes('__pwned'))
    )
  ).toBe(false);

  // The backend preserved the literal payload — verify via the JSON API
  // so we don't depend on where in the UI the name happens to render.
  const list = await page.request.get('/api/leads?search=script');
  expect(list.ok()).toBeTruthy();
  const names = (await list.json()).items.map((i: any) => i.name);
  expect(names.some((n: string) => n.includes('<script>'))).toBe(true);
});
