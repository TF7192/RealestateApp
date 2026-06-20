// The Estia chat agent as a deployable LangGraph (StateGraph).
//
// Topology (mirrors the hand-rolled tool-use loop in
// backend/src/routes/ai.ts):
//
//   START → agent ──(tool calls?)──▶ tools ──▶ agent ─┐
//             │                                        │
//             └──────────(no tool calls)──────────────┴─▶ END
//
//   • agent : ChatAnthropic (claude-haiku-4-5) bound to the 10 Estia
//             tools, prepending the Hebrew SYSTEM prompt.
//   • tools : a ToolNode running the ported tools (each POSTs to the
//             Estia internal endpoint).
//   • Loop cap ~6 LLM turns — same as the in-app agent's `iter < 6`.
//
// LangSmith tracing: AUTOMATIC. When LANGSMITH_TRACING / LANGSMITH_API_KEY
// (and optionally LANGSMITH_PROJECT) env vars are set, importing the
// langchain packages wires tracing for every run — no code needed here.
//
// Agent identity: callers invoke the graph with
//   config: { configurable: { estiaToken: "<short-lived per-agent token>" } }
// where estiaToken is minted by Estia (GET /api/ai/agent-token) and
// scoped to one agent. tools.ts reads it off the config and forwards it
// to the backend, which derives the agentId from the verified token
// claim. No agentId is carried by the graph. See estiaClient.ts /
// backend/src/routes/internalAgentTool.ts for the full auth model.

import { ChatAnthropic } from '@langchain/anthropic';
import { AIMessage, SystemMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  StateGraph,
  MessagesAnnotation,
  START,
  END,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ESTIA_TOOLS } from './tools.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';

// Same model + token budget as the in-app agent. ANTHROPIC_API_KEY is
// read from env by ChatAnthropic automatically.
const model = new ChatAnthropic({
  model: 'claude-haiku-4-5',
  maxTokens: 1024,
  temperature: 0,
  // Populate the LangSmith-indexed model fields so traces report a
  // model/provider and cost can be computed (otherwise total_cost is null).
  metadata: { ls_provider: 'anthropic', ls_model_name: 'claude-haiku-4-5' },
}).bindTools(ESTIA_TOOLS);

const toolNode = new ToolNode(ESTIA_TOOLS);

// Max LLM turns before we stop looping — matches `iter < 6` in ai.ts.
const MAX_TURNS = 6;

// The agent node: prepend the system prompt, call the model. We count
// assistant turns via the message history so we can hard-stop at the
// same cap as the in-app loop instead of spinning on tools forever.
async function callModel(
  state: typeof MessagesAnnotation.State,
  config?: RunnableConfig,
): Promise<{ messages: AIMessage[] }> {
  const aiTurns = state.messages.filter((m) => m.getType() === 'ai').length;
  if (aiTurns >= MAX_TURNS) {
    // Polite punt — same copy as the in-app 6-iteration cap.
    return {
      messages: [
        new AIMessage('לא הצלחתי להרכיב תשובה. נסו/י לנסח את השאלה שוב.'),
      ],
    };
  }
  const response = await model.invoke(
    [new SystemMessage(SYSTEM_PROMPT), ...state.messages],
    config,
  );
  return { messages: [response] };
}

// Conditional edge: if the last assistant message asked for tools, run
// them; otherwise finish. Once we hit the turn cap, callModel emits a
// plain text message (no tool calls) so this routes to END naturally.
function shouldContinue(state: typeof MessagesAnnotation.State): 'tools' | typeof END {
  const last = state.messages[state.messages.length - 1] as AIMessage | undefined;
  if (last && Array.isArray(last.tool_calls) && last.tool_calls.length > 0) {
    return 'tools';
  }
  return END;
}

// Build + compile the graph. Exported as `graph` for langgraph.json.
const workflow = new StateGraph(MessagesAnnotation)
  .addNode('agent', callModel)
  .addNode('tools', toolNode)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', shouldContinue, ['tools', END])
  .addEdge('tools', 'agent');

// withConfig gives the root run a meaningful name + tags (otherwise every
// run shows as the default "LangGraph" in LangSmith).
export const graph = workflow.compile().withConfig({ runName: 'estia-chat', tags: ['estia', 'chat'] });

// Default export too, so langgraph.json can reference either form.
export default graph;
