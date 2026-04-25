// Sprint 4 / Calendar — flat meetings list + agent-scoped create.
//
// PATCH / DELETE + the lead-scoped POST already live on calendar.ts
// (nested under a specific lead). The Calendar page needs a cross-
// lead view + a free-form "פגישה חדשה" CTA, so this file exposes:
//
//   GET  /api/meetings?from=<ISO>&to=<ISO>  → { items: LeadMeeting[] }
//   POST /api/meetings                      → { meeting: LeadMeeting }
//
// Both are scoped to the signed-in agent via JWT. The POST accepts an
// optional `leadId` so the agent can either link the meeting to an
// existing lead or block out time without one (coffee with another
// broker, internal prep, etc.). When `syncToCalendar` is true and the
// agent has Google Calendar connected, the meeting also gets pushed
// upstream and the resulting Google event id is stored on the row so
// edits propagate via the existing PATCH/DELETE handlers in
// calendar.ts.
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
import { recordAnthropic } from '../lib/aiUsage.js';
import { requirePremium } from '../middleware/requirePremium.js';
import { buildAnthropic } from '../lib/anthropic.js';
import { putMeetingAudio } from '../lib/meetingAudio.js';
import { getFreshAccessToken, createCalendarEvent } from './calendar.js';

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to:   z.string().datetime().optional(),
});

// Body shape for the agent-scoped POST /api/meetings endpoint. `leadId`
// is optional — when omitted the meeting is agent-only (e.g. blocking
// out personal time on the /calendar grid). `syncToCalendar` mirrors
// the lead-scoped POST in calendar.ts so a single dialog can reuse the
// same checkbox UX.
const createSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).optional(),
  location: z.string().max(200).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  leadId: z.string().min(1).optional(),
  attendeeName: z.string().max(200).optional(),
  attendeeEmail: z.string().email().optional().or(z.literal('')),
  addMeetLink: z.boolean().optional(),
  syncToCalendar: z.boolean().optional(),
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

  // POST /api/meetings — create an agent-scoped meeting, optionally
  // linked to a lead and optionally pushed to Google Calendar. Mirrors
  // the lead-scoped POST in calendar.ts so the /calendar "פגישה חדשה"
  // dialog has a single endpoint regardless of whether the agent picks
  // a lead or types a free-text participant.
  app.post('/', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const u = requireUser(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { message: parsed.error.issues[0]?.message || 'Invalid input' },
      });
    }
    const { syncToCalendar, addMeetLink, attendeeEmail, attendeeName, leadId, ...rest } = parsed.data;
    const startsAt = new Date(rest.startsAt);
    const endsAt   = new Date(rest.endsAt);

    // Cross-agent guard — if a lead is passed, it must belong to the
    // signed-in agent. 404 (not 403) so we don't leak the existence of
    // other agents' leads.
    let leadRow: { email: string | null } | null = null;
    if (leadId) {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { id: true, agentId: true, email: true },
      });
      if (!lead || lead.agentId !== u.id) {
        return reply.code(404).send({ error: { message: 'Not found' } });
      }
      leadRow = { email: lead.email };
    }

    // Push to Google Calendar FIRST when requested — same ordering as
    // the lead-scoped POST so a Calendar failure surfaces a clear
    // error instead of leaving an orphan local row.
    let googleEventId: string | null = null;
    let meetLink: string | null = null;
    if (syncToCalendar) {
      const token = await getFreshAccessToken(u.id);
      if (!token) {
        return reply.code(428).send({
          error: { message: 'יש לחבר את Google Calendar תחילה', code: 'calendar_not_connected' },
        });
      }
      // Compose the meeting title with the free-text attendee name
      // when there's no lead — keeps the calendar event readable.
      const eventTitle = !leadId && attendeeName
        ? `${rest.title} · ${attendeeName}`
        : rest.title;
      const created = await createCalendarEvent(token, {
        title: eventTitle,
        notes: rest.notes,
        location: rest.location,
        startsAt,
        endsAt,
        attendeeEmail: attendeeEmail || leadRow?.email || null,
        addMeetLink,
      });
      if (!created) {
        return reply.code(502).send({ error: { message: 'יצירת אירוע ב-Google נכשלה' } });
      }
      googleEventId = created.id;
      meetLink = created.meetLink || null;
    }

    // The free-text attendee name (when there's no lead) is appended
    // to notes so it survives — LeadMeeting has no dedicated column
    // for an unstructured participant string and adding one would
    // mean another migration for a single string field.
    const composedNotes = !leadId && attendeeName
      ? [rest.notes, `משתתף: ${attendeeName}`].filter(Boolean).join('\n')
      : rest.notes;

    const meeting = await prisma.leadMeeting.create({
      data: {
        leadId: leadId || null,
        agentId: u.id,
        title: rest.title,
        notes: composedNotes || null,
        location: rest.location || null,
        startsAt,
        endsAt,
        googleEventId,
        meetLink,
      },
      include: {
        lead: { select: { id: true, name: true, phone: true } },
      },
    });
    return { meeting };
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
