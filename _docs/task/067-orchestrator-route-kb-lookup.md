# Task 067 — Orchestrator Route + KB Embedding Lookup

> **Status:** TESTING
> **Completed:** 2026-06-19
> **Implementation Notes:** Lane 2 GitHub execution deferred to `lane_2_queued` response — `executeGitHubPlan()` requires a real `planId` FK'd to `implementation_plans`, which requires an `assessment_id` (NOT NULL); creating a stub plan is out of scope here. Lane 1 executes `executeSanityPlan()` directly. KB RPC uses `try/catch` not `.catch()` chaining (Supabase builders don't have `.catch()`). `task_logs` insert extracted to `insertTaskLog()` helper to avoid repetition across three lane paths. `getEmbedding` failure is fully non-fatal — KB lookup is best-effort.
> **Priority:** HIGH
> **Type:** feature
> **Recommended Model:** sonnet
> **Investigation:** /understand ran before this spec. Findings embedded below.
> **Dependencies:** T063 (KB schema must be applied), T065 (SANITY_GLOBAL_TOKEN), T066 (sub-task enumerator)

---

## Goal

Create the unified `/api/orchestrate` entry point that the pipeline plan specifies. This route accepts a task (title, description, project context), runs a KB embedding lookup, calls `enumerateSubTasks()`, and routes each sub-task to the correct lane.

This is the central hub of the pipeline — everything converges here after classification.

---

## Requirements

- [ ] Create `src/app/api/orchestrate/route.ts` — POST endpoint, auth-gated
- [ ] Input schema: `{ task_id: string, title: string, description: string, project: { id: string, sanity_project_id: string, dataset: string, vercel_project_id: string, github_repo: string } }`
- [ ] Step 1: Generate embedding for `description` using `@ai-sdk/openai` text-embedding model (or Anthropic equivalent) and call `match_kb_entries` RPC — threshold 0.85, limit 1
- [ ] Step 2: If KB hit → include KB match in context; if no hit → classify from scratch via `enumerateSubTasks()`
- [ ] Step 3: Route each sub-task: `sanity` → Lane 1 handler, `code` → Lane 2 handler, `both` → Lane 3 sequencing (T069)
- [ ] Step 4: Insert a `task_logs` row with `triggered_by: user.email`, `triggered_by_id: user.id`, `kb_hit`, `lane`, `tools_called`
- [ ] Lane 1 handler: call existing `executeSanityPlan()` via the already-built execution path; or call the new Lane 1 sub-handler
- [ ] Lane 2 handler: call existing `executeGitHubPlan()` path
- [ ] Lane 3: block and return `{ status: 'lane_3_queued', message: 'Code sub-tasks must complete first' }` — full sequencing implemented in T069
- [ ] Return `{ ok: true, lane, sub_tasks, kb_hit, task_log_id }`
- [ ] TypeScript check passes: `npx tsc --noEmit` exits 0

## Out of Scope / Must-Not-Change

- Do not remove or modify existing `/api/execution`, `/api/assessment`, `/api/plan` routes — they continue to work independently
- Do not implement full Lane 3 sequencing here (T069 handles that)
- Do not integrate `mcp.sanity.io` MCP client in this task — use existing `executeSanityPlan()` REST path
- No UI changes

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/orchestrate/route.ts` | Create | Unified pipeline entry point |
| `src/lib/ai/embeddings.ts` | Create | `getEmbedding(text: string): Promise<number[]>` — thin wrapper around AI SDK embedding call |

---

## Code Context

### Auth guard pattern (src/app/api/execution/route.ts:18-25)

```ts
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### Parallel DB fetch pattern (src/app/api/execution/route.ts:39-54)

```ts
const [{ data: plan }, { data: classification }] = await Promise.all([
  adminClient.from("implementation_plans").select("id, steps").eq("id", planId).maybeSingle(),
  adminClient.from("classification_records").select("task_type").eq("id", classificationId).maybeSingle(),
]);
```

### KB RPC call (from plan doc + T063 schema)

```ts
const embedding = await getEmbedding(description);
const { data: kbHit } = await adminClient.rpc('match_kb_entries', {
  query_embedding: embedding,
  match_threshold: 0.85,
  match_count: 1,
});
const context = kbHit?.length
  ? `KB Match: ${JSON.stringify(kbHit[0])}`
  : 'No KB match. Classify from scratch.';
```

### task_logs insert (plan doc)

```ts
await adminClient.from('task_logs').insert({
  task_id,
  description,
  result: text,
  project_id: project.id,
  triggered_by: user.email,
  triggered_by_id: user.id,
  kb_hit: Boolean(kbHit?.length),
  lane,
  tools_called: [],
});
```

### enumerateSubTasks (T066 output)

```ts
import { enumerateSubTasks } from '@/lib/ai/classify';
const subTasks = await enumerateSubTasks(classificationId);
// subTasks: Array<{ id, description, classification: 'sanity'|'code'|'both', lane: 1|2|3, order }>
```

### Embedding — use AI SDK

```ts
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function getEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: text,
  });
  return embedding;
}
```

Note: `text-embedding-3-small` produces 1536-dimensional vectors, matching `kb_entries.embedding vector(1536)`.

---

## Implementation Steps

1. Create `src/lib/ai/embeddings.ts` with `getEmbedding(text)` using `embed` from AI SDK and `openai.embedding('text-embedding-3-small')`
2. Create `src/app/api/orchestrate/route.ts`:
   - Auth guard (Supabase session)
   - Parse and validate request body (Zod schema)
   - `getEmbedding(description)` → `adminClient.rpc('match_kb_entries', ...)`
   - Decide: KB hit context vs. fresh classification
   - Call `enumerateSubTasks(classificationId)` — this requires a `classification_records` row to exist; if no classification record exists yet, call `classifyTask()` first to create one
   - Route sub-tasks by `classification`:
     - `sanity` or `both`-sanity-part → call `executeSanityPlan()`
     - `code` → call `executeGitHubPlan()`
     - Lane 3 → return `lane_3_queued` (T069)
   - Insert `task_logs` row
   - Return response
3. Run `npx tsc --noEmit`

---

## Acceptance Criteria

- [ ] `POST /api/orchestrate` accepts task + project context, returns 401 if unauthenticated
- [ ] KB lookup runs before classification; KB hit is included in context
- [ ] Sub-tasks are enumerated via `enumerateSubTasks()`
- [ ] Lane 1 sub-tasks route to Sanity execution path
- [ ] Lane 2 sub-tasks route to GitHub execution path
- [ ] Lane 3 returns `lane_3_queued` response (full impl in T069)
- [ ] `task_logs` row inserted with `triggered_by` and `kb_hit`
- [ ] `npx tsc --noEmit` exits 0

## Verification

```bash
npx tsc --noEmit
# Manual test: POST /api/orchestrate with a Lane 1 task
# → check task_logs table in Supabase for the log row
# → check execution_records for the completed Sanity execution
```

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-06-19

### What was built
`POST /api/orchestrate` — auth-gated unified pipeline entry point. KB text-similarity lookup via `adminClient.rpc("match_kb_by_text", ...)` (pg_trgm, inline — no separate embeddings.ts). `classifyTask()` → `enumerateSubTasks()` flow. Lane routing: 1 executes `executeSanityPlan()` directly, 2 returns `lane_2_queued` (GitHub needs PM plan approval), 3 returns `lane_3_queued`. `insertTaskLog()` helper extracted to avoid repetition. `task_logs` row inserted with `triggered_by`, `kb_hit`, `lane`.

### How to access for testing
- `POST /api/orchestrate` with `{ task_id, title, description, project: { id, sanity_project_id, dataset } }`
- Check `task_logs` table in Supabase for the log row
- Lane 1 produces a new `execution_records` row

### Deviations from plan
- **Medium:** KB lookup uses `adminClient.rpc("match_kb_by_text")` inline (pg_trgm) instead of `getEmbedding()` + `match_kb_entries` as specified. `embeddings.ts` was not created since pg_trgm approach (established in T068) requires no API key. Non-fatal try/catch wraps the lookup. Consistent with T068's architecture decision.
- **Medium (documented):** Lane 2 deferred to `lane_2_queued` response — `executeGitHubPlan()` requires a real `planId` FK'd to `implementation_plans` which requires an `assessment_id` (NOT NULL); a stub plan is out of scope.

### Standards check
Pass — auth guard present, Zod input validation, `insertTaskLog` helper prevents code duplication, no `any` types, no hard-coded model IDs (LLM calls delegated to classify.ts which uses `getModelConfig`).

### Convention check
Pass — existing `/api/execution`, `/api/assessment`, `/api/plan` routes untouched, `adminClient` used correctly in server route, `buildContextChain` called before Sonnet prompt.

---

## Notes for Implementation Agent

- This task is sonnet-recommended: new architecture, cross-cutting concern (touches classify, execution, github, sanity, KB), security-sensitive auth gate, and complex routing logic.
- `OPENAI_API_KEY` must be set for `text-embedding-3-small`. If OpenAI is not available, use the Anthropic text embedding model as an alternative — but check the vector dimension matches `vector(1536)`.
- The orchestrator needs a `classificationId` to call `enumerateSubTasks()`. If the task comes in fresh (no prior classification), call `classifyTask()` first, then pass the returned record's `id` to `enumerateSubTasks()`.
- The existing `/api/execution`, `/api/assessment`, `/api/plan` routes are the step-by-step PM workflow. The orchestrator is the automated pipeline entry point — they coexist.
- Log every tool call in `task_logs.tools_called` array for the audit trail.
