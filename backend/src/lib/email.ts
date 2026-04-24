// Sprint 5.1 — minimal SES wrapper used by the /api/contact endpoint.
//
// We build a fresh SESClient per call — same pattern the S3 helper
// (meetingAudio.ts) follows. Construction is cheap, and this keeps
// tests simple: they can `vi.mock('../lib/email.js')` and the route
// picks up the mock without reaching through @aws-sdk internals.
//
// Credentials come from the EC2 instance role in prod. Locally you
// can set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY, but the route
// is designed so a failed send bubbles up as a 500 that the user can
// re-attempt rather than hanging.

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export interface SendContactEmailArgs {
  // Full email subject *after* the app-wide "[Estia][Contact]" prefix.
  // The caller supplies whatever the user typed; we concatenate.
  subject: string;
  body: string;
  // Informational "from" metadata the user filled on the form. The
  // actual envelope sender is the verified SES identity — these land
  // in the email body so the inbox thread captures them.
  fromName?: string | null;
  fromEmail?: string | null;
  // When set, the authenticated user's display name + email are
  // appended automatically so logged-in support requests come with
  // full attribution even if they left the form's optional fields
  // blank.
  authUserDisplayName?: string | null;
  authUserEmail?: string | null;
}

// Constants — all overridable by env so staging / CI can re-route mail
// to a sandbox verified address without a code change.
const RECIPIENT = process.env.CONTACT_RECIPIENT_EMAIL || 'talfuks1234@gmail.com';
const SENDER = process.env.CONTACT_SENDER_EMAIL || 'no-reply@estia.co.il';
const REGION = process.env.AWS_REGION || process.env.SES_REGION || 'eu-north-1';
const SUBJECT_PREFIX = '[Estia][Contact]';

export async function sendContactEmail(args: SendContactEmailArgs): Promise<void> {
  const subject = `${SUBJECT_PREFIX} ${args.subject}`.slice(0, 200);

  const lines: string[] = [];
  if (args.authUserDisplayName || args.authUserEmail) {
    lines.push('— Authenticated sender —');
    if (args.authUserDisplayName) lines.push(`Name (auth): ${args.authUserDisplayName}`);
    if (args.authUserEmail)       lines.push(`Email (auth): ${args.authUserEmail}`);
    lines.push('');
  }
  if (args.fromName || args.fromEmail) {
    lines.push('— Form sender —');
    if (args.fromName)  lines.push(`Name: ${args.fromName}`);
    if (args.fromEmail) lines.push(`Email: ${args.fromEmail}`);
    lines.push('');
  }
  lines.push('— Message —');
  lines.push(args.body);

  const client = new SESClient({ region: REGION });
  await client.send(new SendEmailCommand({
    Source: SENDER,
    Destination: { ToAddresses: [RECIPIENT] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Text: { Data: lines.join('\n'), Charset: 'UTF-8' } },
    },
    // Lets the recipient reply directly to the form sender when they
    // provided one. Falls back to the hardcoded sender otherwise.
    ReplyToAddresses: args.fromEmail ? [args.fromEmail] : [SENDER],
  }));
}

// Exposed for tests.
export const _internals = { RECIPIENT, SENDER, REGION, SUBJECT_PREFIX };
