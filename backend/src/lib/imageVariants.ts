// PERF-005 / PERF-016 — image variant pipeline.
//
// Background: list pages (Properties, Customers, Dashboard) render the
// cover image at 48×36 CSS px but historically downloaded the
// full-resolution 2400 px JPEG. The HEIC path already resized; native
// JPEG/PNG passed through unchanged. Both cases also went through
// `/uploads/*` → backend → S3 presigned 302 — three round-trips per
// thumbnail and an HMAC sign every hit.
//
// Fix: at upload time, decode any input image once and emit three
// fixed JPEG variants (thumb / card / full). Each is uploaded to S3
// with `ACL: public-read` + a long-immutable Cache-Control so the
// browser/CF can long-cache and skip the backend entirely. The
// resulting object URL is the canonical public S3 URL — no signing,
// no redirect.
//
// Variant table:
//   thumb-256.jpg — 256 px wide max, q75 mozjpeg  → list cards
//   card-768.jpg  — 768 px wide max, q80          → detail-page galleries
//   full-2400.jpg — 2400 px wide max, q82         → lightbox
//
// HEIC handling: heic-convert decodes the container, then sharp
// normalizes EXIF orientation and re-encodes. PNG/JPEG/WebP go
// straight through sharp. The original is never persisted.

import {
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import crypto from 'node:crypto';

const BUCKET = process.env.S3_BUCKET || 'estia-prod';
const REGION = process.env.S3_REGION || 'eu-north-1';

let s3: S3Client | null = null;
function client(): S3Client {
  if (!s3) s3 = new S3Client({ region: REGION });
  return s3;
}

export type ProcessedImage = {
  /** Public S3 URL of the 2400 px canonical full-size JPEG. */
  url: string;
  /** Public S3 URL of the 768 px gallery JPEG. */
  urlCard: string;
  /** Public S3 URL of the 256 px list-thumb JPEG. */
  urlThumb: string;
  /** S3 key prefix shared by the variants (under `uploads/`). Useful
   *  for cleanup if the property image row is deleted later. */
  keyPrefix: string;
};

const PUBLIC_BASE = `https://${BUCKET}.s3.${REGION}.amazonaws.com`;

function publicUrlFor(key: string): string {
  // S3 key is stored with the "uploads/" prefix to mirror the legacy
  // layout (keeps backfill / deletion bookkeeping simple). The public
  // URL therefore includes `/uploads/<key>` after the bucket host.
  return `${PUBLIC_BASE}/uploads/${key}`;
}

/**
 * Decode an uploaded property image (HEIC / JPEG / PNG / WebP) and
 * push three public S3 variants. Returns the trio of public URLs and
 * the shared key prefix (e.g. `properties/<propertyId>/<uuid>/`).
 *
 * The caller passes `propertyId` so the keys cluster by property.
 */
export async function processPropertyImage(
  buffer: Buffer,
  mimetype: string | undefined,
  filename: string | undefined,
  propertyId: string,
): Promise<ProcessedImage> {
  // Heuristic for HEIC — Safari sets the proper image/heic mimetype but
  // some upload paths drop it; sniff by extension as a fallback.
  const isHeic =
    mimetype === 'image/heic' ||
    mimetype === 'image/heif' ||
    /\.(heic|heif)$/i.test(filename || '');

  const sharp = (await import('sharp')).default;

  let decoded: Buffer = buffer;
  if (isHeic) {
    // heic-convert returns a JPEG; sharp then normalizes orientation
    // and re-encodes. Quality 0.9 here is the *intermediate* fidelity;
    // every downstream variant rasterizes from it at its own quality.
    const heicConvert = (await import('heic-convert')).default;
    const jpegIntermediate = await heicConvert({
      buffer,
      format: 'JPEG',
      quality: 0.9,
    });
    decoded = Buffer.from(jpegIntermediate);
  }

  // sharp() pipeline — keep one decode shared by all three variants.
  // `.rotate()` honors EXIF orientation before any resize so phone
  // photos in portrait don't end up sideways.
  const base = sharp(decoded).rotate();

  const [thumb, card, full] = await Promise.all([
    base
      .clone()
      .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75, mozjpeg: true })
      .toBuffer(),
    base
      .clone()
      .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer(),
    base
      .clone()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer(),
  ]);

  const folder = crypto.randomUUID();
  const keyPrefix = `properties/${propertyId}/${folder}/`;

  await Promise.all([
    putPublicJpeg(`${keyPrefix}thumb-256.jpg`, thumb),
    putPublicJpeg(`${keyPrefix}card-768.jpg`, card),
    putPublicJpeg(`${keyPrefix}full-2400.jpg`, full),
  ]);

  return {
    url: publicUrlFor(`${keyPrefix}full-2400.jpg`),
    urlCard: publicUrlFor(`${keyPrefix}card-768.jpg`),
    urlThumb: publicUrlFor(`${keyPrefix}thumb-256.jpg`),
    keyPrefix,
  };
}

/**
 * Re-derive the smaller variants from an existing full-size JPEG
 * already in S3. Used by the backfill script so legacy
 * `PropertyImage.url`-only rows can be upgraded without re-uploading
 * from the agent's device. Returns the new public URLs.
 *
 * `existingFullKey` is the S3 key (without the bucket / `uploads/`
 * prefix) of the legacy full-size object.
 */
export async function processExistingFull(
  fullBuffer: Buffer,
  propertyId: string,
): Promise<{ url: string; urlCard: string; urlThumb: string; keyPrefix: string }> {
  return processPropertyImage(fullBuffer, 'image/jpeg', 'legacy.jpg', propertyId);
}

/**
 * Internal helper — put a JPEG to S3 with the long-immutable
 * Cache-Control. Centralized so every variant writes the same
 * metadata.
 *
 * NO `ACL: public-read` — the `estia-prod` bucket runs with Object
 * Ownership = "Bucket owner enforced" (the modern AWS default since
 * 2023), which makes per-object ACLs an error. Public read access for
 * `uploads/properties/*` keys is granted via the bucket policy
 * applied separately. See `storage.ts` putUpload JSDoc for the policy
 * statement.
 */
async function putPublicJpeg(key: string, body: Buffer): Promise<void> {
  await client().send(new PutObjectCommand({
    Bucket: BUCKET,
    // Mirror the legacy "uploads/" prefix so the storage tree is
    // homogeneous and the backfill resolver's `urlToKey` mapping
    // continues to work.
    Key: `uploads/${key}`,
    Body: body,
    ContentType: 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

/**
 * Helpers for the frontend / serializer — pick the right URL for the
 * surface. List pages pass `'thumb'`, gallery thumbs pass `'card'`,
 * lightbox passes `'full'`. Falls back to the next-best variant when
 * legacy rows are missing the smaller URLs.
 */
export function pickImageUrl(
  row: { url?: string | null; urlCard?: string | null; urlThumb?: string | null } | null | undefined,
  variant: 'thumb' | 'card' | 'full',
): string | null {
  if (!row) return null;
  if (variant === 'thumb') return row.urlThumb || row.urlCard || row.url || null;
  if (variant === 'card')  return row.urlCard  || row.url      || row.urlThumb || null;
  return row.url || row.urlCard || row.urlThumb || null;
}
