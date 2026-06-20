// Internal tool endpoint for the hosted LangGraph agent.
//
//   POST /api/internal/agent-tool  { name, input }
//     headers: Authorization: Bearer <short-lived per-agent token>
//     200: { ok: true, result }   — runChatTool output
//     400: invalid payload / unknown tool
//     401: missing / invalid / expired token (or wrong purpose)
//     503: ESTIA_AGENT_TOKEN_SECRET unset (path disabled — fail closed)
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
//  AUTH MODEL — short-lived, per-agent SIGNED token (production-ready)
// ────────────────────────────────────────────────────────────────────
// The previous skeleton authenticated with a single static service
// token and TRUSTED the agentId in the request body. That is replaced.
// A leaked static token + body-supplied agentId = the ability to read
// ANY agent's data — defeating the per-agent `where: { agentId }`
// scoping that is the agent's security boundary.
//
// Now:
//   1. Estia mints a short-lived (5 min) signed JWT scoped to ONE
//      agentId via GET /api/ai/agent-token (see routes/agentToken.ts).
//   2. The graph threads that token through its run config and each
//      tool call forwards it here as `Authorization: Bearer <token>`.
//   3. This endpoint verifies the signature + expiry + purpose claim
//      and derives agentId FROM THE TOKEN'S `sub` CLAIM. Any agentId
//      in the body is IGNORED (and not accepted by the schema).
//
// Defense-in-depth: also restrict /api/internal/* to LangGraph's egress
// IPs at the nginx layer (see the commented snippet in
// frontend/nginx.conf). The signed token is the primary control; the
// IP allowlist is belt-and-suspenders.
//
// Registered in server.ts under the /api/internal prefix so it rides
// the existing /api/* nginx proxy:
//   await app.register(registerInternalAgentToolRoutes, { prefix: '/api/internal' });

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { runChatTool, CHAT_TOOLS } from '../lib/aiChatTools.js';
import {
  verifyAgentToolToken,
  isAgentToolConfigured,
} from '../lib/agentToolToken.js';

const VALID_TOOL_NAMES = new Set(CHAT_TOOLS.map((t) => t.name));

const bodySchema = z
  .object({
    name: z.string().min(1).max(64),
    // `input` is the tool's argument object. We accept any shape and let
    // runChatTool clamp / validate per-tool (it already does, defensively).
    input: z.record(z.any()).optional().default({}),
    // NOTE: agentId is intentionally NOT part of the schema. It is
    // derived from the verified token's `sub` claim — never the body.
    // .strict() so a body-supplied agentId (or any extra field) is
    // rejected rather than silently ignored.
  })
  .strict();

export const registerInternalAgentToolRoutes: FastifyPluginAsync = async (app) => {
  app.post('/agent-tool', async (req, reply) => {
    // Fail closed: if the signing secret is unconfigured, the whole
    // path is disabled — never run with no/weak auth.
    if (!isAgentToolConfigured()) {
      req.log.error('ESTIA_AGENT_TOKEN_SECRET not set — refusing /api/internal/agent-tool');
      return reply.code(503).send({
        error: { code: 'not_configured', message: 'internal tool endpoint not configured' },
      });
    }

    // Bearer token only. (The old X-Estia-Internal-Token header is gone.)
    const auth = (req.headers.authorization as string | undefined)?.trim();
    const token = auth?.toLowerCase().startsWith('bearer ')
      ? auth.slice(7).trim()
      : '';

    const claims = await verifyAgentToolToken(token);
    if (!claims) {
      // Covers missing / malformed / bad-signature / expired / wrong
      // purpose. We don't disclose which to the caller.
      return reply.code(401).send({
        error: { code: 'unauthorized', message: 'invalid or expired token' },
      });
    }

    const agentId = claims.sub; // derived from the token, not the body

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

    const { name, input } = parsed.data;

    if (!VALID_TOOL_NAMES.has(name)) {
      return reply.code(400).send({
        error: { code: 'unknown_tool', message: `unknown tool: ${name}` },
      });
    }

    try {
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
