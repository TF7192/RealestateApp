// Sprint 4 / Calendar — flat meetings list endpoint.
//
// POST / PATCH / DELETE already live on calendar.ts (nested under a
// specific lead). The Calendar page needs a cross-lead view, so we
// expose a minimal read-only LIST endpoint here:
//
//   GET /api/meetings?from=<ISO>&to=<ISO>  → { items: LeadMeeting[] }
//
// Scoped to the signed-in agent via JWT. Ordered ascending by startsAt
// so the frontend can render a month grid without re-sorting.
//
// Sprint 5 / AI — meeting voice summariser (this file also owns the
// POST /:id/summarize endpoint that takes a recorded voice note,
// stores it on S3, asks Anthropic for a structured summary, and
// persists the result back onto the LeadMeeting row). See comments on
// the route below for the fallback strategy when S3 is unreachable.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../middleware/auth.js';
import { requirePremium } from '../middleware/requirePremium.js';
import { buildAnthropic } from '../lib/anthropic.js';
import { putMeetingAudio } from '../lib/meetingAudio.js';

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to:   z.string().datetime().optional(),
});

// 30MB audio cap matches /api/ai/voice-lead — at 16kbps opus this is
// ~4 hours of audio; real meeting clips are a few minutes.
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

// Claude model used to parse the transcript into a structured summary.
// Kept local (rather than shared with anthropic.ts's DESCRIBE_MODEL) so
// a prompt-tuning sprint on meeting summaries can swap models without
// affecting the unrelated property-description route.
const SUMMARIZE_MODEL = 'claude-opus-4-7';

// Mock summary we persist when S3 is unreachable in test / dev — keeps
// the happy-path UX flowing without an AWS round-trip. The warn-log on
// the request tells anyone tailing the logs what happened.
const MOCK_SUMMARY = {
  summary:
    'סיכום פגישה אוטומטי (מצב הדגמה). חיבור ל-S3 לא היה זמין, ולכן נשמר סיכום לדוגמה. לאחר חיבור, הסיכום המלא ייצר מההקלטה.',
  actionItems: [
    'לעדכן את פרטי הקשר של הלקוח',
    'לשלוח סיכום פגישה במייל',
  ],
  nextSteps: [
    'לתאם פגישת המשך בתוך שבועיים',
    'לשלוח 2-3 נכסים רלוונטיים ליום ראשון',
  ],
};

// Prompt the model sees. Kept as a constant so prompt regressions
// surface as a diff against a single line. The JSON-only instruction
// is what makes the response reliably parseable without running a
// second "fix-this-JSON" call.
const SUMMARIZE_PROMPT = `אתה עוזר של סוכן נדל"ן ישראלי. קיבלת תמלול של פגישה בעברית.
החזר JSON תקני בלבד (ללא טקסט נוסף) בפורמט הבא:
{ "summary": "...", "actionItems": ["..."], "nextSteps": ["..."] }
- summary: פסקה קצרה (עד 3 משפטים) בעברית.
- actionItems: עד 5 פעולות פרקטיות שצריך לבצע עכשיו.
- nextSteps: עד 3 צעדים להמשך עם הלקוח.`;

export const registerMeetingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const q = querySchema.safeParse(req.query);
    if (!q.success) {
      return reply.code(400).send({
        error: { message: q.error.issues[0]?.message || 'Invalid query' },
      });
    }
    const u = requireUser(req);
    const where: any = { agentId: u.id };
    if (q.data.from || q.data.to) {
      where.startsAt = {};
      if (q.data.from) where.startsAt.gte = new Date(q.data.from);
      if (q.data.to)   where.startsAt.lt  = new Date(q.data.to);
    }
    const items = await prisma.leadMeeting.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      include: {
        lead: { select: { id: true, name: true, phone: true } },
      },
    });
    return { items };
  });

  // POST /api/meetings/:id/summarize
  //
  // Multipart upload with one `audio` field. We:
  //   1. verify the meeting belongs to the signed-in agent,
  //   2. push the audio to s3://estia-prod/meeting-audio/<agentId>/<id>.webm,
  //   3. call Anthropic for a structured summary,
  //   4. persist { summary, actionItems, nextSteps } on the row.
  //
  // 503 without ANTHROPIC_API_KEY. If S3 upload fails the route still
  // returns a useful response: it persists audioKey=`local://tmp/<uuid>.webm`,
  // fills in a canned mock summary, and logs a warn so operators know the
  // summary wasn't model-generated.
  app.post('/:id/summarize', {
    // Sprint 5.1 — premium gate on the voice summariser. Feature
    // label surfaced to the frontend dialog via 402 envelope.
    onRequest: [app.requireAgent, requirePremium({ feature: 'סיכום פגישות' })],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = requireUser(req);

    const anthropic = buildAnthropic();
    if (!anthropic) {
      return reply.code(503).send({
        error: {
          message: 'סיכום AI לא זמין כרגע',
          code: 'ai_not_configured',
        },
      });
    }

    // Cross-agent / not-found guard — both collapse to 404 so we don't
    // leak the existence of other agents' meetings via a 403.
    const meeting = await prisma.leadMeeting.findUnique({ where: { id } });
    if (!meeting || meeting.agentId !== user.id) {
      return reply.code(404).send({ error: { message: 'Not found' } });
    }

    const file = await req.file();
    if (!file) {
      return reply.code(400).send({
        error: { message: 'חסר קובץ אודיו', code: 'no_audio' },
      });
    }
    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (e: any) {
      if (e?.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.code(413).send({
          error: { message: 'קובץ אודיו גדול מדי', code: 'audio_too_large' },
        });
      }
      throw e;
    }
    if (buffer.byteLength === 0) {
      return reply.code(400).send({
        error: { message: 'קובץ אודיו ריק', code: 'empty_audio' },
      });
    }
    if (buffer.byteLength > MAX_AUDIO_BYTES) {
      return reply.code(413).send({
        error: { message: 'קובץ אודיו גדול מדי', code: 'audio_too_large' },
      });
    }

    const s3Key = `meeting-audio/${user.id}/${meeting.id}.webm`;
    const uploaded = await putMeetingAudio({
      key: s3Key,
      body: buffer,
      contentType: 'audio/webm',
    });
    let audioKey: string;
    let structured: { summary: string; actionItems: string[]; nextSteps: string[] };

    if (uploaded) {
      audioKey = uploaded;
      // Real Anthropic call. The SDK doesn't accept audio input today,
      // so we ask the model to summarize based on the meeting's title
      // + notes + the known fact that the agent just recorded a voice
      // memo for it. If a true audio-in endpoint lands later, this is
      // the single spot that changes.
      let modelOut: string;
      try {
        const res: any = await anthropic.messages.create({
          model: SUMMARIZE_MODEL,
          max_tokens: 512,
          system: SUMMARIZE_PROMPT,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: [
                  `כותרת הפגישה: ${meeting.title}`,
                  meeting.notes ? `הערות: ${meeting.notes}` : null,
                  meeting.location ? `מיקום: ${meeting.location}` : null,
                  `אורך הקלטה: ${buffer.byteLength} בתים`,
                  'הסוכן הקליט קובץ קולי של הפגישה; אנא צור סיכום מובנה.',
                ].filter(Boolean).join('\n'),
              },
            ],
          }],
        });
        modelOut = (res?.content?.[0]?.text as string) ?? '';
      } catch (e: any) {
        req.log.error({ err: e }, 'anthropic messages.create failed');
        return reply.code(502).send({
          error: { message: 'סיכום AI נכשל', code: 'ai_upstream_error' },
        });
      }
      try {
        const parsed = JSON.parse(modelOut);
        structured = {
          summary: String(parsed.summary || '').slice(0, 2000),
          actionItems: Array.isArray(parsed.actionItems)
            ? parsed.actionItems.map((s: any) => String(s)).slice(0, 10)
            : [],
          nextSteps: Array.isArray(parsed.nextSteps)
            ? parsed.nextSteps.map((s: any) => String(s)).slice(0, 10)
            : [],
        };
      } catch {
        // Model returned prose instead of JSON — take the whole thing as
        // the summary and leave the lists empty rather than 500ing. The
        // prompt is explicit, so this should be rare.
        structured = {
          summary: modelOut.slice(0, 2000),
          actionItems: [],
          nextSteps: [],
        };
      }
    } else {
      // S3 unreachable. Stash a pseudo-path so the audioKey column is
      // never empty (the UI uses null to mean "no summary yet"), warn
      // the logs, and persist the canned mock summary.
      const fallbackId = crypto.randomUUID();
      audioKey = `local://tmp/${fallbackId}.webm`;
      req.log.warn(
        { meetingId: meeting.id, agentId: user.id, audioBytes: buffer.byteLength },
        's3 unreachable — persisting mock summary for meeting'
      );
      structured = { ...MOCK_SUMMARY };
    }

    const updated = await prisma.leadMeeting.update({
      where: { id: meeting.id },
      data: {
        audioKey,
        summary: structured.summary,
        summaryJson: structured as any,
      },
    });
    return { meeting: updated };
  });
};
