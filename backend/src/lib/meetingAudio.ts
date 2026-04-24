// Thin wrapper around the S3 put that the meeting-summariser route
// uses. Factored out so tests can `vi.mock('../lib/meetingAudio.js')`
// without having to intercept the full @aws-sdk/client-s3 module tree
// (which is a large CJS bundle that vi.mock struggles to replace
// cleanly from the integration project root).
//
// Returns the storage key on success, or null if anything at all
// throws (credentials, networking, permissions). The caller logs the
// underlying error and swaps in the mock-summary fallback.

import {
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

export interface PutMeetingAudioOpts {
  key: string;
  body: Buffer;
  region?: string;
  bucket?: string;
  contentType?: string;
}

export async function putMeetingAudio(opts: PutMeetingAudioOpts): Promise<string | null> {
  const region = opts.region || process.env.S3_REGION || 'eu-north-1';
  const bucket = opts.bucket || process.env.S3_BUCKET || 'estia-prod';
  try {
    const s3 = new S3Client({ region });
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType || 'application/octet-stream',
    }));
    return opts.key;
  } catch {
    return null;
  }
}
