// Service-to-service authentication for the AI orchestrator (ai/agent).
//
// The orchestrator posts extracted lead / property JSON back to the
// Estia backend to have it persisted on behalf of the calling agent.
// It cannot sign a user JWT — it never saw the user's credentials —
// so we give it a shared secret (`ESTIA_SERVICE_TOKEN`) and require it
// to forward the requesting agent's user id in `X-Agent-Actor-Id`.
//
// When BOTH headers are present and the token matches, we load the
// user and call `setUser(req, …)` exactly as the JWT path would, so
// downstream handlers (prisma scoping by `agentId`) work unchanged.
//
// Routes that want to accept either a normal agent JWT OR a service
// token compose this as a pre-handler AFTER the auth-plugin's onRequest
// has already tried the JWT path. If the JWT succeeded, we're a no-op;
// if not, we try the service-token path; if both fail, request proceeds
// unauthenticated and the existing `requireAgent` returns 401/403 as
// always.

import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { getUser, setUser } from './auth.js';

export async function tryServiceTokenAuth(
  req: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // Already authenticated via JWT — nothing to do.
  if (getUser(req)) return;

  const expected = process.env.ESTIA_SERVICE_TOKEN;
  if (!expected) return; // feature disabled — no token configured

  const auth = req.headers.authorization;
  const actorId = req.headers['x-agent-actor-id'];
  if (!auth || !auth.startsWith('Bearer ')) return;
  if (typeof actorId !== 'string' || !actorId) return;

  const token = auth.slice(7);
  // Constant-time comparison — Node's `Buffer` equality is linear
  // in length but doesn't timing-leak across strings of equal length
  // once we check length first. For short tokens this is close enough
  // and avoids pulling in a new dep.
  if (token.length !== expected.length) return;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return;

  // Token matches. Load the actor so `requireAgent` can verify the role.
  const user = await prisma.user.findUnique({ where: { id: actorId } });
  if (!user) return; // unknown actor id — leave request unauthenticated

  setUser(req, { id: user.id, role: user.role, email: user.email });
}
