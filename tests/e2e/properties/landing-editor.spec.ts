import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

/**
 * @critical — premium agent edits a property landing page.
 *
 * The smallest path that exercises the whole feature end to end:
 *   1. Promote the demo agent to premium (the seed leaves them on
 *      the free tier so the gate-dialog tests can stay valid).
 *   2. Pick any of the agent's properties.
 *   3. Open /properties/:id/landing-editor.
 *   4. Add a DESCRIPTION block, set heading + body.
 *   5. Publish.
 *   6. Hit the public URL /l/<agentSlug>/<propertySlug> and
 *      assert the heading + body we just typed appear there.
 *
 * Cleanup reverts `isPremium` so the gate-dialog tests still see
 * the free-tier agent they expect.
 */

const EMAIL = process.env.TEST_AGENT_EMAIL ?? 'agent.demo@estia.app';

const HEADING = 'בית פתוח בסוף השבוע — סיורים מתואמים מראש';
const BODY = 'פסקת תיאור שנכתבה בעורך דף הנחיתה במסגרת בדיקת ה־e2e.';

const prisma = new PrismaClient();
let prevIsPremium: boolean | undefined;
let testPropertyId: string | undefined;
let agentSlug: string | undefined;
let propertySlug: string | undefined;

test.beforeAll(async () => {
  const agent = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, slug: true, isPremium: true },
  });
  if (!agent) throw new Error(`Demo agent ${EMAIL} not seeded — run db:seed first.`);
  prevIsPremium = agent.isPremium;
  agentSlug = agent.slug ?? undefined;
  await prisma.user.update({ where: { id: agent.id }, data: { isPremium: true } });

  // Pick an existing property of the demo agent. The seed creates a
  // handful; the test doesn't care which one. We just need a
  // property + slug pair the public route can resolve.
  const prop = await prisma.property.findFirst({
    where: { agentId: agent.id, slug: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, slug: true },
  });
  if (!prop?.slug) throw new Error('No demo property with slug — seed regression.');
  testPropertyId = prop.id;
  propertySlug = prop.slug;
});

test.afterAll(async () => {
  // Restore prior premium state so the gate tests still see a
  // non-premium demo agent. Also clear any landingPageConfig we
  // wrote so this test stays idempotent across re-runs.
  const agent = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true } });
  if (agent) {
    await prisma.user.update({ where: { id: agent.id }, data: { isPremium: prevIsPremium ?? false } });
  }
  if (testPropertyId) {
    await prisma.property.update({
      where: { id: testPropertyId },
      data: { landingPageConfig: null as any },
    });
  }
  await prisma.$disconnect();
});

test.describe('Landing-page editor @critical', () => {
  test('premium agent adds a DESCRIPTION block and the public URL renders it', async ({ page }) => {
    test.skip(!testPropertyId, 'Need a seeded property with a slug.');

    await page.goto(`/properties/${testPropertyId}/landing-editor`);

    // Editor toolbar — the back button + save button are the
    // anchors. Wait for the save button (which proves config
    // loaded + the dirty-disabled state worked).
    await expect(page.getByRole('button', { name: /חזרה לנכס/ })).toBeVisible({ timeout: 15_000 });

    // Open the "+ הוסיפו סקציה" picker and click DESCRIPTION.
    await page.getByRole('group', { name: /הוסיפו סקציה/ }).getByText(/הוסיפו סקציה/).click()
      .catch(async () => {
        // Fallback — <details> isn't reported as a role in all
        // Chromium versions. Click the summary text directly.
        await page.getByText('הוסיפו סקציה').click();
      });
    await page.getByRole('button', { name: 'תיאור הנכס' }).click();

    // The newly-added section is auto-selected; fill heading + body.
    const headingInput = page.locator('input[placeholder="קצת על הנכס"]');
    await headingInput.fill(HEADING);
    const bodyInput = page.locator('textarea[placeholder="הוסיפו תיאור של הנכס..."]');
    await bodyInput.fill(BODY);

    // Publish.
    const saveResp = page.waitForResponse(
      (r) => r.url().includes('/landing-page') && r.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: /^שמירה$/ }).click();
    expect((await saveResp).status()).toBe(200);

    // Public URL renders the new copy.
    test.skip(!agentSlug, 'Demo agent has no slug — public URL would not resolve.');
    await page.goto(`/l/${agentSlug}/${propertySlug}`);
    await expect(page.getByRole('heading', { name: HEADING })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(BODY)).toBeVisible();
  });
});
