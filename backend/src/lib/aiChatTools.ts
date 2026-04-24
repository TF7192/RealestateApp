// Read-only DB tool-suite for /api/ai/chat so Claude can answer
// data-aware questions about the signed-in agent's book ("כמה לידים
// חמים יש לי בתל אביב?", "תראה לי את הנכסים שהוסיפו השבוע").
//
// All tool executions are agentId-scoped — the tools never see rows
// belonging to other agents, and they never write. The whole point is
// a demo-safe AI surface for דנה לוי; keeping this layer pure-read
// means it stays safe even if the model hallucinates a call.

import type Anthropic from '@anthropic-ai/sdk';
import { prisma } from './prisma.js';

// Small helper — Claude tends to send large or weird `limit` values.
// Clamp so a tool call can't accidentally dump the whole table.
function clampLimit(n: unknown, fallback = 20, cap = 100): number {
  const parsed = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), cap);
}

// ─── Tool schemas (what Claude sees) ────────────────────────────────
export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_leads',
    description: 'List the agent\'s leads (buyers/renters). Returns newest first. Filter by city, status (HOT/WARM/COLD), or lookingFor (BUY/RENT). Call this to answer "how many leads", "show me hot leads", "who wants to buy in Tel Aviv".',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'Hebrew city name — exact match.' },
        status: { type: 'string', enum: ['HOT', 'WARM', 'COLD'], description: 'Thermal rating.' },
        lookingFor: { type: 'string', enum: ['BUY', 'RENT'], description: 'Buyer or renter.' },
        limit: { type: 'number', description: 'Max rows to return (1–100, default 20).' },
      },
    },
  },
  {
    name: 'list_properties',
    description: 'List the agent\'s properties (listings). Newest first. Filter by city, category (SALE/RENT), or status. Use this for "my listings", "properties in Jerusalem", "what\'s for rent".',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string' },
        category: { type: 'string', enum: ['SALE', 'RENT'] },
        status: { type: 'string', description: 'PropertyStatus enum (ACTIVE/PAUSED/SOLD/RENTED/INACTIVE/CANCELLED/IN_DEAL/ARCHIVED).' },
        limit: { type: 'number', description: 'Max rows (1–100, default 20).' },
      },
    },
  },
  {
    name: 'list_deals',
    description: 'List the agent\'s deals (transactions). Filter by status (NEGOTIATING/WAITING_MORTGAGE/PENDING_CONTRACT/SIGNED/CLOSED).',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'list_reminders',
    description: 'List the agent\'s reminders. Filter by status (PENDING/COMPLETED/CANCELLED) or `dueToday: true` to get only today\'s pending items.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['PENDING', 'COMPLETED', 'CANCELLED'] },
        dueToday: { type: 'boolean', description: 'Only return PENDING reminders whose dueAt is in the user\'s local today.' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'summary_counts',
    description: 'Top-line CRM counts for the signed-in agent: open leads, active properties, open deals, pending reminders, hot leads, today\'s reminders. Zero-arg. Use when asked "give me an overview" or "how is my book".',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_lead',
    description: 'Fetch one lead by id (returns full detail).',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'get_property',
    description: 'Fetch one property by id (returns full detail).',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
  },
  {
    name: 'search',
    description: 'Free-text search across the agent\'s leads and properties. Matches on lead name/phone/notes and property street/city/owner/notes. Use this when the question contains a person\'s name or a partial address.',
    input_schema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Needle — 2–80 characters.' },
        limit: { type: 'number' },
      },
      required: ['q'],
    },
  },
  {
    name: 'list_office_members',
    description: 'List the other members of the caller\'s office (only works for OWNER/AGENT users attached to an office). Returns id, name, role, email.',
    input_schema: { type: 'object', properties: {} },
  },
];

// ─── Dispatcher ────────────────────────────────────────────────────
export async function runChatTool(
  name: string,
  input: Record<string, any>,
  ctx: { agentId: string },
): Promise<unknown> {
  switch (name) {
    case 'list_leads': {
      const limit = clampLimit(input.limit);
      const where: any = { agentId: ctx.agentId };
      if (input.city) where.city = input.city;
      if (input.status) where.status = input.status;
      if (input.lookingFor) where.lookingFor = input.lookingFor;
      const rows = await prisma.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, name: true, phone: true, city: true, rooms: true,
          budget: true, priceRangeLabel: true, status: true,
          lookingFor: true, interestType: true, source: true,
          lastContact: true, createdAt: true,
        },
      });
      return { count: rows.length, items: rows };
    }

    case 'list_properties': {
      const limit = clampLimit(input.limit);
      const where: any = { agentId: ctx.agentId };
      if (input.city) where.city = input.city;
      if (input.category) where.category = input.category;
      if (input.status) where.status = input.status;
      const rows = await prisma.property.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, street: true, city: true, neighborhood: true,
          rooms: true, sqm: true, floor: true, totalFloors: true,
          marketingPrice: true, type: true, assetClass: true,
          category: true, status: true, stage: true,
          isPublicMatch: true, createdAt: true,
        },
      });
      return { count: rows.length, items: rows };
    }

    case 'list_deals': {
      const limit = clampLimit(input.limit);
      const where: any = { agentId: ctx.agentId };
      if (input.status) where.status = input.status;
      const rows = await prisma.deal.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true, propertyStreet: true, city: true, status: true,
          marketingPrice: true, offer: true, closedPrice: true,
          commission: true, signedAt: true, updatedAt: true,
        },
      });
      return { count: rows.length, items: rows };
    }

    case 'list_reminders': {
      const limit = clampLimit(input.limit);
      const where: any = { agentId: ctx.agentId };
      if (input.status) where.status = input.status;
      if (input.dueToday) {
        where.status = 'PENDING';
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        where.dueAt = { gte: start, lt: end };
      }
      const rows = await prisma.reminder.findMany({
        where,
        orderBy: { dueAt: 'asc' },
        take: limit,
        select: {
          id: true, title: true, notes: true, status: true,
          dueAt: true, leadId: true, propertyId: true, createdAt: true,
        },
      });
      return { count: rows.length, items: rows };
    }

    case 'summary_counts': {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const [
        leadsOpen, hotLeads, propertiesActive, dealsOpen,
        remindersPending, remindersToday,
      ] = await Promise.all([
        prisma.lead.count({ where: { agentId: ctx.agentId } }),
        prisma.lead.count({ where: { agentId: ctx.agentId, status: 'HOT' } }),
        prisma.property.count({ where: { agentId: ctx.agentId, status: 'ACTIVE' } }),
        prisma.deal.count({ where: { agentId: ctx.agentId, status: { notIn: ['CLOSED'] as any } } }),
        prisma.reminder.count({ where: { agentId: ctx.agentId, status: 'PENDING' } }),
        prisma.reminder.count({
          where: {
            agentId: ctx.agentId,
            status: 'PENDING',
            dueAt: { gte: start, lt: end },
          },
        }),
      ]);
      return {
        leadsOpen, hotLeads, propertiesActive, dealsOpen,
        remindersPending, remindersToday,
      };
    }

    case 'get_lead': {
      if (!input.id) return { error: 'id required' };
      const row = await prisma.lead.findFirst({
        where: { id: input.id, agentId: ctx.agentId },
      });
      if (!row) return { error: 'not found' };
      return row;
    }

    case 'get_property': {
      if (!input.id) return { error: 'id required' };
      const row = await prisma.property.findFirst({
        where: { id: input.id, agentId: ctx.agentId },
        include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } },
      });
      if (!row) return { error: 'not found' };
      return row;
    }

    case 'search': {
      const q = String(input.q || '').trim();
      if (q.length < 2) return { error: 'q must be at least 2 chars' };
      if (q.length > 80) return { error: 'q too long' };
      const limit = clampLimit(input.limit, 10, 40);
      const [leads, properties] = await Promise.all([
        prisma.lead.findMany({
          where: {
            agentId: ctx.agentId,
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
              { notes: { contains: q, mode: 'insensitive' } },
              { city: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: limit,
          select: {
            id: true, name: true, phone: true, city: true,
            status: true, lookingFor: true, budget: true,
          },
        }),
        prisma.property.findMany({
          where: {
            agentId: ctx.agentId,
            OR: [
              { street: { contains: q, mode: 'insensitive' } },
              { city: { contains: q, mode: 'insensitive' } },
              { owner: { contains: q, mode: 'insensitive' } },
              { notes: { contains: q, mode: 'insensitive' } },
              { neighborhood: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: limit,
          select: {
            id: true, street: true, city: true, neighborhood: true,
            rooms: true, marketingPrice: true, status: true,
          },
        }),
      ]);
      return { leads, properties };
    }

    case 'list_office_members': {
      const me = await prisma.user.findUnique({
        where: { id: ctx.agentId },
        select: { officeId: true },
      });
      if (!me?.officeId) return { office: null, members: [] };
      const members = await prisma.user.findMany({
        where: { officeId: me.officeId, deletedAt: null },
        select: {
          id: true, email: true, displayName: true, role: true,
        },
        orderBy: { displayName: 'asc' },
      });
      return { officeId: me.officeId, members };
    }

    default:
      return { error: `unknown tool: ${name}` };
  }
}
