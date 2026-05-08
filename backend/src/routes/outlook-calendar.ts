// Outlook (Microsoft Graph) Calendar integration — agent-opt-in sync.
//
//   GET  /integrations/outlook-calendar/status      → { connected, configured, expiresAt? }
//   GET  /integrations/outlook-calendar/connect     → OAuth consent
//   GET  /integrations/outlook-calendar/callback    → exchange code → save tokens
//   POST /integrations/outlook-calendar/disconnect  → clear tokens
//
// Mirrors calendar.ts (Google) so an agent can connect either or
// both. Tokens land on User.outlookAccessToken / outlookRefreshToken /
// outlookTokenExpiresAt. Access tokens expire ~1h; refresh tokens via
// `offline_access` scope.
//
// Required env vars:
//   MICROSOFT_CLIENT_ID
//   MICROSOFT_CLIENT_SECRET
//   PUBLIC_ORIGIN          (already used by other OAuth flows)
//
// When the env vars aren't configured, the routes return 503 from
// /connect and `configured:false` from /status — the UI hides the
// button gracefully, so this can be safely deployed without env
// secrets and the "connect" button just stays disabled.

import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { getUser } from '../middleware/auth.js';

const SCOPES = 'openid offline_access https://graph.microsoft.com/Calendars.ReadWrite';
const AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_API = 'https://graph.microsoft.com/v1.0';
const STATE_COOKIE = 'estia_outlook_state';

function isConfigured(): boolean {
  return !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

function redirectUri(): string {
  const origin = process.env.PUBLIC_ORIGIN || 'https://estia.co.il';
  return `${origin}/api/integrations/outlook-calendar/callback`;
}

// Exported so meetings.ts (or any future event-creator) can mirror
// the same auto-refresh behaviour without duplicating the OAuth dance.
export async function getFreshOutlookAccessToken(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u?.outlookRefreshToken) return null;
  const now = Date.now();
  if (u.outlookAccessToken && u.outlookTokenExpiresAt && u.outlookTokenExpiresAt.getTime() - now > 120_000) {
    return u.outlookAccessToken;
  }
  if (!isConfigured()) return null;
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: u.outlookRefreshToken,
      scope: SCOPES,
    }),
  });
  const j = await resp.json() as any;
  if (!resp.ok || !j.access_token) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        outlookAccessToken: null,
        outlookTokenExpiresAt: null,
        outlookCalendarEnabled: false,
      },
    });
    return null;
  }
  const expiresAt = new Date(Date.now() + (j.expires_in || 3600) * 1000);
  await prisma.user.update({
    where: { id: userId },
    data: {
      outlookAccessToken: j.access_token,
      outlookTokenExpiresAt: expiresAt,
      ...(j.refresh_token ? { outlookRefreshToken: j.refresh_token } : {}),
    },
  });
  return j.access_token;
}

interface OutlookEventInput {
  title: string;
  notes?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  attendeeEmail?: string | null;
}

export async function createOutlookEvent(
  accessToken: string,
  input: OutlookEventInput,
): Promise<{ id: string } | null> {
  const body: Record<string, unknown> = {
    subject: input.title,
    body: { contentType: 'text', content: input.notes || '' },
    start: { dateTime: input.startsAt.toISOString(), timeZone: 'Asia/Jerusalem' },
    end:   { dateTime: input.endsAt.toISOString(),   timeZone: 'Asia/Jerusalem' },
  };
  if (input.location) body.location = { displayName: input.location };
  if (input.attendeeEmail) body.attendees = [{
    emailAddress: { address: input.attendeeEmail },
    type: 'required',
  }];
  const resp = await fetch(`${GRAPH_API}/me/events`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) return null;
  const j = await resp.json() as any;
  return { id: j.id };
}

export async function updateOutlookEvent(
  accessToken: string,
  eventId: string,
  input: Partial<OutlookEventInput>,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) body.subject = input.title;
  if (input.notes !== undefined) body.body = { contentType: 'text', content: input.notes || '' };
  if (input.location !== undefined) body.location = input.location ? { displayName: input.location } : null;
  if (input.startsAt) body.start = { dateTime: input.startsAt.toISOString(), timeZone: 'Asia/Jerusalem' };
  if (input.endsAt) body.end = { dateTime: input.endsAt.toISOString(), timeZone: 'Asia/Jerusalem' };
  await fetch(`${GRAPH_API}/me/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteOutlookEvent(accessToken: string, eventId: string): Promise<void> {
  await fetch(`${GRAPH_API}/me/events/${eventId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
}

export const registerOutlookCalendarRoutes: FastifyPluginAsync = async (app) => {
  app.get('/status', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const user = await prisma.user.findUnique({
      where: { id: u.id },
      select: {
        outlookCalendarEnabled: true,
        outlookTokenExpiresAt: true,
        outlookRefreshToken: true,
      },
    });
    return {
      connected: !!(user?.outlookCalendarEnabled && user?.outlookRefreshToken),
      expiresAt: user?.outlookTokenExpiresAt?.toISOString() ?? null,
      configured: isConfigured(),
    };
  });

  app.get('/connect', {
    onRequest: [app.requireAuth],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    if (!isConfigured()) {
      return reply.code(503).send({ error: { message: 'Outlook Calendar not configured' } });
    }
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const state = crypto.randomBytes(24).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ s: state, u: u.id })).toString('base64url');
    reply.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/integrations/outlook-calendar',
      maxAge: 600,
    });
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      redirect_uri: redirectUri(),
      response_type: 'code',
      response_mode: 'query',
      scope: SCOPES,
      state: payload,
      prompt: 'consent',
    });
    return reply.redirect(`${AUTH_URL}?${params.toString()}`);
  });

  app.get('/callback', async (req, reply) => {
    const { code, state: encodedState } = req.query as { code?: string; state?: string };
    const savedState = (req.cookies as any)?.[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, { path: '/api/integrations/outlook-calendar' });
    if (!code || !encodedState || !savedState) {
      return reply.redirect('/profile?outlook=missing_state');
    }
    let decoded: { s: string; u: string };
    try {
      decoded = JSON.parse(Buffer.from(encodedState, 'base64url').toString('utf8'));
    } catch {
      return reply.redirect('/profile?outlook=bad_state');
    }
    if (decoded.s !== savedState) return reply.redirect('/profile?outlook=state_mismatch');

    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        redirect_uri: redirectUri(),
        grant_type: 'authorization_code',
        scope: SCOPES,
      }),
    });
    const tokens = await resp.json() as any;
    if (!resp.ok || !tokens.access_token) {
      req.log.warn({ status: resp.status }, 'outlook token exchange failed');
      return reply.redirect('/profile?outlook=token_failed');
    }
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
    await prisma.user.update({
      where: { id: decoded.u },
      data: {
        outlookAccessToken: tokens.access_token,
        ...(tokens.refresh_token ? { outlookRefreshToken: tokens.refresh_token } : {}),
        outlookTokenExpiresAt: expiresAt,
        outlookCalendarEnabled: true,
      },
    });
    return reply.redirect('/profile?outlook=connected');
  });

  app.post('/disconnect', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    await prisma.user.update({
      where: { id: u.id },
      data: {
        outlookAccessToken: null,
        outlookRefreshToken: null,
        outlookTokenExpiresAt: null,
        outlookCalendarEnabled: false,
      },
    });
    return { ok: true };
  });
};
