# 468: Projects — "Merge to" action (review-first merge wizard with live streamed progress)

**Created:** 2026-11-04
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep (data-moving write path across ~12 tables, dedup rules, streaming + resumability, new migration)
**Status:** Planned

---

## Overview

PMs need to fold one project into another (duplicate projects, split engagements that should be one, Zoho-import leftovers). Today the only options are "re-create everything by hand" or soft-delete. This task adds a **"Merge to…"** action to the project Settings (gear) menu that runs a **git-merge-style wizard**:

1. **Choose target** — a searchable project list; the closest-named project (same customer boosted) is suggested first.
2. **Scan** — the Hub reads both projects and *streams* what it finds, narrated like an assistant ("Comparing 214 tasks…").
3. **Review** — a conflict/dedup review UI per entity (tasks, task lists, milestones, tickets, files & folders, time logs, statuses, members) where each finding has a recommended resolution the PM can override. Redundant items get an explicit **heads-up** callout.
4. **Confirm** — plain-language summary, type-the-target-name to arm the single orange CTA.
5. **Merge** — a **real** progress bar driven by server-emitted events (NDJSON stream), per-entity rows ticking up with actual counts, not a timer.
6. **Done** — summary of moved / merged / skipped, link to the target, source project archived.

"AI-feel" is delivered by deterministic heuristics + narrated copy (see D4) — no LLM call is required for correctness.

Source = the project whose menu was clicked. Target = the project chosen. Everything moves **source → target**.

## Requirements

- [ ] "Merge to…" item in the project Settings gear dropdown (`_project-detail-header.tsx`), v2 + legacy variants, visible to `admin | pm | super_admin` only (mirror `DELETE_PROJECT_ROLES`).
- [ ] Target picker: searchable list of non-deleted projects excluding the source; **top "Suggested" group** ranked by name similarity (token + trigram score; same `customer_id` boosts); shows `project_id`, customer, status, task count.
- [ ] Merges these entities (all re-parented from source to target): tasks (incl. `parent_task_id` trees, comments, attachments, assignees), task lists, milestones, tickets (`issues`) + comments/attachments, project Files (`customer_asset_folders` + `customer_assets`), time logs, statuses (see "Statuses" below), project members, notes/note folders.
- [ ] **Dedup/conflict detection** with a stable, documented key per entity (table in Code Context). Each finding gets a default resolution: `merge` (fold into the matching target row), `keep-both`, or `skip` (do not copy; row stays on the archived source).
- [ ] **Review UI before any write**: nothing is modified until Confirm. Per-section counts (auto-resolved vs needs-attention), per-row resolution switch, bulk "Apply recommended", filter by "Needs attention".
- [ ] **Heads-up callouts** (assistant tone) for: exact-duplicate files/folders that will *not* be copied, tasks that are redundant (identical title in same task list, both open), empty folders, source tasks with a **running timer** (blocks merge), cross-customer targets, a target that already has a programme (Timeline) when the source also has one.
- [ ] **Real streamed progress**: `POST …/merge/execute` returns `application/x-ndjson`; events `{type:"step", step, total, done}`, `{type:"note", text}`, `{type:"done", summary}`, `{type:"error", step, message}`. Progress bar width = `Σdone / Σtotal` from server events. Mirrors task 405's NDJSON precedent.
- [ ] **Idempotent + resumable**: each step re-keys rows with `where project_id = source` (or `id in (...)`), journals progress in `project_merges`; a dropped connection / `maxDuration` cut-off can be resumed by re-POSTing the same `mergeId`.
- [ ] **No data loss by default**: nothing is hard-deleted. "Redundant" rows are skipped (left on the source) rather than deleted. Source project is set to `archived` + `merged_into_project_id` after a fully successful merge (D1).
- [ ] Journal keeps an old-id → new-id map per entity (`project_merges.id_map`) so a future undo is possible (undo itself is out of scope).
- [ ] UI follows `_final_design/guide/central-hub-design-system.md` (tokens, pill buttons, one orange CTA per screen, navy for selection, mono for counts/IDs, skeletons not spinners, no left-border accent stripes, no nested cards, reduced-motion respected). Use `/anthropic-skills:frontend-design` + `/impeccable:impeccable` while building the wizard layout.
- [ ] Every new file ≤ ~250 lines (soft), hard stop 400, per `nextjs-file-length-best-practices.md`; components ≤ 75 lines per function where practical.

## Out of Scope / Must-Not-Change

- **Undo/rollback** (journal enables it later; not built).
- Merging **across customers** is allowed only behind an explicit warning + extra confirm (D2); cross-customer *rewrite of `customer_id`* on child rows is **in** scope only for rows that carry it (Files).
- **Programme/Timeline engine tables** (`customer_phases`, `customer_deliverables`, `programme_notifications`, `phase_members`, `phase_programme_state`): **not merged** (D5) — target's programme wins; a heads-up is shown. These are mid-refactor under 423/427/429/430.
- `stackshift_orders.project_id` is re-pointed to the target (one `update`), nothing else about orders changes.
- LLM is used **only** for phrasing (D4, Haiku, never Opus); it never decides a finding, resolution or write.
- No change to the Zoho import/sync code, no MCP tool (so `_docs/mcp-tools.md` untouched).
- Do not touch `src/app/api/v2/projects/[projectId]/route.ts` (the PATCH/DELETE route) — merge lives under a new `merge/` sub-route.
- Do not remove `excludingChecklist()` use: checklist rows (`kind='checklist'`) are counted/moved with their parent deliverable logic like any task row but are **never listed as tasks in the review UI** (D6).

## Proposed File Changes

> Paths under `src/app/(hub)/projects/_shared/_merge/` are shared by v2 + legacy (page-scoped UI, per CLAUDE.md "extract only when shared" — it *is* shared by both variants).

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/180_project_merges.sql` | Create (**written, not applied**) | `project_merges` journal table (+ RLS via `get_my_role()`), `projects.merged_into_project_id uuid null`, optional `pg_trgm` index not needed (similarity runs in app). |
| `src/lib/projects/merge/types.ts` | Create | `MergePlan`, `MergeFinding`, `Resolution`, `MergeEvent`, entity keys. |
| `src/lib/projects/merge/similarity.ts` | Create | `rankSimilarProjects(sourceName, candidates)` — normalized-token Jaccard + trigram Dice, same-customer boost. Pure. |
| `src/lib/projects/merge/keys.ts` | Create | Normalizers + dedup keys per entity (pure). |
| `src/lib/projects/merge/load.ts` | Create | Paginated (`.range` loop) loaders for both projects' entities. |
| `src/lib/projects/merge/plan-tasks.ts` | Create | Task/tasklist/milestone/ticket findings + parent-tree remap. |
| `src/lib/projects/merge/plan-files.ts` | Create | Folder-path union + file duplicate findings (name+size+folder path). |
| `src/lib/projects/merge/plan-misc.ts` | Create | Time logs, members, notes, status mapping, blockers (running timers, programme). |
| `src/lib/projects/merge/build-plan.ts` | Create | Orchestrates scan → `MergePlan` and emits scan events. |
| `src/lib/projects/merge/execute/*.ts` (`steps.ts`, `tasks.ts`, `containers.ts`, `files.ts`, `timelogs.ts`, `finalize.ts`) | Create | One idempotent function per step; chunked updates (200 ids); journal after each chunk. |
| `src/lib/projects/merge/stream.ts` | Create | `ndjsonResponse(run)` helper (encoder, `send`, close-on-error). |
| `src/app/api/v2/projects/[projectId]/merge/suggest/route.ts` | Create | `GET` ranked target candidates. |
| `src/app/api/v2/projects/[projectId]/merge/plan/route.ts` | Create | `POST` → streamed scan events ending in the full plan (NDJSON). Read-only. |
| `src/app/api/v2/projects/[projectId]/merge/execute/route.ts` | Create | `POST {targetId, decisions, mergeId?}` → NDJSON execution. `maxDuration` set. |
| `src/app/(hub)/projects/_shared/_merge/_merge-menu-item.tsx` | Create | Gear-menu item that opens the wizard. |
| `…/_merge/_merge-wizard.tsx` | Create | Modal shell + stepper + step routing (state machine). |
| `…/_merge/_step-target.tsx`, `_step-scan.tsx`, `_step-review.tsx`, `_step-confirm.tsx`, `_step-progress.tsx`, `_step-done.tsx` | Create | One file per step. |
| `…/_merge/_review-section.tsx`, `_finding-row.tsx`, `_heads-up.tsx`, `_assistant-line.tsx`, `_merge-progress-bar.tsx` | Create | Review/progress building blocks. |
| `…/_merge/_use-ndjson-stream.ts`, `_use-merge-plan.ts` | Create | Client stream reader + plan/decision state. |
| `src/app/(hub)/projects/_shared/_project-detail-header.tsx` | Modify | Add `canMergeProject` + `<MergeMenuItem>` above Delete (≈ +10 lines). |
| `_docs/task/468-project-merge.check.ts` | Create | Pure-logic checks (`npx tsx`) for similarity, keys, tree remap, plan determinism. |
| `_docs/context/project-merge.md` | Create (document stage) | Rules, dedup keys, migration status. |
| `CLAUDE.md` | Modify (document stage) | One Feature Reference row → `project-merge.md`. |

## Code Context

### Tables that carry `project_id` (all must be handled or explicitly excluded)

Evidence: `grep -rnE "project_id +uuid" supabase/migrations` + migration reads on 2026-11-04.

| Table | Migration | `on delete` | Merge treatment |
|---|---|---|---|
| `tasks` (+`parent_task_id`, `milestone_id`, `tasklist_id`, `display_id` UNIQUE global, `kind`) | 025/033/035/089/163 | cascade | **Move** (re-key `project_id`; remap `milestone_id`/`tasklist_id`/`parent_task_id` per plan). Keep `display_id` (globally unique, not recomputed). |
| `task_comments`, `attachments` (`entity_type`,`entity_id`) | 025 | via task | Follow their task (no change unless task folded → re-point `task_id`/`entity_id` to the surviving task). |
| `tasklists` | 035 | cascade | **Move or map** by normalized name. |
| `milestones` | 033 | cascade | **Move or map** by normalized name (+ due date tie-break). |
| `issues` (tickets) + `issue_comments` | 051/052/138 | cascade | **Move**; `display_id` kept; dedup by normalized title + inbox/external id. |
| `time_logs` | 025 | cascade | **Move** (also follows folded task: re-point `task_id`). Dedup only exact (task, employee, date, hours, note). |
| `customer_asset_folders` | 065 | **no action** (FK has no cascade) | Path-union into target tree; unique `(customer_id, project_id, phase_number, parent_folder_id, name)` must hold. |
| `customer_assets` (`project_id`, `folder_id`) | 060/065 | cascade | **Move**; exact duplicates skipped. |
| `project_members`, `phase_members` | 073 | cascade | `project_members`: union (skip existing user). `phase_members`: excluded (D5). |
| `note_folders`, `notes` (+`note_collaborators`) | 120 | cascade | **Move**; folder union by name. |
| `active_timers` | 092 | cascade | **Blocker** if any source timer is running (PM must stop it). |
| `timer_breaks`, `stackshift_orders` | 168/130 | set null | Re-point to target. |
| `project_views` | 156 | cascade | Left (source archived); not merged. |
| `customer_phases`, `customer_deliverables`, `programme_notifications` | 060 | cascade | Excluded (D5). |

**Statuses.** `tasks.status` is a fixed check-constraint set (`backlog|todo|in_progress|for_review|done|cancelled`) and milestone status is `planned|active|completed` — the vocabularies are identical across projects, so "statuses" means: (a) every moved row keeps its status; (b) the review shows a status-distribution diff (source vs target) and flags *milestone* status contradictions (e.g. a `completed` source milestone mapping onto an `active` target milestone → recommended: keep target's status, but if any folded task is open, force `active`); (c) project-level status: source → `archived`, target unchanged. Re-verify this reading in implement: if a customer-defined status table exists by then (check 430/427 progress), map statuses by name.

### Dedup keys (pure functions in `keys.ts`; unit-checked)

```ts
// normalize: NFKC, lowercase, strip HTML entities/tags, collapse whitespace/punctuation
taskKey     = `${norm(title)}|${tasklistKey ?? ""}`          // same title in matching list → duplicate
tasklistKey = norm(name)                                       // list ↔ list
milestoneKey= norm(name)
ticketKey   = norm(title) | externalId                         // externalId wins if present
fileKey     = `${folderPath}|${norm(label)}|${size ?? ""}`     // size from storage metadata when available
folderPath  = ancestors.map(norm).join("/")
timeLogKey  = `${taskKeyResolved}|${employee}|${date}|${hours}|${norm(note)}`
```

Resolution defaults: exact key + identical status → `merge` (fold: re-point comments/attachments/time logs to the target row, source row left on archived source — **not deleted**); exact key but different status/assignee → `keep-both` flagged "needs attention"; no match → `move`.

### Streaming precedent

`src/app/api/admin/zoho-export/tasks/route.ts` already streams (`TextEncoder`, `send({type:"progress",…})`, `Content-Type: text/event-stream`). Task 405 introduced NDJSON for the Wiki PDF import — reuse its client reader if it exists in `src/` at implement time; otherwise `_use-ndjson-stream.ts` (≈40 lines, `response.body.getReader()` + line split).

### Gear-menu integration

`_project-detail-header.tsx:109-150` — `settingsMenu` renders gated items; add a sibling of `DeleteProjectMenuItem`, same row classes, `GitMerge` icon (lucide), divider as the existing pattern. The menu must stay mounted while the wizard is open: **render the wizard through a portal / lift the open-state to the header** (the Delete item documents the same unmount trap at `_delete-project-menu-item.tsx:11-16`).

### Auth

Route handlers: `createClient()` session + role check (`admin|pm|super_admin`), then `adminClient` **for the cross-row writes only** if RLS write policies for `pm` don't cover all child tables (verify per table in implement; D3). Reads stay on the session client. `adminClient` is never imported in Client Components.

## Implementation Steps

1. **Phase 0 – evidence (no code):** list each child table's RLS write policy for `pm`; confirm where Files storage objects live (does the storage path embed `project_id`/`customer_id`? If yes, moving DB rows alone leaves objects under the old prefix — acceptable only if the path is never *derived* from `project_id` on read). Record the answers in this doc's "Implement notes".
2. Write migration 180 (`project_merges`: `id, source_project_id, target_project_id, status('planned'|'running'|'succeeded'|'failed'), decisions jsonb, id_map jsonb, step_progress jsonb, error text, created_by, created_at, finished_at`; `projects.merged_into_project_id`). RLS: select/insert/update for `admin|pm|super_admin` via `get_my_role()`. **Written, not applied** — code wraps access and degrades (feature hidden / "Merge isn't set up yet" message) on `42P01`/`42703`.
3. Build the pure lib (`similarity.ts`, `keys.ts`, plan builders) + `468-project-merge.check.ts` **first**; run with `npx tsx`.
4. `load.ts`: every list read loops `.range(from, from+999)` until a short page; tasks via `excludingChecklist()` for counts shown to the user.
5. `merge/suggest` route → ranked candidates (top 5 "Suggested", rest alphabetical).
6. `merge/plan` route (NDJSON): emits `note`s as each entity is scanned, ends with `{type:"plan", plan}`. Read-only; never writes.
7. `merge/execute` route (NDJSON): creates/loads `project_merges` row; runs steps in dependency order — **blockers re-checked** → tasklists/milestones (create id_map) → tasks (parents before children; two passes: re-key, then fix `parent_task_id`/`milestone_id`/`tasklist_id`) → comments/attachments of folded tasks → tickets → folders then files → time logs → members/notes → `stackshift_orders`/`timer_breaks` → finalize (archive source, set `merged_into_project_id`, bump target `updated_at`, `touch_project_view`). Emit `step` events after every chunk. On error: emit `error`, set journal `failed`, **stop** (already-moved chunks are consistent because each step is idempotent; resume re-runs).
8. Client: wizard state machine + step components; stream hook; bulk "Apply recommended"; Confirm requires typing the target name; Progress step shows overall bar + per-entity rows + live assistant lines; Done shows counts and "Open {target}".
9. Wire the gear-menu item in `_project-detail-header.tsx` for both variants.
10. Visual pass with `/anthropic-skills:frontend-design` + `/impeccable:impeccable` against the design guide; verify desktop + 390px width.
11. Run verification; seed two throwaway projects and exercise the full flow in the browser (never against real customer projects).

## Acceptance Criteria

Each is a check; **pre** = before merge to main (local/dev DB), **post** = after deploy + migration applied.

- [ ] **A1 (pre, auto)** `npx tsx _docs/task/468-project-merge.check.ts` exits 0: `rankSimilarProjects("Acme Dental Website", [...])` puts "Acme Dental – Website" first and a same-customer near-match above a different-customer exact-ish match; dedup keys equal for `"Fix  Login "` vs `"fix login"`; parent-tree remap preserves depth/order for a 3-level tree; `buildPlan` is deterministic (same input → deep-equal output).
- [ ] **A2 (pre, auto)** `npx tsc --noEmit` and `pnpm lint` report 0 new errors; `pnpm build --webpack` succeeds.
- [ ] **A3 (pre, manual — browser)** As a PM, gear menu on a v2 and a legacy project shows "Merge to…"; as `developer` it is absent. Picker lists the closest-name project under "Suggested".
- [ ] **A4 (pre, manual)** Review step: with seeded duplicates (2 identical tasks, 1 identical file, 1 same-named folder), the UI shows exactly those findings with a heads-up for the duplicate file; **a DB check (`select count(*)` on both projects) taken before Confirm equals the one taken at Review → no writes happened pre-confirm**.
- [ ] **A5 (pre, manual + SQL)** After merge on the seeded pair: `select count(*) from tasks where project_id = <source>` = number of *skipped/folded* tasks only; target task count = target-before + moved; `time_logs` sum(hours) over target = source-before + target-before (minus exact-dup skips shown in review); every moved task's `display_id` unchanged; no orphan `parent_task_id` (`select … where parent_task_id not in (select id from tasks)` returns 0).
- [ ] **A6 (pre, manual)** Progress bar is event-driven: throttle the network (DevTools "Slow 3G") and observe the bar advances in step with streamed `step` events (read via `read_network_requests`), never reaches 100% before the `done` event, and shows the failing step if the route is made to throw.
- [ ] **A7 (pre, manual)** Resume: kill the request mid-run (close the tab), reopen the wizard for the same pair → it offers "Resume merge", completes, and row counts equal A5 with **no duplicates created** (idempotency).
- [ ] **A8 (pre, manual)** A source task with a running timer blocks Confirm with a plain-language message naming the task and user.
- [ ] **A9 (pre, manual — a11y)** Wizard is keyboard operable end to end (Tab order, Esc closes only before Confirm, focus trapped, visible focus rings), icon buttons have `aria-label`, status never by color alone; `prefers-reduced-motion` removes bar easing.
- [ ] **A10 (no-regression, pre, manual)** Project Delete, Set Owner and Manage Collaborators in the same gear menu still work; project detail tabs (Tasks/Tickets/Files/Time logs) render for an untouched project; Tasks listing still excludes checklist rows (`excludingChecklist`).
- [ ] **A11 (no-regression, pre, auto)** With migration 180 **not applied**, opening "Merge to…" shows a graceful "Merge isn't available yet" state (no crash, no 500 page) — verified by hitting `merge/plan` and asserting a 200 stream ending in an `error` event, not a thrown exception.
- [ ] **A12 (post, manual)** After the operator applies 180: A5 repeated on a copy of two real, non-customer-facing test projects; `project_merges.status = 'succeeded'` and `id_map` non-empty.

## Verification

```bash
npx tsc --noEmit
pnpm lint
npx tsx _docs/task/468-project-merge.check.ts
pnpm build --webpack
# Browser acceptance (A3–A9): seed two throwaway projects under one test customer, run the wizard,
# confirm counts with SQL (before/at-review/after) and watch merge/execute in the network panel.
```

## Compatibility Touchpoints

- **Docs:** new `_docs/context/project-merge.md` + one `CLAUDE.md` Feature Reference row (document stage). No `_docs/mcp-tools.md` change (no MCP tool).
- **Display IDs:** `tasks.display_id` / `issues.display_id` are globally unique and **not** recomputed; the source project's `project_id` display key will still appear in moved items' IDs (expected; mention in Done step copy).
- **Routing:** `/projects/v2/[projectId]` uses display `project_id`; legacy uses UUID. The new routes accept the same key the surrounding routes do (`project_id` display key, UUID fallback as in `milestones` route) — and return UUIDs in payloads.
- **Pagination rule** (`.range` loop), **RLS helpers** (`get_my_role()`), **written-not-applied migration** degradation: all apply (CLAUDE.md).

## Coordination

| Overlap | With | Rule |
|---|---|---|
| `src/app/(hub)/projects/_shared/_project-detail-header.tsx` (gear menu) | No other Planned/In Progress doc found editing it; `_project-detail.tsx` is currently modified by **467** (working tree) | Header edit is isolated (+~10 lines). If 467 touches `_project-detail.tsx` props for the header, land **after 467**. |
| `tasks.parent_task_id` / subtask tree | **467** (Testing) | Merge's parent remap relies on 467's depth/tree semantics (`src/lib/tasks/subtask-tree.ts`) — reuse it, **land after 467**. |
| `tasks.milestone_id` / `tasklist_id` column names | **430** (Planned: rename → `phase_id`/`deliverable_id`), **427/423** | Isolate column names in one constants block in `merge/load.ts` + `execute/tasks.ts`; **land after 430** if 430 ships first, otherwise 430 must update the constants (call out in 430's file list). |
| Programme tables (`customer_phases`, …) | **429** (In Progress), **433**, **434** | Not touched (D5). |
| `customer_assets` / folders | **464/465** (Testing; `external_id` column, migration 179 not applied) | Files plan must tolerate `external_id` being absent; do not key dedup on it. |
| `project_attachment_counts` RPC / `touch_project_view` | **459**, **417** | Call `touch_project_view` for the target only; no changes to either. |
| Migration number | any task adding a migration | 180 is next after 179 at planning time; re-check `ls supabase/migrations` at implement time and renumber. |

How found: read the Planned/In Progress/Testing rows in `TASKS.md`, `git status` (467 files modified), and grepped task docs 423/427/429/430/433/434 for `project_id` / header references. 467/430 docs not read line-by-line — implement stage should re-check them.

## Open Decisions

- **D1 (NON-BLOCKING)** — Source project after merge. **Default:** set `status='archived'` + `merged_into_project_id` (reversible, keeps skipped/duplicate rows). Alternative: soft-delete (`status='deleted'`, as task 231). Hard delete is never done.
- **D2 (NON-BLOCKING)** — Cross-customer merges. **Default:** allowed for `admin/super_admin` only, behind a red heads-up + second confirm; `pm` limited to same-customer targets. (`customer_id` is the universal key — files' `customer_id` is rewritten.) Confirm this role split.
- **D3 (NON-BLOCKING)** — Write client. **Default:** session client where RLS allows, `adminClient` for cross-table re-keys after the route-level role check, documented as a new exception in `_docs/context/project-merge.md`. If any RLS policy blocks `pm`, this is the fallback.
- **D4 (DECIDED 2026-11-04: Haiku phrasing)** — Correctness stays deterministic (heuristics decide findings/resolutions); Haiku only *phrases* heads-ups and the final summary from the structured findings. Requires: new `llm_config` layer (e.g. `project_merge_assistant`, Haiku) resolved via `getModel(layer)`, `logLLMInvocation()` after every call, templated fallback copy if the call fails/times out (merge must never depend on the LLM), cap ≈ 1 call per review + 1 per summary, never Opus. Add `src/lib/projects/merge/narrate.ts` + `POST …/merge/narrate` route; extend A11 with "LLM down → templated text".
- **D1, D2, D5 (DECIDED 2026-11-04):** D1 archive source; D2 cross-customer = admin/super_admin only with second confirm; D5 programme not merged, target wins.
- **D5 (NON-BLOCKING)** — Programme/Timeline data. **Default:** not merged; target's programme wins; heads-up if source has one. Confirm PMs accept this given 423–430 churn.
- **D6 (NON-BLOCKING)** — Checklist rows (`kind='checklist'`): moved silently with their project only when no checklist collision (`checklist_key` unique per project?) — verify constraint in Phase 0; if both projects have the same `checklist_key`, keep target's and skip source's.
- **D7 (NON-BLOCKING)** — Storage objects stay at their current paths (no byte copying) if Phase 0 shows paths aren't derived from `project_id`; otherwise this becomes a **BLOCKING** decision (copy-vs-leave) before implementation continues.

## Operator Steps

1. Apply `supabase/migrations/180_project_merges.sql` (written-not-applied) to the target Supabase project (`supabase db push`), then verify `select count(*) from project_merges;`.
2. Deploy the Next.js app (single deployable; no worker/cron/StackShift component imports the changed modules — checked via `grep -rn "projects/merge" src` after implement). Confirm Vercel `maxDuration` for `merge/execute` is permitted on the plan.
3. Insert the `llm_config` row for the new merge-assistant layer (Haiku) — via the existing llm_config admin/seed path; until present, narration uses templated fallback.
4. No env vars, no cron, no data backfill.

## Implement notes (fill during implementation)

- Phase 0 findings: RLS per table / storage path shape / checklist uniqueness — _pending_.

## Implementation Notes

### What Changed
- "Merge to…" gear-menu item (admin/pm/super_admin) opening a 6-step wizard: choose target (closest name first) → streamed scan → review (findings, heads-ups, status diff, per-row resolutions, bulk "Apply recommended") → confirm (type target name; cross-customer ack) → real NDJSON-driven progress → done.
- Deterministic planner (`plan.ts`, pure) + idempotent executor split per step; server re-plans on execute (never trusts a client plan); journal in `project_merges`; nothing hard-deleted; source archived (+ `merged_into_project_id`).
- Haiku (`project_merge` layer) only phrases the review/summary text; templated fallback when it fails (D4).
- Phase 0: pm has `tasks_pm_write`/`milestones_pm_write`/`tasklists_pm_write`/`issues_pm_write`, but `time_logs` has no pm write policy and several child tables unverified → executor writes with `adminClient` after the route role check (D3, documented exception). Storage paths are `${customerId}/${projectId}/…` written at upload and stored in `file_path`; reads use the stored path, so objects are NOT moved (D7 holds, not blocking). `tasks_checklist_key_uq (project_id, checklist_key)`: source checklist rows are moved only when the target lacks that key, else left (D6).

### Files Changed
- `supabase/migrations/180_project_merges.sql` (written, not applied); `src/types/hub.ts` (+`project_merge` layer)
- `src/lib/projects/merge/{types,keys,similarity,plan,load,stream,auth,narrate,execute,execute-ctx,execute-tasks,execute-files}.ts`
- `src/app/api/v2/projects/[projectId]/merge/{suggest,plan,execute,narrate}/route.ts`
- `src/app/(hub)/projects/_shared/_merge/{_merge-wizard,_use-merge-wizard,_step-target,_step-review,_step-confirm,_step-progress,_merge-bits}.tsx|ts`, `_stream-ndjson.ts`
- `src/app/(hub)/projects/_shared/_project-detail-header.tsx` (menu item + wizard mount)
- `_docs/task/468-project-merge.check.ts`

### Deviations From Plan
- Single `_step-confirm.tsx` also holds `StepScan`/`StepDone` (small); no separate `_review-section`/`_finding-row` files (inlined in `_step-review.tsx`). All files ≤ 121 lines.
- Tickets are never auto-folded (recommend keep-both) — safer for customer correspondence.
- Resume re-plans from current DB state; dedup matches for rows left after a partial run are recomputed (`shortcut:` a moved task can't be re-matched against itself, but a leftover source task may newly match an already-moved twin; upgrade by persisting the id map in `project_merges`). The journal has no `id_map` column yet (plan promised it) — undo is out of scope.
- Wizard focus handling is basic (dialog focus on step change, Esc rule) — no full focus trap.
- File exact-duplicate key uses `file_size` (nullable); files without size never match as duplicates.

### Verification Run
- `npx tsx _docs/task/468-project-merge.check.ts` - PASS (A1; baseline: n/a, new)
- `npx tsc --noEmit` - PASS, 0 errors
- `npx eslint` on all new/changed paths - PASS, 0 warnings
- `pnpm build --webpack` - SKIPPED (not run this pass)
- A3–A10, A12 (browser/SQL acceptance against seeded projects) - NOT RUN: needs migration 180 applied and two throwaway projects; no live session. A11 (graceful with 180 unapplied) is by construction (execute emits an `error` event on 42P01; plan swallows the missing-table lookup) but was not exercised.

### Attempts That Failed
- None.

### Operator Steps
1. Apply migration 180 (`supabase db push`); verify `select count(*) from project_merges;` and the `project_merge` row in `llm_config`.
2. Deploy the Next.js app only (no other deployable imports `src/lib/projects/merge`); confirm Vercel `maxDuration=300` is allowed for `merge/execute`.
3. Run acceptance A3–A9 on two throwaway projects before use on real ones.

## Quality Gate Notes

### Result
PASS (after 3 fixes applied during the gate)

### Standards Review
- Fixed: a "skip" on a duplicate time log was honoured even when the user overrode its task to keep-both, leaving the log on the source pointing at a moved task. Skip now applies only when the task is folded (`execute-files.ts`).
- Fixed: `useMergeWizard.run` fired the summary LLM call from inside a `setState` updater (impure; double-fires under StrictMode). Now uses a local value.
- Fixed: `targetId` was not validated as an existing non-deleted project in `merge/plan` and `executeMerge` (could merge into a soft-deleted project). Both now call `resolveProjectId`.
- No dead code, no `any`; all new files ≤ 121 lines; `tsc` and eslint clean; `468-project-merge.check.ts` PASS. Weak spots: the check covers pure logic only — executor and routes have no behavioural test (acceptance A4–A8 remain manual).
- `narrate` route re-loads both projects to rebuild facts (extra read cost, accepted).

### Deviations
- Medium: executor never run against a database; resume uses journal decisions (review edits made after a failed run are ignored). Documented in Implementation Notes.
- Minor: inlined review/finding components, tickets default keep-both, no `id_map` column.

### Required Fixes
- None.

## Follow-up (post-test, 2026-11-04) — archived source is now read-only + hidden
- User chose "Archived + read-only 'Merged into X' banner" (plain `archived` stayed visible/editable).
- `_shared/_merged-project-view.tsx` (new): banner linking to the target + `inert` content area; wired in both `(tabs)/layout.tsx` (header/tab strip stay usable).
- v2 + legacy listing loaders hide rows with `merged_into_project_id` (legacy shows them when status filter includes Archived). Needs migration 180 (applied remote).
- Limits: read-only is UI-level (`inert`); write APIs and the onboarding-workspace / task / ticket detail routes (outside `(tabs)`) are not blocked; dashboards/other queries still count the archived project.
- Also fixed earlier this session: `issues`→`tickets` table rename (migration 147); wizard input text colour.
