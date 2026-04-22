import type { FastifyPluginAsync } from 'fastify';
import argon2 from 'argon2';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { slugify, ensureUniqueSlug } from '../lib/slug.js';
import { track as phTrack, identify as phIdentify } from '../lib/analytics.js';
import { requireUser } from '../middleware/auth.js';

async function buildAgentSlug(displayName: string): Promise<string> {
  const base = slugify(displayName) || 'agent';
  return ensureUniqueSlug(base, async (cand) => {
    const x = await prisma.user.findUnique({ where: { slug: cand } });
    return !!x;
  });
}

// Sprint 1 / MLS parity — Task A1 fill-in. Auto-accept any pending
// OfficeInvite rows for this user's email on signup/login. Only runs
// for AGENT/OWNER roles — a CUSTOMER-role user keeps their invite
// pending in case they later upgrade. Never throws outward; any DB
// hiccup here must not break the auth flow.
async function claimOfficeInvites(userId: string, email: string, role: string): Promise<void> {
  if (role !== 'AGENT' && role !== 'OWNER') return;
  try {
    const invite = await prisma.officeInvite.findFirst({
      where: { email: email.toLowerCase(), revokedAt: null, acceptedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!invite) return;
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { officeId: invite.officeId } }),
      prisma.officeInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date(), acceptedById: userId },
      }),
    ]);
  } catch {
    // Silently ignore — auth path has already succeeded by the time
    // this runs. A failed auto-attach just leaves the invite pending
    // for the next login.
  }
}

const COOKIE_NAME = 'estia_token';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 30,
};

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  role: z.enum(['AGENT', 'CUSTOMER']),
  displayName: z.string().min(1).max(120),
  phone: z.string().min(5).max(40).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const googleMockSchema = z.object({
  role: z.enum(['AGENT', 'CUSTOMER']),
  email: z.string().email().optional(),
  displayName: z.string().optional(),
});

// F-11.4 — auth routes get much tighter rate limits than the global
// 300/min. Slow the brute-force window on login and cap spam-signup
// per IP. `@fastify/rate-limit` supports per-route config via
// { config: { rateLimit: … } } on each app.post().
//
// Test E2E suites hammer these endpoints. Setting
// AUTH_RATE_LIMIT_DISABLED=1 in a disposable test environment disables
// the per-route caps while the global 300/min limiter still runs.
const AUTH_RL_DISABLED = process.env.AUTH_RATE_LIMIT_DISABLED === '1';
const LOGIN_LIMIT  = AUTH_RL_DISABLED ? false : { max: 10, timeWindow: '15 minutes' };
const SIGNUP_LIMIT = AUTH_RL_DISABLED ? false : { max: 3,  timeWindow: '1 hour' };

export const registerAuthRoutes: FastifyPluginAsync = async (app) => {
  app.post('/signup', { config: { rateLimit: SIGNUP_LIMIT } }, async (req, reply) => {
    const body = signupSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return reply.code(409).send({ error: { message: 'Email already registered' } });
    }
    const passwordHash = await argon2.hash(body.password);
    const slug = body.role === 'AGENT'
      ? await buildAgentSlug(body.displayName)
      : null;
    const user = await prisma.user.create({
      data: {
        email: body.email,
        passwordHash,
        role: body.role,
        displayName: body.displayName,
        slug,
        phone: body.phone,
        provider: 'EMAIL',
        agentProfile: body.role === 'AGENT' ? { create: {} } : undefined,
        customerProfile: body.role === 'CUSTOMER' ? { create: {} } : undefined,
      },
    });
    const token = app.jwt.sign(
      { sub: user.id, role: user.role, email: user.email },
      { expiresIn: '30d' }
    );
    reply.setCookie(COOKIE_NAME, token, COOKIE_OPTS);
    phIdentify(user.id, { email: user.email, role: user.role, display_name: user.displayName });
    phTrack('signup_completed', user.id, { role: user.role, provider: 'EMAIL' });
    // A1 fill-in — claim any pending OfficeInvite for this email.
    await claimOfficeInvites(user.id, user.email, user.role);
    return {
      user: publicUser(user),
      token,
    };
  });

  app.post('/login', { config: { rateLimit: LOGIN_LIMIT } }, async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !user.passwordHash) {
      return reply.code(401).send({ error: { message: 'Invalid credentials' } });
    }
    // A-1 — soft-deleted accounts must not be able to log in. Return the
    // same "Invalid credentials" message we'd give for a wrong password;
    // don't surface the deletion state — the agent was told the delete
    // was irreversible, and the UI maintains that fiction.
    if (user.deletedAt) {
      return reply.code(401).send({ error: { message: 'Invalid credentials' } });
    }
    const ok = await argon2.verify(user.passwordHash, body.password);
    if (!ok) {
      return reply.code(401).send({ error: { message: 'Invalid credentials' } });
    }
    const token = app.jwt.sign(
      { sub: user.id, role: user.role, email: user.email },
      { expiresIn: '30d' }
    );
    reply.setCookie(COOKIE_NAME, token, COOKIE_OPTS);
    phIdentify(user.id, { email: user.email, role: user.role, display_name: user.displayName });
    phTrack('login_completed', user.id, { role: user.role, provider: 'EMAIL' });
    // A1 fill-in — claim any pending OfficeInvite for this email.
    await claimOfficeInvites(user.id, user.email, user.role);
    return { user: publicUser(user), token };
  });

  // Mock Google OAuth — the frontend already has a "Login with Google" button
  // that posts the user role. In production this would verify a real ID token.
  app.post('/google/mock', async (req, reply) => {
    const body = googleMockSchema.parse(req.body ?? {});
    const email = body.email || (body.role === 'AGENT' ? 'agent.demo@estia.app' : 'customer.demo@estia.app');
    const displayName = body.displayName || (body.role === 'AGENT' ? 'יוסי כהן' : 'רינה שמעון');

    let user = await prisma.user.findUnique({ where: { email } });
    // A-1 — same soft-delete gate as the email path. A deleted account
    // can't come back via the Google shortcut either.
    if (user?.deletedAt) {
      return reply.code(401).send({ error: { message: 'Invalid credentials' } });
    }
    if (!user) {
      const slug = body.role === 'AGENT' ? await buildAgentSlug(displayName) : null;
      user = await prisma.user.create({
        data: {
          email,
          role: body.role,
          displayName,
          slug,
          provider: 'GOOGLE',
          googleId: `mock-${body.role.toLowerCase()}`,
          agentProfile: body.role === 'AGENT' ? { create: {} } : undefined,
          customerProfile: body.role === 'CUSTOMER' ? { create: {} } : undefined,
        },
      });
    }
    const token = app.jwt.sign(
      { sub: user.id, role: user.role, email: user.email },
      { expiresIn: '30d' }
    );
    reply.setCookie(COOKIE_NAME, token, COOKIE_OPTS);
    // A1 fill-in — claim any pending OfficeInvite for this email.
    await claimOfficeInvites(user.id, user.email, user.role);
    return { user: publicUser(user), token };
  });

  app.post('/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return { ok: true };
  });

  // A-1 — soft-delete the authenticated user's account and clear the
  // cookie. UI already confirmed with a type-the-phrase dialog, so the
  // contract here is "trust the authenticated caller, set deletedAt,
  // drop the session". The row is preserved — co-owner agents keep
  // seeing shared properties, a 30-day purge job (scheduled separately)
  // hard-deletes the row later. The client must never learn this is
  // recoverable; the UI presents it as permanent.
  app.post('/delete-account', { onRequest: [app.requireAuth] }, async (req, reply) => {
    const uid = requireUser(req).id;
    // Idempotent: if already deleted, still clear the cookie and succeed.
    await prisma.user.updateMany({
      where: { id: uid, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    phTrack('account_deleted', uid, {});
    return { ok: true };
  });
};

function publicUser(u: {
  id: string;
  email: string;
  role: string;
  displayName: string;
  slug?: string | null;
  phone: string | null;
  avatarUrl: string | null;
}) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    displayName: u.displayName,
    slug: u.slug ?? null,
    phone: u.phone,
    avatarUrl: u.avatarUrl,
  };
}
