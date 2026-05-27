# Sprint 5 Design: Execution Engine (M6) + Reply Generation (M8)

**Date:** 2026-05-27  
**Sprint:** 5 (Weeks 11–12)  
**Tasks:** 027 (Execution Engine) + 028 (Reply Generation)  
**Milestones:** M6, M8

---

## Context

Sprints 1–4 are complete (tasks 001–026, all in Testing/Completed). Sprint 5 closes the full automation loop: an approved plan now executes against Sanity CMS, and a Haiku-drafted reply is generated for the PM to review and send via Zoho Cliq.

Execution scope for this sprint is **Sanity API only** (GitHub PR and MCP/Product API modes remain stubs). Reply generation includes draft display, inline editing, and send via Cliq.

---

## Pre-Sprint Housekeeping

Mark tasks 021–026 as Completed in TASKS.md before starting Sprint 5 work. All have been browser-verified.

---

## Task 027: Execution Engine (M6)

### DB Migration 014

Two changes to the existing schema:

```sql
-- Circuit breaker trip state, per customer
alter table customers
  add column if not exists automation_paused boolean not null default false;

-- Constrain execution status values
alter table execution_records
  add constraint execution_records_status_check
    check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL_EXECUTION', 'FAILED', 'REVERTED'));
```

No new table — `execution_records` already exists from migration 001/004.

### New Files

- `supabase/migrations/014_sprint5_execution.sql`
- `src/app/api/execution/route.ts`
- `src/app/api/execution/[id]/revert/route.ts`

### Modified Files

- `src/lib/sanity/index.ts` — wire up (currently a stub throwing errors)
- `src/app/(hub)/orchestration/page.tsx` — execution section in task detail panel
- `src/types/database.ts` — add `automation_paused` to customers Row/Insert/Update

### Architecture

**Trigger:** PM clicks "Execute Plan" button on an `APPROVED` plan in the orchestration task detail panel.

**`POST /api/execution` flow:**

1. Validate: plan exists, `status = APPROVED`, customer not `automation_paused`
2. Look up `customer_products.sanity_project_id` for the customer
3. Insert `execution_records` row: `status = RUNNING`, `started_at = now()`
4. Call `executeSanityPlan(projectId, planSteps)` — captures `pre_action_states` before touching Sanity, then applies mutations
5. **On success:**
   - Update `execution_records`: `status = COMPLETED`, `post_action_states`, `what_was_done`, `what_was_skipped`, `completed_at`
   - Update `implementation_plans.status = 'COMPLETE'`
   - Update `classification_records.status = 'closed'`
   - Fire Cliq notification (non-blocking) via `sendCliqNotification()`
   - Fire reply generation (non-blocking) via internal fetch to `/api/reply`
6. **On partial failure:** `status = PARTIAL_EXECUTION`, write `error_message`. Never auto-retry. Cliq notification skipped.
7. **On total failure:** `status = FAILED`. Count the customer's last 3 `execution_records` — if all `FAILED`, set `customers.automation_paused = true`. Cliq notification skipped.

**`POST /api/execution/[id]/revert` flow:**

1. Load execution record, confirm `status` is `COMPLETED` or `PARTIAL_EXECUTION`
2. Call `revertSanityExecution(projectId, pre_action_states)`
3. Update `execution_records.status = REVERTED`
4. Update `implementation_plans.status = APPROVED` (back to approvable state)

### Sanity Adapter (`src/lib/sanity/index.ts`)

```ts
getSanityClient(projectId: string): SanityClient
  // Creates @sanity/client with global SANITY_API_TOKEN + per-customer projectId

executeSanityPlan(projectId: string, steps: PlanStep[]): Promise<SanityExecutionResult>
  // Returns { pre_action_states, post_action_states, what_was_done, what_was_skipped }
  // Captures pre-state via fetch before any mutation
  // Applies mutations step-by-step; on any step failure returns partial result

revertSanityExecution(projectId: string, preActionStates: Json): Promise<void>
  // Replays captured pre_action_states as Sanity patch/create mutations
```

Requires `pnpm add @sanity/client`.

### Circuit Breaker

After every `FAILED` execution, the API counts `execution_records` for the customer ordered by `created_at desc` limited to 3. If all 3 have `status = FAILED`, it sets `customers.automation_paused = true`. The PM must manually reset this via a toggle on the customer profile page (or directly in Supabase for now — UI toggle is out of scope for Sprint 5).

### UI (Orchestration Task Detail Panel)

Added below the plan approve/reject section:

- **"Execute Plan" button** — visible when plan `status = APPROVED` and customer not `automation_paused`
- **Execution status badge** — RUNNING (spinner), COMPLETED (green), PARTIAL_EXECUTION (yellow), FAILED (red), REVERTED (gray)
- **`what_was_done` / `what_was_skipped`** — shown when status is COMPLETED or PARTIAL_EXECUTION
- **"Revert" button** — shown when status is COMPLETED or PARTIAL_EXECUTION
- **Automation paused banner** — yellow warning at top of orchestration page when `customers.automation_paused = true`

### Env Vars

`SANITY_API_TOKEN` already in `env.example` (Sprint 5+ section). No new vars needed.

---

## Task 028: Reply Generation (M8)

### DB Migration 015

```sql
create table if not exists reply_drafts (
  id              uuid primary key default gen_random_uuid(),
  classification_id text references classification_records(id) on delete cascade,
  customer_id     text references customers(customer_id) on delete cascade,
  execution_record_id uuid references execution_records(id) on delete cascade,
  draft_content   text not null,
  pm_edited_content text,
  pm_diff         text,
  status          text not null default 'DRAFT'
                    check (status in ('DRAFT', 'SENT', 'DISCARDED')),
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_reply_drafts_classification_id on reply_drafts (classification_id);
create index if not exists idx_reply_drafts_customer_id on reply_drafts (customer_id);

alter table reply_drafts enable row level security;
create policy "authenticated_read_reply_drafts"
  on reply_drafts for select to authenticated using (true);
create policy "authenticated_write_reply_drafts"
  on reply_drafts for all to authenticated using (true) with check (true);
```

### New Files

- `supabase/migrations/015_reply_drafts.sql`
- `src/app/api/reply/route.ts`
- `src/app/api/reply/[id]/send/route.ts`

### Modified Files

- `src/app/(hub)/orchestration/page.tsx` — reply draft section in task detail panel
- `src/types/database.ts` — add `reply_drafts` table type + `ReplyDraftRow` export
- `src/app/api/execution/route.ts` — fire non-blocking POST to `/api/reply` on success

### Architecture

**Trigger:** Non-blocking `fetch('/api/reply', ...)` called inside `/api/execution` after marking execution `COMPLETED`. If this call fails, execution result is unaffected.

**`POST /api/reply` flow:**

1. Accept `{ classificationId, customerId, executionRecordId, whatWasDone }`
2. Call `buildContextChain(classificationId)` for structured customer + task context
3. Fetch `customers.communication_tone` for tone instructions
4. Call Haiku via `getModel('reply')`:
   - System: tone instructions + "Draft a concise client-facing update"
   - User: context chain + what was done summary
5. Insert into `reply_drafts` with `status = DRAFT`
6. Call `logLLMInvocation()` with layer `'reply'`

**`POST /api/reply/[id]/send` flow:**

1. Accept `{ content }` — PM's final (possibly edited) text
2. Call `sendCliqNotification(content)` targeting the PM channel
3. If `content !== draft_content`: compute and store `pm_diff`, set `pm_edited_content`
4. Update `reply_drafts.status = SENT`, `sent_at = now()`

### UI (Orchestration Task Detail Panel)

A "Reply Draft" card rendered below the execution section, only when a `reply_drafts` row exists:

- **Status badge** — DRAFT (blue), SENT (green), DISCARDED (gray)
- **Editable `<textarea>`** — pre-filled with `draft_content`; locked (read-only) once SENT
- **"Send via Cliq" button** — fires `/api/reply/[id]/send` with current textarea content; locks card on success
- **"Discard" button** — fires PATCH to set `status = DISCARDED`; collapses card

### LLM Config

Uses `getModel('reply')`. The `llm_config` table should have a `reply` layer row seeded to `claude-haiku-4-5-20251001`. Add this as an `INSERT ... ON CONFLICT (layer) DO NOTHING` at the end of migration 015.

---

## Acceptance Check (AC3)

A Content Update task completes the full loop without PM touching Zoho:

1. Classification → `pending` (Sprint 2) ✓  
2. Assessment → `CLEAR` (Sprint 3) ✓  
3. Plan generated + approved → `APPROVED` (Sprint 4) ✓  
4. **Execute Plan** → Sanity mutations applied, execution record `COMPLETED` (Task 027)  
5. Reply draft auto-generated → PM edits + sends via Cliq (Task 028)

---

## Out of Scope (Sprint 5)

- GitHub PR execution mode (stub remains)
- MCP/Product API execution mode (stub remains)
- Manual reset UI for `automation_paused` (Supabase dashboard for now)
- Reply send via email or Zoho Desk (Cliq only)
- PM edit pattern learning / reply prompt fine-tuning (post-MVP)
