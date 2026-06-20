// The 10 Estia chat tools, re-expressed as LangChain `tool()`s.
//
// Each tool's Zod schema MIRRORS the corresponding CHAT_TOOLS
// input_schema in backend/src/lib/aiChatTools.ts (same fields, same
// enums, same required-ness, same descriptions). The execute function
// does NOT touch the DB — it POSTs { name, input } to the Estia
// internal endpoint via callEstiaTool() and returns the JSON result.
//
// Agent identity: LangChain passes the run config as the 2nd arg to
// each tool callback. We read `config.configurable.agentId` (threaded
// in by graph.ts from the run config) and forward it to the backend.
// See estiaClient.ts for the production per-agent-token TODO.
//
// Tool execute() must return a STRING (LangChain stringifies tool
// output into a ToolMessage). We JSON.stringify the backend result so
// the model sees the same payload shape the in-app agent fed back as a
// `tool_result` content block.

import { tool } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import { z } from 'zod';
import { callEstiaTool } from './estiaClient.js';

// Pull the per-run agent identity off the LangGraph run config.
// graph.ts sets config.configurable.agentId for every invocation.
function agentIdFrom(config?: RunnableConfig): string {
  const id = (config?.configurable as Record<string, unknown> | undefined)?.agentId;
  if (typeof id !== 'string' || !id) {
    throw new Error(
      'agentId missing from run config.configurable — the graph must be ' +
        'invoked with { configurable: { agentId } }',
    );
  }
  return id;
}

// Helper: build a tool whose execute forwards to the Estia backend.
// `name` is sent to the backend verbatim and must match a CHAT_TOOLS
// entry there.
function estiaTool<S extends z.ZodObject<any>>(opts: {
  name: string;
  description: string;
  schema: S;
}) {
  return tool(
    async (input: z.infer<S>, config?: RunnableConfig): Promise<string> => {
      const agentId = agentIdFrom(config);
      const result = await callEstiaTool(
        opts.name,
        (input ?? {}) as Record<string, unknown>,
        agentId,
        config?.signal,
      );
      return JSON.stringify(result);
    },
    {
      name: opts.name,
      description: opts.description,
      schema: opts.schema,
    },
  );
}

// ─── list_leads ──────────────────────────────────────────────────────
const listLeads = estiaTool({
  name: 'list_leads',
  description:
    'List the agent\'s leads (buyers/renters). Returns newest first. Filter by city, status (HOT/WARM/COLD), or lookingFor (BUY/RENT). Call this to answer "how many leads", "show me hot leads", "who wants to buy in Tel Aviv".',
  schema: z.object({
    city: z.string().optional().describe('Hebrew city name — exact match.'),
    status: z.enum(['HOT', 'WARM', 'COLD']).optional().describe('Thermal rating.'),
    lookingFor: z.enum(['BUY', 'RENT']).optional().describe('Buyer or renter.'),
    limit: z.number().optional().describe('Max rows to return (1–100, default 20).'),
  }),
});

// ─── list_properties ─────────────────────────────────────────────────
const listProperties = estiaTool({
  name: 'list_properties',
  description:
    'List the agent\'s properties (listings). Newest first. Filter by city, category (SALE/RENT), or status. Use this for "my listings", "properties in Jerusalem", "what\'s for rent".',
  schema: z.object({
    city: z.string().optional(),
    category: z.enum(['SALE', 'RENT']).optional(),
    status: z
      .string()
      .optional()
      .describe(
        'PropertyStatus enum (ACTIVE/PAUSED/SOLD/RENTED/INACTIVE/CANCELLED/IN_DEAL/ARCHIVED).',
      ),
    limit: z.number().optional().describe('Max rows (1–100, default 20).'),
  }),
});

// ─── list_deals ──────────────────────────────────────────────────────
const listDeals = estiaTool({
  name: 'list_deals',
  description:
    'List the agent\'s deals (transactions). Filter by status (NEGOTIATING/WAITING_MORTGAGE/PENDING_CONTRACT/SIGNED/CLOSED).',
  schema: z.object({
    status: z.string().optional(),
    limit: z.number().optional(),
  }),
});

// ─── list_reminders ──────────────────────────────────────────────────
const listReminders = estiaTool({
  name: 'list_reminders',
  description:
    'List the agent\'s reminders. Filter by status (PENDING/COMPLETED/CANCELLED) or `dueToday: true` to get only today\'s pending items.',
  schema: z.object({
    status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
    dueToday: z
      .boolean()
      .optional()
      .describe('Only return PENDING reminders whose dueAt is in the user\'s local today.'),
    limit: z.number().optional(),
  }),
});

// ─── summary_counts ──────────────────────────────────────────────────
const summaryCounts = estiaTool({
  name: 'summary_counts',
  description:
    'Top-line CRM counts for the signed-in agent: open leads, active properties, open deals, pending reminders, hot leads, today\'s reminders. Zero-arg. Use when asked "give me an overview" or "how is my book".',
  schema: z.object({}),
});

// ─── get_lead ────────────────────────────────────────────────────────
const getLead = estiaTool({
  name: 'get_lead',
  description: 'Fetch one lead by id (returns full detail).',
  schema: z.object({
    id: z.string(),
  }),
});

// ─── get_property ────────────────────────────────────────────────────
const getProperty = estiaTool({
  name: 'get_property',
  description: 'Fetch one property by id (returns full detail).',
  schema: z.object({
    id: z.string(),
  }),
});

// ─── search ──────────────────────────────────────────────────────────
const search = estiaTool({
  name: 'search',
  description:
    'Free-text search across the agent\'s leads and properties. Matches on lead name/phone/notes and property street/city/owner/notes. Use this when the question contains a person\'s name or a partial address.',
  schema: z.object({
    q: z.string().describe('Needle — 2–80 characters.'),
    limit: z.number().optional(),
  }),
});

// ─── list_office_members ─────────────────────────────────────────────
const listOfficeMembers = estiaTool({
  name: 'list_office_members',
  description:
    'List the other members of the caller\'s office (only works for OWNER/AGENT users attached to an office). Returns id, name, role, email.',
  schema: z.object({}),
});

// ─── lookup_feature ──────────────────────────────────────────────────
const lookupFeature = estiaTool({
  name: 'lookup_feature',
  description:
    'Look up how to do something in the Estia CRM — which page to visit, which button to click, what label the button has, what dialog it opens. ALWAYS call this FIRST when the user asks "how do I X", "where is X", "how do I share/send/create X", "how do I get to X", "what button do I press for X". Pass the user\'s question (Hebrew or English) verbatim as `query`. Returns the top matching catalog entries with exact button labels, page paths, and step-by-step Hebrew instructions. Do NOT guess or paraphrase — quote the labels and page paths the tool returns. If the tool returns no good match (top score < 5), tell the user you\'re not sure and point them to /help.',
  schema: z.object({
    query: z
      .string()
      .describe(
        'The user\'s question or topic, e.g. "איך משתפים נכס בוואטסאפ", "create lead", "delete account".',
      ),
    limit: z.number().optional().describe('Max entries to return (1–8, default 5).'),
  }),
});

// All 10 tools, in the same order as CHAT_TOOLS.
export const ESTIA_TOOLS = [
  listLeads,
  listProperties,
  listDeals,
  listReminders,
  summaryCounts,
  getLead,
  getProperty,
  search,
  listOfficeMembers,
  lookupFeature,
];
