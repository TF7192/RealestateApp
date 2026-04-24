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
// Auth: requireAgent. Even though nothing is persisted yet, only signed-
// in agents should be able to burn OpenAI / Anthropic credits.

import type { FastifyPluginAsync } from 'fastify';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

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
  app.post('/demo-ingest', { onRequest: [app.requireAgent] }, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: { message: 'No file' } });

    if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY) {
      return reply.code(500).send({
        error: { message: 'Voice ingest not configured (missing OPENAI_API_KEY or ANTHROPIC_API_KEY)' },
      });
    }

    const audioBuf = await file.toBuffer();
    const filename = file.filename || 'recording.webm';
    const mimetype = file.mimetype || 'audio/webm';

    // 1. Transcribe with Whisper. The OpenAI SDK's `file` field accepts
    // a File / Blob-like; we build one from the buffer so we can hand
    // over the filename + mime explicitly.
    const audioFile = new File([new Uint8Array(audioBuf)], filename, { type: mimetype });

    let transcript = '';
    try {
      const whisper = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'he',
      });
      transcript = (whisper as any).text || '';
    } catch (e: any) {
      req.log.error({ err: e }, 'whisper failed');
      return reply.code(502).send({
        error: { message: 'תמלול נכשל', detail: e?.message || String(e) },
      });
    }

    if (!transcript.trim()) {
      return { transcript: '', kind: 'unclear', confidence: 0, fields: {}, missing: [], notes_he: 'לא נקלט קול' };
    }

    // 2. Extract structured fields with Haiku.
    let extracted: any = null;
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Transcript:\n${transcript}` }],
      });
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
