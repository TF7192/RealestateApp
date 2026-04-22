// F-11.7 — content-type whitelisting for multipart uploads.
//
// Block executable / HTML / SVG-with-script uploads from being served
// back under estia.co.il (same-origin = full session scope).
// Individual upload routes wrap their `await req.file()` in
// `assertAllowedMime(file, 'image' | 'video' | 'pdf')`.

const ALLOW_IMAGE = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const ALLOW_VIDEO = new Set([
  'video/mp4',
  'video/quicktime',
]);

const ALLOW_PDF = new Set([
  'application/pdf',
]);

export type UploadKind = 'image' | 'video' | 'pdf' | 'image-or-video';

export function assertAllowedMime(
  file: { mimetype?: string | null; filename?: string | null } | null,
  kind: UploadKind,
): void {
  if (!file) return;
  const mime = (file.mimetype || '').toLowerCase();
  const allowed = (() => {
    switch (kind) {
      case 'image':          return ALLOW_IMAGE;
      case 'video':          return ALLOW_VIDEO;
      case 'pdf':            return ALLOW_PDF;
      case 'image-or-video': return new Set([...ALLOW_IMAGE, ...ALLOW_VIDEO]);
    }
  })();
  if (!allowed.has(mime)) {
    const err: any = new Error(`unsupported_mime:${mime || 'unknown'}`);
    err.statusCode = 415;
    throw err;
  }
}
