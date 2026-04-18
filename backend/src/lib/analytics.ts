// Server-side PostHog helper.
//
// Use `track(event, userId, props)` from any route for trust-sensitive
// milestones (signup completed, login, property_created, etc).
// Unhandled exceptions go through `captureException` registered on the
// Fastify error handler.
//
// Required env:
//   POSTHOG_PROJECT_API_KEY   — phc_... project token
//   POSTHOG_HOST              — https://us.i.posthog.com (default US)
//
// No-op when the token is absent so dev/localhost stays silent.

import { PostHog } from 'posthog-node';

const KEY  = process.env.POSTHOG_PROJECT_API_KEY || '';
const HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (client) return client;
  if (!KEY) return null;
  client = new PostHog(KEY, {
    host: HOST,
    flushAt: 1,           // send events immediately in prod — low volume
    flushInterval: 3000,  // 3s fallback
  });
  return client;
}

export function track(event: string, userId: string | null | undefined, properties: Record<string, any> = {}) {
  const c = getClient();
  if (!c) return;
  // Drop events we can't attribute to a person. Generating a fresh random
  // "anon-*" per call was creating thousands of single-event ghost people
  // in PostHog and polluting the Persons list. Upstream callers should
  // forward a stable browser distinct-id (e.g. from posthog-js) when
  // they want anonymous traffic tracked.
  if (!userId) return;
  try {
    c.capture({
      distinctId: userId,
      event,
      properties: {
        env: process.env.NODE_ENV || 'production',
        service: 'estia-backend',
        ...properties,
      },
    });
  } catch { /* never crash the request over analytics */ }
}

export function identify(userId: string, properties: Record<string, any>) {
  const c = getClient();
  if (!c) return;
  try { c.identify({ distinctId: userId, properties }); } catch { /* noop */ }
}

export function captureException(err: unknown, userId: string | null | undefined, context: Record<string, any> = {}) {
  const c = getClient();
  if (!c) return;
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    c.captureException(e, userId || undefined, context);
  } catch { /* noop */ }
}

export async function shutdownAnalytics(): Promise<void> {
  if (!client) return;
  try { await client.shutdown(); } catch { /* noop */ }
}
