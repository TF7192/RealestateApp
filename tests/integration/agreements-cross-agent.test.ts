import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../setup/integration.setup.js';
import { createAgent } from '../factories/user.factory.js';
import { createProperty } from '../factories/property.factory.js';
import { createLead } from '../factories/lead.factory.js';
import { loginAs } from '../helpers/auth.js';

// SEC-002 — /api/agreements had zero agent-scoping. Any authed agent
// could list every signed brokerage agreement in the DB, fetch the PDF
// (incl. seller PII + commission %), overwrite the signed file via the
// upload route, or attach a fresh row to another agent's lead/property.
//
// These tests assert the four denial paths after the fix lands. We mock
// the storage layer so the upload test doesn't touch S3 / the FS.
const { putUpload, resolveUpload } = vi.hoisted(() => ({
  putUpload: vi.fn(),
  resolveUpload: vi.fn(),
}));

vi.mock('../../backend/src/lib/storage.js', async () => {
  const actual = await vi.importActual<typeof import('../../backend/src/lib/storage.js')>(
    '../../backend/src/lib/storage.js',
  );
  return {
    ...actual,
    putUpload,
    resolveUpload,
  };
});

const { build } = await import('../../backend/src/server.js');

let app: FastifyInstance;

beforeAll(async () => {
  process.env.RATE_LIMIT_MAX_PER_MIN = '10000';
  app = await build();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  putUpload.mockReset();
  resolveUpload.mockReset();
  putUpload.mockImplementation(async (key: string) => `/uploads/${key}`);
  resolveUpload.mockImplementation(async (key: string) => ({
    kind: 'redirect',
    url: `https://s3.example/${key}?sig=abc`,
  }));
});

// Build a minimal multipart body for the /:id/upload route — one
// `file` field with a tiny %PDF header. Mirrors the shape used by
// tests/integration/api/documents.test.ts.
function pdfMultipart(filename = 'signed.pdf') {
  const boundary = '----estia-agreements-boundary';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`,
    'utf8',
  );
  const body = Buffer.from(new Uint8Array([37, 80, 68, 70, 10])); // "%PDF\n"
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const payload = Buffer.concat([head, body, tail]);
  return {
    payload,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(payload.length),
    },
  };
}

describe('SEC-002 — /api/agreements cross-agent isolation', () => {
  it('GET /api/agreements — agent B does not see agent A\'s agreement', async () => {
    const [agentA, agentB] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const propA = await createProperty(prisma, { agentId: agentA.id, street: 'A-street' });

    const cookieA = await loginAs(app, agentA.email, agentA._plainPassword);
    const cookieB = await loginAs(app, agentB.email, agentB._plainPassword);

    // A creates an agreement attached to A's property via the API.
    const create = await app.inject({
      method: 'POST',
      url: '/api/agreements/send',
      headers: { cookie: cookieA },
      payload: {
        propertyId: propA.id,
        signerName: 'בעלים של A',
        signerPhone: '0501111111',
      },
    });
    expect(create.statusCode).toBe(200);
    const aId = create.json().agreement.id;
    expect(aId).toBeTruthy();

    // B's listing must not include A's agreement.
    const listB = await app.inject({
      method: 'GET',
      url: '/api/agreements',
      headers: { cookie: cookieB },
    });
    expect(listB.statusCode).toBe(200);
    const itemsB: Array<{ id: string }> = listB.json().items;
    expect(itemsB.find((i) => i.id === aId)).toBeUndefined();

    // Sanity — A still sees its own row.
    const listA = await app.inject({
      method: 'GET',
      url: '/api/agreements',
      headers: { cookie: cookieA },
    });
    expect(listA.statusCode).toBe(200);
    const itemsA: Array<{ id: string }> = listA.json().items;
    expect(itemsA.find((i) => i.id === aId)).toBeTruthy();
  });

  it('GET /api/agreements/:id/pdf — 404 for cross-agent fetch', async () => {
    const [agentA, agentB] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const propA = await createProperty(prisma, { agentId: agentA.id });
    const ag = await prisma.agreement.create({
      data: { propertyId: propA.id, signerName: 'בעלים של A', status: 'SENT' },
    });

    const cookieB = await loginAs(app, agentB.email, agentB._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: `/api/agreements/${ag.id}/pdf`,
      headers: { cookie: cookieB },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/agreements/:id/upload — 404 for cross-agent upload', async () => {
    const [agentA, agentB] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const propA = await createProperty(prisma, { agentId: agentA.id });
    const ag = await prisma.agreement.create({
      data: { propertyId: propA.id, signerName: 'בעלים של A', status: 'SENT' },
    });

    const cookieB = await loginAs(app, agentB.email, agentB._plainPassword);
    const { payload, headers } = pdfMultipart();
    const res = await app.inject({
      method: 'POST',
      url: `/api/agreements/${ag.id}/upload`,
      headers: { cookie: cookieB, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(404);

    // The original row must be untouched — no fileId attached, status SENT.
    const after = await prisma.agreement.findUnique({ where: { id: ag.id } });
    expect(after?.fileId).toBeNull();
    expect(after?.status).toBe('SENT');
    // And no UploadedFile row was created for B either.
    const filesByB = await prisma.uploadedFile.findMany({ where: { ownerId: agentB.id } });
    expect(filesByB).toHaveLength(0);
  });

  it('POST /api/agreements/send — 404 when body references another agent\'s propertyId', async () => {
    const [agentA, agentB] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const propA = await createProperty(prisma, { agentId: agentA.id });

    const cookieB = await loginAs(app, agentB.email, agentB._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: '/api/agreements/send',
      headers: { cookie: cookieB },
      payload: {
        propertyId: propA.id,
        signerName: 'גנב',
      },
    });
    expect([400, 404]).toContain(res.statusCode);

    // No agreement row should have been created — neither for A's
    // property nor anywhere else as a side effect.
    const rows = await prisma.agreement.findMany({ where: { propertyId: propA.id } });
    expect(rows).toHaveLength(0);
  });

  it('POST /api/agreements/send — 404 when body references another agent\'s leadId', async () => {
    const [agentA, agentB] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const leadA = await createLead(prisma, { agentId: agentA.id });

    const cookieB = await loginAs(app, agentB.email, agentB._plainPassword);
    const res = await app.inject({
      method: 'POST',
      url: '/api/agreements/send',
      headers: { cookie: cookieB },
      payload: {
        leadId: leadA.id,
        signerName: 'גנב',
      },
    });
    expect([400, 404]).toContain(res.statusCode);

    const rows = await prisma.agreement.findMany({ where: { leadId: leadA.id } });
    expect(rows).toHaveLength(0);
  });
});
