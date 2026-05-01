// Integration test for the soft-delete purge worker
// (backend/src/workers/purgeDeletedUsers.ts).
//
// Privacy promise: a user with deletedAt < now-30d gets hard-deleted
// from the DB along with their S3 blobs (uploads + property images +
// uploaded video files). The cascade FK chain takes care of Property
// / Lead / Owner / etc.
//
// We seed a user, mark them soft-deleted past the threshold, attach
// some blobs, mock deleteUpload at the helper boundary, run
// purgeOnce(), and assert: row gone + helper called for each blob
// key.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { prisma } from '../../setup/integration.setup.js';
import { createUser } from '../../factories/user.factory.js';
import { createProperty } from '../../factories/property.factory.js';

const { deleteUpload } = vi.hoisted(() => ({ deleteUpload: vi.fn() }));
vi.mock('../../../backend/src/lib/storage.js', async (orig) => {
  const actual = await (orig as () => Promise<any>)();
  return { ...actual, deleteUpload };
});

const { purgeOnce } = await import('../../../backend/src/workers/purgeDeletedUsers.js');

beforeEach(() => {
  deleteUpload.mockReset();
  deleteUpload.mockResolvedValue(undefined);
});

const THIRTY_ONE_DAYS_AGO = () =>
  new Date(Date.now() - (31 * 24 * 60 * 60 * 1000));

describe('purgeDeletedUsers — purgeOnce', () => {
  it('hard-deletes a user whose deletedAt is past the 30d threshold + cleans S3 blobs', async () => {
    // KNOWN BUG (filed as follow-up task): purgeDeletedUsers.ts:67
    // claims "Cascade FKs handle the rest of the schema", but
    // Property.agent + Lead.agent + Deal.agent + Owner.agent have no
    // onDelete:Cascade in schema.prisma — only Property defaults to
    // Restrict. So in production, any user who ever owned a Property
    // / Lead / Owner / Deal silently never gets hard-deleted. We seed
    // an UploadedFile here (its FK does cascade) so the happy path
    // can be exercised. The fix needs a schema migration; this test
    // documents the current behaviour rather than the desired one.
    const u = await createUser(prisma, { email: 'purge-stale@example.com' });

    await prisma.uploadedFile.create({
      data: {
        ownerId: u.id,
        kind: 'document',
        originalName: 'report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        path: 'documents/u1/report.pdf',
      },
    });

    await prisma.user.update({
      where: { id: u.id },
      data: { deletedAt: THIRTY_ONE_DAYS_AGO() },
    });

    await purgeOnce();

    // User row gone via UploadedFile-cascading delete.
    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after).toBeNull();

    expect(deleteUpload).toHaveBeenCalledWith('documents/u1/report.pdf');
  });

  it('leaves users alone when deletedAt is within the 30d window', async () => {
    const u = await createUser(prisma, { email: 'purge-recent@example.com' });
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await prisma.user.update({
      where: { id: u.id },
      data: { deletedAt: fiveDaysAgo },
    });

    await purgeOnce();

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after).not.toBeNull();
    expect(deleteUpload).not.toHaveBeenCalled();
  });

  it('skips user.delete when at least one S3 delete fails (orphan-blob safety)', async () => {
    deleteUpload.mockRejectedValue(new Error('AccessDenied'));
    const u = await createUser(prisma, { email: 'purge-s3-fail@example.com' });
    await prisma.uploadedFile.create({
      data: {
        ownerId: u.id, kind: 'document', originalName: 'x.pdf',
        mimeType: 'application/pdf', sizeBytes: 1, path: 'documents/u/x.pdf',
      },
    });
    await prisma.user.update({
      where: { id: u.id },
      data: { deletedAt: THIRTY_ONE_DAYS_AGO() },
    });

    await purgeOnce();

    // The row stays so the next tick can retry — better than orphaning
    // a paid-for S3 blob forever.
    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after).not.toBeNull();
  });

  it('idempotent — running it on a clean state is a no-op', async () => {
    await purgeOnce();
    expect(deleteUpload).not.toHaveBeenCalled();
  });
});
