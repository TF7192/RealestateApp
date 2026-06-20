# Scoping: hosting the Estia chat agent on LangGraph Platform

Status: scoping only (no code). Written 2026-06-20.

## TL;DR
Hosting the agent on LangGraph Platform ("Create New Deployment / one-click
server") is a **rewrite, not a config file**. The `langgraph.json not found`
error is correct: this repo has no LangGraph app. The hard part isn't the
graph — it's that the agent's tools read our **private RDS** directly, and a
cloud-hosted graph can't. Rough effort: **~5–8 working days** + ongoing
dual-maintenance unless we fully cut over. Recommendation below.

## What exists today
- Chat agent lives in `backend/src/routes/ai.ts` (WebSocket handler): a
  hand-rolled Anthropic tool-use loop (`claude-haiku-4-5`, max 6 iterations),
  streaming token deltas + `tool_use`/`done` events over a WS the frontend
  opens per turn.
- Tools: `backend/src/lib/aiChatTools.ts` — **10 tools**, all executed via
  `runChatTool(name, input, { agentId })`. Every query is **agentId-scoped**
  (`where: { agentId }`) — that scoping IS the security boundary.
- Auth: `requireUser(req)` (JWT cookie) → `user.id` = agentId. Quota via
  `requireAiQuota`; usage recorded via `recordAnthropic`.
- Observability: LangSmith **tracing** already wired (env-gated). That is a
  *different product* from LangGraph Platform (a hosted *runtime*).

## What LangGraph Platform requires
- `langgraph.json` at repo root → points at a compiled LangGraph graph +
  declares deps/env.
- A `StateGraph` (JS `@langchain/langgraph` or Python) with an LLM node + a
  tool node, deployed as a container running LangGraph's agent server
  (threads, persistence, streaming, public Assistants API).

## The core problem: data access + auth
The graph runs in **LangChain's cloud**, but RDS is private (VPC; only the
EC2 security group can reach 5432 — see infra memory). So the ported tools
**cannot** use Prisma directly. They must call back into the Estia backend
over authenticated HTTPS:

1. **Internal tool endpoint** on Estia, e.g. `POST /internal/agent-tool`
   `{ name, input }`, which validates the caller and runs the existing
   `runChatTool(name, input, { agentId })`. Reuses all current tool logic —
   one new endpoint, no tool rewrite on the data side.
2. **Per-agent auth for the graph.** The hosted graph must act *as a specific
   agent*. Safest: Estia mints a short-lived signed token scoped to that
   agentId, passed into the graph run config and forwarded by each tool call;
   Estia validates + enforces `agentId`. Avoid a static "god" service key
   (a leak = cross-agent data exposure).

## Work breakdown (JS recommended — reuse backend types/logic)
| Piece | Effort |
|---|---|
| Backend `/internal/agent-tool` endpoint + per-agent token mint/validate | 0.5–1 d |
| LangGraph graph: LLM node + 10 tools as HTTP-calling LangChain tools + port the Hebrew system prompt | 1–2 d |
| `langgraph.json` + deps + local `langgraph dev` parity testing | 0.5 d |
| Deploy to LangGraph Platform + env (ANTHROPIC key, Estia API base, signing secret) | 0.5 d |
| Frontend: switch chat client to LangGraph SDK (threads/streaming) **or** keep Estia WS as a proxy to the graph | 1–2 d |
| Parity testing vs current agent (tools, streaming UX, quota) | 1 d |

JS over Python so the tool I/O shapes and prompt can track the existing
backend; avoids a second source of truth in another language.

## Risks / trade-offs
- **Dual maintenance**: two agent implementations unless we fully cut the
  in-app agent over to the hosted one.
- **Latency**: extra hop (cloud graph → Estia API → RDS) per tool call.
- **Security**: the hosted graph needs credentialed, agent-scoped access to
  private data — new attack surface; the signing secret/token is sensitive.
- **Cost**: LangGraph Platform runtime + egress, on top of current infra.
- **UX remap**: current WS streaming (text deltas, `tool_use` events) must be
  re-expressed via LangGraph's streaming/threads.

## Recommendation
The agent is tightly (and deliberately) coupled to the DB with per-agent
scoping; that's its strength. **Keep it in the Estia backend** (direct DB,
fast, secure) **+ LangSmith tracing** (already done) unless you specifically
need LangGraph Platform's hosted features: durable threads, human-in-the-loop
checkpoints, cron/scheduled runs, or a public multi-client Assistants API.

If we do proceed, the lowest-risk first step is the **backend
`/internal/agent-tool` endpoint + a thin JS graph**, keeping the frontend on
the Estia WS (proxying to the graph) so the chat UX doesn't change until
parity is proven.
