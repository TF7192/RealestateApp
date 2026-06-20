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
  `POST {ESTIA_API_BASE}/internal/agent-tool { name, input, agentId }`
  back to the Estia backend, which runs the existing
  `runChatTool(name, input, { agentId })`. No tool logic is duplicated.

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
| `ESTIA_API_BASE` | yes | Estia backend base URL, e.g. `https://estia.co.il` (no trailing slash) |
| `ESTIA_INTERNAL_TOKEN` | yes | service token shared with the backend endpoint |
| `LANGSMITH_TRACING` | no | `true` to enable tracing |
| `LANGSMITH_API_KEY` | no | LangSmith key (tracing) |
| `LANGSMITH_PROJECT` | no | LangSmith project name |

**LangSmith tracing is automatic** — when the `LANGSMITH_*` vars are
set, importing the langchain packages wires tracing for every run. No
code change needed.

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
Studio. Invoke the `estia_agent` graph with a run config that carries
the agent identity:

```jsonc
{
  "configurable": { "agentId": "<the signed-in agent's user id>" }
}
```

The graph forwards `agentId` to the backend, which scopes every query
to that agent (`where: { agentId }`).

## Deploy on LangGraph Platform

1. Push this repo to GitHub (the root has `langgraph.json`).
2. In LangGraph Platform → **Create New Deployment**, connect the repo.
   It auto-discovers `langgraph.json` and builds the `estia_agent`
   graph.
3. Set the env vars above in the deployment's environment
   (`ANTHROPIC_API_KEY`, `ESTIA_API_BASE`, `ESTIA_INTERNAL_TOKEN`, and
   `LANGSMITH_*` for tracing).
4. The Estia backend must expose `/internal/agent-tool` (next section)
   and be reachable from LangGraph's cloud over HTTPS.

> Per the repo rules: **do not push or deploy without explicit
> go-ahead.** The steps above are for when that go-ahead is given.

## Wire up the backend internal endpoint

The endpoint already exists at
`backend/src/routes/internalAgentTool.ts` but is **not** registered
(that file's registration site, `backend/src/server.ts`, is being
edited elsewhere). To register it, add — next to the other
`app.register(...)` calls in `backend/src/server.ts`:

```ts
import { registerInternalAgentToolRoutes } from './routes/internalAgentTool.js';

// ...alongside the other route registrations:
await app.register(registerInternalAgentToolRoutes, { prefix: '/internal' });
```

That mounts `POST /internal/agent-tool`. Make sure `ESTIA_INTERNAL_TOKEN`
is set in the backend's environment (the endpoint fails closed with
`503` if it isn't).

> Note: `/internal/*` should NOT be exposed publicly without auth in
> front of it. The endpoint authenticates via the service token, but
> consider also restricting it at the nginx / security-group layer to
> the LangGraph egress IPs.

## ⚠️ Production security TODO (the key upgrade from the scoping doc)

The skeleton uses a **single static service token** and **trusts the
`agentId` in the request body**. That is fine for local `langgraph dev`
parity testing but **NOT for production**: a leaked token lets a caller
read *any* agent's data by passing their id — defeating the per-agent
scoping that is the agent's security boundary.

Before production, replace "static token + body agentId" with a
**short-lived, per-agent signed token**:

1. Estia mints a short-lived JWT (e.g. via `jose`, 5–15 min TTL) scoped
   to **one** `agentId` when it authorizes a graph run.
2. The token is threaded through the run config
   (`configurable.estiaAgentToken`) and forwarded by each tool call as
   the `Authorization: Bearer …` header (`src/estiaClient.ts`).
3. `backend/src/routes/internalAgentTool.ts` verifies the signature +
   expiry and derives `agentId` **from the verified token claim**,
   ignoring the body.

The exact TODO markers live in:

- `backend/src/routes/internalAgentTool.ts` (endpoint header + inline)
- `langgraph-agent/src/estiaClient.ts` (header)
- `langgraph-agent/src/tools.ts` (agent-identity note)
