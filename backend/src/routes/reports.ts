import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';

export const registerReportRoutes: FastifyPluginAsync = async (app) => {
  // Weekly-report stats for a property — used by the "send report to owner" card
  app.get('/property/:id/weekly', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        marketingActions: true,
        viewings: true,
        inquiries: true,
      },
    });
    if (!property || property.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const inquiries = property.inquiries.filter((i) => i.createdAt >= weekAgo).length;
    const viewings = property.viewings.filter((v) => v.viewedAt >= weekAgo).length;
    const done = property.marketingActions.filter((a) => a.done).length;
    return {
      stats: {
        inquiries,
        viewings,
        views: inquiries + viewings * 3 + 4,
        offers: property.offer ? 1 : 0,
        completedActions: done,
        totalActions: property.marketingActions.length,
        doneActionKeys: property.marketingActions.filter((a) => a.done).map((a) => a.actionKey),
        pendingActionKeys: property.marketingActions.filter((a) => !a.done).map((a) => a.actionKey),
      },
    };
  });

  // Dashboard summary
  app.get('/dashboard', { onRequest: [app.requireAgent] }, async (req) => {
    const agentId = requireUser(req).id;
    const [properties, leads, deals] = await Promise.all([
      prisma.property.findMany({ where: { agentId } }),
      prisma.lead.findMany({ where: { agentId } }),
      prisma.deal.findMany({ where: { agentId } }),
    ]);
    const active = properties.filter((p) => p.status === 'ACTIVE');
    const residential = active.filter((p) => p.assetClass === 'RESIDENTIAL');
    const commercial = active.filter((p) => p.assetClass === 'COMMERCIAL');
    return {
      properties: {
        residential: {
          total: residential.length,
          sale: residential.filter((p) => p.category === 'SALE').length,
          rent: residential.filter((p) => p.category === 'RENT').length,
        },
        commercial: {
          total: commercial.length,
          sale: commercial.filter((p) => p.category === 'SALE').length,
          rent: commercial.filter((p) => p.category === 'RENT').length,
        },
      },
      leads: {
        total: leads.length,
        hot: leads.filter((l) => l.status === 'HOT').length,
        warm: leads.filter((l) => l.status === 'WARM').length,
        cold: leads.filter((l) => l.status === 'COLD').length,
      },
      deals: {
        total: deals.length,
        active: deals.filter((d) => d.status !== 'SIGNED').length,
        signed: deals.filter((d) => d.status === 'SIGNED').length,
        totalCommission: deals
          .filter((d) => d.status === 'SIGNED')
          .reduce((s, d) => s + (d.commission || 0), 0),
      },
    };
  });
};
