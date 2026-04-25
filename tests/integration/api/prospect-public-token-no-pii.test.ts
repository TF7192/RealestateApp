// SEC-036 — The public sign endpoint (GET /api/prospects/public/:token)
// must NOT return the agent's broker license, national ID (תעודת זהות),
// or business address. The token is shared via WhatsApp / email — i.e.
// unencrypted channels — so anyone holding the URL must not be able to
// harvest the agent's PII. The signed PDF (rendered server-side after
// sign) still has access to those fields, so legal output is unaffected.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { build } from '../../../backend/src/server.js';
import { prisma } from '../../setup/integration.setup.js';
import { createAgent } from '../../factories/user.factory.js';
import { createProperty } from '../../factories/property.factory.js';
import { loginAs } from '../../helpers/auth.js';

let app: FastifyInstance;
beforeAll(async () => { app = await build(); await app.ready(); });
afterAll(async () => { await app.close(); });

describe('SEC-036 — GET /api/prospects/public/:token does not leak agent PII', () => {
  it('returns displayName/phone/agency/brokerageTermsHtml; never license, personalId, or businessAddress', async () => {
    const agent = await createAgent(prisma);
    // Populate all of the would-be-leaked fields on the agent profile.
    await prisma.agentProfile.update({
      where: { userId: agent.id },
      data: {
        agency:             'אסתיה תיווך',
        license:            '12345678',
        personalId:         '305123456',
        businessAddress:    'אלון 18א, נס ציונה',
        brokerageTermsHtml: '<p>הסכם תיווך — נוסח מותאם אישית.</p>',
      },
    });
    const property = await createProperty(prisma, { agentId: agent.id });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    // Mint a digital prospect → publicToken.
    const init = await app.inject({
      method: 'POST',
      url: `/api/properties/${property.id}/prospects/digital`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'אורח ציבורי', phone: '0501234567' },
    });
    expect(init.statusCode).toBe(200);
    const publicToken = init.json().prospect.publicToken;
    expect(typeof publicToken).toBe('string');

    // Anonymous GET — exactly the request a recipient of the WhatsApp
    // link would make.
    const res = await app.inject({
      method: 'GET',
      url: `/api/prospects/public/${publicToken}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Useful, non-sensitive fields the sign UI actually consumes.
    expect(body.agent.displayName).toBe(agent.displayName);
    expect(body.agent.agency).toBe('אסתיה תיווך');
    // brokerageTermsHtml is rendered as the legal text — must stay.
    expect(body.agent.brokerageTermsHtml).toContain('הסכם תיווך');

    // Sensitive identifiers — must NOT be present (or must be null/undef).
    expect(body.agent.license).toBeFalsy();
    expect(body.agent.personalId).toBeFalsy();
    expect(body.agent.businessAddress).toBeFalsy();

    // Belt-and-braces: also assert serialised payload has neither
    // value embedded under any key (defends against accidental rename
    // leaks).
    const raw = res.payload;
    expect(raw).not.toContain('12345678');     // license
    expect(raw).not.toContain('305123456');    // personalId
    expect(raw).not.toContain('אלון 18א');    // businessAddress
  });
});
