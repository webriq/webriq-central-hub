# Task 066 — Sub-task Enumerator (sanity | code | both lane tagging)

> **Status:** TESTING
> **Completed:** 2026-06-19
> **Implementation Notes:** `enumerateSubTasks()` added to classify.ts alongside existing `classifyTask()`. `SubTask` type derived from Zod schema (single source of truth) and re-exported from `hub.ts`. `Json` import added to classify.ts for the DB update cast. Classification rules table embedded verbatim in the prompt. Uses same model selection pattern as classifyTask (`getModelConfig("classification")` + `getLanguageModel()`). Migration 029 adds `sub_tasks jsonb` column.
> **Priority:** HIGH
> **Type:** feature
> **Recommended Model:** sonnet
> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Goal

Add a sub-task enumeration step on top of the existing classifier. The current `classifyTask()` produces a single `task_type` per ticket. The pipeline needs tickets broken into **atomic sub-tasks**, each tagged `sanity | code | both` and assigned a lane (1|2|3).

This is the most critical piece of the pipeline: everything downstream (orchestrator routing, KB indexing, Lane 3 sequencing) depends on sub-task tags being present.

Implementation approach: a new `enumerateSubTasks()` function that takes a classification record as input and returns an array of sub-tasks. Sub-tasks are stored as a JSONB array on the `classification_records` row (new column `sub_tasks`), or in a new `classification_sub_tasks` table. JSONB column is simpler and sufficient — no FK joins needed for this data.

---

## Requirements

- [ ] Add `sub_tasks jsonb` column to `classification_records` via migration `029_classification_subtasks.sql`
- [ ] Create `enumerateSubTasks(classificationId: string): Promise<SubTask[]>` in `src/lib/ai/classify.ts`
- [ ] `SubTask` type: `{ id: string, description: string, classification: 'sanity' | 'code' | 'both', lane: 1 | 2 | 3, order: number }`
- [ ] Use `generateObject` with a Zod schema (same pattern as existing `classifyTask()`)
- [ ] After enumeration, write sub-tasks array to `classification_records.sub_tasks`
- [ ] Log the LLM invocation via `logLLMInvocation()`
- [ ] Export `SubTask` type from `src/types/hub.ts`
- [ ] Update `src/types/database.ts` for `classification_records.sub_tasks` column
- [ ] TypeScript check passes: `npx tsc --noEmit` exits 0

## Out of Scope / Must-Not-Change

- Do not modify the existing `classifyTask()` function signature — `enumerateSubTasks()` is a separate call
- Do not change the `ClassificationSchema` Zod schema — the existing `task_type` enum stays
- Do not wire this into the orchestrator route in this task (Task 067 does that)
- No UI changes

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/029_classification_subtasks.sql` | Create | Add `sub_tasks jsonb` column to `classification_records` |
| `src/lib/ai/classify.ts` | Modify | Add `enumerateSubTasks()` + `SubTask` type + `SubTaskSchema` |
| `src/types/hub.ts` | Modify | Export `SubTask` type |
| `src/types/database.ts` | Modify | Add `sub_tasks: Json | null` to `classification_records` Row/Insert/Update |

---

## Code Context

### Current ClassificationSchema (src/lib/ai/classify.ts:13-22)

```ts
const ClassificationSchema = z.object({
  task_type: z.enum([
    "CONTENT_UPDATE", "SETTINGS_CHANGE", "BLOG_PUBLISH", "ASSET_UPLOAD",
    "CODE_CHANGE_MINOR", "SEO_UPDATE", "BUG_REPORT", "FEATURE_REQUEST", "STRATEGIC", "OTHER",
  ]),
  priority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]),
  llm_eligible: z.enum(["YES", "NO", "HUMAN_ONLY"]),
  confidence_score: z.number().min(0).max(100),
  reasoning: z.string(),
});
```

### New schema to add (alongside existing, do not replace)

```ts
const SubTaskSchema = z.object({
  id: z.string(),                                    // short slug, e.g. "update-seo-title"
  description: z.string(),
  classification: z.enum(["sanity", "code", "both"]),
  lane: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  order: z.number().int().positive(),
});

const SubTaskEnumerationSchema = z.object({
  sub_tasks: z.array(SubTaskSchema).min(1),
  reasoning: z.string(),
});
```

### generateObject pattern (from existing classifyTask)

```ts
const { object, usage } = await generateObject({
  model,
  schema: SubTaskEnumerationSchema,
  prompt: `Break this task into atomic sub-tasks...`,
});
```

### Admin write pattern

```ts
await adminClient
  .from("classification_records")
  .update({ sub_tasks: object.sub_tasks })
  .eq("id", classificationId);
```

### Classification rules from plan doc

| Request Type | Tag | Lane |
|---|---|---|
| Update page title, SEO, text, slug, body | `sanity` | 1 |
| Create/delete page or document | `sanity` | 1 |
| Publish / unpublish content | `sanity` | 1 |
| New schema type or field | `code` | 2 |
| New component, layout, design change | `code` | 2 |
| Feature development | `code` | 2 |
| Content + schema/component together | `both` | 3 |

---

## Implementation Steps

1. Write `supabase/migrations/029_classification_subtasks.sql`:
   ```sql
   alter table classification_records
     add column if not exists sub_tasks jsonb;
   ```
2. In `src/lib/ai/classify.ts`, add after the existing `ClassificationSchema`:
   - `SubTaskSchema` and `SubTaskEnumerationSchema` Zod schemas
   - `export type SubTask = z.infer<typeof SubTaskSchema>`
   - `export async function enumerateSubTasks(classificationId: string): Promise<SubTask[]>`
     - Fetch the classification record by ID (title, description, task_type)
     - Call `getModelConfig("classification")` for model selection
     - Call `generateObject()` with the sub-task enumeration schema
     - Include the classification rules table in the prompt system message
     - Write `sub_tasks` back to `classification_records`
     - Call `logLLMInvocation()`
     - Return the sub_tasks array
3. Add `SubTask` export to `src/types/hub.ts`
4. Update `src/types/database.ts` — add `sub_tasks: Json | null` to `classification_records`
5. Run `npx tsc --noEmit`

---

## Acceptance Criteria

- [ ] `enumerateSubTasks(classificationId)` exists in `src/lib/ai/classify.ts`
- [ ] Returns an array of `SubTask` objects with `classification` and `lane` fields
- [ ] Result is written to `classification_records.sub_tasks`
- [ ] LLM invocation is logged via `logLLMInvocation()`
- [ ] `SubTask` type exported from `src/types/hub.ts`
- [ ] `npx tsc --noEmit` exits 0

## Verification

```bash
npx tsc --noEmit
# Manual test: call POST /api/classification/{id}/enumerate (or trigger from orchestration UI)
# → check classification_records.sub_tasks in Supabase dashboard
```

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-06-19

### What was built
`enumerateSubTasks(classificationId)` added to `src/lib/ai/classify.ts` alongside existing `classifyTask()`. `SubTaskSchema` + `SubTaskEnumerationSchema` Zod schemas defined. Classification rules table (sanity/code/both decision matrix) embedded verbatim in system prompt. Sub-tasks written back to `classification_records.sub_tasks` as JSONB. `logLLMInvocation` called. `SubTask` type exported from `src/types/hub.ts`. Migration 029 adds `sub_tasks jsonb` column.

### How to access for testing
- `POST /api/classification/{id}/enumerate` (or trigger from orchestration UI once wired in T067)
- Check `classification_records.sub_tasks` in Supabase dashboard after call
- `npx tsc --noEmit` exits 0

### Deviations from plan
- `SubTask` type derived from Zod schema via `z.infer<typeof SubTaskSchema>` (single source of truth) — cleaner than defining separately as specified; same shape.
- `as unknown as Json` cast for the JSONB update — necessary at Supabase type boundary, not a deviation from intent.

### Standards check
Pass — uses `getModelConfig("classification")` (not hard-coded model), `logLLMInvocation` present, `adminClient` used correctly (server-only), no `any` types.

### Convention check
Pass — existing `classifyTask()` signature unchanged, `ClassificationSchema` untouched, `SubTask` exported from `src/types/hub.ts` per convention, JSONB column added via migration.

---

## Notes for Implementation Agent

- This task is sonnet-recommended: new AI layer with complex business logic (the classification rules table must be embedded accurately in the prompt), cross-cutting type changes, and the sub-task ordering logic needs careful handling for Lane 3.
- The prompt for `enumerateSubTasks` must include the classification rules table from the plan doc (sanity/code/both decision matrix) as part of the system message so Claude applies them correctly.
- Use `getModelConfig("classification")` for model selection — do not hard-code the model ID.
- A single ticket should produce 1–N sub-tasks. A pure content ticket typically produces 1 sub-task tagged `sanity/lane-1`. A ticket requesting both a new schema field AND content update produces 2 sub-tasks: `code/lane-2` first, `sanity/lane-1` second.
- `sub_tasks` JSONB ordering (`order` field) is what drives Lane 3 sequencing in Task 069.
