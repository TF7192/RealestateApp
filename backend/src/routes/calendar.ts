// Google Calendar integration — agent-opt-in sync layer.
//
//   GET  /integrations/calendar/status         → { connected, expiresAt? }
//   GET  /integrations/calendar/connect        → OAuth consent (Calendar scope)
//   GET  /integrations/calendar/callback       → exchange code → save tokens
//   POST /integrations/calendar/disconnect     → revoke + clear tokens
//
//   Lead meetings:
//   GET    /leads/:leadId/meetings             → list meetings for a lead
//   POST   /leads/:leadId/meetings             → create + push to Calendar
//   PATCH  /meetings/:id                       → edit + sync
//   DELETE /meetings/:id                       → delete + remove from Calendar
//
// The Calendar API needs a DIFFERENT consent than the login flow (the
// login flow only asks for `openid email profile`; Calendar needs
// `https://www.googleapis.com/auth/calendar.events`). We request it via
// a separate /connect endpoint so agents who logged in with email can
// connect their Calendar without logging out first.
//
// Tokens are stored on User.googleAccessToken / googleRefreshToken.
// Access tokens expire ~1h; we auto-refresh using the refresh token.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { getUser } from '../middleware/auth.js';

const CAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CAL_API = 'https://www.googleapis.com/calendar/v3';
const STATE_COOKIE = 'estia_cal_state';

function isConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function redirectUri(): string {
  const origin = process.env.PUBLIC_ORIGIN || 'https://estia.tripzio.xyz';
  return `${origin}/api/integrations/calendar/callback`;
}

// Refresh the access token if needed. Returns the fresh token string,
// or null if no refresh token is saved (agent needs to reconnect).
async function getFreshAccessToken(userId: string): Promise<string | null> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u?.googleRefreshToken) return null;
  // Margin — refresh if it expires within the next 2 minutes.
  const now = Date.now();
  if (u.googleAccessToken && u.googleTokenExpiresAt && u.googleTokenExpiresAt.getTime() - now > 120_000) {
    return u.googleAccessToken;
  }
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: u.googleRefreshToken,
    }),
  });
  const j = await resp.json() as any;
  if (!resp.ok || !j.access_token) {
    // Refresh failed — likely revoked. Clear so the UI prompts reconnect.
    await prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessToken: null,
        googleTokenExpiresAt: null,
        googleCalendarEnabled: false,
      },
    });
    return null;
  }
  const expiresAt = new Date(now + (j.expires_in || 3600) * 1000);
  await prisma.user.update({
    where: { id: userId },
    data: {
      googleAccessToken: j.access_token,
      googleTokenExpiresAt: expiresAt,
    },
  });
  return j.access_token;
}

interface CalEventInput {
  title: string;
  notes?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  attendeeEmail?: string | null;
  addMeetLink?: boolean;
}

async function createCalendarEvent(accessToken: string, input: CalEventInput): Promise<{ id: string; meetLink?: string } | null> {
  const body: any = {
    summary: input.title,
    description: input.notes || undefined,
    location: input.location || undefined,
    start: { dateTime: input.startsAt.toISOString(), timeZone: 'Asia/Jerusalem' },
    end:   { dateTime: input.endsAt.toISOString(),   timeZone: 'Asia/Jerusalem' },
  };
  if (input.attendeeEmail) body.attendees = [{ email: input.attendeeEmail }];
  if (input.addMeetLink) {
    body.conferenceData = {
      createRequest: {
        requestId: crypto.randomBytes(8).toString('hex'),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }
  const url = `${CAL_API}/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) return null;
  const j = await resp.json() as any;
  const meetLink = j?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri;
  return { id: j.id, meetLink };
}

async function updateCalendarEvent(accessToken: string, eventId: string, input: Partial<CalEventInput>): Promise<void> {
  const body: any = {};
  if (input.title !== undefined)    body.summary = input.title;
  if (input.notes !== undefined)    body.description = input.notes || undefined;
  if (input.location !== undefined) body.location = input.location || undefined;
  if (input.startsAt) body.start = { dateTime: input.startsAt.toISOString(), timeZone: 'Asia/Jerusalem' };
  if (input.endsAt)   body.end   = { dateTime: input.endsAt.toISOString(),   timeZone: 'Asia/Jerusalem' };
  await fetch(`${CAL_API}/calendars/primary/events/${eventId}?sendUpdates=all`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function deleteCalendarEvent(accessToken: string, eventId: string): Promise<void> {
  await fetch(`${CAL_API}/calendars/primary/events/${eventId}?sendUpdates=all`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
}

export const registerCalendarRoutes: FastifyPluginAsync = async (app) => {
  app.get('/status', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const user = await prisma.user.findUnique({
      where: { id: u.id },
      select: { googleCalendarEnabled: true, googleTokenExpiresAt: true, googleRefreshToken: true },
    });
    return {
      connected: !!(user?.googleCalendarEnabled && user?.googleRefreshToken),
      expiresAt: user?.googleTokenExpiresAt?.toISOString() ?? null,
      configured: isConfigured(),
    };
  });

  app.get('/connect', { onRequest: [app.requireAuth] }, async (req, reply) => {
    if (!isConfigured()) {
      return reply.code(500).send({ error: { message: 'Google Calendar not configured' } });
    }
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const state = crypto.randomBytes(24).toString('base64url');
    // Wrap userId + nonce in the state so the callback knows which user
    // to attach tokens to (cookie alone is enough, but belt-and-braces).
    const payload = Buffer.from(JSON.stringify({ s: state, u: u.id })).toString('base64url');
    reply.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/integrations/calendar',
      maxAge: 600,
    });
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: `openid email ${CAL_SCOPE}`,
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent', // force refresh_token even on re-consent
      state: payload,
    });
    return reply.redirect(`${AUTH_URL}?${params.toString()}`);
  });

  app.get('/callback', async (req, reply) => {
    const { code, state: encodedState } = req.query as { code?: string; state?: string };
    const savedState = (req.cookies as any)?.[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, { path: '/api/integrations/calendar' });
    if (!code || !encodedState || !savedState) {
      return reply.redirect('/profile?calendar=missing_state');
    }
    let decoded: { s: string; u: string };
    try {
      decoded = JSON.parse(Buffer.from(encodedState, 'base64url').toString('utf8'));
    } catch {
      return reply.redirect('/profile?calendar=bad_state');
    }
    if (decoded.s !== savedState) return reply.redirect('/profile?calendar=state_mismatch');

    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(),
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await resp.json() as any;
    if (!resp.ok || !tokens.access_token) {
      req.log.warn({ tokens }, 'calendar token exchange failed');
      return reply.redirect('/profile?calendar=token_failed');
    }
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
    await prisma.user.update({
      where: { id: decoded.u },
      data: {
        googleAccessToken: tokens.access_token,
        // If Google didn't return a refresh_token (re-consent without
        // prompt=consent), keep the previous one rather than clobber.
        ...(tokens.refresh_token ? { googleRefreshToken: tokens.refresh_token } : {}),
        googleTokenExpiresAt: expiresAt,
        googleCalendarEnabled: true,
      },
    });
    return reply.redirect('/profile?calendar=connected');
  });

  app.post('/disconnect', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const user = await prisma.user.findUnique({ where: { id: u.id } });
    // Best-effort revoke so Google drops our token server-side.
    if (user?.googleRefreshToken) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(user.googleRefreshToken)}`, {
        method: 'POST',
      }).catch(() => {});
    }
    await prisma.user.update({
      where: { id: u.id },
      data: {
        googleAccessToken: null,
        googleRefreshToken: null,
        googleTokenExpiresAt: null,
        googleCalendarEnabled: false,
      },
    });
    return { ok: true };
  });

  // ── Lead meetings ──────────────────────────────────────────────

  const MeetingInput = z.object({
    title: z.string().min(1).max(200),
    notes: z.string().max(2000).optional(),
    location: z.string().max(200).optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    attendeeEmail: z.string().email().optional().or(z.literal('')),
    addMeetLink: z.boolean().optional(),
    syncToCalendar: z.boolean().optional(),
  });

  app.get('/leads/:leadId/meetings', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const { leadId } = req.params as { leadId: string };
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.agentId !== u.id) return reply.code(404).send({ error: { message: 'Not found' } });
    const items = await prisma.leadMeeting.findMany({
      where: { leadId },
      orderBy: { startsAt: 'desc' },
    });
    return { items };
  });

  app.post('/leads/:leadId/meetings', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const { leadId } = req.params as { leadId: string };
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.agentId !== u.id) return reply.code(404).send({ error: { message: 'Not found' } });
    const parsed = MeetingInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: parsed.error.issues[0]?.message || 'Invalid input' } });
    }
    const { syncToCalendar, addMeetLink, attendeeEmail, ...rest } = parsed.data;
    const startsAt = new Date(rest.startsAt);
    const endsAt   = new Date(rest.endsAt);

    // Push to Google Calendar FIRST when requested — if it fails, the
    // agent gets a clear error instead of a silently-ungated meeting.
    let googleEventId: string | null = null;
    let meetLink: string | null = null;
    if (syncToCalendar) {
      const token = await getFreshAccessToken(u.id);
      if (!token) {
        return reply.code(428).send({
          error: { message: 'יש לחבר את Google Calendar תחילה', code: 'calendar_not_connected' },
        });
      }
      const created = await createCalendarEvent(token, {
        title: rest.title,
        notes: rest.notes,
        location: rest.location,
        startsAt,
        endsAt,
        attendeeEmail: attendeeEmail || lead.email || null,
        addMeetLink,
      });
      if (!created) {
        return reply.code(502).send({ error: { message: 'יצירת אירוע ב-Google נכשלה' } });
      }
      googleEventId = created.id;
      meetLink = created.meetLink || null;
    }

    const meeting = await prisma.leadMeeting.create({
      data: {
        leadId,
        agentId: u.id,
        title: rest.title,
        notes: rest.notes || null,
        location: rest.location || null,
        startsAt,
        endsAt,
        googleEventId,
        meetLink,
      },
    });
    return { meeting };
  });

  app.patch('/meetings/:id', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const existing = await prisma.leadMeeting.findUnique({ where: { id } });
    if (!existing || existing.agentId !== u.id) return reply.code(404).send({ error: { message: 'Not found' } });
    const parsed = MeetingInput.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { message: 'Invalid input' } });
    const patch: any = { ...parsed.data };
    if (patch.startsAt) patch.startsAt = new Date(patch.startsAt);
    if (patch.endsAt)   patch.endsAt   = new Date(patch.endsAt);
    delete patch.syncToCalendar;
    delete patch.addMeetLink;
    delete patch.attendeeEmail;
    const updated = await prisma.leadMeeting.update({ where: { id }, data: patch });
    // Mirror to Calendar if linked.
    if (existing.googleEventId) {
      const token = await getFreshAccessToken(u.id);
      if (token) {
        await updateCalendarEvent(token, existing.googleEventId, {
          title: updated.title,
          notes: updated.notes,
          location: updated.location,
          startsAt: updated.startsAt,
          endsAt: updated.endsAt,
        });
      }
    }
    return { meeting: updated };
  });

  app.delete('/meetings/:id', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = getUser(req);
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    const existing = await prisma.leadMeeting.findUnique({ where: { id } });
    if (!existing || existing.agentId !== u.id) return reply.code(404).send({ error: { message: 'Not found' } });
    if (existing.googleEventId) {
      const token = await getFreshAccessToken(u.id);
      if (token) await deleteCalendarEvent(token, existing.googleEventId);
    }
    await prisma.leadMeeting.delete({ where: { id } });
    return { ok: true };
  });
};
