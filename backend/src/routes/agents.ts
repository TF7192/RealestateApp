import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

// Public read-only routes for an agent's storefront — shared via /a/:id.
// Only exposes display fields; nothing sensitive.
export const registerAgentRoutes: FastifyPluginAsync = async (app) => {
  // Search for another agent by email (exact match). Used by the
  // PropertyAssigneesPanel ("add a co-agent by email") and the
  // PropertyPipelineBlock primary-agent picker. Originally lived under
  // /api/transfers/agents/search alongside the property-transfer flow;
  // moved here when transfers were removed because the two consumers
  // above still need a server-side agent lookup.
  //
  // SEC-037 — rate-limit the lookup. A loose loop here (1 req per email
  // tested) lets an authenticated agent enumerate the entire User table
  // by email. 20/min stays well above the dialog's natural pace (user
  // types email + clicks search) and below scripted enumeration speeds.
  app.get('/search', {
    onRequest: [app.requireAgent],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (req) => {
    const { email } = req.query as { email?: string };
    if (!email) return { agent: null };
    const norm = email.trim().toLowerCase();
    // Case-insensitive lookup handles legacy rows stored with mixed
    // case (signup historically preserved the email as typed).
    const agent = await prisma.user.findFirst({
      where: { email: { equals: norm, mode: 'insensitive' } },
      include: { agentProfile: true },
    });
    // Accept AGENT and OWNER (an OWNER of one office can be added to
    // another). CUSTOMER stays blocked.
    if (!agent || agent.role === 'CUSTOMER') return { agent: null };
    if (agent.id === requireUser(req).id) return { agent: null, self: true };
    return {
      agent: {
        id: agent.id,
        email: agent.email,
        displayName: agent.displayName,
        phone: agent.phone,
        avatarUrl: agent.avatarUrl,
        agency: agent.agentProfile?.agency || null,
      },
    };
  });

  app.get('/:id/public', async (req, reply) => {
    const { id } = req.params as { id: string };
    const agent = await prisma.user.findUnique({
      where: { id },
      include: { agentProfile: true },
    });
    // OWNER accounts (office managers) also own public storefronts.
    // Without this the /a/:id public page 404'd for any manager — the
    // same bug pattern that 5631863 fixed on /api/public/*.
    if (!agent || (agent.role !== 'AGENT' && agent.role !== 'OWNER')) {
      return reply.code(404).send({ error: { message: 'Agent not found' } });
    }
    return {
      agent: {
        id: agent.id,
        displayName: agent.displayName,
        phone: agent.phone,
        avatarUrl: agent.avatarUrl,
        agency: agent.agentProfile?.agency || null,
        title: agent.agentProfile?.title || null,
        bio: agent.agentProfile?.bio || null,
      },
    };
  });
};
