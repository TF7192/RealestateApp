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
function issueNativeCode(userId: string): string {
  // Purge expired entries opportunistically (cheap, bounded map size).
  const now = Date.now();
  for (const [k, v] of pendingCodes) if (v.expires < now) pendingCodes.delete(k);
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

    phIdentify(user.id, { email: user.email, role: user.role, display_name: user.displayName });
    phTrack('login_completed', user.id, { role: user.role, provider: 'GOOGLE' });

    if (isNative) {
      // Native (iPhone app) flow: don't set a cookie here — we're running
      // in SFSafariViewController, whose cookie jar is isolated from the
      // app's WKWebView. Instead, mint a single-use exchange code and
      // hand it off via the app's custom URL scheme; the app will then
      // POST to /native-exchange from its own WebView, where the Set-Cookie
      // response _will_ stick.
      //
      // Why an HTML bounce instead of `reply.redirect('com.estia.agent://...')`:
      //   SFSafariViewController (and many mobile Safari builds) does NOT
      //   follow a server 302 whose Location: header is a non-http(s)
      //   custom scheme. The user gets a blank page and the app never
      //   opens. The reliable pattern is to serve 200 HTML that kicks
      //   the scheme client-side — meta-refresh + setTimeout redirect
      //   + an explicit fallback link if auto-open is blocked.
      const oneTime = issueNativeCode(user.id);
      const target = `${NATIVE_SCHEME}://auth?code=${encodeURIComponent(oneTime)}`;
      const esc = (s: string) => s.replace(/[&<>"']/g, (c) => (
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
      ));
      const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<title>מעביר לאפליקציה…</title>
<style>body{margin:0;font:16px -apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:#f7f3ec;color:#1e1a14;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}a{color:#7a5c2c;font-weight:700}.c{max-width:360px}</style>
</head><body><div class="c">
<h2 style="margin:0 0 8px">מעביר אותך לאפליקציה…</h2>
<p style="margin:0 0 16px;color:#54503e">אם לא עבר תוך שנייה, לחץ/י על הכפתור:</p>
<p><a href="${esc(target)}" style="display:inline-block;padding:12px 20px;background:#1e1a14;color:#f7f3ec;border-radius:10px;text-decoration:none">פתח את Estia</a></p>
</div>
<script>setTimeout(function(){location.href=${JSON.stringify(target)};},50);</script>
</body></html>`;
      reply.type('text/html; charset=utf-8');
      return reply.send(html);
    }

    // Web flow (same origin as the WebView): set the JWT cookie directly.
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
    // Bounce back to the place the user came from (default: dashboard)
    const target = decoded.r && decoded.r.startsWith('/') ? decoded.r : '/';
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
