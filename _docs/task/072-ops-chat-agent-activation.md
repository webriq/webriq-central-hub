# Ops Chat Agent Activation — Tool-Calling Assistant (Claude + Vercel AI SDK + Sanity MCP)

> **Status:** TESTING
> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Created:** 2026-06-21
> **Platform:** Web (v2 hub)
> **Automation:** manual

## Overview

The v2 Ops Chat panel (`src/app/v2/(hub)/_components/ops-chat.tsx`) is currently a **fully mocked UI** — it ships canned sample tasks/leave cards and a hard-coded `getAIResponse()` keyword matcher. This task **activates** it into a real, streaming, tool-calling agent powered by Claude via the Vercel AI SDK.

The activated Ops Chat will: (1) **read live operational data** — `tasks`, `classification_records`, and `tickets`, scoped by the user's role; (2) **stream** responses token-by-token; and (3) **take action** — trigger the orchestration pipeline and execute Sanity content automation via the Sanity MCP server. This reuses existing infrastructure (`getModel`, `logLLMInvocation`, `executeSanityPlan`, `/api/orchestrate` logic) rather than inventing new patterns.

## Requirements

### Must Have
- [ ] New streaming endpoint `POST /api/ops-chat` using Vercel AI SDK `streamText` + `toUIMessageStreamResponse()`
- [ ] Model is DB-driven via a new `ops_chat` orchestration layer (Sonnet) — never hard-coded
- [ ] **Read tools** (Vercel AI SDK `tool()`): `list_tasks`, `list_classifications`, `list_tickets`
- [ ] **Role scoping**: developers see only their own tasks (assignee match); pm/admin/hr see all. Tickets visible to pm/admin/hr only. Role read from `profiles`.
- [ ] **Action tools**: `run_orchestration` (classify → enumerate → lane routing → Sanity execution, reusing `/api/orchestrate` logic) + raw Sanity MCP tools via `createMCPClient`
- [ ] Frontend rewritten to use `useChat` from `@ai-sdk/react` with streaming render; preserves the existing visual design (Ops AI bubbles, user bubbles, thumbs rating)
- [ ] Header input `trigger` (built in the prior change) auto-sends its message through `useChat.sendMessage`
- [ ] Every LLM invocation logged via `logLLMInvocation({ layer: "ops_chat", ... })`
- [ ] Sanity MCP client opened per-request and **closed in `onFinish`/`onError`** (no leaked connections)
- [ ] Sanity write safety preserved: agent creates/patches **DRAFT only**, never auto-publishes (same rules as `EXECUTION_SYSTEM_PROMPT`)

### Nice to Have
- [ ] Render tool results as rich cards (reuse the existing `tasks`/`leave` card styling) instead of plain text
- [ ] Persist conversation history (out of scope — note for a follow-up task)
- [ ] Per-customer cost attribution when a tool acts on a specific customer (`customerId` on the log)

## Current State

Ops Chat is presentational only. The shell already wires open/close + a `trigger` object for header-initiated messages (completed in the prior change). The AI/MCP plumbing exists and is proven in `lib/sanity` and `/api/orchestrate`.

**Current Files:**
| File | Purpose |
|------|---------|
| `src/app/v2/(hub)/_components/ops-chat.tsx` | Mocked chat UI — `INITIAL_MESSAGES`, `getAIResponse()`, sample cards. Accepts `{ open, onClose, trigger }`. |
| `src/app/v2/(hub)/_components/v2-hub-shell.tsx` | Owns `opsChatOpen` + `chatTrigger` state; renders `<OpsChat …>`. |
| `src/lib/ai/model-config.ts` | `getModel(layer)` / `getModelConfig(layer)` — DB-driven, 5-min cache. |
| `src/lib/ai/logger.ts` | `logLLMInvocation()` — cost attribution. |
| `src/lib/sanity/index.ts` | `executeSanityPlan()` — proven `createMCPClient` + `generateText` + Sanity MCP tool pattern. |
| `src/app/api/orchestrate/route.ts` | Pipeline: classify → enumerate → lane → Sanity execution. Logic to factor out into a reusable helper. |
| `src/app/api/dev/ask/route.ts` | Reference for auth + `generateText` + logging in a route. |
| `src/types/hub.ts` | `OrchestrationLayer` union — add `"ops_chat"`. |
| `supabase/migrations/001_initial_schema.sql` | CHECK constraints on `llm_config.orchestration_layer` and `llm_invocation_logs.orchestration_layer`. |
| `supabase/migrations/002_seed_llm_config.sql` | Per-layer model seed (upsert pattern). |

## Proposed Solution

### Architecture

```
┌─ ops-chat.tsx (client) ─────────────┐        ┌─ POST /api/ops-chat (server) ───────────────┐
│ useChat({ transport → /api/ops-chat})│  HTTP  │ 1. auth (createClient().auth.getUser())     │
│  - streams UI messages              │ ─────► │ 2. role ← profiles.role                      │
│  - trigger → sendMessage()          │        │ 3. model ← getModel("ops_chat")  (Sonnet)   │
│  - renders text + tool parts        │ ◄───── │ 4. sanityMCP ← createMCPClient(mcp.sanity.io)│
└─────────────────────────────────────┘ stream │ 5. streamText({ model, system, messages,    │
                                                │      tools: { ...localTools, ...mcpTools }, │
                                                │      stopWhen: stepCountIs(8),              │
                                                │      onFinish: log + mcp.close() })         │
                                                │ 6. return toUIMessageStreamResponse()       │
                                                └─────────────────────────────────────────────┘
        localTools: list_tasks · list_classifications · list_tickets · run_orchestration
        mcpTools:   Sanity MCP (query/create/patch documents, schemas) — DRAFT-only by prompt rule
```

Key decisions:
- **Streaming via AI SDK UI protocol.** `streamText(...).toUIMessageStreamResponse()` on the server pairs with `useChat` on the client (`@ai-sdk/react`). This is the canonical v6 pattern and replaces the bespoke `setTimeout` typing simulation.
- **Role scoping inside tool `execute`.** Each read tool queries Supabase with the request-scoped server client (RLS enforced) and additionally narrows by role for developers. Role is fetched once at the top of the handler.
- **Reuse, don't duplicate.** Factor the pipeline body of `/api/orchestrate` into `src/lib/pipeline/orchestrate.ts::runOrchestration(...)` so both the existing route and the new `run_orchestration` tool call the same code.
- **MCP lifecycle.** Open one `sanityMCP` client per request; close it in **both** `onFinish` and `onError` to avoid leaks (the existing `executeSanityPlan` uses `finally` around a single `generateText`; streaming needs the callback form).
- **New DB layer.** Add `ops_chat` to both CHECK constraints + seed an `llm_config` row (Sonnet, temp ~0.3). Add `"ops_chat"` to the `OrchestrationLayer` type.

### File Changes

| Action | File | Description |
|--------|------|-------------|
| CREATE | `supabase/migrations/030_ops_chat_llm_layer.sql` | Widen both `orchestration_layer` CHECK constraints to include `ops_chat`; upsert `llm_config` row (Sonnet). |
| CREATE | `src/app/api/ops-chat/route.ts` | Streaming agent endpoint — auth, role, model, tools, MCP, logging. |
| CREATE | `src/lib/ai/ops-chat-tools.ts` | Vercel AI SDK `tool()` defs: `list_tasks`, `list_classifications`, `list_tickets`, `run_orchestration`. Factory takes `{ supabase, userId, role }`. |
| CREATE | `src/lib/pipeline/orchestrate.ts` | `runOrchestration(input)` extracted from `/api/orchestrate/route.ts`. |
| MODIFY | `src/app/api/orchestrate/route.ts` | Call `runOrchestration()` instead of inline pipeline (no behavior change). |
| MODIFY | `src/app/v2/(hub)/_components/ops-chat.tsx` | Replace mock with `useChat`; stream render; wire `trigger → sendMessage`; update footnote. |
| MODIFY | `src/types/hub.ts` | Add `"ops_chat"` to `OrchestrationLayer`. |
| MODIFY | `package.json` / lockfile | Add `@ai-sdk/react` (via `pnpm add`). |

## Implementation Steps

### Step 1: DB migration + type
Create `supabase/migrations/030_ops_chat_llm_layer.sql`:
```sql
-- Widen CHECK constraints to allow the ops_chat layer
alter table llm_config drop constraint llm_config_orchestration_layer_check;
alter table llm_config add constraint llm_config_orchestration_layer_check
  check (orchestration_layer in ('classification','assessment','planning','execution','digest','reply','wiki_lint','ops_chat'));

alter table llm_invocation_logs drop constraint llm_invocation_logs_orchestration_layer_check;
alter table llm_invocation_logs add constraint llm_invocation_logs_orchestration_layer_check
  check (orchestration_layer in ('classification','assessment','planning','execution','digest','reply','wiki_lint','ops_chat'));

-- Seed the ops_chat model (Sonnet — agentic tool use over ops data)
insert into llm_config (orchestration_layer, model_id, max_tokens, temperature, notes)
values ('ops_chat', 'claude-sonnet-4-6', 8192, 0.30, 'Sonnet: streaming Ops Chat agent — task/ticket reads + Sanity MCP automation')
on conflict (orchestration_layer) do update set
  model_id = excluded.model_id, max_tokens = excluded.max_tokens,
  temperature = excluded.temperature, notes = excluded.notes, updated_at = now();
```
> ⚠️ Verify the exact constraint names in the live DB before running (`\d llm_config`). Names above follow Postgres' default `<table>_<column>_check` convention used in migration 001.

Add `"ops_chat"` to `OrchestrationLayer` in `src/types/hub.ts`.

### Step 2: Extract `runOrchestration`
Move the pipeline body of `src/app/api/orchestrate/route.ts` (KB lookup → `classifyTask` → `enumerateSubTasks` → lane decision → `executeSanityPlan` → `insertTaskLog`) into `src/lib/pipeline/orchestrate.ts` as `runOrchestration({ task_id, title, description, project, userId, userEmail })`. Have the route call it. **No behavior change** — verify with the existing orchestrate flow.

### Step 3: Tool factory
Create `src/lib/ai/ops-chat-tools.ts`. Example shape:
```ts
import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runOrchestration } from "@/lib/pipeline/orchestrate";

export function buildOpsChatTools(ctx: {
  supabase: SupabaseClient;
  userId: string;
  role: string;            // admin | pm | developer | hr | client
}) {
  const isStaff = ["admin", "pm", "hr"].includes(ctx.role);

  return {
    list_tasks: tool({
      description: "List tasks. Developers see only tasks assigned to them; staff see all.",
      inputSchema: z.object({
        status: z.enum(["backlog","todo","in_progress","for_review","done","cancelled"]).optional(),
        priority: z.enum(["low","normal","high","critical"]).optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
      execute: async ({ status, priority, limit }) => {
        let q = ctx.supabase.from("tasks")
          .select("id,title,status,priority,due_date,assignees,project_id")
          .order("position", { ascending: true }).limit(limit);
        if (status) q = q.eq("status", status);
        if (priority) q = q.eq("priority", priority);
        if (ctx.role === "developer") q = q.contains("assignees", [ctx.userId]);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return { tasks: data ?? [] };
      },
    }),

    list_classifications: tool({ /* classification_records, staff-only filter */ }),
    list_tickets: tool({ /* tickets, isStaff guard → return {error:"forbidden"} otherwise */ }),

    run_orchestration: tool({
      description: "Run the automation pipeline on a task (classify → subtasks → Sanity execution for lane 1).",
      inputSchema: z.object({ taskId: z.string().uuid() }),
      execute: async ({ taskId }) => {
        // load task + project, then call runOrchestration(...)
        // guard: only staff may trigger actions
      },
    }),
  };
}
```
Notes: use the **request-scoped server client** (RLS on), not `adminClient`. Return plain JSON-serialisable objects.

### Step 4: Streaming route
Create `src/app/api/ops-chat/route.ts`:
```ts
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { createClient } from "@/lib/supabase/server";
import { getModel, getModelConfig } from "@/lib/ai/model-config";
import { logLLMInvocation } from "@/lib/ai/logger";
import { buildOpsChatTools } from "@/lib/ai/ops-chat-tools";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profile?.role ?? "client";

  const { messages }: { messages: UIMessage[] } = await req.json();

  const [model, config] = await Promise.all([getModel("ops_chat"), getModelConfig("ops_chat")]);
  const token = process.env.SANITY_GLOBAL_TOKEN;
  const sanityMCP = token
    ? await createMCPClient({ transport: { type: "http", url: "https://mcp.sanity.io", headers: { Authorization: `Bearer ${token}` } } })
    : null;

  const localTools = buildOpsChatTools({ supabase, userId: user.id, role });
  const mcpTools = sanityMCP ? await sanityMCP.tools() : {};
  const startMs = Date.now();

  const result = streamText({
    model,
    system: OPS_CHAT_SYSTEM_PROMPT, // role-aware; DRAFT-only Sanity rules; concise
    messages: convertToModelMessages(messages),
    tools: { ...localTools, ...(mcpTools as Record<string, unknown>) } as any,
    stopWhen: stepCountIs(8),
    onFinish: async ({ usage }) => {
      await sanityMCP?.close();
      await logLLMInvocation({
        layer: "ops_chat", modelUsed: config.model_id,
        inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0,
        durationMs: Date.now() - startMs, referenceType: "ops_chat",
      }).catch(() => {});
    },
    onError: async () => { await sanityMCP?.close(); },
  });

  return result.toUIMessageStreamResponse();
}
```
`OPS_CHAT_SYSTEM_PROMPT`: identify as WebriQ Ops AI; describe the tools; **never publish Sanity docs (DRAFT only)**; only staff may trigger `run_orchestration`; be concise; cite task IDs.

### Step 5: Frontend rewrite
Rewrite `ops-chat.tsx` to use `useChat`:
```ts
import { useChat } from "@ai-sdk/react";
// inside component:
const { messages, sendMessage, status } = useChat({ api: "/api/ops-chat" });
```
- Map `messages[].parts` → render `text` parts as bubbles; optionally render `tool-*` parts as status/cards.
- `status === "streaming"` drives the typing/streaming indicator (replaces `typing` + `setTimeout`).
- `trigger` effect: when a new `trigger.ts` arrives and `open`, call `sendMessage({ text: trigger.message })` (keep the `processedTsRef` dedupe).
- Keep input box; on send call `sendMessage({ text: input })`.
- Update the footnote from "Read-only — actions arrive in Phase 2" to reflect live + action capability.
- Remove `INITIAL_MESSAGES`, `getAIResponse`, `SAMPLE_TASKS`, `SAMPLE_LEAVE` (or repurpose card markup for tool-result rendering).

### Step 6: Dependency + checks
- `pnpm add @ai-sdk/react`
- `npx tsc --noEmit` clean
- Manual: ask "what are my tasks?" (dev vs PM scoping), then a Sanity content request → confirm DRAFT-only behavior and a row in `llm_invocation_logs` with `orchestration_layer = 'ops_chat'`.

## Code Examples

System prompt sketch:
```
You are WebriQ Ops AI, an assistant inside the WebriQ Central Hub.
Tools: list_tasks, list_classifications, list_tickets (read); run_orchestration + Sanity MCP (act).
Rules:
- Use tools to ground every factual answer; never invent task IDs or statuses.
- Sanity: create/patch DRAFTS only — NEVER publish. Verify schema/existence before writing.
- Only staff (admin/pm/hr) may trigger run_orchestration or Sanity writes. Refuse politely otherwise.
- Be concise. Reference task IDs. Report what you did and what needs human review.
```

## Testing Checklist
- [ ] Unauthenticated `POST /api/ops-chat` → 401
- [ ] Developer asks "my tasks" → only their assigned tasks returned
- [ ] PM/admin asks "all open tasks" → full list; tickets accessible
- [ ] Developer attempts a Sanity write / `run_orchestration` → politely refused (staff-only)
- [ ] Response streams token-by-token in the panel
- [ ] Header input message auto-sends on open (trigger path) and isn't double-sent
- [ ] Sanity request produces a DRAFT (never published) and reports what was done
- [ ] `llm_invocation_logs` row written with `orchestration_layer = 'ops_chat'`
- [ ] Sanity MCP client closes on both success and error (no hung requests)
- [ ] `npx tsc --noEmit` passes; existing `/api/orchestrate` still works after extraction

## Dependencies
- **New package:** `@ai-sdk/react` (for `useChat`). `ai@6.0.168`, `@ai-sdk/anthropic`, `@ai-sdk/mcp` already present.
- **APIs/env:** `SANITY_GLOBAL_TOKEN` (Sanity MCP), DB-driven model config.
- **Blocked by:** none. Builds on T065 (Sanity MCP), T066 (subtask enumerator), T067 (orchestrator route) — all in Testing.

## Notes for Implementation Agent
- **Never use `adminClient` for the read tools** — use the request-scoped `createClient()` so RLS applies; layer the developer/staff narrowing on top.
- **Always** call `logLLMInvocation` in `onFinish` (project rule — no exceptions).
- **Never hard-code the model** — `getModel("ops_chat")`.
- Confirm the exact CHECK constraint names against the live DB before the migration (`\d+ llm_config`, `\d+ llm_invocation_logs`).
- Keep the existing Ops Chat visual language (amber Ops AI avatar, dark user bubbles) — this is a logic swap, not a redesign.
- Verify the AI SDK v6 streaming API surface (`toUIMessageStreamResponse`, `convertToModelMessages`, `useChat` import path) against the installed version before finalizing — pin to what `ai@6.0.168` + `@ai-sdk/react` expose.
- Do not run any git commands (project rule).

## Related
- Sanity MCP pattern: `src/lib/sanity/index.ts` (`executeSanityPlan`)
- Pipeline: `src/app/api/orchestrate/route.ts`
- Prior chat reference: `src/app/api/dev/ask/route.ts`
- Tasks: T065 (Sanity MCP), T066 (enumerator), T067 (orchestrator)
