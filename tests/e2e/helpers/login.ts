import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const EMAIL    = process.env.TEST_AGENT_EMAIL    ?? 'agent.demo@estia.app';
const PASSWORD = process.env.TEST_AGENT_PASSWORD ?? 'Password1!';

/**
 * The <label>s in Login.jsx aren't htmlFor-linked, so role/label selectors
 * can't find the email/password inputs. We target them by type attribute.
 */
export const emailInput = (page: Page) => page.locator('input[type="email"]');
export const passwordInput = (page: Page) => page.locator('input[type="password"]');
export const emailMethodBtn = (page: Page) =>
  page.getByRole('button', { name: /כניסה עם אימייל וסיסמה/ });

/**
 * Standard test entry point. The Playwright config loads a shared
 * storageState produced by global-setup so the cookie is already there —
 * this helper just navigates home and verifies the authed nav rendered.
 *
 * Specs that need to exercise the login form itself (e.g. auth/login.spec.ts)
 * bypass the storage state with `test.use({ storageState: ... })`.
 */
export async function loginViaUI(page: Page, _email = EMAIL, _password = PASSWORD) {
  await page.goto('/');
  await expect(page.locator('nav').first()).toBeVisible({ timeout: 10_000 });
}
