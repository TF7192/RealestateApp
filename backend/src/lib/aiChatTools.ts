// Read-only DB tool-suite for /api/ai/chat so Claude can answer
// data-aware questions about the signed-in agent's book ("כמה לידים
// חמים יש לי בתל אביב?", "תראה לי את הנכסים שהוסיפו השבוע").
//
// All tool executions are agentId-scoped — the tools never see rows
// belonging to other agents, and they never write. The whole point is
// a demo-safe AI surface for דנה לוי; keeping this layer pure-read
// means it stays safe even if the model hallucinates a call.
//
// One tool is *not* DB-scoped: `lookup_feature`. It reads the static
// catalog at src/data/featureGuide.json (every CRM page, button,
// dialog, and how-to) so Claude can answer "איך עושים X" with the
// exact button name and page path instead of guessing from training.
// The catalog is loaded once at module init and cached in memory.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import { prisma } from './prisma.js';

// ─── Feature-guide catalog (loaded once at module init) ──────────────
type CatalogEntry = {
  id: string;
  feature: string;
  category: string;
  page: string;
  pageFile: string;
  howTo: string;
  buttons: Array<{ label: string; where: string; does: string }>;
  prerequisites: string;
  premium: boolean;
  keywords: string[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FEATURE_GUIDE: CatalogEntry[] = JSON.parse(
  readFileSync(resolve(__dirname, '../data/featureGuide.json'), 'utf8'),
) as CatalogEntry[];

// Tokenize a Hebrew/English query into a set of normalised lowercase
// tokens. Drops punctuation, splits on whitespace + common separators.
// Hebrew letters are unicode-stable through toLowerCase (no-op).
function tokenize(s: string): string[] {
  return String(s || '')
    .toLowerCase()
    .split(/[\s,.;:!?'"()[\]{}\-/\\<>=+|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

// Score one catalog entry against a query's tokens. Higher weight on
// the structured fields (feature title, keywords, button labels) than
// on prose (howTo). Exact token matches beat substring matches — that
// way "מחיקת חשבון" hits the settings entry (keyword: "חשבון") instead
// of the calculator entry whose feature title contains "מחשבון".
function scoreEntry(entry: CatalogEntry, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const featureTokens = tokenize(entry.feature);
  // Split each keyword (which may be a multi-word phrase like "גלגל שיניים")
  // into atomic tokens so a single-word query still gets an exact-token hit.
  const keywordTokens = entry.keywords.flatMap((k) => tokenize(k));
  const buttonTokens = tokenize(entry.buttons.map((b) => `${b.label} ${b.does}`).join(' '));
  const howToTokens = tokenize(entry.howTo);
  const pageHay = entry.page.toLowerCase();
  // Substring haystacks for "fuzzier" matches (Hebrew inflection, missing nikud).
  const featureHay = entry.feature.toLowerCase();
  const keywordHay = keywordTokens.join(' ');
  const buttonHay = entry.buttons.map((b) => `${b.label} ${b.does}`).join(' ').toLowerCase();
  const howToHay = entry.howTo.toLowerCase();
  let score = 0;
  for (const tok of tokens) {
    // Keywords: exact token match is the strongest signal — these are
    // hand-curated so an exact hit means the entry is on-topic.
    if (keywordTokens.some((k) => k === tok)) score += 10;
    else if (keywordHay.includes(tok)) score += 4;
    // Feature title: exact token > substring.
    if (featureTokens.some((t) => t === tok)) score += 7;
    else if (featureHay.includes(tok)) score += 3;
    // Button labels.
    if (buttonTokens.some((t) => t === tok)) score += 4;
    else if (buttonHay.includes(tok)) score += 2;
    // HowTo prose.
    if (howToTokens.some((t) => t === tok)) score += 2;
    else if (howToHay.includes(tok)) score += 1;
    // Page path.
    if (pageHay.includes(tok)) score += 1;
  }
  return score;
}

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
  {
    name: 'lookup_feature',
    description: 'Look up how to do something in the Estia CRM — which page to visit, which button to click, what label the button has, what dialog it opens. ALWAYS call this FIRST when the user asks "how do I X", "where is X", "how do I share/send/create X", "how do I get to X", "what button do I press for X". Pass the user\'s question (Hebrew or English) verbatim as `query`. Returns the top matching catalog entries with exact button labels, page paths, and step-by-step Hebrew instructions. Do NOT guess or paraphrase — quote the labels and page paths the tool returns. If the tool returns no good match (top score < 5), tell the user you\'re not sure and point them to /help.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The user\'s question or topic, e.g. "איך משתפים נכס בוואטסאפ", "create lead", "delete account".' },
        limit: { type: 'number', description: 'Max entries to return (1–8, default 5).' },
      },
      required: ['query'],
    },
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

    case 'lookup_feature': {
      const query = String(input.query || '').slice(0, 200);
      const limit = clampLimit(input.limit, 5, 8);
      const tokens = tokenize(query);
      if (tokens.length === 0) {
        return { count: 0, items: [], note: 'empty query' };
      }
      // Score every entry, keep the ones that scored at all, sort
      // descending. The model decides whether the top score is
      // "good enough" — we expose the score so it can.
      const scored = FEATURE_GUIDE
        .map((entry) => ({ score: scoreEntry(entry, tokens), entry }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      return {
        count: scored.length,
        topScore: scored[0]?.score ?? 0,
        items: scored.map((x) => ({ score: x.score, ...x.entry })),
      };
    }

    default:
      return { error: `unknown tool: ${name}` };
  }
}
