import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

/**
 * Sprint 6 / ScreenContract — in-house digital contract e-sign flow.
 * Agent-side type-to-sign was removed 2026-06-02; the only remaining
 * sign surface is the customer-via-token public flow. These tests cover
 * both the agent-side CRUD surface and the public sign-by-link path.
 */
describe('POST /api/contracts', () => {
  it('H — creates an EXCLUSIVITY contract for the authed agent', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/contracts', headers: { cookie },
      payload: {
        type: 'EXCLUSIVITY',
        signerName: 'דן כהן',
        signerPhone: '0501234567',
        signerEmail: 'dan@example.com',
      },
    });
    expect(res.statusCode).toBe(200);
    const { contract } = res.json();
    expect(contract.agentId).toBe(agent.id);
    expect(contract.type).toBe('EXCLUSIVITY');
    expect(contract.signerName).toBe('דן כהן');
    // Default body should be filled in from DEFAULT_BODIES by type.
    expect(contract.body.length).toBeGreaterThan(0);
    // Unsigned by default.
    expect(contract.signedAt).toBeNull();
    expect(contract.signatureHash).toBeNull();
    // 2026-06-02 — public sign token is generated at create time so
    // the agent can immediately share `/contracts/sign/:token`.
    expect(typeof contract.publicSignToken).toBe('string');
    expect(contract.publicSignToken.length).toBe(48); // 24 bytes hex
    expect(contract.publicSignTokenExpiresAt).toBeTruthy();
  });

  it('H — creates a BUYER_BROKERAGE contract with a property snapshot', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'POST', url: '/api/contracts', headers: { cookie },
      payload: {
        type: 'BUYER_BROKERAGE',
        signerName: 'אלון מזרחי',
        propertiesSnapshot: [
          {
            address: 'הרצל 12',
            city: 'תל אביב',
            rooms: 3.5,
            sqm: 78,
            marketingPrice: 2_450_000,
            kind: 'דירה',
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const { contract } = res.json();
    expect(contract.type).toBe('BUYER_BROKERAGE');
    expect(Array.isArray(contract.propertiesSnapshot)).toBe(true);
    expect(contract.propertiesSnapshot).toHaveLength(1);
    expect(contract.propertiesSnapshot[0].city).toBe('תל אביב');
  });

  it('Az — EXCLUSIVITY rejects a baseContractId belonging to another agent', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const cookieA = await loginAs(app, a.email, a._plainPassword);
    const cookieB = await loginAs(app, b.email, b._plainPassword);
    // A creates a BROKERAGE order.
    const baseRes = await app.inject({
      method: 'POST', url: '/api/contracts', headers: { cookie: cookieA },
      payload: { type: 'BROKERAGE', signerName: 'בעלים א׳' },
    });
    expect(baseRes.statusCode).toBe(200);
    const baseId = baseRes.json().contract.id;
    // B tries to reference it from an EXCLUSIVITY of their own → 404.
    const cross = await app.inject({
      method: 'POST', url: '/api/contracts', headers: { cookie: cookieB },
      payload: {
        type: 'EXCLUSIVITY',
        signerName: 'מתעניין ב׳',
        baseContractId: baseId,
      },
    });
    expect(cross.statusCode).toBe(404);
  });
});

describe('GET /api/contracts/:id', () => {
  it('H — hydrates baseContract for an EXCLUSIVITY addendum', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const baseRes = await app.inject({
      method: 'POST', url: '/api/contracts', headers: { cookie },
      payload: { type: 'BROKERAGE', signerName: 'בעלים' },
    });
    const baseId = baseRes.json().contract.id;
    const exRes = await app.inject({
      method: 'POST', url: '/api/contracts', headers: { cookie },
      payload: {
        type: 'EXCLUSIVITY',
        signerName: 'בעלים',
        baseContractId: baseId,
      },
    });
    const exId = exRes.json().contract.id;
    const get = await app.inject({
      method: 'GET', url: `/api/contracts/${exId}`, headers: { cookie },
    });
    expect(get.statusCode).toBe(200);
    const body = get.json();
    expect(body.contract.baseContractId).toBe(baseId);
    expect(body.baseContract?.id).toBe(baseId);
  });

  it('Az — agent B sees 404 on agent A\'s contract', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const cookieA = await loginAs(app, a.email, a._plainPassword);
    const cookieB = await loginAs(app, b.email, b._plainPassword);
    const create = await app.inject({
      method: 'POST', url: '/api/contracts', headers: { cookie: cookieA },
      payload: { type: 'OFFER', signerName: 'משה פרץ' },
    });
    expect(create.statusCode).toBe(200);
    const id = create.json().contract.id;
    // B reading A's contract → 404 (NOT 403 — don't leak existence).
    const cross = await app.inject({
      method: 'GET', url: `/api/contracts/${id}`, headers: { cookie: cookieB },
    });
    expect(cross.statusCode).toBe(404);
    // A's own view still works.
    const own = await app.inject({
      method: 'GET', url: `/api/contracts/${id}`, headers: { cookie: cookieA },
    });
    expect(own.statusCode).toBe(200);
  });
});

describe('GET /api/contracts/:id/pdf', () => {
  it('H — renders a PDF for a BUYER_BROKERAGE contract', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const create = await app.inject({
      method: 'POST', url: '/api/contracts', headers: { cookie },
      payload: {
        type: 'BUYER_BROKERAGE',
        signerName: 'רונית לוי',
        propertiesSnapshot: [
          { address: 'דיזנגוף 100', city: 'תל אביב', rooms: 4, sqm: 90, marketingPrice: 3_200_000 },
        ],
      },
    });
    const id = create.json().contract.id;
    const pdf = await app.inject({
      method: 'GET', url: `/api/contracts/${id}/pdf`, headers: { cookie },
    });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
    // PDF magic bytes — sanity check that pdfkit actually emitted a doc.
    expect(pdf.rawPayload.slice(0, 4).toString()).toBe('%PDF');
  });
});

// 2026-06-02 — public sign-by-link surface. Token-gated, no auth.
describe('Public contract sign-by-link', () => {
  // Tiny 1x1 transparent PNG as a stand-in for the canvas data-URL.
  const TINY_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAA' +
    'C0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';

  async function createContract(opts: { signerName?: string } = {}) {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const create = await app.inject({
      method: 'POST', url: '/api/contracts', headers: { cookie },
      payload: {
        type: 'BROKERAGE',
        signerName: opts.signerName || 'מתעניין ג׳',
      },
    });
    return { agent, cookie, contract: create.json().contract };
  }

  it('H — GET /api/public/contracts/:token returns the contract for an unauth caller', async () => {
    const { contract } = await createContract();
    const res = await app.inject({
      method: 'GET',
      url: `/api/public/contracts/${contract.publicSignToken}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.contract.id).toBe(contract.id);
    expect(body.contract.type).toBe('BROKERAGE');
    expect(body.agent).toBeTruthy();
    // Agent-PII is intentionally exposed on the public payload so the
    // signer sees who they're contracting with under חוק המתווכים.
    expect('displayName' in body.agent).toBe(true);
  });

  it('H — POST /sign locks the contract and stores audit metadata', async () => {
    const { contract } = await createContract();
    const signRes = await app.inject({
      method: 'POST',
      url: `/api/public/contracts/${contract.publicSignToken}/sign`,
      payload: {
        signatureDataUrl: TINY_PNG,
        signerName: 'מתעניין ג׳',
        signerIdType: 'ID',
        signerIdNumber: '123456789',
        signerAddress: 'הרצל 1, תל אביב',
        consentAccepted: true,
      },
    });
    expect(signRes.statusCode).toBe(200);
    // Row should now be locked.
    const locked = await prisma.contract.findUnique({ where: { id: contract.id } });
    expect(locked?.signedAt).toBeTruthy();
    expect(locked?.signatureName).toBe('מתעניין ג׳');
    expect(locked?.signatureHash).toMatch(/^[a-f0-9]{64}$/);
    expect(locked?.signatureImage?.startsWith('data:image/')).toBe(true);
    expect(locked?.consentAcceptedAt).toBeTruthy();
  });

  it('Az — already-signed contract returns 410 on subsequent GET and 409 on subsequent POST', async () => {
    const { contract } = await createContract();
    await app.inject({
      method: 'POST',
      url: `/api/public/contracts/${contract.publicSignToken}/sign`,
      payload: {
        signatureDataUrl: TINY_PNG,
        signerName: 'מתעניין ד׳',
        consentAccepted: true,
      },
    });
    const get = await app.inject({
      method: 'GET',
      url: `/api/public/contracts/${contract.publicSignToken}`,
    });
    expect(get.statusCode).toBe(410);
    const second = await app.inject({
      method: 'POST',
      url: `/api/public/contracts/${contract.publicSignToken}/sign`,
      payload: {
        signatureDataUrl: TINY_PNG,
        signerName: 'מתעניין ד׳',
        consentAccepted: true,
      },
    });
    expect(second.statusCode).toBe(409);
  });

  it('Az — expired token returns 404', async () => {
    const { contract } = await createContract();
    // Roll the expiry back by an hour.
    await prisma.contract.update({
      where: { id: contract.id },
      data: { publicSignTokenExpiresAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/public/contracts/${contract.publicSignToken}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('Az — unknown token returns 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/public/contracts/${'0'.repeat(48)}`,
    });
    expect(res.statusCode).toBe(404);
  });
});
