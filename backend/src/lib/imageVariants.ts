// PERF-005 — image variant pipeline.
//
// Background: list pages (Properties, Customers, Dashboard) render the
// cover image at 48×36 CSS px but historically downloaded the
// full-resolution 2400 px JPEG. The HEIC path already resized; native
// JPEG/PNG passed through unchanged.
//
// Fix: at upload time, decode any input image once and emit three
// fixed JPEG variants (thumb / card / full). All three are written to
// the SAME private S3 location the legacy single-image upload uses,
// and the URLs we return are the existing `/uploads/<key>` relative
// paths so reads keep going through the backend's signed-redirect
// resolver — no public S3, no bucket policy, no ACLs. The win comes
// from the byte size drop on list pages (256-px thumb instead of
// 2400-px full) plus the long-immutable `Cache-Control` we set on
// every variant.
//
// Variant table:
//   thumb-256.jpg — 256 px wide max, q75 mozjpeg  → list cards
//   card-768.jpg  — 768 px wide max, q80          → detail-page galleries
//   full-2400.jpg — 2400 px wide max, q82         → lightbox
//
// HEIC handling: heic-convert decodes the container, then sharp
// normalizes EXIF orientation and re-encodes. PNG/JPEG/WebP go
// straight through sharp. The original is never persisted.

import { putUpload } from './storage.js';
import crypto from 'node:crypto';

export type ProcessedImage = {
  /** `/uploads/<key>` of the 2400 px canonical full-size JPEG. */
  url: string;
  /** `/uploads/<key>` of the 768 px gallery JPEG. */
  urlCard: string;
  /** `/uploads/<key>` of the 256 px list-thumb JPEG. */
  urlThumb: string;
  /** S3 key prefix shared by the variants (under `uploads/`). Useful
   *  for cleanup if the property image row is deleted later. */
  keyPrefix: string;
};

/**
 * Decode an uploaded property image (HEIC / JPEG / PNG / WebP) and
 * push three private S3 variants behind the existing `/uploads/<key>`
 * resolver. Returns the trio of relative paths.
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

  // All three variants land on the same private S3 location the
  // legacy single-upload pathway uses; `putUpload` with no `public`
  // option returns the relative `/uploads/<key>` path that the
  // backend's signed-redirect resolver already understands.
  const [urlThumb, urlCard, url] = await Promise.all([
    putUpload(`${keyPrefix}thumb-256.jpg`, thumb, 'image/jpeg'),
    putUpload(`${keyPrefix}card-768.jpg`, card, 'image/jpeg'),
    putUpload(`${keyPrefix}full-2400.jpg`, full, 'image/jpeg'),
  ]);

  return { url, urlCard, urlThumb, keyPrefix };
}

/**
 * Re-derive the smaller variants from an existing full-size JPEG
 * already in S3. Used by the backfill script so legacy
 * `PropertyImage.url`-only rows can be upgraded without re-uploading
 * from the agent's device. Returns the new relative paths.
 */
export async function processExistingFull(
  fullBuffer: Buffer,
  propertyId: string,
): Promise<{ url: string; urlCard: string; urlThumb: string; keyPrefix: string }> {
  return processPropertyImage(fullBuffer, 'image/jpeg', 'legacy.jpg', propertyId);
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
