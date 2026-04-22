// Sign in with Apple — native-only flow.
//
// App Store Guideline 4.8 requires a login option that:
//   - limits data collection to name + email,
//   - lets users keep their email private,
//   - doesn't collect interactions for advertising without consent.
// Sign in with Apple is the explicitly-listed option that meets all
// three. We only expose it to the native iOS app; the web flow keeps
// Google + email/password.
//
// Architecture — mirrors oauth-google's native-exchange step:
//   1. The iOS app calls AuthenticationServices via the
//      @capacitor-community/apple-sign-in plugin and gets an
//      { identityToken, authorizationCode, user, givenName?, familyName?, email? }
//      payload back. The JWT identity token is what we verify.
//   2. App POSTs the payload to `/api/auth/apple/native-exchange`.
//   3. Backend pulls Apple's JWKS, verifies the JWT signature +
//      issuer + audience, extracts the stable `sub` (Apple user ID)
//      and email claim, upserts a User row keyed by appleId, and
//      sets the estia_token cookie.
//   4. Subsequent /api/* calls are authenticated normally.
//
// First-login name handling:
//   Apple only sends givenName/familyName on the VERY FIRST sign-in
//   for a given Apple ID. We persist it to displayName once; later
//   sign-ins only carry the JWT, so we rely on the saved row.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { prisma } from '../lib/prisma.js';
import { track as phTrack, identify as phIdentify } from '../lib/analytics.js';

const COOKIE_NAME = 'estia_token';

// Apple's OIDC issuer + JWKS endpoint. Cached in-process (createRemoteJWKSet
// has its own LRU + refresh logic per the library docs).
const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

// Audience is our iOS app's bundle ID. Apple signs the identity token
// with aud = this value. Set via env so non-prod builds can point at
// their own bundle without recompiling.
const APPLE_AUDIENCE = process.env.APPLE_BUNDLE_ID || 'com.estia.agent';

const nativeExchangeSchema = z.object({
  identityToken: z.string().min(1),
  // Apple's stable user id ("sub" in the JWT). Present on every sign-in.
  user: z.string().min(1).optional(),
  // First-login only; null/undefined on subsequent sign-ins.
  email: z.string().email().optional().nullable(),
  givenName: z.string().optional().nullable(),
  familyName: z.string().optional().nullable(),
});

export const registerAppleOAuthRoutes: FastifyPluginAsync = async (app) => {
  // Native exchange — called by the iPhone app after AuthenticationServices
  // returns. Verifies the JWT, upserts the user, sets the session cookie.
  app.post('/apple/native-exchange', async (req, reply) => {
    const parsed = nativeExchangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { message: 'invalid payload' } });
    }
    const { identityToken, email, givenName, familyName } = parsed.data;

    // Verify Apple's JWT. jose checks signature (via the JWKS), iss, aud,
    // and expiry by default. Anything fails → throw → we map to 401.
    let claims: {
      sub: string; email?: string; email_verified?: string | boolean;
      is_private_email?: string | boolean;
    };
    try {
      const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
        issuer: APPLE_ISSUER,
        audience: APPLE_AUDIENCE,
      });
      claims = payload as typeof claims;
    } catch (e) {
      req.log.warn({ err: e }, 'apple: identity token verification failed');
      return reply.code(401).send({ error: { message: 'Apple sign-in verification failed' } });
    }

    const appleId = claims.sub;
    if (!appleId) {
      return reply.code(400).send({ error: { message: 'apple token missing sub' } });
    }

    // Prefer the email from the JWT claims (verified by Apple); fall
    // back to the one the client forwarded (only provided on first login).
    const userEmail = (claims.email as string | undefined) || email || null;

    // Upsert by appleId first; if we already have this Apple account
    // linked, reuse it. Otherwise, if we have a matching email on an
    // existing account, attach the Apple identity to it. Otherwise
    // create a brand-new User.
    let user = await prisma.user.findUnique({ where: { appleId } });
    if (!user && userEmail) {
      const byEmail = await prisma.user.findUnique({ where: { email: userEmail } });
      if (byEmail) {
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: { appleId, provider: byEmail.provider === 'EMAIL' ? byEmail.provider : 'APPLE' },
        });
      }
    }
    if (!user) {
      if (!userEmail) {
        // Apple can return a hidden/private relay email — it's still
        // a valid email, just routed. But if we have nothing, we can't
        // create a unique user row since email is @unique.
        return reply.code(400).send({ error: { message: 'Apple did not return an email — please retry and allow email share' } });
      }
      const displayName =
        [givenName, familyName].filter(Boolean).join(' ').trim()
        || userEmail.split('@')[0];
      user = await prisma.user.create({
        data: {
          email: userEmail,
          provider: 'APPLE',
          appleId,
          role: 'AGENT',
          displayName,
          hasCompletedTutorial: false,
        },
      });
    }

    phIdentify(user.id, { email: user.email, role: user.role, display_name: user.displayName });
    phTrack('login_completed', user.id, { role: user.role, provider: 'APPLE' });

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

    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
      },
    };
  });
};
