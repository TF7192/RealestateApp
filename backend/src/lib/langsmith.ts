// LangSmith tracing helpers for the existing Anthropic / OpenAI clients.
//
// Tracing is OFF unless BOTH:
//   - LANGSMITH_TRACING=true  (or the legacy LANGCHAIN_TRACING_V2=true)
//   - LANGSMITH_API_KEY is set
// which matches the LangSmith SDK's own env contract. When disabled these
// helpers are passthroughs, so production behaviour is unchanged until the
// env is configured — wrapping only adds tracing, never alters responses.
//
// The wrapped client has the SAME type + API surface as the original
// (wrapSDK/wrapOpenAI proxy every method), so callers don't change.
//
// SECURITY: never hardcode LANGSMITH_API_KEY here — it comes from env.

import { wrapSDK, wrapOpenAI } from 'langsmith/wrappers';

export function langsmithEnabled(): boolean {
  const tracing =
    process.env.LANGSMITH_TRACING === 'true' ||
    process.env.LANGCHAIN_TRACING_V2 === 'true';
  return tracing && !!process.env.LANGSMITH_API_KEY;
}

// Wrap an Anthropic SDK client so every API call is traced in LangSmith.
export function traceAnthropic<T extends object>(client: T): T {
  return langsmithEnabled() ? wrapSDK(client) : client;
}

// Wrap an OpenAI SDK client (dedicated wrapper → better span naming +
// token-usage capture than the generic wrapSDK).
export function traceOpenAI<T extends object>(client: T): T {
  return langsmithEnabled() ? (wrapOpenAI(client as never) as T) : client;
}
