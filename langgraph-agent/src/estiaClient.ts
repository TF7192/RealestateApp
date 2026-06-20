// Thin HTTP client the ported tools use to call back into Estia.
//
// The hosted graph runs in LangChain's cloud and cannot reach our
// private RDS, so every tool execution does an authenticated POST to
// the Estia internal endpoint (backend/src/routes/internalAgentTool.ts):
//
//   POST {ESTIA_API_BASE}/internal/agent-tool
//   headers: Authorization: Bearer {token}, X-Estia-Internal-Token: {token}
//   body:    { name, input, agentId }
//   -> { ok: true, result }   (result is the runChatTool output)
//
// Config:
//   • ESTIA_API_BASE       — base URL of the Estia backend, e.g.
//                            https://estia.co.il  (no trailing /internal).
//   • ESTIA_INTERNAL_TOKEN — service token. SKELETON DEFAULT (static).
//                            See the per-agent-token TODO below.
//
// ────────────────────────────────────────────────────────────────────
//  AGENT IDENTITY THREADING (how `agentId` reaches a tool call)
// ────────────────────────────────────────────────────────────────────
// LangGraph tools receive the run config as their 2nd argument. The
// caller supplies the per-run agent identity via
//   config.configurable.agentId   (or .estiaAgentToken in production).
// graph.ts pulls it off config and hands it to callEstiaTool below.
//
//  ⚠️  SECURITY TODO — see backend/src/routes/internalAgentTool.ts.
// In the skeleton we send a STATIC service token + the agentId in the
// body. Production must mint a SHORT-LIVED, PER-AGENT SIGNED TOKEN in
// Estia, thread it through config.configurable, forward it as the
// Authorization header here, and have the endpoint derive agentId from
// the verified token claim (ignoring the body). Do NOT ship the static
// token to production.
// ────────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  const base = process.env.ESTIA_API_BASE;
  if (!base) {
    throw new Error(
      'ESTIA_API_BASE is not set — the graph cannot reach the Estia backend',
    );
  }
  return base.replace(/\/+$/, '');
}

function getServiceToken(): string {
  const token = process.env.ESTIA_INTERNAL_TOKEN;
  if (!token) {
    throw new Error(
      'ESTIA_INTERNAL_TOKEN is not set — cannot authenticate tool calls to Estia',
    );
  }
  return token;
}

export type EstiaToolResult = unknown;

/**
 * Execute one Estia chat tool via the internal endpoint.
 *
 * @param name    tool name (must match a CHAT_TOOLS entry on the backend)
 * @param input   the tool's argument object
 * @param agentId identity the tool runs as. SKELETON: trusted by the
 *                backend. PRODUCTION: replace with a per-agent token
 *                (see header TODO).
 * @param signal  optional AbortSignal to cancel in-flight requests.
 */
export async function callEstiaTool(
  name: string,
  input: Record<string, unknown>,
  agentId: string,
  signal?: AbortSignal,
): Promise<EstiaToolResult> {
  if (!agentId) {
    throw new Error(
      'missing agentId — pass it via run config.configurable.agentId',
    );
  }

  const url = `${getBaseUrl()}/internal/agent-tool`;
  const token = getServiceToken();

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Send both header styles — the endpoint accepts either. In
        // production the Bearer value becomes the per-agent signed token.
        authorization: `Bearer ${token}`,
        'x-estia-internal-token': token,
      },
      body: JSON.stringify({ name, input, agentId }),
      signal,
    });
  } catch (e: any) {
    throw new Error(`Estia tool request failed (network): ${e?.message || e}`);
  }

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    // non-JSON body — fall through to status handling below.
  }

  if (!res.ok) {
    const msg = payload?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Estia tool '${name}' failed: ${msg}`);
  }

  // The endpoint wraps the runChatTool output in { ok, result }.
  return payload?.result ?? payload;
}
