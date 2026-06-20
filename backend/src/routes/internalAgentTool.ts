// Internal tool endpoint for the hosted LangGraph agent.
//
//   POST /internal/agent-tool  { name, input, agentId }
//     200: { ok: true, result }   — runChatTool output
//     400: invalid payload
//     401: missing / wrong service token
//     500: tool execution threw
//
// The Estia chat agent has been ported to a graph that runs on
// LangGraph Platform (LangChain's cloud — see docs/langgraph-port-
// scoping.md). That graph cannot reach our private RDS, so the ten
// chat tools call back here over authenticated HTTPS instead of using
// Prisma directly. This endpoint is the single re-entry point: it
// validates the caller, then runs the *existing* `runChatTool` so all
// agentId-scoped read logic is reused verbatim — no tool rewrite on
// the data side.
//
// ────────────────────────────────────────────────────────────────────
//  ⚠️  SECURITY TODO — PRODUCTION HARDENING REQUIRED BEFORE GO-LIVE  ⚠️
// ────────────────────────────────────────────────────────────────────
// This skeleton authenticates with a single static service token
// (`ESTIA_INTERNAL_TOKEN`) and TRUSTS the `agentId` supplied in the
// request body. That is acceptable for local `langgraph dev` parity
// testing ONLY. It is NOT safe for production:
//
//   • A leak of the static token = the ability to read ANY agent's
//     data by passing their id (cross-agent data exposure — the exact
//     thing the per-agent `where: { agentId }` scoping exists to stop).
//
// Production must replace "static token + body agentId" with a
// SHORT-LIVED, PER-AGENT SIGNED TOKEN, as recommended in the scoping
// doc (§"Per-agent auth for the graph"):
//
//   1. Estia mints a short-lived JWT (e.g. jose, 5–15 min TTL) scoped
//      to ONE agentId when it kicks off / authorizes a graph run.
//   2. The token travels in the graph run config and each tool call
//      forwards it in the Authorization header to THIS endpoint.
//   3. This endpoint verifies the signature + expiry and derives the
//      agentId FROM THE TOKEN CLAIM — never from the request body.
//      The body agentId is then ignored entirely.
//
// Until that lands, deploy this endpoint only on a trusted network
// path and keep ESTIA_INTERNAL_TOKEN secret + rotated.
// ────────────────────────────────────────────────────────────────────
//
// NOTE: this plugin is intentionally NOT registered in server.ts by
// this change (that file is being edited elsewhere). To wire it up,
// add — next to the other `app.register(...)` calls in
// backend/src/server.ts — the line documented in
// langgraph-agent/README.md, e.g.:
//
//   import { registerInternalAgentToolRoutes } from './routes/internalAgentTool.js';
//   await app.register(registerInternalAgentToolRoutes, { prefix: '/internal' });

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { runChatTool, CHAT_TOOLS } from '../lib/aiChatTools.js';

const VALID_TOOL_NAMES = new Set(CHAT_TOOLS.map((t) => t.name));

const bodySchema = z.object({
  name: z.string().min(1).max(64),
  // `input` is the tool's argument object. We accept any shape and let
  // runChatTool clamp / validate per-tool (it already does, defensively).
  input: z.record(z.any()).optional().default({}),
  // SECURITY TODO (see header): in production this comes from a signed
  // token claim, NOT the body. Kept here for the skeleton only.
  agentId: z.string().min(1).max(128),
});

// Constant-time-ish token comparison. Avoids a length-leaking early
// return; not a true timing-safe compare (Buffer + timingSafeEqual
// would be stricter) but good enough for a static skeleton token and
// keeps this file dependency-free.
function tokensMatch(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export const registerInternalAgentToolRoutes: FastifyPluginAsync = async (app) => {
  app.post('/agent-tool', async (req, reply) => {
    const expected = process.env.ESTIA_INTERNAL_TOKEN;
    if (!expected) {
      // Fail closed: if the operator never configured the token, the
      // endpoint must not run with no auth at all.
      req.log.error('ESTIA_INTERNAL_TOKEN not set — refusing /internal/agent-tool');
      return reply.code(503).send({
        error: { code: 'not_configured', message: 'internal tool endpoint not configured' },
      });
    }

    // Accept the token from a dedicated header or a Bearer
    // Authorization header (the graph forwards whichever is simplest).
    const headerToken = (req.headers['x-estia-internal-token'] as string | undefined)?.trim();
    const auth = (req.headers.authorization as string | undefined)?.trim();
    const bearer = auth?.toLowerCase().startsWith('bearer ')
      ? auth.slice(7).trim()
      : undefined;
    const provided = headerToken || bearer || '';

    if (!provided || !tokensMatch(provided, expected)) {
      return reply.code(401).send({
        error: { code: 'unauthorized', message: 'invalid service token' },
      });
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'invalid_request',
          message: 'invalid payload',
          issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
        },
      });
    }

    const { name, input, agentId } = parsed.data;

    if (!VALID_TOOL_NAMES.has(name)) {
      return reply.code(400).send({
        error: { code: 'unknown_tool', message: `unknown tool: ${name}` },
      });
    }

    try {
      // SECURITY TODO: derive agentId from a verified signed token,
      // not from the body. See file header.
      const result = await runChatTool(name, input, { agentId });
      return { ok: true, result };
    } catch (e: any) {
      req.log.error({ err: e, tool: name }, 'internal agent-tool execution failed');
      return reply.code(500).send({
        error: { code: 'tool_failed', message: e?.message || 'tool failed' },
      });
    }
  });
};
