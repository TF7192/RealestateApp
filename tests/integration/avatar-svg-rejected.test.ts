import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createAgent } from '../factories/user.factory.js';
import { loginAs } from '../helpers/auth.js';
import { prisma } from '../setup/integration.setup.js';

// SEC-007 — Avatar upload must reject SVG (XSS surface).
// The previous check was `mimetype.startsWith('image/')`, which lets
// `image/svg+xml` through. SVG can carry inline <script>/event handlers
// and on the local-storage backend the avatar is served same-origin —
// it can run JS in the authenticated session. We now route the avatar
// upload through `assertAllowedMime(file, 'image')`, the same helper the
// property-image route uses (jpg / png / webp / heic / heif only).
const { putUpload } = vi.hoisted(() => ({
  putUpload: vi.fn(),
}));

vi.mock('../../backend/src/lib/storage.js', async () => {
  const actual = await vi.importActual<typeof import('../../backend/src/lib/storage.js')>(
    '../../backend/src/lib/storage.js',
  );
  return {
    ...actual,
    putUpload,
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
  putUpload.mockImplementation(async (key: string) => `/uploads/${key}`);
});

afterEach(() => {
  vi.clearAllMocks();
});

// Build a minimal multipart body with one `file` field.
function avatarMultipart(
  bytes: Uint8Array,
  filename: string,
  mime: string,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----estia-avatar-boundary';
  const parts: Buffer[] = [];
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

describe('SEC-007 — POST /api/me/avatar rejects SVG', () => {
  it('V — image/svg+xml with inline <script> is rejected with 415', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    const svgBody = '<svg onload="alert(1)" xmlns="http://www.w3.org/2000/svg"></svg>';
    const { payload, headers } = avatarMultipart(
      new TextEncoder().encode(svgBody),
      'evil.svg',
      'image/svg+xml',
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/me/avatar',
      headers: { cookie, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(415);
    // The route must NOT have written to storage.
    expect(putUpload).not.toHaveBeenCalled();
    // And the user.avatarUrl must remain unchanged (still null on a fresh agent).
    const u = await prisma.user.findUnique({ where: { id: agent.id } });
    expect(u?.avatarUrl).toBeNull();
  });

  it('H — image/png is accepted (200)', async () => {
    const agent = await createAgent(prisma);
    const cookie = await loginAs(app, agent.email, agent._plainPassword);

    // Minimal PNG: 8-byte signature + IHDR (1×1 image).
    // PNG header (89 50 4E 47 0D 0A 1A 0A) is enough for a route that
    // only checks mimetype + writes the buffer to storage.
    const pngHeader = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89,
    ]);
    const { payload, headers } = avatarMultipart(pngHeader, 'avatar.png', 'image/png');
    const res = await app.inject({
      method: 'POST',
      url: '/api/me/avatar',
      headers: { cookie, ...headers },
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(putUpload).toHaveBeenCalledTimes(1);
    const putKey = putUpload.mock.calls[0][0] as string;
    expect(putKey.startsWith(`avatars/${agent.id}/`)).toBe(true);
    expect(putKey.endsWith('.png')).toBe(true);
    const u = await prisma.user.findUnique({ where: { id: agent.id } });
    expect(u?.avatarUrl).toMatch(/^\/uploads\/avatars\//);
  });
});
