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
 * Four tests: create, sign, cross-agent 404, signed-lock (409 on second
 * sign attempt). The PDF renderer is exercised implicitly via the GET
 * flow but we don't byte-compare the bytes — it's pdfkit output and
 * locking to a checksum would be brittle across font versions.
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
  });
});

describe('POST /api/contracts/:id/sign', () => {
  it('H — signs the contract and locks it with a SHA-256 hash', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    // Seed a contract via the API so the flow is end-to-end.
    const create = await app.inject({
      method: 'POST', url: '/api/contracts', headers: { cookie },
      payload: { type: 'BROKERAGE', signerName: 'רונית לוי' },
    });
    expect(create.statusCode).toBe(200);
    const id = create.json().contract.id;

    const sign = await app.inject({
      method: 'POST', url: `/api/contracts/${id}/sign`, headers: { cookie },
      payload: { signatureName: 'רונית לוי' },
    });
    expect(sign.statusCode).toBe(200);
    const signed = sign.json().contract;
    expect(signed.signedAt).not.toBeNull();
    expect(signed.signatureName).toBe('רונית לוי');
    // 64-char lowercase hex SHA-256.
    expect(signed.signatureHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('GET /api/contracts/:id — cross-agent scoping', () => {
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

describe('POST /api/contracts/:id/sign — signed-lock', () => {
  it('409 — second sign attempt on an already-signed contract is rejected', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const create = await app.inject({
      method: 'POST', url: '/api/contracts', headers: { cookie },
      payload: { type: 'EXCLUSIVITY', signerName: 'שרה ישראלי' },
    });
    const id = create.json().contract.id;
    const first = await app.inject({
      method: 'POST', url: `/api/contracts/${id}/sign`, headers: { cookie },
      payload: { signatureName: 'שרה ישראלי' },
    });
    expect(first.statusCode).toBe(200);
    const originalHash = first.json().contract.signatureHash;

    const second = await app.inject({
      method: 'POST', url: `/api/contracts/${id}/sign`, headers: { cookie },
      payload: { signatureName: 'זייפן' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error?.code).toBe('already_signed');

    // Verify the row wasn't mutated — signatureName + hash unchanged.
    const after = await prisma.contract.findUnique({ where: { id } });
    expect(after?.signatureName).toBe('שרה ישראלי');
    expect(after?.signatureHash).toBe(originalHash);
  });
});
