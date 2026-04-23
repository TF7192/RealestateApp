import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';
import { tryServiceTokenAuth } from '../middleware/service-token.js';
import { track as phTrack } from '../lib/analytics.js';
import { evaluateLeadProperty } from '../lib/matching.js';
import { logActivity } from '../lib/activity.js';
import { normalizeAddress, normalizeCity } from '../lib/addressNormalize.js';

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
  // Commercial-lead requirement block — business-client brief fields.
  sqmGrossMin: z.number().int().nonnegative().nullable().optional(),
  sqmNetMin: z.number().int().nonnegative().nullable().optional(),
  accessibilityRequired: z.boolean().optional(),
  buildStateRequired: z.string().max(60).nullable().optional(),
  workstationsMin: z.number().int().nonnegative().nullable().optional(),
  kitchenetteRequired: z.boolean().optional(),
  floorShelterRequired: z.boolean().optional(),
  inOfficeToiletsRequired: z.boolean().optional(),
  onFloorToiletsRequired: z.boolean().optional(),
  openSpaceRequired: z.boolean().optional(),
  schoolProximity: z.string().max(60).nullable().optional(),
  source: z.string().max(60).nullable().optional(),
  status: z.enum(['HOT', 'WARM', 'COLD']).optional(),
  notes: z.string().max(2000).nullable().optional(),
  brokerageSignedAt: z.string().nullable().optional(),
  brokerageExpiresAt: z.string().nullable().optional(),
  lastContact: z.string().nullable().optional(),

  // Sprint 1 / MLS parity — Task K2. Customer admin block.
  // `status` (above) stays thermal; `customerStatus` is the life-cycle.
  customerStatus: z
    .enum(['ACTIVE', 'INACTIVE', 'CANCELLED', 'PAUSED', 'IN_DEAL', 'BOUGHT', 'RENTED'])
    .nullable()
    .optional(),
  commissionPct: z.number().min(0).max(100).nullable().optional(),
  isPrivate: z.boolean().optional(),
  purposes: z
    .array(z.enum(['INVESTMENT', 'RESIDENCE', 'COMMERCIAL', 'COMBINATION']))
    .optional(),
  seriousnessOverride: z.enum(['NONE', 'SORT_OF', 'MEDIUM', 'VERY']).nullable().optional(),

  // Sprint 2 / MLS parity — Task K1. Richer contact + identity fields.
  firstName:    z.string().max(120).nullable().optional(),
  lastName:     z.string().max(120).nullable().optional(),
  companyName:  z.string().max(200).nullable().optional(),
  address:      z.string().max(400).nullable().optional(),
  cityText:     z.string().max(120).nullable().optional(),
  zip:          z.string().max(20).nullable().optional(),
  primaryPhone: z.string().max(40).nullable().optional(),
  phone1:       z.string().max(40).nullable().optional(),
  phone2:       z.string().max(40).nullable().optional(),
  fax:          z.string().max(40).nullable().optional(),
  personalId:   z.string().max(40).nullable().optional(),
  description:  z.string().max(500).nullable().optional(),

  // Sprint 2 / MLS parity — Task L1. Quick-lead lifecycle status.
  leadStatus: z
    .enum([
      'NEW', 'INTENT_TO_CALL', 'CONVERTED', 'DISQUALIFIED',
      'NOT_INTERESTED', 'IN_PROGRESS', 'CONVERTED_NO_OPPORTUNITY',
      'DELETED', 'ARCHIVED',
    ])
    .nullable()
    .optional(),
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
    const uid = requireUser(req).id;
    const where: any = { agentId: uid };
    // Legacy single-value filters.
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

    // Sprint 2 / MLS parity — Task C2. Nadlan-parity filter panel.
    // Query params arrive as either a single string or an array (Fastify
    // auto-parses `?cities=A&cities=B`); `toList` normalizes both shapes.
    const toList = (v: unknown): string[] => {
      if (v == null) return [];
      return (Array.isArray(v) ? v : [v]).map((x) => String(x)).filter(Boolean);
    };
    const cities = toList(q.cities).map((c) => normalizeCity(c)?.value ?? c);
    if (cities.length) where.city = { in: cities };
    const leadStatus = toList(q.leadStatus);
    if (leadStatus.length) where.leadStatus = { in: leadStatus };
    const customerStatus = toList(q.customerStatus);
    if (customerStatus.length) where.customerStatus = { in: customerStatus };
    const seriousness = toList(q.seriousness);
    if (seriousness.length) where.seriousnessOverride = { in: seriousness };
    const types = toList(q.types); // apartment / house / ...
    // Lead.type is a free-form hint; we match via searchProfiles when
    // supplied AND also accept exact match on the flat field for back-compat.
    if (q.minPrice != null || q.maxPrice != null) {
      const min = q.minPrice != null ? Number(q.minPrice) : undefined;
      const max = q.maxPrice != null ? Number(q.maxPrice) : undefined;
      where.budget = {};
      if (Number.isFinite(min!)) where.budget.gte = min;
      if (Number.isFinite(max!)) where.budget.lte = max;
    }
    // Requirement booleans — flags on the lead itself.
    for (const k of [
      'balconyRequired', 'parkingRequired', 'elevatorRequired',
      'safeRoomRequired', 'acRequired', 'storageRequired',
    ] as const) {
      if (q[k] === '1' || q[k] === 'true' || q[k] === true) where[k] = true;
    }
    // Keyword (Nadlan `Keyword`): broad text match across name/notes/city.
    if (q.keyword) {
      const s = String(q.keyword);
      where.AND = [...(where.AND || []), {
        OR: [
          { name:   { contains: s, mode: 'insensitive' } },
          { notes:  { contains: s, mode: 'insensitive' } },
          { city:   { contains: s, mode: 'insensitive' } },
          { street: { contains: s, mode: 'insensitive' } },
          { description: { contains: s, mode: 'insensitive' } },
        ],
      }];
    }
    // Flag = Tag filter (server-side join via TagAssignment).
    const tagIds = toList(q.tags);
    if (tagIds.length) {
      const assigned = await prisma.tagAssignment.findMany({
        where: { tagId: { in: tagIds }, entityType: 'LEAD' },
        select: { entityId: true },
      });
      const leadIds = Array.from(new Set(assigned.map((a) => a.entityId)));
      where.AND = [...(where.AND || []), { id: { in: leadIds.length ? leadIds : ['__none__'] } }];
    }

    const items = await prisma.lead.findMany({
      where,
      include: { viewings: true, agreements: true, searchProfiles: true },
      orderBy: { createdAt: 'desc' },
    });

    // Post-filter on search-profile fields (rooms / floor / types / hoods)
    // — doing this in Prisma requires either a raw join or a nested
    // `some: { ... }` per field, and mixing them in one where-clause gets
    // hairy. The result set is already owner-scoped (bounded) so an
    // in-memory filter is safe and keeps the query readable.
    const hoods    = toList(q.neighborhoods);
    const minRoom  = q.minRoom  != null ? Number(q.minRoom)  : null;
    const maxRoom  = q.maxRoom  != null ? Number(q.maxRoom)  : null;
    const minFloor = q.minFloor != null ? Number(q.minFloor) : null;
    const maxFloor = q.maxFloor != null ? Number(q.maxFloor) : null;
    const hasProfileFilters =
      hoods.length || types.length ||
      minRoom != null || maxRoom != null ||
      minFloor != null || maxFloor != null;

    const filtered = !hasProfileFilters ? items : items.filter((l: any) => {
      const profiles = l.searchProfiles || [];
      // A lead passes if ANY of its profiles matches every constraint.
      // Leads with no profiles fall back to flat `rooms`/`city` fields.
      const candidates = profiles.length ? profiles : [{
        neighborhoods: [], propertyTypes: [],
        minRoom:  null, maxRoom:  null,
        minFloor: null, maxFloor: null,
      }];
      return candidates.some((p: any) => {
        if (hoods.length && !(p.neighborhoods || []).some((h: string) => hoods.includes(h))) return false;
        if (types.length && !(p.propertyTypes || []).some((t: string) => types.includes(t))) return false;
        if (minRoom != null && (p.maxRoom != null && p.maxRoom < minRoom)) return false;
        if (maxRoom != null && (p.minRoom != null && p.minRoom > maxRoom)) return false;
        if (minFloor != null && (p.maxFloor != null && p.maxFloor < minFloor)) return false;
        if (maxFloor != null && (p.minFloor != null && p.minFloor > maxFloor)) return false;
        return true;
      });
    });
    // Decorate with computed heat suggestion + explanation
    const withSuggest = filtered.map((l: any) => {
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

  app.post('/', { onRequest: [tryServiceTokenAuth, app.requireAgent] }, async (req) => {
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
    await logActivity({
      agentId, actorId: agentId,
      verb: 'created', entityType: 'Lead', entityId: created.id,
      summary: `לקוח חדש: ${created.name}`,
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
    await logActivity({
      agentId: existing.agentId, actorId: requireUser(req).id,
      verb: 'updated', entityType: 'Lead', entityId: id,
      summary: `עודכן לקוח: ${updated.name}`,
      metadata: { fields: Object.keys(body) },
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
    await logActivity({
      agentId: existing.agentId, actorId: requireUser(req).id,
      verb: 'deleted', entityType: 'Lead', entityId: id,
      summary: `נמחק לקוח: ${existing.name}`,
    });
    return { ok: true };
  });

  // Sprint 2 / MLS parity — Task C3. Server-side matching: properties
  // this lead could be interested in. Owner-scoped — only returns
  // properties the signed-in agent owns.
  app.get('/:id/matches', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const uid = requireUser(req).id;
    const lead = await prisma.lead.findFirst({
      where: { id, agentId: uid },
      include: { searchProfiles: true },
    });
    if (!lead) return reply.code(404).send({ error: { message: 'Lead not found' } });
    const props = await prisma.property.findMany({
      where: { agentId: uid, status: 'ACTIVE' },
      include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
    });
    const scored = props
      .map((p: any) => ({ p, sig: evaluateLeadProperty(lead as any, p) }))
      .filter((r) => r.sig.matches)
      .sort((a, b) => b.sig.score - a.sig.score)
      .map((r) => ({
        property: {
          ...r.p,
          images: (r.p.images || []).map((i: any) => i.url),
        },
        score:   r.sig.score,
        reasons: r.sig.reasons,
      }));
    return { items: scored };
  });
};

function normalize(body: Partial<z.infer<typeof leadInput>>) {
  const data: any = { ...body };
  for (const k of ['brokerageSignedAt', 'brokerageExpiresAt', 'lastContact'] as const) {
    if (data[k]) data[k] = new Date(data[k]);
    if (data[k] === null) data[k] = null;
  }
  // Snap city + street to their government-registered canonical form
  // so rows stay comparable across spelling variants (שיינקין / שינקין,
  // ת"א / תל אביב - יפו). Unrecognized values pass through unchanged.
  // Only the string fields — Lead has no cityCode / streetCode columns.
  const addr = normalizeAddress({ city: data.city, street: data.street });
  if (addr.city)   data.city   = addr.city;
  if (addr.street) data.street = addr.street;
  return data;
}
