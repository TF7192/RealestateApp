import type { FastifyPluginAsync } from 'fastify';
import argon2 from 'argon2';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { slugify, ensureUniqueSlug } from '../lib/slug.js';
import { track as phTrack, identify as phIdentify } from '../lib/analytics.js';

async function buildAgentSlug(displayName: string): Promise<string> {
  const base = slugify(displayName) || 'agent';
  return ensureUniqueSlug(base, async (cand) => {
    const x = await prisma.user.findUnique({ where: { slug: cand } });
    return !!x;
  });
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
    return { user: publicUser(user), token };
  });

  // Mock Google OAuth — the frontend already has a "Login with Google" button
  // that posts the user role. In production this would verify a real ID token.
  app.post('/google/mock', async (req, reply) => {
    const body = googleMockSchema.parse(req.body ?? {});
    const email = body.email || (body.role === 'AGENT' ? 'agent.demo@estia.app' : 'customer.demo@estia.app');
    const displayName = body.displayName || (body.role === 'AGENT' ? 'יוסי כהן' : 'רינה שמעון');

    let user = await prisma.user.findUnique({ where: { email } });
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
    return { user: publicUser(user), token };
  });

  app.post('/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
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
