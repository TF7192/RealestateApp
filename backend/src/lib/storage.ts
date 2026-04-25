// Storage abstraction — local disk in dev, S3 in production.
//
// Toggle via env: UPLOADS_BACKEND=s3|local
// When s3:  S3_BUCKET, S3_REGION  required
//           AWS creds via the EC2 IAM role (preferred) OR
//           AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars.
//
// `key` is the storage key (relative path under "uploads/"). For S3 the
// object lives at  s3://<bucket>/uploads/<key>. The route layer keeps using
// the same /uploads/<key> URL the frontend already expects — when serving
// from S3 the static handler 302s to a presigned URL.

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'node:path';
import fs from 'node:fs/promises';

const BACKEND  = (process.env.UPLOADS_BACKEND || 'local').toLowerCase();
const BUCKET   = process.env.S3_BUCKET || 'estia-prod';
const REGION   = process.env.S3_REGION || 'eu-north-1';
const LOCAL_DIR = path.resolve(process.env.UPLOADS_DIR || './uploads');

let s3: S3Client | null = null;
function client(): S3Client {
  if (!s3) s3 = new S3Client({ region: REGION });
  return s3;
}

export const storageBackend = BACKEND;

/**
 * Write a file to storage. Returns the URL the frontend will read —
 * same shape regardless of backend so DB/JSON columns don't need
 * migrating. Two modes:
 *
 *   • opts.public !== true (default): returns the relative
 *     `/uploads/<key>` path. The backend's `/uploads/*` route then
 *     resolves it to a presigned S3 URL on read.
 *   • opts.public === true: PERF-016 — sets `ACL: public-read` on the
 *     object and returns the absolute `https://<bucket>.s3.<region>
 *     .amazonaws.com/uploads/<key>` URL so the browser can hit S3
 *     directly (skipping the backend signing round-trip on every fetch).
 *     Used by the property-image variant pipeline.
 *
 * The cache-control header is identical in both modes — `max-age=31536000,
 * immutable` — but the public mode is the one where it actually takes
 * effect: signed URLs change every hour so the browser cache misses
 * anyway.
 */
export async function putUpload(
  key: string,
  data: Buffer,
  contentType?: string,
  opts?: { public?: boolean },
): Promise<string> {
  if (BACKEND === 's3') {
    await client().send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: `uploads/${key}`,
      Body: data,
      ContentType: contentType || 'application/octet-stream',
      CacheControl: 'public, max-age=31536000, immutable',
      ...(opts?.public ? { ACL: 'public-read' as const } : null),
    }));
    if (opts?.public) {
      return `https://${BUCKET}.s3.${REGION}.amazonaws.com/uploads/${key}`;
    }
    return `/uploads/${key}`;
  }
  const dest = path.join(LOCAL_DIR, key);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, data);
  return `/uploads/${key}`;
}

/**
 * Look up where to send a /uploads/<key> request.
 *  - local: returns the absolute file path (caller can pipe via fs.createReadStream)
 *  - s3:    returns a presigned URL (caller redirects with 302)
 */
export async function resolveUpload(key: string): Promise<
  { kind: 'file'; path: string } | { kind: 'redirect'; url: string }
> {
  if (BACKEND === 's3') {
    const url = await getSignedUrl(
      client(),
      new GetObjectCommand({ Bucket: BUCKET, Key: `uploads/${key}` }),
      { expiresIn: 60 * 60 } // 1h
    );
    return { kind: 'redirect', url };
  }
  return { kind: 'file', path: path.join(LOCAL_DIR, key) };
}

/**
 * Delete an object. Best-effort: silently swallow "not found".
 */
export async function deleteUpload(key: string): Promise<void> {
  if (BACKEND === 's3') {
    try {
      await client().send(new DeleteObjectCommand({
        Bucket: BUCKET, Key: `uploads/${key}`,
      }));
    } catch (e: any) {
      if (e?.$metadata?.httpStatusCode !== 404) throw e;
    }
    return;
  }
  try { await fs.unlink(path.join(LOCAL_DIR, key)); }
  catch (e: any) { if (e?.code !== 'ENOENT') throw e; }
}

/**
 * Strip a "/uploads/" prefix from a stored URL to get the storage key.
 * Also handles the absolute public S3 URL form
 * (`https://<bucket>.s3.<region>.amazonaws.com/uploads/<key>`) the new
 * variant pipeline writes — strips the bucket host so callers like the
 * legacy delete path keep working.
 */
export function urlToKey(url: string): string | null {
  if (!url) return null;
  if (url.startsWith('/uploads/')) return url.replace(/^\/uploads\//, '');
  // Absolute public S3 URL — accept any bucket / region match against
  // the configured one so we don't accidentally pick up cross-account
  // links pasted into a row by hand.
  const publicPrefix = `https://${BUCKET}.s3.${REGION}.amazonaws.com/uploads/`;
  if (url.startsWith(publicPrefix)) return url.slice(publicPrefix.length);
  return null;
}

/**
 * Fetch the bytes of an existing object — used by the image-variant
 * backfill to re-derive smaller variants from a legacy full-size row.
 * Local mode reads from disk; S3 mode does a GetObject. Returns null if
 * the object is missing.
 */
export async function getUploadBytes(key: string): Promise<Buffer | null> {
  if (BACKEND === 's3') {
    try {
      const r = await client().send(new GetObjectCommand({
        Bucket: BUCKET, Key: `uploads/${key}`,
      }));
      const body = r.Body as any;
      // The SDK returns a stream; collect into a buffer.
      const chunks: Buffer[] = [];
      for await (const chunk of body) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    } catch (e: any) {
      if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NoSuchKey') return null;
      throw e;
    }
  }
  try { return await fs.readFile(path.join(LOCAL_DIR, key)); }
  catch (e: any) { if (e?.code === 'ENOENT') return null; throw e; }
}
