// Sprint 6 — Documents library.
//
// S3-backed uploaded-files surface for a single agent. Distinct from
// property images (PropertyImage rows) and signed agreements (fileId
// on Agreement) — this is the standalone "library" the agent keeps
// for pdfs, DWGs, xlsx reports and generic zip bundles of source
// documents.
//
// Storage layout: documents/<agentId>/<uuid>.<ext>
// DB row:         UploadedFile { kind: 'document', tags: [...] }
//
// Listing is filterable by ?kind=pdf|dwg|zip|xlsx (mime family, not
// the UploadedFile.kind column) and ?tag=<label> (any-of match when
// repeated).
//
// SEC-034 — the list response no longer carries a presigned download
// URL per row. A presigned URL leaks the document for ~1h to anyone
// who can read the JSON (e.g. via a future shoulder-surf, error log
// in PostHog/Sentry, or a logged screenshot). Instead callers ask for
// `GET /api/documents/:id/download`, which 302s to a freshly-minted
// presigned URL — short window, owner-scoped, no caching of the
// pre-signed link in client logs.

import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';
import { putUpload, deleteUpload, resolveUpload } from '../lib/storage.js';
import { logActivity } from '../lib/activity.js';

// Upload ceiling — 50MB. dwg + pdf + xlsx sit well under this; zips
// occasionally bump against it (topography bundles for a large site).
// Larger than that and the agent should be sharing a Drive link
// instead of storing in Estia.
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

// Kind mapping — the ?kind= query filter groups mime types into
// buckets the UI uses verbatim. Lowercased so case doesn't matter.
const KIND_PREFIXES: Record<string, string[]> = {
  pdf:  ['application/pdf'],
  xlsx: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
  ],
  zip:  [
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
  ],
  // AutoCAD DWG — browsers occasionally dispatch these as
  // application/octet-stream depending on OS. We match by both
  // mimetype and extension so imports from a Mac vs Windows host
  // resolve identically.
  dwg:  ['image/vnd.dwg', 'application/acad', 'application/x-dwg'],
};

const KIND_EXTS: Record<string, string[]> = {
  pdf:  ['.pdf'],
  xlsx: ['.xlsx', '.xls', '.csv'],
  zip:  ['.zip', '.rar', '.7z'],
  dwg:  ['.dwg', '.dxf'],
};

function classifyKind(mime: string, filename: string): string | null {
  const m = (mime || '').toLowerCase();
  const ext = path.extname(filename || '').toLowerCase();
  for (const [kind, prefixes] of Object.entries(KIND_PREFIXES)) {
    if (prefixes.includes(m)) return kind;
  }
  for (const [kind, exts] of Object.entries(KIND_EXTS)) {
    if (exts.includes(ext)) return kind;
  }
  return null;
}

const listQuery = z.object({
  kind: z.enum(['pdf', 'dwg', 'zip', 'xlsx']).optional(),
  tag:  z.union([z.string(), z.array(z.string())]).optional(),
});

export const registerDocumentRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/documents — list the authenticated agent's documents,
  // optionally filtered by mime-family kind and/or tag.
  app.get('/documents', { onRequest: [app.requireAgent] }, async (req) => {
    const q = listQuery.parse(req.query ?? {});
    const uid = requireUser(req).id;

    const tags = Array.isArray(q.tag) ? q.tag : q.tag ? [q.tag] : [];

    const where: any = { ownerId: uid, kind: 'document' };
    if (tags.length) where.tags = { hasSome: tags };

    const rows = await prisma.uploadedFile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // ?kind= filter happens in application code because it's a mime-
    // family bucket, not a column. Small N (an agent's library is
    // typically dozens, not thousands) so this is cheap.
    const filtered = q.kind
      ? rows.filter((r) => classifyKind(r.mimeType, r.originalName) === q.kind)
      : rows;

    // SEC-034 — return a stable per-row download path. Callers fetch
    // the actual file via `GET /api/documents/:id/download`, which
    // 302s to a freshly-presigned URL. We no longer mint one per row
    // here so the JSON list (which can be cached/logged/screenshotted)
    // doesn't leak hour-long S3 grants.
    const items = filtered.map((r) => ({
      id:           r.id,
      originalName: r.originalName,
      mimeType:     r.mimeType,
      sizeBytes:    r.sizeBytes,
      tags:         r.tags,
      kind:         classifyKind(r.mimeType, r.originalName),
      createdAt:    r.createdAt,
      downloadUrl:  `/api/documents/${r.id}/download`,
    }));

    return { items };
  });

  // SEC-034 — owner-scoped download endpoint. 302s to the storage
  // backend's URL (presigned in S3 mode; legacy /uploads/<key> in dev
  // where the static handler serves the file). Owner check stops a
  // cross-agent enumeration attempt cold — we only resolve the file if
  // the row's ownerId matches the caller.
  app.get('/documents/:id/download', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const uid = requireUser(req).id;
    const row = await prisma.uploadedFile.findFirst({
      where: { id, ownerId: uid, kind: 'document' },
    });
    if (!row) return reply.code(404).send({ error: { message: 'Not found' } });
    try {
      const resolved = await resolveUpload(row.path);
      if (resolved.kind === 'redirect') return reply.redirect(resolved.url);
    } catch { /* fall through to local /uploads/ redirect */ }
    // Local dev — fall back to the legacy /uploads route which the
    // static handler serves. (Production paths always hit the redirect
    // branch above.)
    return reply.redirect(`/uploads/${row.path}`);
  });

  // POST /api/documents — multipart upload. Accepts one `file` field
  // plus an optional repeatable `tags` field (comma-separated in a
  // single value also works for clients that can't dispatch multiple
  // form values under the same name).
  app.post('/documents', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const uid = requireUser(req).id;
    const mp = await req.file();
    if (!mp) {
      return reply.code(400).send({
        error: { message: 'חסר קובץ', code: 'no_file' },
      });
    }

    // Extract tags from the multipart fields bag. `req.file()` collects
    // non-file fields alongside the file part, so we read them off the
    // returned descriptor.
    const fields = (mp.fields as Record<string, any>) || {};
    const rawTags = fields.tags;
    const tagList = Array.isArray(rawTags)
      ? rawTags.map((t: any) => String(t?.value ?? t)).flat()
      : rawTags
        ? [String(rawTags.value ?? rawTags)]
        : [];
    // Allow CSV form too (`tags: "a,b,c"`) — handy when the client
    // can't dispatch multiple fields under the same name.
    const tags = tagList
      .flatMap((t) => t.split(','))
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10); // cap — no realistic use-case needs more than 10.

    let buffer: Buffer;
    try {
      buffer = await mp.toBuffer();
    } catch (e: any) {
      if (e?.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(413).send({
          error: { message: 'הקובץ גדול מדי', code: 'file_too_large' },
        });
      }
      throw e;
    }
    if (buffer.byteLength === 0) {
      return reply.code(400).send({
        error: { message: 'קובץ ריק', code: 'empty_file' },
      });
    }
    if (buffer.byteLength > MAX_DOCUMENT_BYTES) {
      return reply.code(413).send({
        error: { message: 'הקובץ גדול מדי', code: 'file_too_large' },
      });
    }

    const ext = (path.extname(mp.filename) || '').toLowerCase() || '.bin';
    const key = `documents/${uid}/${crypto.randomUUID()}${ext}`;
    await putUpload(key, buffer, mp.mimetype);

    const row = await prisma.uploadedFile.create({
      data: {
        ownerId:      uid,
        kind:         'document',
        originalName: mp.filename,
        mimeType:     mp.mimetype,
        sizeBytes:    buffer.byteLength,
        path:         key,
        tags,
      },
    });

    await logActivity({
      agentId: uid, actorId: uid,
      verb: 'uploaded', entityType: 'UploadedFile', entityId: row.id,
      summary: `הועלה מסמך: ${row.originalName}`,
      metadata: { mimeType: row.mimeType, sizeBytes: row.sizeBytes },
    });

    return { document: row };
  });

  // DELETE /api/documents/:id — owner-scoped. Removes the row and
  // best-effort deletes the S3 object (ENOENT is swallowed inside
  // deleteUpload so a half-deleted state still cleans up cleanly).
  app.delete('/documents/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const uid = requireUser(req).id;
    const existing = await prisma.uploadedFile.findFirst({
      where: { id, ownerId: uid, kind: 'document' },
    });
    if (!existing) return reply.code(404).send({ error: { message: 'Not found' } });

    await prisma.uploadedFile.delete({ where: { id } });
    try { await deleteUpload(existing.path); } catch { /* best-effort */ }

    await logActivity({
      agentId: uid, actorId: uid,
      verb: 'deleted', entityType: 'UploadedFile', entityId: id,
      summary: `נמחק מסמך: ${existing.originalName}`,
      metadata: { mimeType: existing.mimeType },
    });

    return { ok: true };
  });
};
