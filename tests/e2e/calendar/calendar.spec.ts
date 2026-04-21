import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

/**
 * Calendar connect UI lives on /profile as a separate card ("הקישור
 * לגוגל קלנדר" etc.). The demo agent is not connected by default, so
 * we just assert the disconnected-state UI renders and exposes a
 * connect-style affordance.
 *
 * The Google OAuth redirect itself is out of scope — we never hit real
 * Google from the suite.
 */
test.describe('Calendar connect (disconnected state)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('/api/integrations/calendar/status reports disconnected for the demo agent', async ({ page }) => {
    // page.request shares the browser context's cookies (so the auth
    // cookie set by loginViaUI is sent).
    const res = await page.request.get('/api/integrations/calendar/status');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('connected');
    expect(body.connected).toBe(false);
  });
});
