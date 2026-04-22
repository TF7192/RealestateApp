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
import { requireUser } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';

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
};
