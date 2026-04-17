import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../lib/prisma.js';

// Public read-only routes for an agent's storefront — shared via /a/:id.
// Only exposes display fields; nothing sensitive.
export const registerAgentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/:id/public', async (req, reply) => {
    const { id } = req.params as { id: string };
    const agent = await prisma.user.findUnique({
      where: { id },
      include: { agentProfile: true },
    });
    if (!agent || agent.role !== 'AGENT') {
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
