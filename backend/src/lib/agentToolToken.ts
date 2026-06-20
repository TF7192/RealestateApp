// Short-lived, per-agent signed token for the hosted-LangGraph → Estia
// internal tool path (backend/src/routes/internalAgentTool.ts).
//
// WHY a dedicated token (not the session JWT):
//   The chat agent has been ported to a graph that runs on LangGraph
//   Platform (LangChain's cloud — see docs/langgraph-port-scoping.md).
//   That graph cannot reach our private RDS, so each tool call POSTs
//   back to the Estia backend. The graph must act *as one specific
//   agent*. The safe model (scoping doc §"Per-agent auth for the
//   graph") is: Estia mints a SHORT-LIVED token scoped to ONE agentId;
//   the graph forwards it; the endpoint derives agentId FROM THE TOKEN.
//   A static "god" service key is rejected — a leak = cross-agent data
//   exposure, defeating the per-agent `where: { agentId }` boundary.
//
// WHY `jose` + a SEPARATE secret (ESTIA_AGENT_TOKEN_SECRET), not the
// app's `app.jwt` / JWT_SECRET:
//   • Secret separation — a leak of the agent-tool secret must NOT let
//     an attacker forge full 30-day session cookies, and vice-versa.
//     `app.jwt` is bound to JWT_SECRET at registration time, so a
//     distinct secret needs a distinct signer. `jose` is already a
//     backend dependency (used in routes/oauth-apple.ts) — no new dep.
//   • The token's blast radius is tiny: 5-min TTL, one agentId, a
//     fixed purpose claim, and it only authorizes the read-only
//     internal tool endpoint.
//
// FAIL CLOSED: every function throws (or verify returns null) when
// ESTIA_AGENT_TOKEN_SECRET is unset, so the whole agent-tool path is
// inert — and safe to merge/deploy — until the secret is configured.

import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';

// Purpose binds the token to THIS path only. A token minted for the
// agent-tool path can never be replayed as a session cookie (different
// secret) and is rejected here if the purpose claim is wrong.
export const AGENT_TOOL_PURPOSE = 'agent-tool';

// 5-minute TTL. A graph run's tool calls all happen within seconds of
// the mint; 5 min is generous headroom for retries/latency while
// keeping a leaked token near-useless.
const TTL_SECONDS = 5 * 60;

const ALG = 'HS256';

export type AgentToolClaims = {
  sub: string; // agentId
  purpose: typeof AGENT_TOOL_PURPOSE;
};

// Returns the HMAC key, or null if the secret env var is unset.
// Null is the fail-closed signal — callers must treat it as "feature
// disabled" (mint throws; verify returns null → 503/401 at the route).
function getKey(): Uint8Array | null {
  const secret = process.env.ESTIA_AGENT_TOKEN_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

/** True only when the agent-tool path is configured (secret present). */
export function isAgentToolConfigured(): boolean {
  return getKey() !== null;
}

/**
 * Mint a fresh short-lived token scoped to ONE agent.
 *
 * @throws if ESTIA_AGENT_TOKEN_SECRET is unset (fail closed — the
 *         caller route must surface 503 "not configured").
 */
export async function signAgentToolToken(agentId: string): Promise<string> {
  if (!agentId) throw new Error('signAgentToolToken: agentId required');
  const key = getKey();
  if (!key) {
    throw new Error(
      'ESTIA_AGENT_TOKEN_SECRET is not set — agent-tool token path disabled',
    );
  }
  return new SignJWT({ purpose: AGENT_TOOL_PURPOSE })
    .setProtectedHeader({ alg: ALG })
    .setSubject(agentId)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(key);
}

/**
 * Verify a token's signature + expiry + purpose. Returns the claims
 * (with a guaranteed non-empty `sub`/agentId) on success, or null on
 * ANY failure: unset secret, bad signature, expired, wrong purpose,
 * missing sub. Callers map null → 401 (or 503 if unconfigured — check
 * isAgentToolConfigured() first to distinguish).
 */
export async function verifyAgentToolToken(
  token: string,
): Promise<AgentToolClaims | null> {
  const key = getKey();
  if (!key) return null; // fail closed: unconfigured
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: [ALG] });
    if (payload.purpose !== AGENT_TOOL_PURPOSE) return null;
    const sub = payload.sub;
    if (typeof sub !== 'string' || !sub) return null;
    return { sub, purpose: AGENT_TOOL_PURPOSE };
  } catch (e) {
    // jose throws typed errors for expired / signature / claim
    // failures. We treat them all as "invalid token" → 401, and never
    // leak which check failed to the caller.
    if (e instanceof joseErrors.JOSEError) return null;
    return null;
  }
}

export const AGENT_TOOL_TOKEN_TTL_SECONDS = TTL_SECONDS;
