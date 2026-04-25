// Sprint 10 — AI usage ledger.
// Fire-and-forget writes to the AiUsage table so every Anthropic call
// lands as a row with input/output/cache tokens and an authoritative
// USD cost computed from the model's published prices. Owners read
// the aggregate on /office (no enforcement yet — observability first).

import { prisma } from './prisma.js';

// Per-MTok USD prices. Keep in sync with Anthropic's public pricing
// page. If a model is missing we log and bill at $0 — visible via the
// usage ledger — rather than crash the caller.
const PRICES: Record<string, { input: number; cacheRead: number; cacheCreate: number; output: number }> = {
  'claude-opus-4-7':   { input: 15,  cacheRead: 1.5, cacheCreate: 18.75, output: 75 },
  'claude-opus-4-5':   { input: 15,  cacheRead: 1.5, cacheCreate: 18.75, output: 75 },
  'claude-sonnet-4-6': { input: 3,   cacheRead: 0.3, cacheCreate: 3.75,  output: 15 },
  'claude-haiku-4-5':  { input: 1,   cacheRead: 0.1, cacheCreate: 1.25,  output: 5 },
};
// Whisper is priced per minute, not per token. We store seconds in
// audioSeconds and fold the cost into costUsd at recording time.
const WHISPER_PER_MINUTE_USD = 0.006;

export type AiFeature =
  | 'chat'
  | 'describe-property'
  | 'voice-ingest'
  | 'meeting-brief'
  | 'offer-review'
  | 'ai-match';

interface AnthropicUsageLike {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

function priceAnthropic(model: string, usage: AnthropicUsageLike) {
  const p = PRICES[model];
  if (!p) return 0;
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheCreate = usage.cache_creation_input_tokens || 0;
  // Anthropic's pricing splits input into three buckets. The standard
  // `input_tokens` already excludes cached reads / creation on newer
  // SDK versions; treat them additively here so miscounted fields
  // still produce a reasonable upper bound.
  return (
    (input / 1_000_000) * p.input +
    (cacheRead / 1_000_000) * p.cacheRead +
    (cacheCreate / 1_000_000) * p.cacheCreate +
    (output / 1_000_000) * p.output
  );
}

// Record an Anthropic call. Fire-and-forget by design — a failed
// write to AiUsage should never block or fail the caller's API
// response. Logs on failure so we can catch silent data gaps.
export function recordAnthropic(opts: {
  userId: string;
  feature: AiFeature;
  model: string;
  usage: AnthropicUsageLike | undefined | null;
}): void {
  if (!opts.userId || !opts.usage) return;
  const usage = opts.usage;
  const costUsd = priceAnthropic(opts.model, usage);
  prisma.aiUsage
    .create({
      data: {
        userId: opts.userId,
        feature: opts.feature,
        model: opts.model,
        inputTokens:       usage.input_tokens || 0,
        outputTokens:      usage.output_tokens || 0,
        cacheReadTokens:   usage.cache_read_input_tokens || 0,
        cacheCreateTokens: usage.cache_creation_input_tokens || 0,
        costUsd,
      },
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[aiUsage] record failed', err?.message || err);
    });
}

// Whisper — track as audio seconds so cost stays linear even if
// pricing bands change later. `durationSec` is the full clip length;
// we round up to match OpenAI's billing.
export function recordWhisper(opts: {
  userId: string;
  durationSec: number;
}): void {
  if (!opts.userId) return;
  const seconds = Math.max(0, Math.ceil(opts.durationSec || 0));
  const minutes = seconds / 60;
  const costUsd = minutes * WHISPER_PER_MINUTE_USD;
  prisma.aiUsage
    .create({
      data: {
        userId: opts.userId,
        feature: 'voice-ingest',
        model: 'whisper-1',
        audioSeconds: seconds,
        costUsd,
      },
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[aiUsage] whisper record failed', err?.message || err);
    });
}
