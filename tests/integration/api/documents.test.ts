import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createAgent } from '../../factories/user.factory.js';
import { loginAs } from '../../helpers/auth.js';
import { prisma } from '../../setup/integration.setup.js';

// Sprint 6 — Documents library. The route writes via `putUpload` and
// reads via `resolveUpload` (both in backend/src/lib/storage.js).
// Mocking the storage layer (rather than the @aws-sdk/client-s3
// internals) keeps these tests fast and focused on the route contract
// — upload persists the row, list filters, delete is owner-scoped.
const { putUpload, resolveUpload, deleteUpload } = vi.hoisted(() => ({
  putUpload: vi.fn(),
  resolveUpload: vi.fn(),
  deleteUpload: vi.fn(),
}));

vi.mock('../../../backend/src/lib/storage.js', async () => {
  const actual = await vi.importActual<typeof import('../../../backend/src/lib/storage.js')>(
    '../../../backend/src/lib/storage.js',
  );
  return {
    ...actual,
    putUpload,
    resolveUpload,
    deleteUpload,
  };
});

const { build } = await import('../../../backend/src/server.js');

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
  deleteUpload.mockReset();
  putUpload.mockImplementation(async (key: string) => `/uploads/${key}`);
  resolveUpload.mockImplementation(async (key: string) => ({
    kind: 'redirect',
    url: `https://s3.example/${key}?sig=abc`,
  }));
  deleteUpload.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

// Build a minimal multipart body — one `file` field + optional
// repeatable `tags` text fields. Matches the shape `api.uploadDocument`
// sends from the frontend.
function docMultipart(
  bytes: Uint8Array,
  filename: string,
  mime: string,
  tags: string[] = [],
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----estia-docs-boundary';
  const parts: Buffer[] = [];
  for (const t of tags) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="tags"\r\n\r\n${t}\r\n`,
      'utf8',
    ));
  }
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
    'utf8',
  ));
  parts.push(Buffer.from(bytes));
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));
  const payload = Buffer.concat(parts);
  return {
    payload,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(payload.length),
    },
  };
}

describe('Documents — S3-backed library', () => {
  it('A — 401 without a session cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/documents' });
    expect(res.statusCode).toBe(401);
    expect(putUpload).not.toHaveBeenCalled();
  });

  it('H — POST persists UploadedFile row and writes via storage.putUpload', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const { payload, headers } = docMultipart(
      new Uint8Array([37, 80, 68, 70]), // %PDF magic bytes
      'brochure.pdf',
      'application/pdf',
      ['חוזים', 'בלעדיות'],
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/documents',
      headers: { cookie, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.document.ownerId).toBe(agent.id);
    expect(body.document.kind).toBe('document');
    expect(body.document.originalName).toBe('brochure.pdf');
    expect(body.document.tags).toEqual(['חוזים', 'בלעדיות']);

    // Storage side-effect — putUpload called with
    // `documents/<agentId>/<uuid>.pdf`.
    expect(putUpload).toHaveBeenCalledTimes(1);
    const putKey = putUpload.mock.calls[0][0] as string;
    expect(putKey.startsWith(`documents/${agent.id}/`)).toBe(true);
    expect(putKey.endsWith('.pdf')).toBe(true);

    // DB row matches — the presigned URL is only synthesised on GET.
    const row = await prisma.uploadedFile.findUnique({
      where: { id: body.document.id },
    });
    expect(row?.path).toBe(putKey);
    expect(row?.sizeBytes).toBe(4);
  });

  it('F — GET filters by ?kind= and ?tag=', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    // Seed three documents directly so the test is deterministic.
    await prisma.uploadedFile.createMany({
      data: [
        {
          ownerId: agent.id, kind: 'document',
          originalName: 'plan.dwg', mimeType: 'application/acad',
          sizeBytes: 100, path: `documents/${agent.id}/a.dwg`,
          tags: ['תוכניות'],
        },
        {
          ownerId: agent.id, kind: 'document',
          originalName: 'report.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          sizeBytes: 200, path: `documents/${agent.id}/b.xlsx`,
          tags: ['סקרים'],
        },
        {
          ownerId: agent.id, kind: 'document',
          originalName: 'contract.pdf', mimeType: 'application/pdf',
          sizeBytes: 300, path: `documents/${agent.id}/c.pdf`,
          tags: ['חוזים'],
        },
      ],
    });

    // No filter → all three.
    const all = await app.inject({ method: 'GET', url: '/api/documents', headers: { cookie } });
    expect(all.statusCode).toBe(200);
    expect(all.json().items).toHaveLength(3);
    // SEC-034 — list rows no longer carry a presigned URL; each row
    // points at the dedicated /download endpoint instead.
    expect(all.json().items[0].url).toBeUndefined();
    expect(all.json().items[0].downloadUrl).toMatch(/^\/api\/documents\/[^/]+\/download$/);

    // Kind filter → only pdf.
    const pdfOnly = await app.inject({
      method: 'GET', url: '/api/documents?kind=pdf', headers: { cookie },
    });
    expect(pdfOnly.statusCode).toBe(200);
    const pdfs = pdfOnly.json().items;
    expect(pdfs).toHaveLength(1);
    expect(pdfs[0].originalName).toBe('contract.pdf');

    // Tag filter → only סקרים.
    const surveys = await app.inject({
      method: 'GET', url: '/api/documents?tag=סקרים', headers: { cookie },
    });
    expect(surveys.statusCode).toBe(200);
    expect(surveys.json().items).toHaveLength(1);
    expect(surveys.json().items[0].originalName).toBe('report.xlsx');
  });

  it('Az — 404 deleting another agent\'s document (cross-agent isolation)', async () => {
    const [a, b] = await Promise.all([createAgent(prisma), createAgent(prisma)]);
    const bDoc = await prisma.uploadedFile.create({
      data: {
        ownerId: b.id, kind: 'document',
        originalName: 'private.pdf', mimeType: 'application/pdf',
        sizeBytes: 10, path: `documents/${b.id}/z.pdf`,
        tags: [],
      },
    });
    const cookie = await loginAs(app, a.email, a._plainPassword);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/documents/${bDoc.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(404);
    // Row must survive — the 404 is a leak-guard, not a permission
    // response; the document still belongs to agent B.
    const stillThere = await prisma.uploadedFile.findUnique({ where: { id: bDoc.id } });
    expect(stillThere).not.toBeNull();
    expect(deleteUpload).not.toHaveBeenCalled();
  });

  it('H — DELETE removes the row and best-effort deletes the S3 object', async () => {
    const agent = await createAgent(prisma);
    const doc = await prisma.uploadedFile.create({
      data: {
        ownerId: agent.id, kind: 'document',
        originalName: 'old.pdf', mimeType: 'application/pdf',
        sizeBytes: 10, path: `documents/${agent.id}/old.pdf`,
        tags: [],
      },
    });
    const cookie = await loginAs(app, agent.email, agent._plainPassword);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/documents/${doc.id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    const row = await prisma.uploadedFile.findUnique({ where: { id: doc.id } });
    expect(row).toBeNull();
    expect(deleteUpload).toHaveBeenCalledWith(`documents/${agent.id}/old.pdf`);
  });
});
