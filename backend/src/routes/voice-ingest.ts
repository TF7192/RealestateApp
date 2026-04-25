// Voice-ingest POC — not shipped yet.
//
// POST /api/voice/demo-ingest  (multipart, field: file, max ~2 min audio)
//   1. OpenAI Whisper transcribes the clip (Hebrew + English mixed).
//   2. Claude Haiku 4.5 extracts a structured {kind, fields} payload
//      matching the Lead / Property shape in prisma/schema.prisma.
//   3. We return {transcript, kind, fields, confidence} straight to the
//      browser — no DB writes on this route. The frontend demo renders
//      it as JSON so we can iterate on the prompt before wiring save.
//
// Auth: requireAgent + requirePremium. Only premium agents can burn
// OpenAI / Anthropic credits via this endpoint.

import type { FastifyPluginAsync } from 'fastify';
import OpenAI, { toFile } from 'openai';
import { requirePremium } from '../middleware/requirePremium.js';
import Anthropic from '@anthropic-ai/sdk';
import { requireUser } from '../middleware/auth.js';
import { recordAnthropic, recordWhisper } from '../lib/aiUsage.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

const SYSTEM_PROMPT = `You are an extraction assistant for an Israeli real-estate CRM.

The user sends you a transcript of an agent speaking in Hebrew (possibly mixed with English). The agent is either:
  - Describing a LEAD (a buyer/renter looking for something), OR
  - Describing a PROPERTY (a listing they are marketing — seller/landlord side).

Return ONE JSON object with this exact shape:

{
  "kind": "lead" | "property" | "unclear",
  "confidence": 0.0-1.0,
  "fields": { ... },
  "missing": [ "field names the agent did not mention" ],
  "notes_he": "one short Hebrew sentence summarizing what you understood"
}

For kind=lead, fields may include:
  name, phone, email, city, street, rooms, budget (integer ILS), priceRangeLabel,
  lookingFor ("BUY" | "RENT"), sector, notes, source

For kind=property, fields may include:
  type (e.g. "דירה", "משרד", "חנות"), street, city, neighborhood, rooms (number),
  floor (integer), totalFloors (integer), sqm (integer), marketingPrice (integer ILS),
  owner, ownerPhone, ownerEmail, elevator (bool), parking (string), notes

Rules:
  - ONLY include fields the agent actually mentioned. Do not invent values.
  - Parse "שתיים וחצי מיליון" → 2500000. "5000 שקל" → 5000. Assume BUY if the number is in millions, RENT if thousands.
  - If the agent's intent is genuinely ambiguous, set kind="unclear" and explain in notes_he.
  - Output valid JSON only — no prose before or after.`;

export const registerVoiceIngestRoutes: FastifyPluginAsync = async (app) => {
  app.post('/demo-ingest', {
    onRequest: [app.requireAgent, requirePremium({ feature: 'הקלטה חכמה' })],
  }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: { message: 'No file' } });

    if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY) {
      return reply.code(500).send({
        error: { message: 'Voice ingest not configured (missing OPENAI_API_KEY or ANTHROPIC_API_KEY)' },
      });
    }

    const audioBuf = await file.toBuffer();
    // Whisper requires the filename's extension to match the container.
    // MediaRecorder on Chrome emits `audio/webm;codecs=opus`; on Safari
    // it's `audio/mp4` (AAC) — strip codec params and pick the right
    // extension off the leading mime so the OpenAI sniffer doesn't
    // bail with "could not be decoded".
    const rawMime = (file.mimetype || 'audio/webm').toLowerCase();
    const baseMime = rawMime.split(';')[0].trim();
    const extByMime: Record<string, string> = {
      'audio/webm': 'webm',
      'audio/ogg':  'ogg',
      'audio/mp4':  'm4a',
      'audio/mpeg': 'mp3',
      'audio/mp3':  'mp3',
      'audio/wav':  'wav',
      'audio/x-wav': 'wav',
      'audio/flac': 'flac',
    };
    const ext = extByMime[baseMime] || 'webm';
    const safeName = `recording.${ext}`;

    if (audioBuf.byteLength < 1024) {
      // Anything under 1 KB isn't a real recording — stop here so we
      // don't burn an OpenAI call to learn the same thing the hard way.
      return reply.code(400).send({
        error: { message: 'ההקלטה קצרה מדי — נסה/י שוב.', code: 'audio_too_short' },
      });
    }

    const u = requireUser(req);

    // 1. Transcribe with Whisper. `toFile` is the OpenAI SDK's blessed
    // helper for Node — wraps the buffer with the right Web-File-like
    // shape so the SDK's content-type sniffer accepts it. The previous
    // `new File([Uint8Array], ...)` path was producing a payload Whisper
    // would 400 on with "format not supported" intermittently.
    const audioFile = await toFile(audioBuf, safeName, { type: baseMime });

    let transcript = '';
    try {
      const whisper = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'he',
      });
      transcript = (whisper as any).text || '';
      // Whisper is billed per-minute (rounded up). Audio length isn't
      // in the response; approximate from the buffer size + typical
      // webm/opus bitrate (~16 kbps) so the number is within ~20%.
      const approxSeconds = Math.max(1, Math.round(audioBuf.byteLength / 2000));
      recordWhisper({ userId: u.id, durationSec: approxSeconds });
    } catch (e: any) {
      req.log.error(
        { err: e, mime: baseMime, name: safeName, bytes: audioBuf.byteLength },
        'whisper failed',
      );
      return reply.code(502).send({
        error: { message: 'תמלול נכשל', detail: e?.message || String(e) },
      });
    }

    if (!transcript.trim()) {
      return { transcript: '', kind: 'unclear', confidence: 0, fields: {}, missing: [], notes_he: 'לא נקלט קול' };
    }

    // 2. Extract structured fields with Haiku. Cap output at 400
    // tokens — the emitted JSON is never larger than ~300.
    let extracted: any = null;
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 400,
        // Tag the system prompt for Anthropic prompt caching. After
        // the first call in a 5-minute window, re-reads of the same
        // prompt bill at ~10% of normal input rate.
        system: [
          { type: 'text' as any, text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' as any } },
        ] as any,
        messages: [{ role: 'user', content: `Transcript:\n${transcript}` }],
      });
      recordAnthropic({ userId: u.id, feature: 'voice-ingest', model: 'claude-haiku-4-5', usage: (msg as any).usage });
      const text = msg.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n')
        .trim();

      // The model sometimes wraps JSON in ```json fences despite the
      // instruction. Strip them defensively.
      const cleaned = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      extracted = JSON.parse(cleaned);
    } catch (e: any) {
      req.log.error({ err: e }, 'haiku extraction failed');
      return reply.code(502).send({
        error: { message: 'שליפת השדות נכשלה', detail: e?.message || String(e), transcript },
      });
    }

    return {
      transcript,
      kind: extracted.kind || 'unclear',
      confidence: typeof extracted.confidence === 'number' ? extracted.confidence : null,
      fields: extracted.fields || {},
      missing: extracted.missing || [],
      notes_he: extracted.notes_he || '',
    };
  });
};
