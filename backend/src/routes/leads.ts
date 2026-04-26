import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';
import { tryServiceTokenAuth } from '../middleware/service-token.js';
import { track as phTrack } from '../lib/analytics.js';
import { evaluateLeadProperty } from '../lib/matching.js';
import { logActivity } from '../lib/activity.js';
import { normalizeAddress, normalizeCity } from '../lib/addressNormalize.js';
import { buildAnthropic } from '../lib/anthropic.js';
import { recordAnthropic } from '../lib/aiUsage.js';

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
    // PERF-002 — pagination. `take` defaults to 200 so the legacy FE
    // (no pagination yet) keeps getting full pages. `cursor` is an
    // id-based cursor: the id of the last lead from the previous page.
    const takeRaw = q.take != null ? Number(q.take) : 200;
    const take = Number.isFinite(takeRaw)
      ? Math.max(1, Math.min(200, Math.floor(takeRaw)))
      : 200;
    const cursor = typeof q.cursor === 'string' && q.cursor ? q.cursor : null;
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

    // PERF-002 — overfetch by 1 to detect a next page. When post-filter
    // search-profile criteria are active we still apply them in JS (see
    // hasProfileFilters block below); pagination is best-effort in that
    // path — the cursor is still based on createdAt order so the
    // worst-case is the FE asking for one extra page. The legacy FE
    // doesn't pass `take`/`cursor` so this is purely additive today.
    const items = await prisma.lead.findMany({
      where,
      include: { viewings: true, agreements: true, searchProfiles: true },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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
    // PERF-002 — slice off the +1 overfetch and emit a nextCursor.
    const hasMore = filtered.length > take;
    const page = hasMore ? filtered.slice(0, take) : filtered;
    const nextCursor = hasMore ? page[page.length - 1].id : null;
    // PERF-024 — list responses no longer carry `suggestedStatus` /
    // `statusExplanation`; the heuristic + Hebrew prose is recomputed
    // on the lead-detail endpoint where the UI actually renders it.
    // Saves ~80-150 bytes per row × N leads on every list fetch.
    return { items: page, nextCursor };
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
    // PERF-024 — keep the computed heat suggestion + Hebrew explanation
    // on the detail endpoint (where the UI actually shows it). The list
    // endpoint dropped these fields to keep payloads light.
    const suggestedStatus = suggestStatus(lead);
    return {
      lead: {
        ...lead,
        suggestedStatus,
        statusExplanation: explainStatus(lead, suggestedStatus),
      },
    };
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

  // 2026-04-26 — AI edit. Mirrors POST /api/properties/:id/ai-edit.
  app.post('/:id/ai-edit', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const Body = z.object({ instruction: z.string().min(2).max(800) });
    const { instruction } = Body.parse(req.body);
    const agentId = requireUser(req).id;
    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing || existing.agentId !== agentId) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }
    const fieldList = Object.keys(leadInput.shape).join(', ');
    const sys = [
      'אתה עוזר עריכה לנתוני ליד נדל״ן בעברית. הסוכן מתאר בקצרה מה הוא רוצה לשנות.',
      'החזר אך ורק JSON תקין במבנה: {"updates":{<שדות שצריך לעדכן>},"summary":"<סיכום קצר בעברית>"}.',
      'שנה רק שדות שהמשתמש ביקש מפורשות לשנות. שמות שדות חייבים להיות מתוך הרשימה הבאה בלבד:',
      fieldList,
      'מספרים החזר כ-Number, בוליאנים כ-true/false. אל תכלול שדות שלא הוזכרו.',
      'אם הבקשה לא ברורה או לא ניתן לבצע אותה, החזר {"updates":{},"summary":"<הסיבה>"}.',
    ].join('\n');
    const user = [
      `ליד נוכחי: ${JSON.stringify(existing)}`,
      `בקשת המשתמש: "${instruction}"`,
    ].join('\n\n');
    let parsed: { updates: any; summary?: string };
    try {
      const client = buildAnthropic();
      if (!client) return reply.code(503).send({ error: { message: 'שירות ה-AI לא מוגדר בשרת' } });
      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 800,
        system: sys,
        messages: [{ role: 'user', content: user }],
      });
      recordAnthropic({ userId: agentId, feature: 'lead-ai-edit', model: 'claude-haiku-4-5', usage: response.usage as any });
      const text = response.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { updates: {} };
    } catch (e: any) {
      req.log.warn({ err: e }, 'lead ai-edit model call failed');
      return reply.code(502).send({ error: { message: 'שירות ה-AI לא זמין כרגע, נסו שוב' } });
    }
    const updates = parsed.updates && typeof parsed.updates === 'object' ? parsed.updates : {};
    if (!Object.keys(updates).length) {
      return reply.code(422).send({
        error: { message: parsed.summary || 'לא הצלחתי להבין מה לעדכן' },
      });
    }
    const validated = leadInput.partial().parse(updates);
    const updated = await prisma.lead.update({
      where: { id },
      data: normalize(validated),
    });
    await logActivity({
      agentId, actorId: agentId,
      verb: 'updated', entityType: 'Lead', entityId: id,
      summary: `AI עריכה: ${parsed.summary || instruction.slice(0, 60)}`,
      metadata: { fields: Object.keys(validated), instruction },
    });
    return {
      lead: updated,
      summary: parsed.summary || null,
      changedFields: Object.keys(validated),
    };
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
  //
  // PERF-009 — push obvious filters (city, assetClass/category, price
  // band, rooms band) into the SQL where clause so we don't pull every
  // ACTIVE property into Node just to throw most of them away. The JS
  // scorer still runs on the narrowed set so the return shape and the
  // computed `score`/`reasons` are unchanged.
  app.get('/:id/matches', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const uid = requireUser(req).id;
    const lead = await prisma.lead.findFirst({
      where: { id, agentId: uid },
      include: { searchProfiles: true },
    });
    if (!lead) return reply.code(404).send({ error: { message: 'Lead not found' } });

    // Build the SQL pre-filter. Property is the more constrained side
    // here — we know its concrete column values from the lead.
    const where: any = { agentId: uid, status: 'ACTIVE' };
    // assetClass: COMMERCIAL leads → COMMERCIAL props; everything else
    // looks at RESIDENTIAL. Keep null-tolerant on legacy rows.
    if (lead.interestType === 'COMMERCIAL') where.assetClass = 'COMMERCIAL';
    else if (lead.interestType === 'PRIVATE') where.assetClass = 'RESIDENTIAL';
    // category: BUY → SALE / RENT → RENT.
    if (lead.lookingFor === 'BUY') where.category = 'SALE';
    else if (lead.lookingFor === 'RENT') where.category = 'RENT';
    // city: when the lead has a city filter, only match properties in it.
    if (lead.city) where.city = lead.city;
    // price band: ±15% of the lead's budget (matches the JS evaluator).
    if (lead.budget) {
      const lo = Math.round(lead.budget * 0.85);
      const hi = Math.round(lead.budget * 1.15);
      where.marketingPrice = { gte: lo, lte: hi };
    }
    // rooms ±1: parse the leading number out of the free-form string.
    const roomsMatch = lead.rooms ? String(lead.rooms).match(/\d+(\.\d+)?/g) : null;
    if (roomsMatch && roomsMatch.length) {
      const nums = roomsMatch.map(Number);
      const lo = Math.min(...nums) - 1;
      const hi = Math.max(...nums) + 1;
      where.rooms = { gte: lo, lte: hi };
    }

    const props = await prisma.property.findMany({
      where,
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
