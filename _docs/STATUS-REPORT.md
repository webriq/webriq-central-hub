# WebriQ Central Hub — Development Status Report

**Date:** 2026-05-27  
**Branch:** `claude/gifted-johnson-9Tw0g`  
**Reviewer:** Claude Code (automated audit)  
**Sprint:** End of Sprint 5 / Start of Sprint 6

---

## Executive Summary

Sprint 5 (Execution Engine + Reply Generation) has been implemented and is in **Testing**. Sprints 0–4 are complete. Sprint 6 (Developer Dashboard + KB Seed) has not started. The TypeScript check (`npx tsc --noEmit`) currently fails with 12 errors — the build script uses webpack and likely suppresses these, but they represent unresolved type-safety gaps. The code review surfaced 7 findings (3 confirmed bugs, 4 plausible runtime failures) that should be addressed before Sprint 5 exits Testing.

---

## Sprint Completion Status

| Sprint | Milestone | Status | Tasks |
|--------|-----------|--------|-------|
| Sprint 0 | Infrastructure Foundation | ✅ Complete | 001 |
| Sprint 1 | Customer Creation & Onboarding (M1) | ✅ Complete | 003, 004, 005, 016, 017, 018, 019 |
| Sprint 1.1 | Zoho OAuth + hub_users (M—) | ✅ Complete | 006, 007, 008 |
| Sprint 2 | Classification Engine + Zoho Webhook (M2, M7 partial) | ✅ Complete | 013, 014, 015, 020, 021 |
| Sprint 3 | Requirements Assessment + Daily Digest (M3, M4) | ✅ Complete | 022, 023, 024 |
| Sprint 4 | Plan Generation + Full Zoho Sync (M5, M7 complete) | ✅ Complete | 025, 026 |
| Sprint 5 | Execution Engine + Reply Generation (M6, M8) | 🟡 Testing | 027, 028 |
| Sprint 6 | Developer Dashboard + KB Seed (M9, M10) | ❌ Not started | — |

**Progress: 5 of 7 sprints complete. Phase 1 MVP is ~85% implemented.**

---

## MVP Acceptance Criteria — Updated Status

| # | Criteria | Status | Notes |
|---|----------|--------|-------|
| AC1 | PM can onboard a new customer end-to-end without opening Zoho. | ✅ Done | Sprint 1 complete |
| AC2 | A new Zoho Desk ticket appears in the Hub classified within 60 seconds. | 🟡 Code complete | Requires env config (Zoho webhook + Cliq webhook) |
| AC3 | A Content Update task completes the full loop (classify → plan → execute → reply) without PM touching Zoho. | 🟡 Code complete | Sprint 5 implemented; 3 confirmed bugs block full confidence — see Code Review section |
| AC4 | A PM starts the day from the digest with full situational awareness without opening Zoho. | ✅ Done | Sprint 3 complete (pg_cron + digest_logs) |
| AC5 | A Developer can see assigned work and self-assign an available task from the Hub. | ❌ Not started | Blocked on Sprint 6 (M9) |

---

## Milestone Detail

### M1 — Customer & Onboarding ✅
- Schema-driven onboarding form (StackShift, PublishForge, CiteForge, PipelineForge)
- Login-free public URL per customer (`/onboarding/[customerId]/[productSlug]`)
- Auto-save with completion percentage; `onboarding_complete` flag on 100%
- File/asset upload via Supabase Storage
- PM dashboard: completion %, missing fields, product instance view
- CiteForge as StackShift add-on (badge + card on customer profile)

### M2 — Classification Engine ✅
- Zoho webhook listener (`/api/webhooks`) — classifies incoming tasks via Claude Haiku
- `classification_records` stored with priority, task_type, llm_eligible, confidence_score, model_used, token counts
- Low-confidence records surfaced in PM UI for manual review / re-classification
- Cliq notification on high-priority classification
- Live stats on PM dashboard (classification counts, pipeline view)

### M3 — Requirements Assessment ✅
- PM-triggered "Run Assessment" via Claude Sonnet
- Structured `requirements_assessments` record: subtasks with `CLEAR/PARTIAL/BLOCKED` statuses
- `buildContextChain()` shared utility wiring ticket → classification → assessment context
- Clarification draft auto-generated for BLOCKED subtasks
- Orchestration page: assessment section with subtask breakdown display

### M4 — Daily Digest ✅
- pg_cron schedule (migration 012) calling `/api/digest` daily at 08:00 UTC
- PM and Dev digests stored in `digest_logs` — dashboard reads stored record (no live LLM call)
- Dev digest with type-aware queries and dedicated Cliq dev channel
- Digest feedback (Useful / Partial / Not Useful) stored for future prompt improvement
- Clarification flags, automation queue, and unassigned task sections

### M5 — Plan Generation ✅
- Claude Sonnet plan generation: ordered steps, affected files, confidence score (0–100), risk flags
- `PENDING_APPROVAL → APPROVED / REJECTED` flow with structured rejection reasons
- `buildContextChain()` extended to include assessment subtasks
- Playbooks fetched by task_type and included in plan prompt
- All LLM calls logged via `logLLMInvocation()`

### M7 — Zoho Sync (complete) ✅
- Plan approval pushes task to Zoho Projects (`syncTaskToZoho()`)
- Zoho status changes sync back via inbound webhook (`direct_zoho_edit` flag)
- `zoho_task_id` on `implementation_plans` for deep links and bidirectional sync
- PM actions from Hub: Open / On Hold / Active / Review / Close / Reopen
- Zoho project auto-created on customer onboarding completion

### M6 — Execution Engine 🟡 Testing
- `POST /api/execution` — reads approved plan steps, calls Claude Sonnet (`execution` layer) to translate to Sanity mutations
- Pre-action state capture for rollback (`pre_action_states` stored on execution_records)
- `POST /api/execution/[id]/revert` — replays inverse state via `revertSanityExecution()`
- `PARTIAL_EXECUTION` status for partial failures (manual review, no auto-retry)
- Circuit breaker: 3 consecutive `FAILED` executions → `automation_paused = true` on customer
- Execution-complete Cliq notification (non-blocking)
- Non-blocking reply draft trigger on COMPLETED status
- Migration 014: `automation_paused` on customers + execution status constraint

### M8 — Reply Generation 🟡 Testing
- `generateReplyDraft()` — Claude Haiku drafts a client-facing update using context chain + `what_was_done`
- `reply_drafts` table (migration 015) with `DRAFT / SENT / DISCARDED` statuses
- PM reviews and edits draft in orchestration panel; `pm_diff` stored on edit
- `POST /api/reply/[id]/send` — sends final draft via Zoho Cliq webhook
- `PATCH /api/reply/[id]` — discard a draft

### M9 — Developer Dashboard ❌ Not started
Planned for Sprint 6:
- Today's assigned tasks/tickets with direct Zoho links
- Overdue items highlighted
- Team unassigned task list with self-assign
- Hours logged this week (read-only from Zoho Projects)
- Prompt-based queries

### M10 — LLM Wiki / KB Seed ❌ Not started
Planned for Sprint 6:
- Internal KB directory in Supabase Storage
- Seed playbooks for Content Update and Settings Change task types
- Customer KB scaffold with PM/Dev file upload
- Weekly Wiki Lint Cron job
- Metrics dashboard (11 Phase 1 targets from spec Section 13)

---

## Database Migration Status

| Migration | Description | Status |
|-----------|-------------|--------|
| 001_initial_schema | Base tables | ✅ Applied |
| 002_seed_llm_config | llm_config seed data | ✅ Applied |
| 003_rls_policies | Row-level security | ✅ Applied |
| 004_schema_corrections | Schema fixes | ✅ Applied |
| 005_onboarding_storage | Storage bucket + policies | ✅ Applied |
| 006_product_completion_percentage | Completion % column | ✅ Applied |
| 007_hub_users | hub_users table + trigger | ✅ Applied |
| 008_fix_hub_users_trigger | Trigger fix | ✅ Applied |
| 009_force_logout_function | Force logout RPC | ✅ Applied |
| 010_completed_onboarding_status | Onboarding status | ✅ Applied |
| 011_assessment_raw_response | raw_response on assessments | ✅ Applied |
| 012_pg_cron_digest | pg_cron + pg_net digest schedule | ✅ Applied |
| 013_zoho_task_sync | zoho_task_id + direct_zoho_edit | ✅ Applied |
| 014_sprint5_execution | automation_paused + execution status | 🟡 Pending apply |
| 015_reply_drafts | reply_drafts table + RLS | 🟡 Pending apply |

Migrations 014 and 015 are written and correct. They need to be applied in the Supabase dashboard SQL editor before Sprint 5 acceptance testing can complete.

---

## TypeScript Check Status

Running `npx tsc --noEmit` currently returns **12 errors** across 2 files:

| File | Error | Count |
|------|-------|-------|
| `src/proxy.ts` | `Cannot find module '@supabase/ssr'` | 1 |
| `src/proxy.ts` | `Cannot find module 'next/server'` | 1 |
| `src/proxy.ts` | `Cannot find name 'process'` (missing `@types/node`) | 5 |
| `src/lib/zoho/index.ts` | `Cannot find name 'process'` (missing `@types/node`) | 3 |
| `src/proxy.ts` | Implicit `any` on cookie handler params | 2 |

The production `pnpm build` uses `--webpack` which compiles through Next.js and does not surface these as blockers. However, type-checking via `npx tsc --noEmit` (the documented verification method in CLAUDE.md) is broken. Likely root cause: `@types/node` is present in `devDependencies` but the `tsconfig.json` does not explicitly include `"node"` in the `types` array, leaving `process` undefined in files outside the Next.js compilation boundary (`proxy.ts` is a module-level export, not a Next.js route).

**Recommended fix:** Add `"types": ["node"]` to `tsconfig.json` compilerOptions.

---

## Code Review Findings

Code review scope: `git diff HEAD~1` (Sprint 5 implementation commit — 36 changed files).  
Severity ranking: Critical → High → Medium → Low.

---

### 1. `src/lib/sanity/index.ts:92` — **Sanity `getDocuments()` index mismatch corrupts rollback map** 🔴 CONFIRMED

**Summary:** The Sanity JS client's `getDocuments(ids)` does not guarantee that returned documents are in the same order as the input `ids` array. The current code maps `pre_action_states[allDocIds[i]] = preDocs[i]` using array index `i`, which silently mis-maps states when the API returns docs in a different order (e.g., cache hits reorder results).

**Failure:** If `getDocuments(['docA', 'docB'])` returns `[docB, docA]`, then `pre_action_states['docA'] = docB` and vice versa. When revert is triggered, the wrong pre-state is applied to each document — corrupting CMS content rather than restoring it.

**Fix:** Map by document `_id` instead of array index:
```ts
preDocs.forEach((doc) => {
  if (doc?._id) pre_action_states[doc._id] = doc;
});
// Documents not returned by Sanity (don't exist yet) stay null
allDocIds.forEach((id) => {
  if (!(id in pre_action_states)) pre_action_states[id] = null;
});
```

---

### 2. `src/app/api/execution/[id]/revert/route.ts:56` — **Sanity reverted but DB status never updated on write failure** 🔴 CONFIRMED

**Summary:** After `revertSanityExecution()` succeeds, the `Promise.all()` that marks `execution_records` as `REVERTED` and resets `implementation_plans` to `APPROVED` has no error handling. If either Supabase write fails, Sanity content is already rolled back, but the Hub DB permanently shows the execution as `COMPLETED` — making the revert invisible to the UI and preventing a second revert attempt.

**Fix:** Wrap the `Promise.all` in try/catch and return a 500 with a message that distinguishes "revert succeeded, DB update failed" from "revert failed":
```ts
const [execUpdate, planUpdate] = await Promise.all([...]);
if (execUpdate.error || planUpdate.error) {
  console.error("[revert] DB update failed after successful Sanity revert", ...);
  return NextResponse.json({ error: "Revert applied but status update failed — contact support" }, { status: 500 });
}
```

---

### 3. `src/app/api/execution/route.ts:117` — **Promise.all status updates unhandled on success path** 🔴 CONFIRMED

**Summary:** After a successful Sanity execution, `Promise.all()` updates `implementation_plans` to `COMPLETE` and `classification_records` to `closed`. There is no error check on the result. If either write fails, the execution_records table correctly shows `COMPLETED`, but the plan and classification remain in their prior states (`APPROVED` / `approved`). The route still returns `{ok: true}` to the client.

**Failure:** Plan appears stuck in `APPROVED` despite execution completing. PM sees no green status on the orchestration page and may re-trigger execution, causing duplicate Sanity mutations.

**Fix:** Destructure and check errors:
```ts
const [planUpdate, classUpdate] = await Promise.all([...]);
if (planUpdate.error || classUpdate.error) {
  console.error("[execution] post-execution status update failed", planUpdate.error ?? classUpdate.error);
  // Still return ok — execution did succeed, but flag the issue
}
```

---

### 4. `src/app/api/execution/route.ts:167` — **Circuit breaker never fires for customers with fewer than 3 executions** 🟡 CONFIRMED

**Summary:** The circuit breaker condition uses strict equality `recent?.length === 3`. A customer with only 1 or 2 total execution attempts (e.g., a new customer whose first two executions both fail) will never have automation paused, regardless of failure rate.

**Fix:** Change to `>= 1` with an `every` check on all available records, or cap to `Math.min(3, recent.length)`:
```ts
if (recent && recent.length > 0 && recent.every((e) => e.status === "FAILED")) {
  // pause if ALL recent executions (up to 3) are failures
```

---

### 5. `src/app/api/execution/route.ts:160` — **Circuit breaker query races with just-inserted FAILED record** 🟠 PLAUSIBLE

**Summary:** The circuit breaker reads the last 3 execution records immediately after updating the current record's status to `FAILED`. Under concurrent load or with Supabase read replica lag, the SELECT may run before the UPDATE fully propagates, returning only 2 records (length !== 3 → circuit never trips). Additionally, if two executions fail simultaneously, both reads see only 2 FAs and neither trips the breaker.

**Fix:** Use `limit(3)` but change the count check to `>= 3` (already recommended in finding #4), and consider a DB-level trigger or advisory lock for the circuit breaker to be concurrency-safe.

---

### 6. `src/app/api/reply/[id]/send/route.ts:~50-62` — **Cliq fires even when reply_drafts update affects 0 rows** 🟠 PLAUSIBLE

**Summary:** The update to `reply_drafts` (setting `pm_edited_content`, `status = 'SENT'`, `sent_at`) is awaited but its `error` and `count` are not inspected. If the draft was already marked `SENT` or `DISCARDED` (e.g., double-submit), the update silently affects 0 rows. The code continues and fires `sendCliqNotification()`, sending a duplicate message to the client's Cliq channel.

**Fix:** Check `data` (row count) before proceeding:
```ts
const { data: updated, error: updateError } = await adminClient
  .from("reply_drafts")
  .update({ ... })
  .eq("id", id)
  .eq("status", "DRAFT")   // guard against already-sent
  .select("id")
  .maybeSingle();
if (!updated) return NextResponse.json({ error: "Draft already sent or not found" }, { status: 409 });
```

---

### 7. `src/app/(hub)/orchestration/page.tsx:~477-485` — **.single() throws on 0 rows after execution trigger** 🟠 PLAUSIBLE

**Summary:** After `POST /api/execution` returns `executionId`, the client-side code queries `execution_records` by `id` using `.single()`. If Supabase read replica lag means the just-inserted row isn't immediately visible, `.single()` throws a PostgREST error ("JSON object requested, multiple (or no) rows returned"), which is caught only by a generic error handler and displayed as a generic failure message to the PM.

**Fix:** Use `.maybeSingle()` and handle the null case explicitly:
```ts
const { data: execRecord } = await supabase
  .from("execution_records")
  .select(...)
  .eq("id", executionId)
  .maybeSingle();
if (!execRecord) { /* retry once after 500ms or show "execution started" */ }
```

---

## Open Items from Sprint Plan

| # | Item | Sprint | Status |
|---|------|--------|--------|
| O1 | Complete Task Type Taxonomy | Sprint 0 pre-work | ⚠️ Partially resolved in llm_config seed — full taxonomy not confirmed |
| O3 | Zoho API credentials and webhook setup | Sprint 2 | ⚠️ Env vars documented in env.example; production setup unconfirmed |
| O4 | Sanity API access per tenant | Sprint 5 | ⚠️ `sanity_project_id` in customer_products — requires real project IDs per customer |
| O5 | Claude Code execution environment | Sprint 5 | ✅ Execution via Vercel AI SDK `generateObject` (not Claude Code CLI) — approach resolved |
| O6 | Seed playbook content | Sprint 6 | ❌ No playbooks authored yet |
| O7 | Internal KB initial content | Sprint 6 | ❌ Not started |
| O12 | Cliq channel structure | Sprint 2+ | ⚠️ Webhook URL wired; channel routing implemented — confirm channel IDs with PM |

---

## Next Steps

### Before Sprint 5 exits Testing
1. Apply migrations 014 and 015 in Supabase dashboard
2. Fix `sanity/index.ts:92` — map pre_action_states by `_id` not index (finding #1)
3. Fix `revert/route.ts:56` — wrap Promise.all in error handler (finding #2)
4. Fix `execution/route.ts:117` — check Promise.all result on success path (finding #3)
5. Fix circuit breaker condition `=== 3` → `>= 1` with all-FAILED check (finding #4)
6. Set `SANITY_API_TOKEN` and verify `sanity_project_id` is populated in customer_products for at least one test customer
7. Run browser acceptance test: classify → plan → execute → reply loop end-to-end

### Before Sprint 6 starts
1. Fix TypeScript check — add `"node"` to `tsconfig.json` types array
2. Confirm Sprint 6 scope with PM (Dev Dashboard, KB seed, Metrics Dashboard)
3. Author seed playbooks for Content Update and Settings Change task types (O6)

### Sprint 6 scope (M9 + M10)
- Developer Dashboard: today's tasks, overdue items, self-assign from team pool
- Zoho hours read-only pull
- LLM Wiki: Supabase Storage KB scaffold, PM/Dev file upload, weekly lint cron
- Metrics panel: 11 Phase 1 targets from spec Section 13

---

*Report generated: 2026-05-27 | Next update due: Sprint 5 exit or Sprint 6 start*
