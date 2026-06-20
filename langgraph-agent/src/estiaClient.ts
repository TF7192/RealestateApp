// Thin HTTP client the ported tools use to call back into Estia.
//
// The hosted graph runs in LangChain's cloud and cannot reach our
// private RDS, so every tool execution does an authenticated POST to
// the Estia internal endpoint (backend/src/routes/internalAgentTool.ts):
//
//   POST {ESTIA_API_BASE}/api/internal/agent-tool
//   headers: Authorization: Bearer {estiaToken}
//   body:    { name, input }
//   -> { ok: true, result }   (result is the runChatTool output)
//
// Config:
//   • ESTIA_API_BASE — base URL of the Estia backend, e.g.
//                      https://estia.co.il (no trailing slash, no /api).
//
// ────────────────────────────────────────────────────────────────────
//  AUTH — short-lived, per-agent SIGNED token (production model)
// ────────────────────────────────────────────────────────────────────
// There is NO static service token anymore. The graph caller mints a
// short-lived (5 min) per-agent token from Estia
// (GET /api/ai/agent-token) and supplies it per run via
//   config.configurable.estiaToken
// graph.ts → tools.ts pulls it off the run config and passes it here as
// `estiaToken`. We forward it as `Authorization: Bearer <estiaToken>`.
//
// The backend verifies the token's signature + expiry + purpose and
// derives the agentId from the token's `sub` claim — the body carries
// NO agentId (the endpoint rejects one). A leaked token is scoped to a
// single agent and expires in minutes.

function getBaseUrl(): string {
  const base = process.env.ESTIA_API_BASE;
  if (!base) {
    throw new Error(
      'ESTIA_API_BASE is not set — the graph cannot reach the Estia backend',
    );
  }
  return base.replace(/\/+$/, '');
}

export type EstiaToolResult = unknown;

/**
 * Execute one Estia chat tool via the internal endpoint.
 *
 * @param name       tool name (must match a CHAT_TOOLS entry on the backend)
 * @param input      the tool's argument object
 * @param estiaToken short-lived per-agent signed token (from the run
 *                   config). The backend derives agentId from it; we
 *                   never send an agentId in the body.
 * @param signal     optional AbortSignal to cancel in-flight requests.
 */
export async function callEstiaTool(
  name: string,
  input: Record<string, unknown>,
  estiaToken: string,
  signal?: AbortSignal,
): Promise<EstiaToolResult> {
  if (!estiaToken) {
    throw new Error(
      'missing estiaToken — pass it via run config.configurable.estiaToken',
    );
  }

  const url = `${getBaseUrl()}/api/internal/agent-tool`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${estiaToken}`,
      },
      body: JSON.stringify({ name, input }),
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
