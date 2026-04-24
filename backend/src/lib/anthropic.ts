// Thin factory around the Anthropic SDK.
//
// Wrapping client construction here means two things:
//   1. Routes don't each re-read the env var; missing-key handling lives
//      in one place (returns null → caller responds 503).
//   2. Tests can vi.mock('@anthropic-ai/sdk') without reaching through
//      nested imports.
//
// The client is built on every call rather than memoized. Building is
// cheap (just stores the key); the request path already reaches out to
// the Anthropic API, so one extra ctor per call is noise in the profile.

import Anthropic from '@anthropic-ai/sdk';

export function buildAnthropic(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

// Model string is centralized so a migration sprint only touches one line.
// Opus 4.7 is the strongest generally available model — marketing copy
// is short and high-value-per-token, so the cost difference vs Sonnet
// isn't meaningful here.
export const DESCRIBE_MODEL = 'claude-opus-4-7';
