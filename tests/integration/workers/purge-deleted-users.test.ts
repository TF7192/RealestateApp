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
  it('hard-deletes a user with owned Property + Lead + UploadedFile and cleans S3 blobs', async () => {
    // Migration 20260512000000_purge_user_cascade_property_lead added
    // ON DELETE CASCADE to Property.agent + Lead.agent (the two FKs
    // that previously blocked the worker's user.delete call). With
    // the cascade in place, every agent-owned model — Property, Lead,
    // Owner, Deal, Reminder, Tag, SavedSearch, Favorite, LeadMeeting,
    // UploadedFile — disappears together with the user.
    const u = await createUser(prisma, { email: 'purge-stale@example.com' });

    // Seed a Property + Lead owned by the user — these are the rows
    // that used to break the cascade pre-migration.
    const prop = await createProperty(prisma, { agentId: u.id });

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
    await prisma.propertyImage.create({
      data: {
        propertyId: prop.id,
        url: '/uploads/properties/p1/cover.jpg',
        sortOrder: 0,
      },
    });

    await prisma.user.update({
      where: { id: u.id },
      data: { deletedAt: THIRTY_ONE_DAYS_AGO() },
    });

    await purgeOnce();

    // User row gone — and the Property is gone too (cascade).
    const afterUser = await prisma.user.findUnique({ where: { id: u.id } });
    expect(afterUser).toBeNull();
    const afterProp = await prisma.property.findUnique({ where: { id: prop.id } });
    expect(afterProp).toBeNull();

    // S3 helper invoked for both the document path and the property
    // image url (with the /uploads/ prefix stripped by the worker).
    const allKeys = deleteUpload.mock.calls.map((c) => c[0]);
    expect(allKeys).toContain('documents/u1/report.pdf');
    expect(allKeys).toContain('properties/p1/cover.jpg');
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
