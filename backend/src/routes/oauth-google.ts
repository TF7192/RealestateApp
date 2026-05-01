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

// In-memory one-time code store for the native exchange step. We keep
// tokens short-lived (2 minutes) and single-use to minimize blast radius.
// An in-process Map is acceptable because the native flow is:
//    1. open Safari → 2. user signs in → 3. Safari redirects to
//    com.estia.agent://auth?code=X → 4. app POSTs /native-exchange
// all within seconds on the same backend process. If we ever scale
// horizontally, move this to Redis or a short-lived DB row.
type PendingExchange = { userId: string; expires: number };
const pendingCodes = new Map<string, PendingExchange>();
// Native polling map — keyed by the client-supplied `nativeState`. Once
// OAuth completes, we drop the one-time `code` here so the app can
// fetch it via /native-poll. Same TTL + cap policy as pendingCodes.
type PendingPollEntry = { code: string; expires: number };
const pendingPolls = new Map<string, PendingPollEntry>();
// SEC-021 — hard cap so a misbehaving / hostile caller burning native
// flow attempts can't unboundedly grow this Map. Map iteration order is
// insertion order, so evicting the first key drops the oldest entry.
const MAX_PENDING = 10_000;
function issueNativeCode(userId: string): string {
  // Purge expired entries opportunistically (cheap, bounded map size).
  const now = Date.now();
  for (const [k, v] of pendingCodes) if (v.expires < now) pendingCodes.delete(k);
  // After expiry-sweep, if we're still at the cap, evict the oldest entry.
  // The 2-minute TTL means we shouldn't normally reach here in practice;
  // the cap is a backstop against pathological burst traffic.
  if (pendingCodes.size >= MAX_PENDING) {
    const oldest = pendingCodes.keys().next().value;
    if (oldest) pendingCodes.delete(oldest);
  }
  const code = crypto.randomBytes(24).toString('base64url');
  pendingCodes.set(code, { userId, expires: now + 120_000 });
  return code;
}
function consumeNativeCode(code: string): string | null {
  const entry = pendingCodes.get(code);
  if (!entry) return null;
  pendingCodes.delete(code);
  if (entry.expires < Date.now()) return null;
  return entry.userId;
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
    // `nativeState` is a client-supplied opaque token (UUID) the
    // Capacitor app uses to poll for completion. Validated for shape so
    // it can't be used as a giant key in pendingPolls.
    const rawNs = typeof q.nativeState === 'string' ? q.nativeState : '';
    const nativeState = /^[A-Za-z0-9_-]{8,128}$/.test(rawNs) ? rawNs : '';
    const payload = JSON.stringify({
      s: state,
      r: typeof rt === 'string' ? rt : '/',
      n: native ? 1 : 0,
      // Carry the polling state through Google's redirect via the
      // signed state cookie + encoded state param, just like `r` and `n`.
      ps: nativeState || undefined,
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

    let decoded: { s: string; r: string; n?: number; ps?: string };
    try {
      decoded = JSON.parse(Buffer.from(encodedState, 'base64url').toString('utf8'));
    } catch {
      return reply.redirect('/?auth=google_bad_state');
    }
    if (decoded.s !== savedState) {
      return reply.redirect('/?auth=google_state_mismatch');
    }
    const isNative = decoded.n === 1;
    const pollState = typeof decoded.ps === 'string' ? decoded.ps : '';

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
      // from the app's WKWebView. Polling design:
      //   1. App opens Browser.open with `?nativeState=<uuid>`.
      //   2. After OAuth completes here, we drop the one-time code
      //      into pendingPolls keyed by that UUID and render a
      //      "התחברת" page that just sits there.
      //   3. The app polls /api/auth/google/native-poll?state=<uuid>.
      //   4. On hit, the app calls Browser.close() (auto-dismissing
      //      SFSafariViewController) and POSTs to /native-exchange.
      //
      // Older iOS versions could rely on a server 302 to
      // `com.estia.agent://auth?code=…`. iOS 26 silently drops both
      // server-issued non-https redirects from SFSafariViewController
      // *and* user-tapped <a> links to custom schemes. Polling is the
      // only mechanism that doesn't depend on Apple-honored redirects.
      const oneTime = issueNativeCode(user.id);
      if (pollState) {
        // Same TTL/cap policy as pendingCodes (see issueNativeCode).
        const now = Date.now();
        for (const [k, v] of pendingPolls) if (v.expires < now) pendingPolls.delete(k);
        if (pendingPolls.size >= MAX_PENDING) {
          const oldest = pendingPolls.keys().next().value;
          if (oldest) pendingPolls.delete(oldest);
        }
        pendingPolls.set(pollState, { code: oneTime, expires: now + 120_000 });
      }
      reply.header('Content-Type', 'text/html; charset=utf-8');
      return reply.send(`<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Estia</title>
<style>
  html, body { margin: 0; height: 100%; }
  body {
    background: #f7f3ec; color: #1e1a14;
    font-family: -apple-system, BlinkMacSystemFont, 'Assistant', sans-serif;
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 24px; gap: 14px; text-align: center;
  }
  h1 { font-size: 22px; font-weight: 800; margin: 0; }
  p { font-size: 14px; color: #6b6356; margin: 0; }
  .spinner {
    width: 36px; height: 36px; margin-top: 12px;
    border-radius: 50%;
    border: 3px solid rgba(180, 139, 76, 0.2);
    border-top-color: #b48b4c;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
  <div class="spinner" aria-hidden="true"></div>
  <h1>התחברת בהצלחה</h1>
  <p>חוזר אל Estia…</p>
</body>
</html>`);
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
    const userId = consumeNativeCode(code);
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

  // ── Step 2.5 (native only): polling endpoint for the Capacitor app.
  //
  // The app polls this every ~750ms after opening Browser.open. Once
  // the SFSafariViewController-side OAuth callback fires, the
  // pendingPolls Map gets a `code` keyed by the app's `state`; the
  // next poll consumes that code, the app closes the in-app browser,
  // and POSTs to /native-exchange to finalize.
  //
  // Read-only — returns either { code } or { pending: true }. Single
  // consumption: the entry is deleted on first successful return so a
  // stale poll can't grab the same code twice.
  app.get<{ Querystring: { state?: string } }>('/google/native-poll', async (req, reply) => {
    const state = (req.query?.state || '').toString();
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(state)) {
      return reply.code(400).send({ error: { message: 'invalid state' } });
    }
    const entry = pendingPolls.get(state);
    if (!entry) return reply.send({ pending: true });
    pendingPolls.delete(state);
    if (entry.expires < Date.now()) {
      return reply.code(400).send({ error: { message: 'expired' } });
    }
    return reply.send({ code: entry.code });
  });
};
