// Per-agent AI quota guards. Three concurrent budgets, all sliced
// from the existing AiUsage ledger so we don't need a new table:
//
//   • Voice: 45 minutes/day of Whisper transcription (audioSeconds
//     summed over rolling-day window).
//   • Chat:  15 questions/hour (count of `feature='chat'` rows in
//     the last 60 minutes).
//   • Spend: $30/month (calendar-month sum of costUsd across every
//     feature). HIDDEN from the agent — admin-only signal. The 402
//     copy says "AI temporarily unavailable" without exposing the
//     dollar amount.
//
// All three return a 429 (rate-limit) on breach with a Hebrew
// envelope the FE renders verbatim. Admin role bypasses every cap
// (so platform owners can keep testing without burning their own
// quota at the gate).

import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/prisma.js';

export const VOICE_DAILY_SECONDS = 45 * 60; // 45 minutes
export const CHAT_HOURLY_COUNT = 15;
export const MONTHLY_BUDGET_USD = 30;

export interface QuotaSnapshot {
  voice: { usedSec: number; limitSec: number; remainingSec: number; resetAt: string };
  chat:  { usedCount: number; limitCount: number; remainingCount: number; resetAt: string };
  // `spend` is computed but only surfaced to ADMINs via the admin
  // route; the public /ai/quota response strips it.
  spend: { usedUsd: number; limitUsd: number; resetAt: string };
}

/** Rolling 24-hour window for voice. */
function voiceWindow() {
  const now = Date.now();
  return { since: new Date(now - 24 * 60 * 60 * 1000), resetAt: new Date(now + 24 * 60 * 60 * 1000) };
}

/** Rolling 60-minute window for chat. */
function chatWindow() {
  const now = Date.now();
  return { since: new Date(now - 60 * 60 * 1000), resetAt: new Date(now + 60 * 60 * 1000) };
}

/** Calendar-month start for spend. */
function monthWindow() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { since: start, resetAt: end };
}

export async function loadQuota(userId: string): Promise<QuotaSnapshot> {
  const v = voiceWindow();
  const c = chatWindow();
  const m = monthWindow();
  const [voiceAgg, chatCount, spendAgg] = await Promise.all([
    prisma.aiUsage.aggregate({
      where: { userId, createdAt: { gte: v.since }, audioSeconds: { gt: 0 } },
      _sum: { audioSeconds: true },
    }),
    prisma.aiUsage.count({
      where: { userId, createdAt: { gte: c.since }, feature: 'chat' },
    }),
    prisma.aiUsage.aggregate({
      where: { userId, createdAt: { gte: m.since } },
      _sum: { costUsd: true },
    }),
  ]);
  const usedSec = Number(voiceAgg._sum.audioSeconds || 0);
  const usedUsd = Number(spendAgg._sum.costUsd || 0);
  return {
    voice: {
      usedSec,
      limitSec: VOICE_DAILY_SECONDS,
      remainingSec: Math.max(0, VOICE_DAILY_SECONDS - usedSec),
      resetAt: v.resetAt.toISOString(),
    },
    chat: {
      usedCount: chatCount,
      limitCount: CHAT_HOURLY_COUNT,
      remainingCount: Math.max(0, CHAT_HOURLY_COUNT - chatCount),
      resetAt: c.resetAt.toISOString(),
    },
    spend: {
      usedUsd,
      limitUsd: MONTHLY_BUDGET_USD,
      resetAt: m.resetAt.toISOString(),
    },
  };
}

/** Strip the spend block before returning to a non-admin caller. */
export function publicQuota(snap: QuotaSnapshot, isAdmin: boolean) {
  if (isAdmin) return snap;
  const { spend: _spend, ...rest } = snap;
  void _spend;
  return rest;
}

interface CheckOpts {
  kind: 'voice' | 'chat';
  /** Voice routes pass the audio length client-side (or estimate from
   *  bytes) so we can refuse before burning a Whisper call. */
  voiceSecPlanned?: number;
}

/**
 * `requireAiQuota({ kind: 'voice' | 'chat' })` — a Fastify
 * onRequest-style middleware. ADMIN role bypasses; everyone else gets
 * checked against the three caps above.
 */
export function requireAiQuota(opts: CheckOpts) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const u = (req as any).user as { id: string; role: string } | undefined;
    if (!u) return reply.code(401).send({ error: { message: 'Unauthorized' } });
    // Admin bypass — platform owner needs to test without rate-limit
    // friction. Same allowlist the rest of the app already uses.
    if (u.role === 'ADMIN') return;

    const snap = await loadQuota(u.id);

    // Spend cap is the hard ceiling; fires for both voice and chat.
    if (snap.spend.usedUsd >= snap.spend.limitUsd) {
      return reply.code(429).send({
        error: {
          // Deliberately vague — agents don't see the $ figure.
          message: 'שירות ה-AI אינו זמין כרגע. נסה/י שוב בחודש הבא.',
          code: 'ai_unavailable',
        },
      });
    }

    if (opts.kind === 'voice') {
      const planned = opts.voiceSecPlanned || 0;
      if (snap.voice.usedSec + planned > snap.voice.limitSec) {
        const usedMin = Math.floor(snap.voice.usedSec / 60);
        const limitMin = Math.floor(snap.voice.limitSec / 60);
        return reply.code(429).send({
          error: {
            message: `הגעת למכסה היומית של ${limitMin} דקות הקלטה (${usedMin} דק׳ נצברו). מתחדשת מחר.`,
            code: 'voice_quota_exceeded',
            quota: { used: usedMin, limit: limitMin },
          },
        });
      }
    } else if (opts.kind === 'chat') {
      if (snap.chat.usedCount >= snap.chat.limitCount) {
        return reply.code(429).send({
          error: {
            message: `הגעת למכסה השעתית של ${snap.chat.limitCount} שאלות. נסה/י שוב בעוד שעה.`,
            code: 'chat_quota_exceeded',
            quota: { used: snap.chat.usedCount, limit: snap.chat.limitCount },
          },
        });
      }
    }
  };
}
