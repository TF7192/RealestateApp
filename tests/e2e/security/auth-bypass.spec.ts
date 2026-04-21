import { test, expect } from '@playwright/test';
import { emailMethodBtn } from '../helpers/login.ts';

/**
 * Security smoke: every protected route should redirect to login (or
 * render the login screen) for unauthenticated requests. If any of
 * these ever returns 200 with actual content for an anonymous user,
 * treat it as a P0.
 *
 * Public routes intentionally excluded:
 *   /agents/:slug, /a/:agentId, /p/:id, /public/p/:token
 */
const PROTECTED = [
  '/',
  '/properties',
  '/properties/new',
  '/owners',
  '/customers',
  '/customers/new',
  '/deals',
  '/transfers',
  '/templates',
  '/profile',
  '/admin/chats',
  '/admin/users',
  '/calculator',
  '/integrations/yad2',
];

for (const path of PROTECTED) {
  test(`unauth visitor to ${path} hits the login screen`, async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(path);
    await expect(emailMethodBtn(page)).toBeVisible({ timeout: 10_000 });
  });
}
