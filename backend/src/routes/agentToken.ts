// Token-minting route for the hosted-LangGraph agent-tool path.
//
//   GET /api/ai/agent-token   (authenticated agent only)
//     200: { token }          — a freshly minted short-lived (5 min)
//                               token scoped to req.user.id
//     401: not signed in (handled by app.requireAgent)
//     403: wrong role         (handled by app.requireAgent)
//     503: agent-tool path not configured (ESTIA_AGENT_TOKEN_SECRET unset)
//
// Flow: the logged-in agent (or a server acting on their behalf) calls
// this to obtain a per-agent token, then hands it to a LangGraph run as
// config.configurable.estiaToken. Each tool call in the graph forwards
// it to POST /api/internal/agent-tool, which verifies it and derives
// the agentId from the token's `sub` claim — never from the body.
//
// Lives in its own small file (registered alongside the large
// routes/ai.ts) so the AI route file doesn't churn for this. Mounted
// under the /api/ai prefix in server.ts so it sits next to the other
// /api/ai/* routes the frontend already talks to.

import type { FastifyPluginAsync } from 'fastify';
import { requireUser } from '../middleware/auth.js';
import { signAgentToolToken, isAgentToolConfigured } from '../lib/agentToolToken.js';

export const registerAgentTokenRoutes: FastifyPluginAsync = async (app) => {
  app.get('/agent-token', { onRequest: [app.requireAgent] }, async (req, reply) => {
    // Fail closed: if the operator hasn't configured the signing secret,
    // the whole agent-tool path is disabled. Don't mint an unverifiable
    // token; tell the caller the feature is off.
    if (!isAgentToolConfigured()) {
      req.log.warn('ESTIA_AGENT_TOKEN_SECRET not set — /api/ai/agent-token disabled');
      return reply.code(503).send({
        error: { code: 'not_configured', message: 'agent-tool path not configured' },
      });
    }

    const user = requireUser(req);
    const token = await signAgentToolToken(user.id);
    return { token };
  });
};
