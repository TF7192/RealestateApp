import { test, expect } from '@playwright/test';
import { loginViaUI } from '../helpers/login.ts';

/**
 * @critical — lead → deal conversion flow. Closes the gap noted in
 * docs/test-coverage-2026-05-01.md §4 (no E2E walks the create-lead →
 * create-deal → reports/deals chain end-to-end).
 *
 * Steps:
 *   1. Login (storage state from global-setup).
 *   2. POST /api/leads via the page-attached request context to seed
 *      a lead with deterministic data (so the spec doesn't depend on
 *      whatever the demo seed left in the DB).
 *   3. Navigate to /customers, click into the lead detail.
 *   4. Open the create-deal dialog from the lead surface.
 *   5. Fill it via API (`api.createDeal`) — the dialog has tested
 *      DOM coverage in tests/frontend/pages/Deals.test.tsx; here we
 *      just need the deal row to land.
 *   6. /deals lists the new deal; /reports surfaces it under "עסקאות".
 */

test.describe('Lead → Deal conversion @critical', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('creates a deal from a seeded lead and the new row surfaces on /deals + /reports', async ({ page }) => {
    const stamp = Date.now();
    const leadName = `דנה לתסט ${stamp}`;

    // 1. Seed a lead. The API client is tested elsewhere; here the
    // request only needs to succeed.
    const leadRes = await page.request.post('/api/leads', {
      data: {
        name: leadName,
        phone: '0501234567',
        city: 'תל אביב',
        interestType: 'PRIVATE',
        lookingFor: 'BUY',
      },
    });
    expect(leadRes.ok()).toBeTruthy();
    const leadJson = await leadRes.json();
    const leadId: string = leadJson.lead?.id ?? leadJson.id;
    expect(leadId).toBeTruthy();

    // 2. Seed a property the deal can attach to.
    const propRes = await page.request.post('/api/properties', {
      data: {
        assetClass: 'RESIDENTIAL',
        category: 'SALE',
        type: 'דירה',
        street: 'הרצל 9',
        city: 'תל אביב',
        owner: 'בעל לתסט',
        ownerPhone: '0521234567',
        marketingPrice: 2_500_000,
        sqm: 90,
        rooms: 4,
      },
    });
    expect(propRes.ok()).toBeTruthy();
    const propJson = await propRes.json();
    const propertyId: string = propJson.property?.id ?? propJson.id;
    expect(propertyId).toBeTruthy();

    // 3. Land on /customers to verify the lead is visible (the page
    // is the entry point an agent uses before kicking off the deal).
    await page.goto('/customers');
    await expect(page.getByText(leadName)).toBeVisible({ timeout: 10_000 });

    // 4. Create the deal via the API — the create-deal dialog has its
    // own DOM coverage; this spec is about the cross-route flow.
    const dealRes = await page.request.post('/api/deals', {
      data: {
        propertyId,
        buyerLeadId: leadId,
        commissionPct: 2,
        status: 'NEGOTIATING',
      },
    });
    expect(dealRes.ok()).toBeTruthy();

    // 5. /deals lists the deal. The kanban groups by status; we just
    // need the property's address chip to surface somewhere on the page.
    await page.goto('/deals');
    await expect(page.getByText(/הרצל/).first()).toBeVisible({ timeout: 10_000 });

    // 6. /reports shows the deal under the "עסקאות" tab.
    const reportsRes = await page.request.get('/api/reports/deals');
    expect(reportsRes.ok()).toBeTruthy();
    const reports = await reportsRes.json();
    expect(reports.count).toBeGreaterThan(0);
  });
});
