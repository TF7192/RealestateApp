import { test, expect } from '@playwright/test';

/**
 * @critical — full agent-A → agent-B property handoff.
 *
 * The existing transfers.spec.ts covers the /transfers UI shell;
 * this one walks the actual ownership transfer end-to-end:
 *
 *   1. Agent A signs up + seeds a property.
 *   2. Agent B signs up.
 *   3. Agent A initiates a transfer to B's email.
 *   4. Agent B accepts the transfer.
 *   5. The Property's agentId now points at B; A no longer sees it
 *      under `mine=1`; B does.
 */

const passwordForBoth = 'TransferPass1!';

async function signupAndLogin(request: any, email: string, displayName: string) {
  const res = await request.post('/api/auth/signup', {
    data: {
      email,
      password: passwordForBoth,
      role: 'AGENT',
      displayName,
      acceptedTerms: true,
    },
  });
  if (!res.ok()) throw new Error(`signup failed for ${email}: ${res.status()}`);
}

test.describe('Property transfer A → B @critical', () => {
  // Bypass the shared storage state so each agent gets their own session.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('seller initiates transfer; buyer accepts; ownership flips', async ({ browser }) => {
    const stamp = Date.now();
    const aEmail = `transfer-a-${stamp}@example.com`;
    const bEmail = `transfer-b-${stamp}@example.com`;

    // ── Agent A: signs up, seeds a property
    const aCtx = await browser.newContext();
    const aPage = await aCtx.newPage();
    await signupAndLogin(aPage.request, aEmail, `מעביר ${stamp}`);
    // signupAndLogin uses the request context which doesn't auto-set
    // cookies in a NEW page — re-issue login via the page so cookies
    // land in the browser context.
    await aPage.request.post('/api/auth/login', {
      data: { email: aEmail, password: passwordForBoth },
    });

    const propRes = await aPage.request.post('/api/properties', {
      data: {
        assetClass: 'RESIDENTIAL',
        category: 'SALE',
        type: 'דירה',
        street: `העברה ${stamp % 1000}`,
        city: 'הרצליה',
        owner: 'בעל לתסט',
        ownerPhone: '0531112222',
        marketingPrice: 2_700_000,
        sqm: 90,
        rooms: 3,
      },
    });
    expect(propRes.ok()).toBeTruthy();
    const propertyId: string = (await propRes.json()).property?.id;
    expect(propertyId).toBeTruthy();

    // ── Agent B: signs up
    const bCtx = await browser.newContext();
    const bPage = await bCtx.newPage();
    await signupAndLogin(bPage.request, bEmail, `מקבל ${stamp}`);
    await bPage.request.post('/api/auth/login', {
      data: { email: bEmail, password: passwordForBoth },
    });

    // ── A initiates the transfer to B's email
    const initRes = await aPage.request.post(`/api/properties/${propertyId}/transfer`, {
      data: { toEmail: bEmail },
    });
    expect(initRes.ok()).toBeTruthy();
    const transferId: string = (await initRes.json()).transfer?.id;
    expect(transferId).toBeTruthy();

    // ── B accepts the transfer
    const acceptRes = await bPage.request.post(`/api/transfers/${transferId}/accept`);
    expect(acceptRes.ok()).toBeTruthy();

    // ── B sees the property under `mine=1`; A no longer does.
    const aMine = await aPage.request.get('/api/properties?mine=1');
    expect(aMine.ok()).toBeTruthy();
    const aIds = ((await aMine.json()).items || []).map((p: any) => p.id);
    expect(aIds).not.toContain(propertyId);

    const bMine = await bPage.request.get('/api/properties?mine=1');
    expect(bMine.ok()).toBeTruthy();
    const bIds = ((await bMine.json()).items || []).map((p: any) => p.id);
    expect(bIds).toContain(propertyId);

    await aCtx.close();
    await bCtx.close();
  });
});
