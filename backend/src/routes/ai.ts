// Voice-to-lead AI route.
//
// The frontend records a short voice memo, uploads it here as multipart
// /audio, and we forward the file to the in-network AI orchestrator
// container (ai/agent/) which runs whisper → dicta → estia-create.
//
// The orchestrator needs to know WHICH agent is creating the row so the
// inserted Lead/Property ends up owned by the caller — we forward the
// authenticated user's id via `X-Agent-Actor-Id`, and the orchestrator
// echoes it back to POST /api/leads with the service token. See
// middleware/service-token.ts for the other half of that flow.

import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { requireUser } from '../middleware/auth.js';
import { requirePremium } from '../middleware/requirePremium.js';
import { logActivity } from '../lib/activity.js';
import { prisma } from '../lib/prisma.js';
import { buildAnthropic } from '../lib/anthropic.js';
import { CHAT_TOOLS, runChatTool } from '../lib/aiChatTools.js';
import { recordAnthropic } from '../lib/aiUsage.js';

const AI_AGENT_URL = (process.env.AI_AGENT_URL || 'http://estia-ai-agent:8080').replace(/\/$/, '');

// 30MB audio cap — at 16kbps opus this is ~4 hours; real agent memos
// are <2 minutes. Anything bigger is probably the wrong file.
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

// 10 req / min per user. Whisper is slow and a stuck client loop
// would otherwise blow through both our upstream quota and the agent's
// patience.
const VOICE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };

export const registerAiRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/voice-lead',
    {
      onRequest: [app.requireAgent],
      config: { rateLimit: VOICE_RATE_LIMIT },
    },
    async (req, reply) => {
      const user = requireUser(req);
      const traceId = crypto.randomUUID();
      const kindRaw = ((req.query as any)?.kind ?? 'LEAD').toString().toUpperCase();
      const kind: 'LEAD' | 'PROPERTY' = kindRaw === 'PROPERTY' ? 'PROPERTY' : 'LEAD';

      const file = await req.file();
      if (!file) {
        return reply.code(400).send({
          error: { message: 'חסר קובץ אודיו', code: 'no_audio', traceId },
        });
      }

      // Buffer the audio so we can (a) enforce the 30MB cap without
      // trusting the client-supplied Content-Length, and (b) stream a
      // fresh Blob to the orchestrator. Streaming multipart straight
      // through Fastify → fetch() is possible but fragile (back-pressure
      // on the agent side hangs the frontend upload) — for <30MB blobs
      // buffering is simpler and fast enough.
      let buffer: Buffer;
      try {
        buffer = await file.toBuffer();
      } catch (e: any) {
        // @fastify/multipart throws FST_REQ_FILE_TOO_LARGE when the
        // configured per-file cap is exceeded. We cap at the route
        // level too (below) so this only fires for the global cap.
        if (e?.code === 'FST_REQ_FILE_TOO_LARGE') {
          return reply.code(413).send({
            error: { message: 'קובץ אודיו גדול מדי', code: 'audio_too_large', traceId },
          });
        }
        throw e;
      }
      if (buffer.byteLength > MAX_AUDIO_BYTES) {
        return reply.code(413).send({
          error: { message: 'קובץ אודיו גדול מדי', code: 'audio_too_large', traceId },
        });
      }
      if (buffer.byteLength === 0) {
        return reply.code(400).send({
          error: { message: 'קובץ אודיו ריק', code: 'empty_audio', traceId },
        });
      }

      // Rebuild a multipart body for the orchestrator. Global FormData +
      // Blob are available on Node 18+ (the backend's runtime target).
      const fd = new FormData();
      const blob = new Blob([buffer], { type: file.mimetype || 'application/octet-stream' });
      fd.append('audio', blob, file.filename || 'audio.webm');

      let upstream: Response;
      try {
        upstream = await fetch(`${AI_AGENT_URL}/process?kind=${kind}`, {
          method: 'POST',
          headers: { 'X-Agent-Actor-Id': user.id },
          body: fd,
        });
      } catch (e: any) {
        req.log.error({ err: e, traceId }, 'ai agent unreachable');
        return reply.code(502).send({
          error: { message: 'שירות ה-AI לא זמין', code: 'ai_unreachable', traceId },
        });
      }

      const upstreamBody = await upstream.text();
      let parsed: any = null;
      try { parsed = JSON.parse(upstreamBody); } catch { /* keep raw */ }

      if (!upstream.ok) {
        req.log.warn({ traceId, status: upstream.status, body: upstreamBody }, 'ai agent error');
        return reply.code(502).send({
          error: {
            message: 'שירות ה-AI החזיר שגיאה',
            code: 'ai_upstream_error',
            traceId,
            upstreamStatus: upstream.status,
          },
        });
      }

      // Audit trail — only when we actually created an entity. Draft
      // mode never reaches the DB (the user will save manually from the
      // edit form, which runs its own logActivity).
      if (parsed?.mode === 'created' && parsed?.created?.id) {
        await logActivity({
          agentId: user.id,
          actorId: user.id,
          verb: 'voice_created',
          entityType: kind === 'LEAD' ? 'Lead' : 'Property',
          entityId: parsed.created.id,
          summary: kind === 'LEAD'
            ? `לקוח נוצר מהקלטת קול: ${parsed.created.name ?? ''}`
            : `נכס נוצר מהקלטת קול: ${parsed.created.street ?? ''} ${parsed.created.city ?? ''}`,
          metadata: { traceId },
        });
      }

      return { ...(parsed ?? { raw: upstreamBody }), traceId };
    }
  );

  // ─── Sprint 5 — AI property-description generator ──────────────────
  //
  // POST /api/ai/describe-property
  //   body: { propertyId: string }
  //   200:  { description: string, highlights: string[] }
  //   401:  not signed in
  //   403:  property belongs to another agent (wrapped as 404 per the
  //         house pattern — see properties.ts for precedent)
  //   404:  property doesn't exist
  //   503:  ANTHROPIC_API_KEY not configured
  //
  // The endpoint loads the property (auth + ownership-scoped), builds a
  // Hebrew marketing prompt with the property's structured facts, and
  // asks Claude Opus 4.7 to draft a ~120-word description plus 5 bullet
  // selling points. We parse out <description>…</description> and
  // <bullet>…</bullet> XML blocks so the model can't accidentally break
  // our JSON contract with stray quotes.
  const describeBody = z.object({
    propertyId: z.string().min(1).max(64),
  });

  app.post(
    '/describe-property',
    {
      // Sprint 5.1 — premium gate. The gate returns 402 for free-tier
      // users; the frontend's api.js interceptor catches it and opens
      // the "שדרגו" dialog with the feature label.
      onRequest: [app.requireAgent, requirePremium({ feature: 'Estia AI' })],
      // Claude calls are slow (5-20s) and each one costs a few cents.
      // 20/min per agent is generous for "I want to regenerate once or
      // twice" while cutting off scripted abuse.
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const user = requireUser(req);
      const { propertyId } = describeBody.parse(req.body);

      const property = await prisma.property.findUnique({
        where: { id: propertyId },
      });
      // Same 404-for-both-cases pattern as properties.ts: don't leak
      // whether the id exists under a different agent.
      if (!property || property.agentId !== user.id) {
        return reply.code(404).send({ error: { message: 'Not found' } });
      }

      const client = buildAnthropic();
      if (!client) {
        return reply.code(503).send({
          error: {
            message: 'שירות ה-AI לא מוגדר — חסר מפתח ANTHROPIC_API_KEY',
            code: 'ai_not_configured',
          },
        });
      }

      // Structured facts-only prompt. The model does a lot better with
      // a key/value dump than with prose like "the property has 4 rooms
      // and…" — fewer hallucinations about fields we didn't supply.
      const facts: string[] = [];
      facts.push(`סוג נכס: ${property.type}`);
      facts.push(`כתובת: ${property.street}, ${property.city}`);
      if (property.rooms != null) facts.push(`חדרים: ${property.rooms}`);
      if (property.sqm) facts.push(`שטח: ${property.sqm} מ״ר`);
      if (property.floor != null) facts.push(`קומה: ${property.floor}${property.totalFloors ? ` מתוך ${property.totalFloors}` : ''}`);
      if (property.marketingPrice) facts.push(`מחיר שיווק: ₪${property.marketingPrice.toLocaleString('he-IL')}`);
      if (property.balconySize) facts.push(`מרפסת: ${property.balconySize} מ״ר`);
      if (property.parking) facts.push(`חניה: כן${property.parkingCount ? ` (${property.parkingCount})` : ''}`);
      if (property.storage) facts.push('מחסן: כן');
      if (property.elevator) facts.push('מעלית: כן');
      if (property.renovated) facts.push(`מצב: ${property.renovated}`);
      if (property.notes) facts.push(`הערות: ${property.notes}`);

      const userPrompt = `יש לכתוב תיאור שיווקי מקצועי לנכס הבא לפרסום באתר נדל"ן (כמו יד2 / מדלן).

פרטי הנכס:
${facts.join('\n')}

הנחיות:
1. כתוב תיאור שיווקי רציף בעברית, בערך 120 מילים, בטון מקצועי אך חם.
2. הוסף 5 נקודות מכירה (bullet points) קצרות — כל אחת שורה אחת, המתמקדת ביתרון ספציפי של הנכס.
3. אל תמציא עובדות שלא הופיעו ברשימה למעלה.
4. החזר את התשובה בפורמט הבא בדיוק:

<description>
[כאן התיאור הרציף]
</description>
<bullet>נקודת מכירה 1</bullet>
<bullet>נקודת מכירה 2</bullet>
<bullet>נקודת מכירה 3</bullet>
<bullet>נקודת מכירה 4</bullet>
<bullet>נקודת מכירה 5</bullet>`;

      // Opus 4.7: adaptive thinking only. No temperature/top_p (would 400).
      // We don't stream — max_tokens is small (~1.5K for ~120 Hebrew
      // words + 5 bullets) so there's no timeout risk.
      let description = '';
      let highlights: string[] = [];
      try {
        // Sprint 10 — marketing copy doesn't need Opus. Sonnet 4.6
        // handles Hebrew prose + 5 bullets at the same quality for
        // ~20% of the price.
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system:
            'אתה כותב תוכן שיווקי מומחה בנדל"ן ישראלי. אתה כותב בעברית טבעית, תקנית, וזורמת. אל תמציא עובדות.',
          messages: [{ role: 'user', content: userPrompt }],
        });
        recordAnthropic({ userId: user.id, feature: 'describe-property', model: 'claude-sonnet-4-6', usage: response.usage as any });

        // Narrow to the first text block. The SDK's ContentBlock union
        // includes `text`, `thinking`, `tool_use` — we only care about
        // the generated copy; tool_use/thinking don't apply here.
        const textBlock = response.content.find((b) => b.type === 'text');
        const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';

        const descMatch = raw.match(/<description>([\s\S]*?)<\/description>/);
        description = (descMatch?.[1] ?? '').trim();
        // Bullet regex — /g so we collect all five.
        highlights = Array.from(raw.matchAll(/<bullet>([\s\S]*?)<\/bullet>/g))
          .map((m) => m[1].trim())
          .filter(Boolean);

        // Fallback: if the model ignored the schema, hand back the raw
        // text as the description rather than an empty object.
        if (!description && raw) description = raw.trim();
      } catch (e: any) {
        req.log.error({ err: e, propertyId }, 'ai describe-property upstream error');
        return reply.code(502).send({
          error: {
            message: 'שירות ה-AI החזיר שגיאה — נסה/י שוב',
            code: 'ai_upstream_error',
          },
        });
      }

      await logActivity({
        agentId: user.id,
        actorId: user.id,
        verb: 'ai_description_generated',
        entityType: 'Property',
        entityId: property.id,
        summary: `תיאור AI נוצר: ${property.street} ${property.city}`,
      });

      return { description, highlights };
    }
  );

  // ─── Sprint 5 — Smart lead ↔ property matcher ──────────────────────
  //
  // GET /api/ai/match-leads?propertyId=<id>
  //   200:  { matches: [{ lead: {...}, score: 0-100, reason: string }] }
  //   401:  not signed in
  //   404:  property doesn't exist / belongs to another agent
  //   503:  ANTHROPIC_API_KEY not configured
  //
  // GET /api/ai/match-properties?leadId=<id>
  //   200:  { matches: [{ property: {...}, score: 0-100, reason: string }] }
  //   401:  not signed in
  //   404:  lead doesn't exist / belongs to another agent
  //   503:  ANTHROPIC_API_KEY not configured
  //
  // Unlike the deterministic `leadMatchesProperty` / `evaluateLeadProperty`
  // helpers (which use hard filter rules), this endpoint sends the full
  // anchor entity + the agent's complete inventory to Claude and asks for
  // the top-5 matches with a soft score (0-100) and a one-line Hebrew
  // reason per match. Useful when the structured rules are too strict
  // (e.g., a lead who "wants רמת גן or קרבה לרמת גן" that the city-name
  // filter misses).
  //
  // Rate-limited more aggressively than describe-property because each
  // call ships more tokens (entire lead/property inventory).
  const matchLeadsQuery = z.object({
    propertyId: z.string().min(1).max(64),
  });
  const matchPropertiesQuery = z.object({
    leadId: z.string().min(1).max(64),
  });

  // Shape the match response. Claude returns XML-tagged blocks so we
  // don't have to rely on JSON mode surviving stray Hebrew quotes.
  type AiMatch<T> = { entity: T; score: number; reason: string };

  function parseMatches(raw: string): { id: string; score: number; reason: string }[] {
    // Each match looks like:
    //   <match id="abc123" score="87">נמצאים בעיר המבוקשת ובטווח התקציב</match>
    const out: { id: string; score: number; reason: string }[] = [];
    const re = /<match\s+id="([^"]+)"\s+score="(\d+)"\s*>([\s\S]*?)<\/match>/g;
    for (const m of raw.matchAll(re)) {
      const id = m[1];
      const score = Math.max(0, Math.min(100, Number(m[2]) || 0));
      const reason = (m[3] || '').trim();
      if (id) out.push({ id, score, reason });
    }
    return out;
  }

  // Compact JSON-ish field dump for the prompt. Keeps only the fields
  // Claude needs to score the match — we strip timestamps / internal
  // ids / large freeform blobs so the token budget stays sane even on
  // agents with hundreds of leads.
  function leadDigest(l: any) {
    return {
      id: l.id,
      name: l.name,
      interestType: l.interestType,
      lookingFor: l.lookingFor,
      city: l.city,
      rooms: l.rooms,
      budget: l.budget,
      priceRangeLabel: l.priceRangeLabel,
      status: l.status,
      notes: l.notes?.slice(0, 200) ?? null,
    };
  }
  function propertyDigest(p: any) {
    return {
      id: p.id,
      assetClass: p.assetClass,
      category: p.category,
      type: p.type,
      city: p.city,
      neighborhood: p.neighborhood,
      street: p.street,
      rooms: p.rooms,
      sqm: p.sqm,
      floor: p.floor,
      marketingPrice: p.marketingPrice,
      parking: p.parking,
      elevator: p.elevator,
      balconySize: p.balconySize,
      notes: p.notes?.slice(0, 200) ?? null,
    };
  }

  async function askClaudeForMatches(
    req: any,
    anchorLabel: string,
    anchor: unknown,
    candidatesLabel: string,
    candidates: unknown[],
  ): Promise<{ id: string; score: number; reason: string }[]> {
    const client = buildAnthropic();
    if (!client) return []; // caller already 503'd

    const prompt = `אתה עוזר לסוכן נדל"ן ישראלי למצוא את 5 ההתאמות הטובות ביותר.

עוגן — ${anchorLabel}:
${JSON.stringify(anchor, null, 2)}

מועמדים — ${candidatesLabel} (${candidates.length}):
${JSON.stringify(candidates, null, 2)}

הנחיות:
1. בחר עד 5 התאמות טובות ביותר מבין המועמדים.
2. לכל התאמה תן ציון 0-100 המבטא כמה היא מתאימה לעוגן.
3. כתוב סיבה קצרה (10-18 מילים) בעברית שמסבירה למה זו התאמה טובה או חלקית.
4. התייחס לקריטריונים מוחשיים: עיר, טווח מחיר/תקציב, חדרים, סוג נכס, ומה שהעוגן מחפש.
5. דרג לפי ציון מהגבוה לנמוך.
6. אל תמציא מועמדים שלא ברשימה. השתמש ב-id המדויק מהרשימה.
7. אם אין אף התאמה טובה באמת, החזר פחות מ-5.

החזר את התשובה בפורמט הבא בדיוק (XML), ללא טקסט נוסף:

<matches>
<match id="ID-של-המועמד" score="87">סיבה קצרה בעברית</match>
<match id="ID-אחר" score="72">סיבה אחרת</match>
</matches>`;

    try {
      // Sprint 10 — pattern matching + XML ranking is squarely in
      // Haiku's wheelhouse: structured output, short reasoning,
      // deterministic scoring. 15× cheaper than Opus per call.
      const response = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system:
          'אתה מומחה התאמת לקוחות לנכסים בישראל. אתה מדייק, לא ממציא עובדות, ומחזיר תשובות בפורמט XML מדויק.',
        messages: [{ role: 'user', content: prompt }],
      });
      recordAnthropic({ userId: requireUser(req).id, feature: 'ai-match', model: 'claude-haiku-4-5', usage: response.usage as any });
      // Content is a discriminated union of TextBlock / ThinkingBlock / etc.
      // Loop and read `.text` only on text blocks so TypeScript narrows.
      let raw = '';
      for (const b of response.content) {
        if (b.type === 'text') { raw = b.text; break; }
      }
      return parseMatches(raw);
    } catch (e: any) {
      req.log.error({ err: e }, 'ai matcher upstream error');
      throw e;
    }
  }

  app.get(
    '/match-leads',
    {
      // Sprint 5.1 — premium gate. See /describe-property for rationale.
      onRequest: [app.requireAgent, requirePremium({ feature: 'Estia AI' })],
      // Heavier than describe-property — a single call can ship a few
      // hundred leads. 10/min is enough for "browse matches" but blocks
      // automated abuse.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const user = requireUser(req);
      const { propertyId } = matchLeadsQuery.parse(req.query);

      const property = await prisma.property.findUnique({
        where: { id: propertyId },
      });
      if (!property || property.agentId !== user.id) {
        return reply.code(404).send({ error: { message: 'Not found' } });
      }

      const client = buildAnthropic();
      if (!client) {
        return reply.code(503).send({
          error: {
            message: 'שירות ה-AI לא מוגדר — חסר מפתח ANTHROPIC_API_KEY',
            code: 'ai_not_configured',
          },
        });
      }

      const leads = await prisma.lead.findMany({
        where: { agentId: user.id },
        orderBy: { updatedAt: 'desc' },
        take: 200, // cap so the prompt stays bounded even for power users
      });

      if (leads.length === 0) {
        return { matches: [] as AiMatch<unknown>[] };
      }

      const digestMap = new Map(leads.map((l) => [l.id, leadDigest(l)]));
      let picked: { id: string; score: number; reason: string }[] = [];
      try {
        picked = await askClaudeForMatches(
          req,
          'נכס',
          propertyDigest(property),
          'לקוחות',
          Array.from(digestMap.values()),
        );
      } catch {
        return reply.code(502).send({
          error: { message: 'שירות ה-AI החזיר שגיאה — נסה/י שוב', code: 'ai_upstream_error' },
        });
      }

      // Join the Claude picks back to the full lead records the UI needs.
      const leadMap = new Map(leads.map((l) => [l.id, l]));
      const matches = picked
        .filter((p) => leadMap.has(p.id))
        .slice(0, 5)
        .map((p) => {
          const l = leadMap.get(p.id)!;
          return {
            lead: {
              id: l.id,
              name: l.name,
              phone: l.phone,
              email: l.email,
              city: l.city,
              budget: l.budget,
              rooms: l.rooms,
              lookingFor: l.lookingFor,
              interestType: l.interestType,
              status: l.status,
            },
            score: p.score,
            reason: p.reason,
          };
        });

      await logActivity({
        agentId: user.id,
        actorId: user.id,
        verb: 'ai_match_leads',
        entityType: 'Property',
        entityId: property.id,
        summary: `התאמות AI ללקוחות (${matches.length})`,
      });

      return { matches };
    }
  );

  app.get(
    '/match-properties',
    {
      // Sprint 5.1 — premium gate.
      onRequest: [app.requireAgent, requirePremium({ feature: 'Estia AI' })],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const user = requireUser(req);
      const { leadId } = matchPropertiesQuery.parse(req.query);

      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead || lead.agentId !== user.id) {
        return reply.code(404).send({ error: { message: 'Not found' } });
      }

      const client = buildAnthropic();
      if (!client) {
        return reply.code(503).send({
          error: {
            message: 'שירות ה-AI לא מוגדר — חסר מפתח ANTHROPIC_API_KEY',
            code: 'ai_not_configured',
          },
        });
      }

      const props = await prisma.property.findMany({
        where: { agentId: user.id, status: 'ACTIVE' },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      });

      if (props.length === 0) {
        return { matches: [] as AiMatch<unknown>[] };
      }

      let picked: { id: string; score: number; reason: string }[] = [];
      try {
        picked = await askClaudeForMatches(
          req,
          'לקוח',
          leadDigest(lead),
          'נכסים',
          props.map(propertyDigest),
        );
      } catch {
        return reply.code(502).send({
          error: { message: 'שירות ה-AI החזיר שגיאה — נסה/י שוב', code: 'ai_upstream_error' },
        });
      }

      const propMap = new Map(props.map((p) => [p.id, p]));
      const matches = picked
        .filter((p) => propMap.has(p.id))
        .slice(0, 5)
        .map((p) => {
          const property = propMap.get(p.id)!;
          return {
            property: {
              id: property.id,
              assetClass: property.assetClass,
              category: property.category,
              type: property.type,
              city: property.city,
              neighborhood: property.neighborhood,
              street: property.street,
              rooms: property.rooms,
              marketingPrice: property.marketingPrice,
              sqm: property.sqm,
              floor: property.floor,
            },
            score: p.score,
            reason: p.reason,
          };
        });

      await logActivity({
        agentId: user.id,
        actorId: user.id,
        verb: 'ai_match_properties',
        entityType: 'Lead',
        entityId: lead.id,
        summary: `התאמות AI לנכסים (${matches.length})`,
      });

      return { matches };
    }
  );

  // ─── Sprint 7 — Pre-meeting AI brief ───────────────────────────────
  //
  // POST /api/ai/meeting-brief { meetingId }
  //   200:  { brief, checklist: string[], talkingPoints: string[] }
  //   401:  not signed in
  //   404:  meeting doesn't exist / belongs to another agent
  //   503:  ANTHROPIC_API_KEY not configured
  //
  // Loads the meeting + its lead + up to 20 of the agent's recent
  // ACTIVE properties, hands the whole pack to Claude Opus 4.7, and
  // asks for a structured Hebrew prep card: a short paragraph brief,
  // a bullet-list checklist (things to bring / prepare), and a list
  // of conversation points tailored to the lead's profile.
  const meetingBriefBody = z.object({
    meetingId: z.string().min(1).max(64),
  });

  app.post(
    '/meeting-brief',
    {
      onRequest: [app.requireAgent, requirePremium({ feature: 'Estia AI' })],
      // Single Claude call per invocation; 20/min matches describe-property.
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const user = requireUser(req);
      const { meetingId } = meetingBriefBody.parse(req.body);

      const meeting = await prisma.leadMeeting.findUnique({
        where: { id: meetingId },
        include: { lead: true },
      });
      if (!meeting || meeting.agentId !== user.id) {
        return reply.code(404).send({ error: { message: 'Not found' } });
      }

      const client = buildAnthropic();
      if (!client) {
        return reply.code(503).send({
          error: {
            message: 'שירות ה-AI לא מוגדר — חסר מפתח ANTHROPIC_API_KEY',
            code: 'ai_not_configured',
          },
        });
      }

      // Pull a handful of recent ACTIVE properties. The brief references
      // "which of your active listings might fit" — capping at 20 keeps
      // the prompt bounded even for power users.
      const recentProperties = await prisma.property.findMany({
        where: { agentId: user.id, status: 'ACTIVE' },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });

      const lead = meeting.lead;
      const leadFacts: string[] = [];
      if (lead?.name) leadFacts.push(`שם: ${lead.name}`);
      if (lead?.phone) leadFacts.push(`טלפון: ${lead.phone}`);
      if (lead?.city) leadFacts.push(`עיר: ${lead.city}`);
      if (lead?.budget) leadFacts.push(`תקציב: ₪${lead.budget.toLocaleString('he-IL')}`);
      if (lead?.rooms != null) leadFacts.push(`חדרים: ${lead.rooms}`);
      if (lead?.lookingFor) leadFacts.push(`מחפש: ${lead.lookingFor === 'BUY' ? 'קנייה' : 'שכירות'}`);
      if (lead?.interestType) leadFacts.push(`סוג עניין: ${lead.interestType}`);
      if (lead?.status) leadFacts.push(`סטטוס: ${lead.status}`);
      if (lead?.notes) leadFacts.push(`הערות: ${lead.notes.slice(0, 300)}`);

      const propertySummaries = recentProperties.map((p) => {
        const price = p.marketingPrice ? `₪${p.marketingPrice.toLocaleString('he-IL')}` : '—';
        return `- ${p.street || ''} ${p.city || ''} · ${p.rooms ?? '?'} חד׳ · ${price}`;
      }).join('\n');

      const userPrompt = `הכן brief קצר לקראת פגישה עם לקוח נדל"ן.

פרטי הפגישה:
- כותרת: ${meeting.title}
- מועד: ${meeting.startsAt.toISOString()}
${meeting.location ? `- מיקום: ${meeting.location}` : ''}
${meeting.notes ? `- הערות הסוכן: ${meeting.notes.slice(0, 400)}` : ''}

פרטי הלקוח:
${leadFacts.length ? leadFacts.join('\n') : '(אין פרטים מלאים)'}

נכסים פעילים של הסוכן (עד 20 האחרונים):
${propertySummaries || '(אין נכסים פעילים)'}

הנחיות:
1. כתוב brief קצר (3-4 משפטים בעברית) שמסכם מי הלקוח, מה הוא מחפש, ומה המטרה המיידית של הפגישה.
2. הוסף צ'ק-ליסט של 4-6 פריטים פרקטיים להכנה לפגישה.
3. הוסף 4-6 נקודות שיחה (talking points) שיעזרו לסוכן להוביל את השיחה — התייחס לפרטי הלקוח ולנכסים הרלוונטיים אם יש כאלה.
4. אל תמציא עובדות שלא ברשימה.
5. החזר את התשובה בפורמט XML הזה בדיוק, ללא טקסט נוסף:

<brief>[הפסקה של ה-brief]</brief>
<check>פריט 1</check>
<check>פריט 2</check>
<check>פריט 3</check>
<check>פריט 4</check>
<point>נקודת שיחה 1</point>
<point>נקודת שיחה 2</point>
<point>נקודת שיחה 3</point>
<point>נקודת שיחה 4</point>`;

      let brief = '';
      let checklist: string[] = [];
      let talkingPoints: string[] = [];
      try {
        // Sprint 10 — meeting brief: structured output, short. Sonnet.
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system:
            'אתה יועץ מכירות בכיר בתחום הנדל"ן הישראלי. אתה מכין briefs מקצועיים, קצרים ופרקטיים, בעברית טבעית. אל תמציא עובדות.',
          messages: [{ role: 'user', content: userPrompt }],
        });
        recordAnthropic({ userId: user.id, feature: 'meeting-brief', model: 'claude-sonnet-4-6', usage: response.usage as any });
        const textBlock = response.content.find((b) => b.type === 'text');
        const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';

        const briefMatch = raw.match(/<brief>([\s\S]*?)<\/brief>/);
        brief = (briefMatch?.[1] ?? '').trim();
        checklist = Array.from(raw.matchAll(/<check>([\s\S]*?)<\/check>/g))
          .map((m) => m[1].trim())
          .filter(Boolean);
        talkingPoints = Array.from(raw.matchAll(/<point>([\s\S]*?)<\/point>/g))
          .map((m) => m[1].trim())
          .filter(Boolean);

        // Fallback: if the model ignored the schema, hand back the raw
        // text as the brief rather than an empty payload.
        if (!brief && raw) brief = raw.trim();
      } catch (e: any) {
        req.log.error({ err: e, meetingId }, 'ai meeting-brief upstream error');
        return reply.code(502).send({
          error: {
            message: 'שירות ה-AI החזיר שגיאה — נסה/י שוב',
            code: 'ai_upstream_error',
          },
        });
      }

      await logActivity({
        agentId: user.id,
        actorId: user.id,
        verb: 'ai_meeting_brief',
        entityType: 'LeadMeeting',
        entityId: meeting.id,
        summary: `brief לפגישה נוצר: ${meeting.title}`,
      });

      return { brief, checklist, talkingPoints };
    }
  );

  // ─── Sprint 7 — Buyer-offer review ─────────────────────────────────
  //
  // POST /api/ai/offer-review { dealId, offerAmount }
  //   200:  { recommendedCounter, confidence, reasoning }
  //   401 / 404 / 503: same pattern as meeting-brief.
  //
  // Loads the deal + its linked property + up to 10 comparable nearby
  // properties (same city, same asset class) and asks Claude for a
  // counter-price recommendation with reasoning + confidence chip.
  const offerReviewBody = z.object({
    dealId: z.string().min(1).max(64),
    offerAmount: z.number().int().positive(),
  });

  app.post(
    '/offer-review',
    {
      onRequest: [app.requireAgent, requirePremium({ feature: 'Estia AI' })],
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const user = requireUser(req);
      const { dealId, offerAmount } = offerReviewBody.parse(req.body);

      const deal = await prisma.deal.findUnique({
        where: { id: dealId },
        include: { property: true },
      });
      if (!deal || deal.agentId !== user.id) {
        return reply.code(404).send({ error: { message: 'Not found' } });
      }

      const client = buildAnthropic();
      if (!client) {
        return reply.code(503).send({
          error: {
            message: 'שירות ה-AI לא מוגדר — חסר מפתח ANTHROPIC_API_KEY',
            code: 'ai_not_configured',
          },
        });
      }

      // Comparable nearby properties — same city + asset class, bound to
      // the agent's inventory (we only have rights to read their own
      // listings). Excludes the deal's own property if it's linked.
      const comps = await prisma.property.findMany({
        where: {
          agentId: user.id,
          city: deal.city,
          assetClass: deal.assetClass,
          NOT: deal.propertyId ? { id: deal.propertyId } : undefined,
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      });

      const compsText = comps.map((p) => {
        const price = p.marketingPrice ? `₪${p.marketingPrice.toLocaleString('he-IL')}` : '—';
        const rooms = p.rooms != null ? `${p.rooms} חד׳` : '?';
        const sqm = p.sqm ? `${p.sqm} מ״ר` : '?';
        return `- ${p.street || ''} · ${rooms} · ${sqm} · ${price}`;
      }).join('\n');

      const userPrompt = `עזור לסוכן נדל"ן להעריך הצעת קונה ולהציע מחיר נגדי.

פרטי העסקה:
- נכס: ${deal.propertyStreet}, ${deal.city}
- סוג: ${deal.assetClass === 'COMMERCIAL' ? 'מסחרי' : 'מגורים'} · ${deal.category === 'SALE' ? 'מכירה' : 'השכרה'}
- מחיר שיווק: ₪${deal.marketingPrice.toLocaleString('he-IL')}
${deal.property?.sqm ? `- שטח: ${deal.property.sqm} מ״ר` : ''}
${deal.property?.rooms != null ? `- חדרים: ${deal.property.rooms}` : ''}
${deal.property?.floor != null ? `- קומה: ${deal.property.floor}` : ''}

הצעת הקונה: ₪${offerAmount.toLocaleString('he-IL')}

השוואה לנכסים דומים באזור:
${compsText || '(אין נכסים להשוואה)'}

הנחיות:
1. הצע מחיר נגדי סביר (מספר שלם בש"ח) שקרוב למחיר השיווק אך לוקח בחשבון את הפער מההצעה ואת נתוני ההשוואה.
2. תן רמת ביטחון: low / medium / high.
3. נמק ב-2-3 משפטים קצרים בעברית — התייחס לפער מההצעה, להשוואה, ולנסיבות הנראות מהנתונים.
4. אל תמציא עובדות.
5. החזר בפורמט XML הזה בדיוק, ללא טקסט נוסף:

<counter>מספר שלם בלבד</counter>
<confidence>low|medium|high</confidence>
<reasoning>הנימוק בעברית</reasoning>`;

      let recommendedCounter = deal.marketingPrice;
      let confidence: 'low' | 'medium' | 'high' = 'low';
      let reasoning = '';
      try {
        // Sprint 10 — offer-review: price reasoning, needs some
        // nuance. Sonnet is the right tier (not Haiku).
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          system:
            'אתה יועץ מחיר לסוכני נדל"ן בישראל. אתה מדייק, מחושב, ולא ממציא עובדות. אתה מחזיר תשובות בפורמט XML מדויק.',
          messages: [{ role: 'user', content: userPrompt }],
        });
        recordAnthropic({ userId: user.id, feature: 'offer-review', model: 'claude-sonnet-4-6', usage: response.usage as any });
        const textBlock = response.content.find((b) => b.type === 'text');
        const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';

        const counterMatch = raw.match(/<counter>\s*(\d+)\s*<\/counter>/);
        if (counterMatch) {
          const n = parseInt(counterMatch[1], 10);
          if (Number.isFinite(n) && n > 0) recommendedCounter = n;
        }
        const confMatch = raw.match(/<confidence>\s*(low|medium|high)\s*<\/confidence>/i);
        if (confMatch) confidence = confMatch[1].toLowerCase() as typeof confidence;
        const reasonMatch = raw.match(/<reasoning>([\s\S]*?)<\/reasoning>/);
        reasoning = (reasonMatch?.[1] ?? '').trim();
      } catch (e: any) {
        req.log.error({ err: e, dealId }, 'ai offer-review upstream error');
        return reply.code(502).send({
          error: {
            message: 'שירות ה-AI החזיר שגיאה — נסה/י שוב',
            code: 'ai_upstream_error',
          },
        });
      }

      await logActivity({
        agentId: user.id,
        actorId: user.id,
        verb: 'ai_offer_review',
        entityType: 'Deal',
        entityId: deal.id,
        summary: `סקירת הצעת AI: ₪${offerAmount.toLocaleString('he-IL')} → ₪${recommendedCounter.toLocaleString('he-IL')}`,
      });

      return { recommendedCounter, confidence, reasoning };
    }
  );

  // ─── Sprint 7 — Estia AI chat (/ai page) ───────────────────────────
  //
  // POST /api/ai/chat { messages: [{role, content}] }
  //   200:  { reply }
  //   401 / 503: standard.
  //
  // Open-ended chat — single-session, no server-side history. The
  // frontend keeps the transcript in local state and replays it on
  // every call so Claude sees the full context.
  const chatBody = z.object({
    messages: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      // 4,000 chars per message is already a generous essay — stops
      // runaway paste-the-whole-CSV-into-chat behavior from blowing up
      // the prompt budget.
      content: z.string().min(1).max(4000),
    })).min(1).max(40),
  });

  app.post(
    '/chat',
    {
      onRequest: [app.requireAgent, requirePremium({ feature: 'Estia AI' })],
      // Chat is the most-used surface; allow a little more headroom than
      // the one-shot analysis endpoints. 30/min per agent is enough for
      // an active conversation but cuts off scripted abuse.
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const user = requireUser(req);
      const { messages } = chatBody.parse(req.body);

      const client = buildAnthropic();
      if (!client) {
        return reply.code(503).send({
          error: {
            message: 'שירות ה-AI לא מוגדר — חסר מפתח ANTHROPIC_API_KEY',
            code: 'ai_not_configured',
          },
        });
      }

      // Sprint 10 — tool-use loop. Claude now has read-only access to
      // the signed-in agent's book (leads, properties, deals,
      // reminders, office members, free-text search, summary counts)
      // via the CHAT_TOOLS schemas in lib/aiChatTools.ts. All tool
      // calls are agentId-scoped; none of them write.
      //
      // Loop termination: Anthropic returns stop_reason="tool_use"
      // until it has enough context to answer, then "end_turn" with
      // the final assistant text. We cap at 6 iterations so a
      // pathological "keep calling tools forever" run can't burn
      // credits. A single user turn rarely needs >3 tool calls for
      // CRM questions.
      const SYSTEM = [
        'אתה Estia AI — עוזר אישי לסוכני נדל"ן ישראלים. חשוב/י על עצמך כעל יד-ימין של הסוכן/ת: ניסיון בשוק, היכרות עם תרבות העבודה המקומית, והבנה שאין שתי עיסקאות זהות.',
        '',
        '# שפה וטון',
        '- ענה/י בעברית רהוטה וקצרה. בלי פראזות מנופחות ובלי הקדמות ארוכות.',
        '- התייחס/י לסוכן/ת בגוף שני ("לך", "אצלך") כדי שהתשובה תישמע אישית.',
        '- השתמש/י במונחים מקצועיים מהשוק הישראלי: "בלעדיות", "מ״ר", "ועד בית", "טאבו", "גוש/חלקה", "מדד תשומות", "מחיר שיווק / מחיר סגירה".',
        '- כשמדובר במספרי טלפון או מחירים — הצג/י בפורמט קריא (₪2,850,000, 054-1234567).',
        '',
        '# גישה לנתונים',
        '- יש לך גישת קריאה בלבד לנתוני הסוכן/ת המחובר/ת דרך הכלים (tools).',
        '- השתמש/י בכלים כל פעם שהשאלה דורשת נתונים אמיתיים ("כמה לידים חמים יש לי", "מה הנכסים שלי בתל אביב", "מה התזכורות להיום").',
        '- קודם תקרא/י את הנתונים, ורק אחר כך תנסח/י תשובה מבוססת. אל תמציא/י מספרים או שמות.',
        '- אם הכלי החזיר רשימה ריקה — אמור/י זאת במפורש.',
        '- לעולם אל תחזיר/י מזהים ארוכים (id). העדף/י שם + עיר + טלפון.',
        '',
        '# פורמט התשובה',
        '- כשיש 3+ פריטים עם 2+ תכונות (לידים, נכסים, עסקאות, פגישות) — הצג/י כ-**טבלת Markdown** (`| עמודה | עמודה |`) עם כותרות ברורות בעברית. הטבלה קריאה יותר מרשימת bullet-ים.',
        '- כשיש עד 3 פריטים פשוטים — רשימת bullet-ים (`- `) זה בסדר.',
        '- השתמש/י ב-**מודגש** (כוכביות כפולות) כדי להדגיש מספרים, שמות עיר, סטטוסים חשובים.',
        '- השתמש/י בכותרות `### ` כשאתה/את מחלק/ת תשובה לסקציות (לפי חום ליד, לפי עיר וכו׳).',
        '- אימוג׳ים מותרים במידה וזה קריא: 🔥 חם · ☀️ פושר · ❄️ קר, 🏠 נכס, 📞 טלפון, 📅 פגישה. אל תגזים/י.',
        '- סיים/י כל תשובה עם שורה של "רוצה ש…" כשיש המשך טבעי (להכין הודעה קבוצתית, לפתוח תזכורת, לחפש התאמות וכו׳).',
        '',
        '# מה לא לעשות',
        '- אל תמציא/י עובדות, מספרים, שמות, או תאריכים.',
        '- אל תחזיר/י JSON גולמי ללקוח — הסוכן/ת לא מפתח/ת.',
        '- אל תסביר/י איך הכלים עובדים ("אני שולף/ת מ-database") — ענה/י מהבטן כאילו הכרת את הלקוחות שנים.',
      ].join('\n');

      type ContentBlock =
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, any> };
      type AssistantMsg = { role: 'assistant'; content: ContentBlock[] };
      type UserMsg = { role: 'user'; content: string | Array<{ type: 'tool_result'; tool_use_id: string; content: string }> };

      const convo: Array<AssistantMsg | UserMsg> =
        messages.map((m) => ({ role: m.role, content: m.content } as any));

      // Prompt-caching: the system prompt + tool schemas are the same
      // on every turn, so tagging them with `cache_control: ephemeral`
      // drops the billed-input cost on the second+ request to ~10% of
      // normal. The last tool entry carries the marker; everything
      // above it in the tools array gets cached by the server.
      const systemCached = [
        { type: 'text' as const, text: SYSTEM, cache_control: { type: 'ephemeral' as const } },
      ];
      const toolsCached = CHAT_TOOLS.map((t, i) => (
        i === CHAT_TOOLS.length - 1
          ? { ...t, cache_control: { type: 'ephemeral' as const } }
          : t
      ));

      let replyText = '';
      try {
        for (let iter = 0; iter < 6; iter += 1) {
          // Sprint 10 — Sonnet 4.6 is the right tier for this
          // surface: tool-use + Hebrew writing + CRM Q&A don't need
          // Opus-level reasoning, and it's 5× cheaper per call.
          const response = await client.messages.create({
            model: 'claude-sonnet-4-6',
            // Tightened from 2048 → 1024. The chat replies that hit
            // the previous ceiling were almost always runaway table
            // regens; capping halves the worst-case output cost
            // without clipping normal conversational answers.
            max_tokens: 1024,
            system: systemCached as any,
            tools: toolsCached as any,
            messages: convo as any,
          });

          // Observability — one row per LLM round-trip.
          recordAnthropic({
            userId: user.id,
            feature: 'chat',
            model: 'claude-sonnet-4-6',
            usage: response.usage as any,
          });

          // Record the assistant turn (blocks verbatim so tool_use ids
          // stay matched with the tool_result we send back next).
          const assistantBlocks = response.content as ContentBlock[];
          convo.push({ role: 'assistant', content: assistantBlocks });

          if (response.stop_reason !== 'tool_use') {
            const text = assistantBlocks
              .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
              .map((b) => b.text)
              .join('\n')
              .trim();
            replyText = text;
            break;
          }

          // Run every tool_use block in parallel, then feed the
          // results back as a single user turn.
          const toolUses = assistantBlocks.filter(
            (b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use',
          );
          const results = await Promise.all(
            toolUses.map(async (tu) => {
              try {
                const out = await runChatTool(tu.name, tu.input || {}, { agentId: user.id });
                return {
                  type: 'tool_result' as const,
                  tool_use_id: tu.id,
                  content: JSON.stringify(out),
                };
              } catch (e: any) {
                req.log.warn({ err: e, tool: tu.name }, 'chat tool failed');
                return {
                  type: 'tool_result' as const,
                  tool_use_id: tu.id,
                  content: JSON.stringify({ error: e?.message || 'tool failed' }),
                };
              }
            }),
          );
          convo.push({ role: 'user', content: results });
        }

        if (!replyText) {
          replyText = 'לא הצלחתי להרכיב תשובה. נסו/י לנסח את השאלה שוב.';
        }
      } catch (e: any) {
        req.log.error({ err: e }, 'ai chat upstream error');
        return reply.code(502).send({
          error: {
            message: 'שירות ה-AI החזיר שגיאה — נסה/י שוב',
            code: 'ai_upstream_error',
          },
        });
      }

      return { reply: replyText };
    }
  );
};
