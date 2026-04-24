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
        const response = await client.messages.create({
          model: 'claude-opus-4-7',
          max_tokens: 2048,
          system:
            'אתה כותב תוכן שיווקי מומחה בנדל"ן ישראלי. אתה כותב בעברית טבעית, תקנית, וזורמת. אל תמציא עובדות.',
          messages: [{ role: 'user', content: userPrompt }],
        });

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
      const response = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 2048,
        system:
          'אתה מומחה התאמת לקוחות לנכסים בישראל. אתה מדייק, לא ממציא עובדות, ומחזיר תשובות בפורמט XML מדויק.',
        messages: [{ role: 'user', content: prompt }],
      });
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
};
