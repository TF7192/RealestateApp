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
 * Write a file to storage. Returns the public URL prefix used by the
 * frontend (e.g. "/uploads/properties/abc.jpg") — same shape regardless
 * of backend so the database/JSON columns don't need migrating.
 */
export async function putUpload(
  key: string,
  data: Buffer,
  contentType?: string
): Promise<string> {
  if (BACKEND === 's3') {
    await client().send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: `uploads/${key}`,
      Body: data,
      ContentType: contentType || 'application/octet-stream',
      CacheControl: 'public, max-age=31536000, immutable',
    }));
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
 */
export function urlToKey(url: string): string | null {
  if (!url || !url.startsWith('/uploads/')) return null;
  return url.replace(/^\/uploads\//, '');
}
