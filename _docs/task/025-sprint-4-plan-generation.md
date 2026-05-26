# 025: Sprint 4 — Plan Generation (M5)

**Created:** 2026-05-26
**Priority:** HIGH
**Type:** feature
**Recommended Model:** sonnet
**Status:** TESTING
**Completed:** 2026-05-26

> **Recommended Model:** sonnet — spans 4 layers (AI lib, API route, orchestration UI, DB context extension); extends `buildContextChain()` which existing `assessTask()` calls depend on (regression risk); introduces structured `generateObject` schema for multi-field plan output.
>
> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Overview

Sprint 4, Part 1 of 2. Implements AI plan generation (M5) — the step after requirements assessment.

Claude Sonnet reviews a CLEAR-assessed task and produces a structured implementation plan: ordered steps, affected files, APIs involved, playbooks used, confidence score, and risk flags. PM triggers generation manually from the orchestration page, then approves or rejects the plan with a reason.

**Part 2 (task 026) covers:** Zoho Sync — pushing approved plans to Zoho Projects as tasks, bidirectional webhook status updates, and the `zoho_task_id` column migration on `implementation_plans`.

### Decisions (confirmed)
- Plan UI stays inline in `/orchestration/page.tsx` — no new subroute
- `kb_gaps` table / KB gap stubs on rejection → deferred to Sprint 6
- `zoho_task_id` column on `implementation_plans` → added in task 026 migration

---

## Requirements

- [ ] Extend `buildContextChain()` to include the latest `requirements_assessments` row (subtasks + overall_status) when one exists
- [ ] Create `src/lib/ai/plan.ts` with `generatePlan({ classificationId, customerId, assessmentId })` following `assessTask()` pattern exactly
- [ ] `POST /api/plan` — authenticated; triggers plan generation; returns `ImplementationPlanRow`
- [ ] `PATCH /api/plan` — authenticated; approve or reject a plan; updates `classification_records.status`
- [ ] Orchestration page — add Plan Generation section below the existing Assessment section:
  - Tasks with CLEAR assessment and no existing plan → "Generate Plan" button
  - Tasks with plan in `PENDING_APPROVAL` → plan details + Approve / Reject buttons (inline rejection reason dropdown)
  - Tasks with `APPROVED` plan → green approved badge, read-only
- [ ] On plan generate: update `classification_records.status = "planning"`
- [ ] On plan approve: update `classification_records.status = "approved"`
- [ ] On plan reject: update `classification_records.status = "pending"` (returns to assessment queue)
- [ ] Fetch `ACTIVE` playbooks matching `task_type` and include in plan prompt + `playbooks_used` field
- [ ] All LLM calls log via `logLLMInvocation({ layer: "planning", ... })`

## Out of Scope / Must-Not-Change

- Zoho task push — task 026
- `kb_gaps` table / KB gap stubs on rejection — Sprint 6
- `implementation_plans.zoho_task_id` column — task 026 migration
- Sprint 3 `assessTask()` logic — `buildContextChain()` extension must be purely additive
- Cliq notifications for plan events — Sprint 5 scope
- New page routes — Plan UI stays in `/orchestration/page.tsx`
- The existing Assessment section of the orchestration page (do not break it)

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/ai/context-chain.ts` | Modify | Append latest assessment section when one exists |
| `src/lib/ai/plan.ts` | Create | `generatePlan()` — Sonnet, structured plan output, inserts to `implementation_plans` |
| `src/app/api/plan/route.ts` | Replace stub | `POST` generate + `PATCH` approve/reject |
| `src/app/(hub)/orchestration/page.tsx` | Modify | Add Plan section: generate trigger + plan detail + approve/reject UI |

---

## Implementation Steps

### Step 1 — Extend `buildContextChain()` with Assessment Data

**`src/lib/ai/context-chain.ts`** (modify)

After the existing `=== TASK ===` section push (after `classification.description` block), add:

```typescript
// Fetch latest assessment for this classification
const assessmentResult = await adminClient
  .from("requirements_assessments")
  .select("overall_status, subtasks, assessment_version")
  .eq("classification_id", classificationId)
  .order("assessment_version", { ascending: false })
  .limit(1)
  .maybeSingle();

const assessment = assessmentResult.data;
if (assessment) {
  const subtasks = (assessment.subtasks as Array<{ title: string; status: string; notes?: string }>) ?? [];
  sections.push(
    ``,
    `=== ASSESSMENT (v${assessment.assessment_version}) ===`,
    `Overall Status: ${assessment.overall_status}`,
  );
  for (const st of subtasks) {
    sections.push(`  [${st.status}] ${st.title}${st.notes ? ` — ${st.notes}` : ""}`);
  }
}
```

**Critical:** The `if (assessment)` guard makes this purely additive — no assessment = no section added. `assessTask()` behavior is unchanged.

---

### Step 2 — Create `src/lib/ai/plan.ts`

Mirror `assess.ts` exactly. Key differences from `assessTask()`:

**Zod schema:**
```typescript
const PlanStepSchema = z.object({
  order: z.number(),
  title: z.string(),
  description: z.string(),
  estimated_hours: z.number().optional(),
});

const PlanSchema = z.object({
  steps: z.array(PlanStepSchema).min(1).max(20),
  affected_files: z.array(z.string()),
  apis_involved: z.array(z.string()),
  playbooks_used: z.array(z.string()),  // playbook titles, not IDs
  confidence_score: z.number().min(0).max(100),
  risk_flags: z.array(z.string()),
});
```

**Export:**
```typescript
export type PlanInput = {
  classificationId: string;
  customerId: string;
  assessmentId: string;
};
export async function generatePlan(input: PlanInput): Promise<ImplementationPlanRow | null>
```

**Logic:**
1. `buildContextChain(classificationId)` — now includes assessment section
2. Fetch the classification record to get `task_type` (needed for playbook lookup)
3. Fetch `ACTIVE` playbooks: `adminClient.from("playbooks").select("title, content").eq("task_type", taskType).eq("status", "ACTIVE").limit(5)`
4. Build `playbooksSection`: if any playbooks found, join as `=== PLAYBOOKS ===\n[title]\n[content]\n...`; if none, use `""` (omit section entirely — do not inject an empty block)
5. `const [model, config] = await Promise.all([getModel("planning"), getModelConfig("planning")])`
6. Call `generateObject({ model, schema: PlanSchema, prompt: ... })`
7. `logLLMInvocation({ layer: "planning", ... })` — always, on success and error
8. Insert to `implementation_plans`: `{ assessment_id, customer_id, steps, affected_files, apis_involved, playbooks_used, confidence_score, risk_flags, status: "PENDING_APPROVAL", model_used, input_tokens, output_tokens }`
9. Update `classification_records.status = "planning"` (adminClient UPDATE WHERE id = classificationId)
10. Return inserted plan row

**Prompt template:**
```
You are a senior technical project manager for a web development agency.

Given the following task context (customer, task, and requirements assessment):

${contextChain}

${playbooksSection}

Produce a structured implementation plan:
- Break the work into ordered steps (1–20)
- List all source files likely to be affected
- List all external APIs or integrations involved
- List which playbooks apply (by title)
- Assign a confidence score (0–100) based on how complete the requirements are
- Flag any risks or unknowns as risk_flags

If the assessment overall_status is BLOCKED, set confidence_score below 50 and add a risk flag noting the blocked dependency.
```

---

### Step 3 — Replace `/api/plan/route.ts` Stub

Two handlers in the same file:

**`POST /api/plan`**
```typescript
// Body: { classificationId: string; assessmentId: string; customerId: string }
// Returns: ImplementationPlanRow | { error: string }
```
1. Verify session (createClient from `@/lib/supabase/server`, check `getUser()`)
2. Validate body with Zod: `classificationId: z.string().uuid()`, `assessmentId: z.string().uuid()`, `customerId: z.string()`
3. Call `generatePlan({ classificationId, customerId, assessmentId })`
4. Return 200 with plan row, or 500 `{ error: "Plan generation failed" }` if null

**`PATCH /api/plan`**
```typescript
// Body: { planId: string; action: "approve" | "reject"; rejectionReason?: string }
// Returns: { ok: true } | { error: string }
```
1. Verify session
2. Validate body with Zod: `planId: z.string().uuid()`, `action: z.enum(["approve", "reject"])`, `rejectionReason: z.string().optional()`
3. Fetch plan row to get `assessment_id` → fetch assessment row to get `classification_id`
4. Get `userId` from session user
5. If `action === "approve"`:
   - Update `implementation_plans`: `status = "APPROVED"`, `approved_by = userId`
   - Update `classification_records`: `status = "approved"` WHERE id = classificationId
6. If `action === "reject"`:
   - Update `implementation_plans`: `status = "REJECTED"`, `rejection_reason = body.rejectionReason ?? null`, `rejected_by = userId`
   - Update `classification_records`: `status = "pending"` (returns task to assessment queue)
7. Use `adminClient` for all DB writes in this route

---

### Step 4 — Update Orchestration Page

**`src/app/(hub)/orchestration/page.tsx`** (modify)

**Data changes:**

Expand the classification query status filter from `eq("status", "pending")` to:
```typescript
.in("status", ["pending", "planning", "planned", "approved"])
```

Add a third parallel query for implementation plans:
```typescript
supabase.from("implementation_plans").select("*").order("created_at", { ascending: false })
```

Add new state and build an index by `assessment_id`:
```typescript
const [plans, setPlans] = useState<Record<string, ImplementationPlanRow>>({});
// build: plansByAssessmentId: { [assessmentId]: latestPlanRow }
```

**Page layout — two sections:**

```
─── Requirements Assessment ───────────────
[existing TaskRow list — tasks where no CLEAR assessment yet]

─── Plan Generation ───────────────────────
[PlanRow list — tasks where assessments[task.id]?.overall_status === "CLEAR"]
```

To avoid duplication: in the Assessment section, skip tasks where `assessments[task.id]?.overall_status === "CLEAR"` (they've moved to Plan). Show them as "Assessed — pending plan" if needed or simply omit from Assessment list.

**New `PlanRow` inline component** (same structure as `TaskRow`):
- Shows task title, `customer_id`, `priority`, `task_type`
- Props: `record: ClassificationRecordRow`, `existingAssessment: RequirementsAssessmentRow`, `existingPlan: ImplementationPlanRow | null`
- Local state: `PlanState { loading, result, error, actionLoading }`

**"Generate Plan" flow:**
- Button visible when `existingPlan === null`
- On click: POST `/api/plan` → on success set `result` + `setExpanded(true)`

**`PlanResult` inline component:**
- Props: `plan: ImplementationPlanRow`, `onAction: (action, reason?) => Promise<void>`, `actionLoading: boolean`
- Numbered steps list
- `affected_files` as small pill tags
- `Confidence: {score}%` label (color: green ≥80, yellow 50–79, red <50)
- `risk_flags` as red text rows (only if any)
- When `plan.status === "PENDING_APPROVAL"`: Approve button + Reject button
  - Reject → shows inline `<select>` with the 5 `PlanRejectionReason` options + "Confirm Reject" button
- When `plan.status === "APPROVED"`: green "Approved" badge, read-only

**`actionLoading` flow:**
- On Approve/Reject: PATCH `/api/plan` → on success mutate local `plans` state
- On reject + confirm: update `plans` state to remove the row (task returns to Assessment section)

**TypeScript:** add `type ImplementationPlanRow = Database["public"]["Tables"]["implementation_plans"]["Row"]` at the top of the page file.

---

## Acceptance Criteria

- [ ] `/orchestration` page shows a "Plan Generation" section below the Assessment section
- [ ] Tasks with CLEAR assessment and no existing plan show "Generate Plan" button
- [ ] Clicking "Generate Plan" calls POST /api/plan and renders plan steps inline
- [ ] Plan display includes: ordered steps, affected_files, confidence_score (color-coded), risk_flags
- [ ] "Approve" button sends PATCH and shows green "Approved" badge
- [ ] "Reject" shows a 5-option dropdown (PlanRejectionReason), submits PATCH, and removes task from Plan section
- [ ] Rejected task reappears in Assessment section on next page load
- [ ] `buildContextChain()` includes assessment data for assessed tasks
- [ ] `assessTask()` is unaffected — no regression (test by triggering assessment on a pending task)
- [ ] `npx tsc --noEmit` passes with no new errors

---

## Verification

```bash
npx tsc --noEmit
pnpm build

# Browser: /orchestration
# 1. Assessment section unchanged — "Run Assessment" still works on a pending task
# 2. CLEAR-assessed tasks appear in Plan section with "Generate Plan" button
# 3. Generate plan → steps appear, confidence shown
# 4. Approve → "Approved" badge shown
# 5. Reject → dropdown → confirm → task moves back to Assessment section
```

---

## Code Context

### `assess.ts` — Direct template for `plan.ts`

Full file at `src/lib/ai/assess.ts`. Mirror the structure exactly — same imports, same try/catch, same `logLLMInvocation` in both success and error paths, same `adminClient` insert pattern.

### `implementation_plans` Row Type (`src/types/database.ts:247–266`)

```typescript
Row: {
  id: string;
  assessment_id: string;        // FK → requirements_assessments.id
  customer_id: string;
  steps: Json;                  // PlanStep[]
  affected_files: Json;         // string[]
  apis_involved: Json;          // string[]
  playbooks_used: Json;         // string[] (titles)
  confidence_score: number | null;
  risk_flags: Json;             // string[]
  status: string;               // PlanStatus
  rejection_reason: string | null;
  rejected_by: string | null;
  approved_by: string | null;
  model_used: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
  updated_at: string;
  // zoho_task_id: added in task 026 migration
}
```

### `PlanStatus` + `PlanRejectionReason` (`src/types/hub.ts:52–66`)

```typescript
export type PlanStatus =
  | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "EXECUTING" | "COMPLETE" | "FAILED";

export type PlanRejectionReason =
  | "PLAN_INCOMPLETE" | "WRONG_APPROACH" | "SCOPE_EXCEEDED" | "KNOWLEDGE_GAP" | "MISCLASSIFICATION";
```

### `OrchestrationLayer` includes `"planning"` (`src/types/hub.ts:1–8`)

```typescript
export type OrchestrationLayer =
  | "classification" | "assessment" | "planning" | "execution" | "digest" | "reply" | "wiki_lint";
```

`getModel("planning")` will work once a `llm_config` row exists for this layer. If missing, the route returns 500 — document as a deploy prerequisite.

### `buildContextChain()` extension point (`src/lib/ai/context-chain.ts`)

Current file ends at line 56. The assessment fetch block goes after `classification.description` push (around line 53) and before the final `return sections.join("\n")`. The full current file is 56 lines — read it before editing.

### Orchestration page — current status filter (`src/app/(hub)/orchestration/page.tsx:229–231`)

```typescript
supabase
  .from("classification_records")
  .select("*")
  .eq("llm_eligible", "YES")
  .eq("status", "pending")   // ← change to .in("status", ["pending", "planning", "planned", "approved"])
```

### Playbooks table schema (`src/types/database.ts:397–414`)

```typescript
Row: {
  id: string;
  customer_id: string | null;   // null = global playbook
  task_type: string;            // matches classification_records.task_type
  title: string;
  content: string;
  status: string;               // "ACTIVE" | "STALE" | "ARCHIVED"
  // ...
}
```

---

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-05-26

### What was built
- `buildContextChain()` extended to fetch the latest `requirements_assessments` row and append an `=== ASSESSMENT (vN) ===` section with overall status and subtask breakdown. Additive — no assessment = no section; existing `assessTask()` calls are unaffected.
- `src/lib/ai/plan.ts` — `generatePlan()` mirrors `assessTask()` exactly: parallel `Promise.all` for context chain + classification lookup, ACTIVE playbook injection (skipped entirely when none match), `generateObject` with `PlanSchema` (steps, affected_files, apis_involved, playbooks_used, confidence_score, risk_flags), `logLLMInvocation({ layer: "planning" })` in both success and error paths, `adminClient` insert to `implementation_plans` with `PENDING_APPROVAL` status, then updates `classification_records.status = "planning"`.
- `POST /api/plan` — authenticated, Zod-validated, calls `generatePlan()`, returns plan row or 500.
- `PATCH /api/plan` — authenticated; approve (→ `APPROVED`, updates classification to `"approved"`) or reject (→ `REJECTED` with reason, updates classification to `"pending"`). Uses parallel `Promise.all` for the two DB writes. Session `supabase` client used for reads; `adminClient` for writes only.
- Orchestration page (`/orchestration`) — rewritten with two sections: **Requirements Assessment** (tasks without CLEAR assessment) and **Plan Generation** (tasks with CLEAR assessment). Triple `Promise.all` fetch on mount. All 6 components defined at module level (no inline components). Rejection reason dropdown with 5 `PlanRejectionReason` options. Optimistic UI: approve mutates local status to `APPROVED`; reject clears plan state and calls `onPlanRejected` callback to reassign task to Assessment section.

### How to access for testing
- **URL:** `/orchestration`
- **Prerequisite:** Verify `llm_config` table has a row with `orchestration_layer = 'planning'`. If absent, insert: `{ orchestration_layer: 'planning', model_id: 'claude-sonnet-4-6', provider: 'anthropic', is_active: true }`.
- **Flow:** (1) Classify a task with `llm_eligible = YES` → (2) Run Assessment on it in the Assessment section until it returns CLEAR → (3) Task appears in Plan Generation section → (4) Click "Generate Plan" → (5) Approve or Reject.

### Deviations from plan
- **Medium (fixed):** Initial implementation used `adminClient` for the two DB reads in the PATCH handler (`implementation_plans` lookup and `requirements_assessments` lookup). CLAUDE.md requires `adminClient` only for writes; reads in authenticated routes must use the session `supabase` client. Fixed: both reads now use `supabase` (session-based `createClient()` from server); only the UPDATE calls use `adminClient`.
- **Minor:** When no playbooks match, `playbooksSection = ""` is interpolated into the prompt template producing two consecutive blank lines between the context chain and the instructions. Functionally harmless — the empty string injects no header block (the specific concern in the task notes was about an empty `=== PLAYBOOKS ===` block, which was avoided).

### Standards check
Pass — no `any` types, no unused imports, no `console.log` (only `console.error` in error paths consistent with `assess.ts` reference pattern), all components have explicit prop types, loading/error/empty states handled in all three UI sections, all hooks called unconditionally, all `setState` calls in async flows use functional `prev => ...` form, no inline components inside `OrchestrationPage`.

### Convention check
Pass (after fix) — all LLM calls log via `logLLMInvocation()`, no hard-coded model IDs (`getModel("planning")` throughout), `adminClient` only for writes (reads use session client), `buildContextChain()` called before the Sonnet prompt, `"use client"` only on the page component (not on lib files), `createClient()` from `@/lib/supabase/client` in page.tsx, `createClient()` from `@/lib/supabase/server` in route.ts.

---

## Notes for Implementation Agent

- **Verify `llm_config` has a `"planning"` row** before testing. If absent, insert: `{ orchestration_layer: 'planning', model_id: 'claude-sonnet-4-6', provider: 'anthropic', is_active: true }`. The route will silently fail without it.
- **`buildContextChain()` change is additive** — the `if (assessment)` guard means existing `assessTask()` calls where no assessment exists yet are completely unaffected. Still, run an assessment after changing context-chain to confirm no regression.
- **Playbook section must be omitted (not empty) when no playbooks found.** Inject `playbooksSection` only when the array is non-empty. Injecting an empty `=== PLAYBOOKS ===` block confuses Sonnet.
- **`syncTaskToZoho()` throws in `src/lib/zoho/index.ts`** — do not call it anywhere in this task. Zoho is task 026.
- **`implementation_plans` has no `zoho_task_id` column yet** — that migration is task 026. Do not reference it.
- **PATCH reject → status back to `"pending"`** — intentional. PM re-runs assessment after getting missing info from customer, then generates a new plan. The old rejected plan row stays in DB for audit.
- **`approved_by` / `rejected_by`** — store Supabase `user.id` from session, not Zoho user ID.
- **Assessment section deduplication** — the simplest approach: filter tasks shown in the Assessment section to exclude those where `assessments[task.id]?.overall_status === "CLEAR"`. No complex state needed; derive it from the existing `assessments` map.
- **`classification_records.status` may still be `"pending"` for assessed tasks** (assessTask() doesn't update it). The expanded `in("status", [...])` filter handles this correctly — `"pending"` is still included.
