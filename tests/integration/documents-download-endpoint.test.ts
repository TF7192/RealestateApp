import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createAgent } from '../factories/user.factory.js';
import { loginAs } from '../helpers/auth.js';
import { prisma } from '../setup/integration.setup.js';

// SEC-034 — `GET /api/documents` no longer leaks a presigned URL per
// row; callers fetch the actual file via the new
//   GET /api/documents/:id/download
// endpoint. These tests pin the contract:
//   - 302 to a redirect URL when the caller owns the row
//   - 404 when another agent tries to fetch
//   - 401 when unauthenticated

const { resolveUpload } = vi.hoisted(() => ({
  resolveUpload: vi.fn(),
}));

vi.mock('../../backend/src/lib/storage.js', async () => {
  const actual = await vi.importActual<typeof import('../../backend/src/lib/storage.js')>(
    '../../backend/src/lib/storage.js',
  );
  return {
    ...actual,
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
  resolveUpload.mockReset();
  resolveUpload.mockImplementation(async (key: string) => ({
    kind: 'redirect',
    url: `https://s3.example/${key}?sig=xyz`,
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SEC-034 — /api/documents/:id/download', () => {
  it('list response no longer carries `url`; carries `downloadUrl` instead', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const row = await prisma.uploadedFile.create({
      data: {
        ownerId:      agent.id,
        kind:         'document',
        originalName: 'plan.pdf',
        mimeType:     'application/pdf',
        sizeBytes:    1024,
        path:         `documents/${agent.id}/plan.pdf`,
        tags:         [],
      },
    });

    const list = await app.inject({
      method: 'GET',
      url: '/api/documents',
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    const body = list.json();
    const item = body.items.find((i: { id: string }) => i.id === row.id);
    expect(item).toBeDefined();
    expect(item.url).toBeUndefined();
    expect(item.downloadUrl).toBe(`/api/documents/${row.id}/download`);
  });

  it('owner gets 302 to the resolved storage URL', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const row = await prisma.uploadedFile.create({
      data: {
        ownerId:      agent.id,
        kind:         'document',
        originalName: 'a.pdf',
        mimeType:     'application/pdf',
        sizeBytes:    10,
        path:         `documents/${agent.id}/a.pdf`,
        tags:         [],
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/documents/${row.id}/download`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain(`documents/${agent.id}/a.pdf`);
    expect(res.headers.location).toContain('sig=');
    expect(resolveUpload).toHaveBeenCalledWith(row.path);
  });

  it('cross-agent fetch returns 404', async () => {
    const [agentA, agentB] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const row = await prisma.uploadedFile.create({
      data: {
        ownerId:      agentA.id,
        kind:         'document',
        originalName: 'private.pdf',
        mimeType:     'application/pdf',
        sizeBytes:    10,
        path:         `documents/${agentA.id}/private.pdf`,
        tags:         [],
      },
    });

    const cookieB = await loginAs(app, agentB.email, agentB._plainPassword);
    const res = await app.inject({
      method: 'GET',
      url: `/api/documents/${row.id}/download`,
      headers: { cookie: cookieB },
    });
    expect(res.statusCode).toBe(404);
    // Storage layer was never asked to resolve A's path.
    expect(resolveUpload).not.toHaveBeenCalled();
  });

  it('401 without a session', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/documents/anything/download',
    });
    expect(res.statusCode).toBe(401);
    expect(resolveUpload).not.toHaveBeenCalled();
  });

  it('falls back to /uploads/ redirect when storage backend is local (kind=file)', async () => {
    resolveUpload.mockResolvedValueOnce({
      kind: 'file',
      path: '/var/local/file.pdf',
    });
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const row = await prisma.uploadedFile.create({
      data: {
        ownerId:      agent.id,
        kind:         'document',
        originalName: 'b.pdf',
        mimeType:     'application/pdf',
        sizeBytes:    10,
        path:         `documents/${agent.id}/b.pdf`,
        tags:         [],
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/documents/${row.id}/download`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`/uploads/documents/${agent.id}/b.pdf`);
  });
});
