// Real Google OAuth 2.0 (Authorization Code flow).
//
//   GET /api/auth/google           → redirect to Google consent screen
//   GET /api/auth/google/callback  → exchange code → fetch userinfo → issue JWT
//
// Required env:
//   GOOGLE_CLIENT_ID
//   GOOGLE_CLIENT_SECRET
//   PUBLIC_ORIGIN               (e.g. https://estia.co.il)
//
// The authorised redirect URI in the Google Cloud Console must be:
//   https://estia.co.il/api/auth/google/callback
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
import { redactTokenExchangeError } from '../lib/oauthLog.js';

const COOKIE_NAME = 'estia_token';
const STATE_COOKIE = 'estia_oauth_state';

const AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

// Custom URL scheme the iOS app registers in Info.plist — used to bounce
// the OAuth result back into the app from SFSafariViewController.
const NATIVE_SCHEME = 'com.estia.agent';

// One-time code for the native exchange step. The flow is:
//   1. open Safari → 2. user signs in → 3. Safari redirects to
//   com.estia.agent://auth?code=X → 4. app POSTs /native-exchange
//
// 2026-05-02 — moved from an in-memory Map to a JWT signed with the
// shared JWT_SECRET. Reason: 2026-05-01 prod scaled to 2 backend
// replicas behind DNS round-robin (commit b5246aa). With per-process
// state the issuing replica and the exchanging replica were almost
// always different — the exchange step returned "invalid or expired
// code" and Google login silently broke for native users. JWTs are
// stateless across replicas because every replica has the same
// JWT_SECRET, so the verify-side works regardless of which one
// handled the OAuth callback.
//
// The token is short-lived (60s, far shorter than any session) and
// scoped via a `kind: 'native_exchange'` claim so it can't be reused
// as a session cookie even if it leaked. Single-use enforcement is
// deliberately omitted: it would re-introduce per-process state
// (the same problem we're fixing). The 60-second window + single
// successful exchange producing a real session cookie is the
// blast-radius bound.
function issueNativeCode(app: { jwt: { sign: (p: object, o: object) => string } }, userId: string): string {
  return app.jwt.sign(
    { sub: userId, kind: 'native_exchange', jti: crypto.randomBytes(8).toString('base64url') },
    { expiresIn: '60s' },
  );
}
function consumeNativeCode(app: { jwt: { verify: (t: string) => { sub: string; kind?: string } } }, code: string): string | null {
  try {
    const decoded = app.jwt.verify(code);
    if (!decoded || decoded.kind !== 'native_exchange' || !decoded.sub) return null;
    return decoded.sub;
  } catch {
    return null;
  }
}

function isConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// SEC-015 — guard against open redirect via ?redirect=.
// Browsers process `//evil.com` as a protocol-relative URL pointing at
// https://evil.com, and Edge/older-IE normalize backslash-prefixed
// values like `/\evil.com` to the same. Both must be rejected; only
// genuine same-origin paths starting with a single `/` survive.
// Exported so the unit test can pin the behavior in isolation.
export function safeRedirectPath(s: string | undefined): string {
  if (!s) return '/';
  if (!s.startsWith('/')) return '/';
  if (s.startsWith('//')) return '/';
  if (s.startsWith('/\\')) return '/';
  return s;
}

function redirectUri(): string {
  const origin = process.env.PUBLIC_ORIGIN || 'https://estia.co.il';
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
    const q = (req.query || {}) as Record<string, unknown>;
    const rt = q.redirect;
    const native = q.native === '1' || q.native === 'true';
    const payload = JSON.stringify({
      s: state,
      r: typeof rt === 'string' ? rt : '/',
      n: native ? 1 : 0,
    });
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

    let decoded: { s: string; r: string; n?: number };
    try {
      decoded = JSON.parse(Buffer.from(encodedState, 'base64url').toString('utf8'));
    } catch {
      return reply.redirect('/?auth=google_bad_state');
    }
    if (decoded.s !== savedState) {
      return reply.redirect('/?auth=google_state_mismatch');
    }
    const isNative = decoded.n === 1;

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
        // SEC-005 — never log the raw `tokens` body. On some failure
        // modes Google returns access/refresh/id_token alongside the
        // error envelope; logging it raw puts those tokens on disk.
        req.log.warn(redactTokenExchangeError(tokens, resp.status), 'google token exchange failed');
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

    phIdentify(user.id, { email: user.email, role: user.role, display_name: user.displayName });
    phTrack('login_completed', user.id, { role: user.role, provider: 'GOOGLE' });

    if (isNative) {
      // Native (iPhone app) flow: don't set a cookie here — we're
      // running in SFSafariViewController, whose cookie jar is isolated
      // from the app's WKWebView. Mint a single-use exchange code and
      // 302 to the app's custom URL scheme; the app's appUrlOpen
      // listener catches it and POSTs /native-exchange to mint the
      // real session. This is the path that worked before 2026-05-01
      // and continues to work — the prior breakage was the issuing
      // replica differing from the exchanging replica (in-memory Map
      // not shared), now fixed by switching the code to a JWT.
      const oneTime = issueNativeCode(app, user.id);
      return reply.redirect(`${NATIVE_SCHEME}://auth?code=${encodeURIComponent(oneTime)}`);
    }

    // Web flow (same origin as the WebView): set the JWT cookie directly.
    const token = app.jwt.sign(
      { sub: user.id, role: user.role, email: user.email },
      { expiresIn: '30d' }
    );
    // SEC-017 — host-only cookie. No `domain` attribute → the browser
    // scopes the cookie to estia.co.il only, never to subdomains we
    // might not control. See routes/auth.ts COOKIE_OPTS for the longer
    // note; do NOT add `domain:` here without auditing every subdomain.
    reply.setCookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
    });
    // Bounce back to the place the user came from (default: dashboard).
    // safeRedirectPath rejects protocol-relative + backslash variants
    // so a malicious ?redirect=//evil.com can't bounce off-site.
    const target = safeRedirectPath(decoded.r);
    return reply.redirect(target);
  });

  // ── Step 3 (native only): app trades the one-time code for a session.
  //
  //   Called by the Capacitor app from its own WKWebView after catching
  //   the com.estia.agent:// deep link. The response Set-Cookie lands in
  //   the WebView's cookie jar, so the user is logged in right after.
  app.post('/google/native-exchange', async (req, reply) => {
    const { code } = (req.body || {}) as { code?: string };
    if (!code) return reply.code(400).send({ error: { message: 'missing code' } });
    const userId = consumeNativeCode(app, code);
    if (!userId) return reply.code(400).send({ error: { message: 'invalid or expired code' } });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(400).send({ error: { message: 'user not found' } });
    const token = app.jwt.sign(
      { sub: user.id, role: user.role, email: user.email },
      { expiresIn: '30d' }
    );
    // SEC-017 — host-only cookie (no `domain` attr). See COOKIE_OPTS in
    // routes/auth.ts for the detailed reasoning.
    reply.setCookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 30,
    });
    return reply.send({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
      },
    });
  });

};
