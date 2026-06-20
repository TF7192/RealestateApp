# Estia LangGraph agent

A deployable [LangGraph](https://langchain-ai.github.io/langgraphjs/)
(LangGraph Platform / JS) port of the Estia chat agent. It mirrors the
in-app agent in `backend/src/routes/ai.ts`: same model
(`claude-haiku-4-5`), the same Hebrew system prompt, and the same 10
read-only tools — but as a `StateGraph` that can run on LangGraph
Platform instead of inside the Estia backend.

See `docs/langgraph-port-scoping.md` for the full plan and the
recommendation. **This is the lowest-risk first step** from that doc: a
thin JS graph + a backend internal endpoint, with the frontend
unchanged.

## How it works

```
START → agent ──(tool calls?)──▶ tools ──▶ agent ─┐
          │                                        │
          └──────────(no tool calls)──────────────┴─▶ END
```

- **agent** — `ChatAnthropic` (`claude-haiku-4-5`) bound to the 10
  tools, prepending the Hebrew `SYSTEM_PROMPT`. Loops at most 6 LLM
  turns (same cap as the in-app `iter < 6`).
- **tools** — a `ToolNode`. The graph runs in LangChain's cloud and
  **cannot reach our private RDS**, so each tool does an authenticated
  `POST {ESTIA_API_BASE}/api/internal/agent-tool { name, input }` back
  to the Estia backend (with `Authorization: Bearer <per-agent token>`),
  which verifies the token, derives the agentId from its claim, and runs
  the existing `runChatTool(name, input, { agentId })`. No tool logic is
  duplicated, and the body carries **no** agentId.

### Files

| File | Purpose |
|---|---|
| `src/graph.ts` | the compiled `StateGraph` (exported as `graph`) |
| `src/tools.ts` | the 10 tools as LangChain `tool()`s (schemas mirror `CHAT_TOOLS`) |
| `src/estiaClient.ts` | HTTP client that calls the Estia internal endpoint |
| `src/systemPrompt.ts` | the Hebrew system prompt, ported verbatim from `ai.ts` |
| `../langgraph.json` | LangGraph config at the repo root |

## Required environment

Set these in a `.env` at the **repo root** (`langgraph.json` declares
`"env": ".env"`). A template lives at `langgraph-agent/.env.example`.

| Var | Required | What |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | model key for `claude-haiku-4-5` |
| `ESTIA_API_BASE` | yes | Estia backend base URL, e.g. `https://estia.co.il` (no trailing slash, no `/api`) |
| `LANGSMITH_TRACING` | no | `true` to enable tracing |
| `LANGSMITH_API_KEY` | no | LangSmith key (tracing) |
| `LANGSMITH_PROJECT` | no | LangSmith project name |

There is **no** `ESTIA_INTERNAL_TOKEN` (the static-token model is
removed). Auth is a short-lived **per-agent** token supplied per run via
`config.configurable.estiaToken` — see "Run locally" and "Auth" below.

**LangSmith tracing is automatic** — when the `LANGSMITH_*` vars are
set, importing the langchain packages wires tracing for every run. No
code change needed.

## Tracing requirements

Callers MUST pass `thread_id`, `user_id`, and `environment` on every
invocation so the LangSmith Threads view groups multi-turn turns,
per-tenant filtering works, and prod/staging traffic stays separate.

```jsonc
{
  "configurable": {
    "thread_id": "<chat conversation/session id>",
    "estiaToken": "<token from GET /api/ai/agent-token>"
  },
  "metadata": {
    "user_id": "<signed-in agent id>",
    "environment": "production"
  }
}
```

## Run locally

```bash
cd langgraph-agent
npm install
npx tsc --noEmit          # typecheck
# from the REPO ROOT (so it finds langgraph.json + .env):
cd ..
npx --prefix langgraph-agent langgraph dev
# or, if @langchain/langgraph-cli is installed at the root:
# langgraph dev
```

`langgraph dev` starts a local LangGraph server and opens LangGraph
Studio. Invoke the `estia_agent` graph with a run config that carries a
short-lived **per-agent token** (mint it from the running Estia backend:
`GET /api/ai/agent-token` while logged in as the agent → `{ token }`):

```jsonc
{
  "configurable": { "estiaToken": "<token from GET /api/ai/agent-token>" }
}
```

The graph forwards the token as `Authorization: Bearer <token>`; the
backend verifies it, derives the agentId from the token's `sub` claim,
and scopes every query to that agent (`where: { agentId }`). The token
expires in 5 minutes, so mint a fresh one per session.

## Deploy on LangGraph Platform

1. Push this repo to GitHub (the root has `langgraph.json`).
2. In LangGraph Platform → **Create New Deployment**, connect the repo.
   It auto-discovers `langgraph.json` and builds the `estia_agent`
   graph.
3. Set the env vars above in the deployment's environment
   (`ANTHROPIC_API_KEY`, `ESTIA_API_BASE`, and `LANGSMITH_*` for
   tracing). No static service token.
4. The Estia backend must expose `/api/internal/agent-tool` (next
   section) and be reachable from LangGraph's cloud over HTTPS, and have
   `ESTIA_AGENT_TOKEN_SECRET` set so it can verify the per-agent tokens.

> Per the repo rules: **do not push or deploy without explicit
> go-ahead.** The steps above are for when that go-ahead is given.

## Backend internal endpoint (already wired)

The backend exposes `POST /api/internal/agent-tool`, registered in
`backend/src/server.ts` (`prefix: '/api/internal'`) so it rides the
existing `/api/*` nginx proxy. It is authenticated by the short-lived
per-agent token (below) — **not** a static key. It fails closed with
`503` until `ESTIA_AGENT_TOKEN_SECRET` is set in the backend env.

> `/api/internal/*` should additionally be IP-restricted to LangGraph's
> egress at the nginx / security-group layer (a commented, ready-to-
> enable snippet lives in `frontend/nginx.conf`). The signed token is
> the primary control; the IP allowlist is defense-in-depth.

## Auth — short-lived, per-agent signed token

The static-token model is gone. Auth is now:

1. Estia mints a short-lived (5 min) HMAC-signed JWT scoped to **one**
   `agentId`, with a `purpose: 'agent-tool'` claim, via
   `GET /api/ai/agent-token` (authenticated agent only). The signing
   secret is `ESTIA_AGENT_TOKEN_SECRET` (separate from the app's
   `JWT_SECRET`). Helper: `backend/src/lib/agentToolToken.ts`.
2. The graph caller threads that token through the run config
   (`configurable.estiaToken`); each tool call forwards it as the
   `Authorization: Bearer …` header (`src/estiaClient.ts`).
3. `backend/src/routes/internalAgentTool.ts` verifies the signature +
   expiry + purpose and derives `agentId` **from the verified token's
   `sub` claim**. The request body carries no agentId and the schema
   rejects one (`.strict()`).

Everything fails closed when `ESTIA_AGENT_TOKEN_SECRET` is unset, so the
whole path is inert (and safe to merge/deploy) until it's configured.

The relevant code:

- `backend/src/lib/agentToolToken.ts` (sign + verify helper)
- `backend/src/routes/agentToken.ts` (the mint route)
- `backend/src/routes/internalAgentTool.ts` (the verify + dispatch)
- `langgraph-agent/src/estiaClient.ts` / `src/tools.ts` (forwards the token)

## Remaining for a full cutover (not in this change)

The frontend ↔ LangGraph-Platform wiring is **not** implemented here.
To go live, still needed: (a) the frontend (or a backend proxy) calls
`GET /api/ai/agent-token`, opens a LangGraph run with
`configurable.estiaToken`, and renders the stream; (b) deploy the graph
to LangGraph Platform with `ANTHROPIC_API_KEY` + `ESTIA_API_BASE`;
(c) set `ESTIA_AGENT_TOKEN_SECRET` on the backend; (d) enable the nginx
IP allowlist with LangGraph's published egress IPs.
