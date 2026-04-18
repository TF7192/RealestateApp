import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';
import { track as phTrack } from '../lib/analytics.js';

const leadInput = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(3).max(40),
  email: z.string().email().nullable().optional(),
  interestType: z.enum(['PRIVATE', 'COMMERCIAL']),
  lookingFor: z.enum(['BUY', 'RENT']),
  city: z.string().max(80).nullable().optional(),
  street: z.string().max(120).nullable().optional(),
  rooms: z.string().max(20).nullable().optional(),
  priceRangeLabel: z.string().max(120).nullable().optional(),
  budget: z.number().int().nonnegative().nullable().optional(),
  preApproval: z.boolean().optional(),
  sector: z.string().max(60).nullable().optional(),
  balconyRequired: z.boolean().optional(),
  parkingRequired: z.boolean().optional(),
  elevatorRequired: z.boolean().optional(),
  safeRoomRequired: z.boolean().optional(),
  acRequired: z.boolean().optional(),
  storageRequired: z.boolean().optional(),
  schoolProximity: z.string().max(60).nullable().optional(),
  source: z.string().max(60).nullable().optional(),
  status: z.enum(['HOT', 'WARM', 'COLD']).optional(),
  notes: z.string().max(2000).nullable().optional(),
  brokerageSignedAt: z.string().nullable().optional(),
  brokerageExpiresAt: z.string().nullable().optional(),
  lastContact: z.string().nullable().optional(),
});

// Suggest HOT/WARM/COLD status from activity signals.
// HOT:  last contact ≤ 7 days AND (has viewings OR pre-approval)
// WARM: last contact ≤ 30 days OR has a recent viewing
// COLD: otherwise
function suggestStatus(lead: any): 'HOT' | 'WARM' | 'COLD' {
  const now = Date.now();
  const lastContact = lead.lastContact ? new Date(lead.lastContact).getTime() : null;
  const recentContactDays = lastContact ? Math.floor((now - lastContact) / (1000 * 60 * 60 * 24)) : null;
  const recentViewings = (lead.viewings || []).filter(
    (v: any) => new Date(v.viewedAt).getTime() > now - 30 * 24 * 60 * 60 * 1000
  ).length;

  if (recentContactDays != null && recentContactDays <= 7 && (recentViewings > 0 || lead.preApproval)) {
    return 'HOT';
  }
  if ((recentContactDays != null && recentContactDays <= 30) || recentViewings > 0) {
    return 'WARM';
  }
  return 'COLD';
}

function explainStatus(lead: any, suggested: string): string {
  const now = Date.now();
  const lastContact = lead.lastContact ? new Date(lead.lastContact).getTime() : null;
  const days = lastContact ? Math.floor((now - lastContact) / (1000 * 60 * 60 * 24)) : null;
  const viewings = (lead.viewings || []).length;
  const parts: string[] = [];
  if (days == null) parts.push('אין קשר מתועד');
  else parts.push(`קשר אחרון לפני ${days} ימים`);
  if (viewings > 0) parts.push(`${viewings} ביקורים`);
  if (lead.preApproval) parts.push('יש אישור עקרוני');
  const ruleExplain = suggested === 'HOT'
    ? 'חם: יצרת קשר לאחרונה ויש פעילות או אישור עקרוני'
    : suggested === 'WARM'
    ? 'חמים: יצרת קשר ב-30 הימים האחרונים או שהלקוח ראה נכס'
    : 'קר: לא היה קשר או פעילות לאחרונה';
  return `${ruleExplain}. נתונים: ${parts.join(' · ')}`;
}

export const registerLeadRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { onRequest: [app.requireAgent] }, async (req) => {
    const q = req.query as any;
    const where: any = { agentId: requireUser(req).id };
    if (q.status) where.status = q.status;
    if (q.lookingFor) where.lookingFor = q.lookingFor;
    if (q.interestType) where.interestType = q.interestType;
    if (q.search) {
      const s = String(q.search);
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s } },
        { city: { contains: s, mode: 'insensitive' } },
      ];
    }
    const items = await prisma.lead.findMany({
      where,
      include: { viewings: true, agreements: true },
      orderBy: { createdAt: 'desc' },
    });
    // Decorate with computed heat suggestion + explanation
    const withSuggest = items.map((l: any) => {
      const suggestedStatus = suggestStatus(l);
      return {
        ...l,
        suggestedStatus,
        statusExplanation: explainStatus(l, suggestedStatus),
      };
    });
    return { items: withSuggest };
  });

  app.get('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: { viewings: true, agreements: true },
    });
    if (!lead || lead.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    return { lead };
  });

  app.post('/', { onRequest: [app.requireAgent] }, async (req) => {
    const body = leadInput.parse(req.body);
    const agentId = requireUser(req).id;
    const created = await prisma.lead.create({
      data: {
        agentId,
        ...normalize(body),
      },
    });
    phTrack('lead_created', agentId, {
      lead_id: created.id,
      status: created.status,
      interest_type: created.interestType,
      looking_for: created.lookingFor,
      city: created.city,
    });
    return { lead: created };
  });

  app.patch('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = leadInput.partial().parse(req.body);
    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing || existing.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const updated = await prisma.lead.update({
      where: { id },
      data: normalize(body),
    });
    return { lead: updated };
  });

  app.delete('/:id', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing || existing.agentId !== requireUser(req).id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    await prisma.lead.delete({ where: { id } });
    return { ok: true };
  });
};

function normalize(body: Partial<z.infer<typeof leadInput>>) {
  const data: any = { ...body };
  for (const k of ['brokerageSignedAt', 'brokerageExpiresAt', 'lastContact'] as const) {
    if (data[k]) data[k] = new Date(data[k]);
    if (data[k] === null) data[k] = null;
  }
  return data;
}
