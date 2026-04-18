// Real Google OAuth 2.0 (Authorization Code flow).
//
//   GET /api/auth/google           → redirect to Google consent screen
//   GET /api/auth/google/callback  → exchange code → fetch userinfo → issue JWT
//
// Required env:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   PUBLIC_ORIGIN               (e.g. https://estia.tripzio.xyz)
//
// The authorised redirect URI in the Google Cloud Console must be:
//   https://estia.tripzio.xyz/api/auth/google/callback
//
// The legacy POST /api/auth/google/mock stays in auth.ts as a dev fallback
// (see README for how to disable it in production).
//
// State is stored in a short-lived httpOnly cookie to defend against CSRF.

import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { slugify, ensureUniqueSlug } from '../lib/slug.js';
import { track as phTrack, identify as phIdentify } from '../lib/analytics.js';

const COOKIE_NAME = 'estia_token';
const STATE_COOKIE = 'estia_oauth_state';

const AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

function isConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function redirectUri(): string {
  const origin = process.env.PUBLIC_ORIGIN || 'https://estia.tripzio.xyz';
  return `${origin}/api/auth/google/callback`;
}

async function buildAgentSlug(displayName: string): Promise<string> {
  const base = slugify(displayName) || 'agent';
  return ensureUniqueSlug(base, async (cand) => {
    const x = await prisma.user.findUnique({ where: { slug: cand } });
    return !!x;
  });
}

export const registerGoogleOAuthRoutes: FastifyPluginAsync = async (app) => {
  // ── Step 1: kick off the OAuth dance ─────────────────────────────
  app.get('/google', async (req, reply) => {
    if (!isConfigured()) {
      return reply
        .code(500)
        .send({ error: { message: 'Google OAuth not configured on the server' } });
    }
    const state = crypto.randomBytes(24).toString('base64url');
    // Optional: allow a ?redirect=/some/path to bounce user back to a page
    const rt = typeof req.query === 'object' && req.query && (req.query as any).redirect;
    const payload = JSON.stringify({ s: state, r: typeof rt === 'string' ? rt : '/' });
    const encoded = Buffer.from(payload).toString('base64url');

    reply.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 600,
    });

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      include_granted_scopes: 'true',
      prompt: 'select_account',
      state: encoded,
    });
    return reply.redirect(`${AUTH_URL}?${params.toString()}`);
  });

  // ── Step 2: Google redirects here with ?code= and ?state= ────────
  app.get('/google/callback', async (req, reply) => {
    const { code, state: encodedState } = req.query as {
      code?: string; state?: string; error?: string;
    };
    const savedState = (req.cookies as any)?.[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, { path: '/api/auth' });

    if (!code || !encodedState || !savedState) {
      return reply.redirect('/?auth=google_missing_state');
    }

    let decoded: { s: string; r: string };
    try {
      decoded = JSON.parse(Buffer.from(encodedState, 'base64url').toString('utf8'));
    } catch {
      return reply.redirect('/?auth=google_bad_state');
    }
    if (decoded.s !== savedState) {
      return reply.redirect('/?auth=google_state_mismatch');
    }

    // Exchange authorization code for an access token + id_token
    let tokens: any;
    try {
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
      tokens = await resp.json();
      if (!resp.ok || !tokens.access_token) {
        req.log.warn({ tokens, status: resp.status }, 'google token exchange failed');
        return reply.redirect('/?auth=google_token_failed');
      }
    } catch (e) {
      req.log.error({ err: e }, 'google token exchange threw');
      return reply.redirect('/?auth=google_token_error');
    }

    // Fetch the signed-in user's profile
    let userinfo: any;
    try {
      const resp = await fetch(USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      userinfo = await resp.json();
      if (!resp.ok || !userinfo.sub || !userinfo.email) {
        req.log.warn({ userinfo }, 'google userinfo failed');
        return reply.redirect('/?auth=google_userinfo_failed');
      }
    } catch (e) {
      req.log.error({ err: e }, 'google userinfo threw');
      return reply.redirect('/?auth=google_userinfo_error');
    }

    const googleId: string = userinfo.sub;
    const email: string = userinfo.email;
    const name: string = userinfo.name || userinfo.given_name || email.split('@')[0];
    const picture: string | undefined = userinfo.picture;

    // Find-or-create. We match on googleId first, then fall back to email —
    // that way an existing email-only account gets linked to Google on first
    // OAuth sign-in without creating a duplicate.
    let user =
      (await prisma.user.findUnique({ where: { googleId } })) ||
      (await prisma.user.findUnique({ where: { email } }));

    if (!user) {
      const slug = await buildAgentSlug(name);
      user = await prisma.user.create({
        data: {
          email,
          role: 'AGENT',
          displayName: name,
          slug,
          provider: 'GOOGLE',
          googleId,
          avatarUrl: picture || null,
          agentProfile: { create: {} },
        },
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId,
          provider: 'GOOGLE',
          avatarUrl: user.avatarUrl || picture || null,
        },
      });
    }

    // Issue the same JWT cookie the /login route uses
    const token = app.jwt.sign(
      { sub: user.id, role: user.role, email: user.email },
      { expiresIn: '30d' }
    );
    reply.setCookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
    });
    phIdentify(user.id, { email: user.email, role: user.role, display_name: user.displayName });
    phTrack('login_completed', user.id, { role: user.role, provider: 'GOOGLE' });

    // Bounce back to the place the user came from (default: dashboard)
    const target = decoded.r && decoded.r.startsWith('/') ? decoded.r : '/';
    return reply.redirect(target);
  });
};
