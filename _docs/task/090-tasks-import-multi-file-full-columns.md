# Task 090 — Tasks Import: Multi-File, Full Column Set & Parent Resolution

> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Date:** 2026-06-29
> **Status:** COMPLETED
> **Completed:** 2026-06-29
> **Implementation Notes:** Added `src/types/database.ts` to file changes (not in original spec) — tasks.status type changed from literal union to `string`, and 5 new columns added to Row/Insert/Update. Pass 2 uses `Promise.all` within each 50-row chunk to parallelize parent updates. Fallback to `tasks.json` (no batch files) is supported. Route was subsequently converted to SSE streaming (ReadableStream) — emits `{type:"progress", pass:1|2, current, total}` per chunk and `{type:"done", imported, skipped, parents_resolved, errors}` on completion. Migrate page updated with a special Tasks import row: two-phase progress bars (blue for pass 1, violet for pass 2), done chip showing imported/parents linked/skipped counts. Verified: 6,946 imported · 200 parents linked · 0 skipped · 0 errors.

---

## Problem

The existing `POST /api/admin/zoho-import/tasks` route has several gaps:

1. **Single-file only** — reads `tasks.json` but the export now produces multiple batched files (`tasks-0-50-2025.json`, `tasks-50-100-2025.json`, etc.)
2. **Missing columns** — `milestone_id`, `parent_task_id`, `completion_percentage`, `is_completed`, `depth`, `completed_on`, and `source_meta` are not written
3. **Per-row DB calls** — `resolveProjectId` and `resolveTasklistId` fire one DB query per task; at 6,946 tasks this is ~14,000 queries and will be very slow
4. **Parent resolution impossible** — `parent_task_id` is self-referential; it can only be resolved in a second pass after all tasks are inserted

Additionally the tasks table is missing 5 columns that are needed to store the full Zoho dataset.

---

## Requirements

### Migration — new file `supabase/migrations/042_tasks_import_columns.sql`

Add to the `tasks` table:
- `completion_percentage integer not null default 0`
- `is_completed boolean not null default false`
- `depth integer not null default 0` — 0 = top-level task, 1–6 = subtask depth
- `completed_on timestamptz` — nullable; when Zoho marked it done
- `source_meta jsonb not null default '{}'` — Zoho-specific raw data

**Drop the existing status constraint** (from migration 034) and replace with one that allows all Zoho status values verbatim. Zoho status names are preserved exactly as they arrive — no mapping to Hub values. Hub-native tasks created after decommission will use the same free-form text column.

```sql
alter table tasks drop constraint if exists tasks_status_check;
alter table tasks alter column status set default 'Open';
-- update any existing rows that used the old Hub values back to readable names
update tasks set status = 'Open'                  where status = 'open';
update tasks set status = 'In Progress'           where status = 'in_progress';
update tasks set status = 'Ready for QA/QC'       where status = 'ready_for_qa';
update tasks set status = 'Closed'               where status in ('closed', 'testing_completed');
update tasks set status = 'For Client Approval'  where status = 'for_client_approval';
update tasks set status = 'Ready to Merge'       where status = 'ready_to_merge';
update tasks set status = 'Post-live QA/QC'      where status = 'post_live_qa';
```

No replacement CHECK constraint — status is free-form text going forward.

Add index on `depth` for subtask filtering queries.

### Import Route — `src/app/api/admin/zoho-import/tasks/route.ts`

Full rewrite of the route body (auth guard + helpers stay the same):

1. **Multi-file scan** — read all files in `_from_zoho/` that match `tasks-*.json` (glob pattern via `fs.readdirSync` filter). Concatenate into one array. Fall back to `tasks.json` if no batch files exist.

2. **Pre-build lookup maps** (two DB queries total, not per-row):
   - `projectMap: Map<zoho_project_id → hub uuid>` from `projects` table
   - `tasklistMap: Map<external_id → hub uuid>` from `tasklists` table
   - `milestoneMap: Map<external_id → hub uuid>` from `milestones` table

3. **Pass 1 — upsert all tasks** (chunk size 50, 100ms delay between chunks):
   - `external_id` = Zoho task `id`
   - `project_id` from `projectMap`
   - `tasklist_id` from `tasklistMap` via `tasklist.id`
   - `milestone_id` from `milestoneMap` via `milestone.id` (null when `milestone.name === "None"`)
   - `parent_task_id` = null (resolved in pass 2)
   - `title` = `name`
   - `description` = `description` (raw HTML, nullable)
   - `priority` = `mapPriority(priority)`
   - `status` = `t.status?.name ?? "Open"` — raw Zoho status name, no mapping
   - `due_date` = `end_date ?? due_date ?? null`
   - `start_date` = `start_date ?? null`
   - `completion_percentage` = `completion_percentage ?? 0`
   - `is_completed` = `is_completed ?? false`
   - `depth` = `depth ?? 0`
   - `completed_on` = `completed_on ?? null`
   - `source_meta` = object with: `status` (full object), `log_hours`, `owners_and_work`, `duration`, `sequence`, `association_info`, `billing_type`, `created_by`, `updated_by`, `teams`, `reviewer`, `tags`, `created_via`

4. **Pass 2 — resolve parent_task_id** (chunk size 50):
   - After pass 1, fetch all `{ id, external_id }` from `tasks` where `external_id` is not null → build `taskMap: Map<external_id → hub uuid>`
   - For each task that has `parental_info.parent_task_id`: look up both the task's Hub UUID and the parent's Hub UUID in `taskMap`, collect update pairs
   - Chunk-update `tasks` rows: `update({ parent_task_id }).eq("id", hubTaskId)`

5. **Result** — return `{ imported, updated, skipped, errors, parents_resolved }` where `parents_resolved` is the count of successful parent links set in pass 2

---

## Notes for Implementation Agent

- **Sonnet required** — two-pass import with pre-built lookup maps, multi-file scanning, and self-referential FK resolution are non-trivial.
- **No changes to `zoho-import.ts`** — `mapPriority`, `adminClient`, and all other helpers are already correct. Do not modify the shared lib.
- **Do NOT call `mapTaskStatus`** — status is stored verbatim from Zoho (`t.status?.name ?? "Open"`). The 16 Zoho status values are: `Open`, `In Progress`, `Closed`, `Ready for QA/QC`, `Post-live QA/QC`, `QA Check`, `Client Validation`, `For Client Approval`, `Ready to Merge`, `Roadblock`, `Todo`, `Ready for Code Review`, `Backlog`, `Ready for Post QA/QC`, `Completed task`. These are preserved as-is in the `status` column.
- **Migration drops the status constraint** — the old `tasks_status_check` from migration 034 (`open | in_progress | ...`) is dropped. The column is free-form text going forward. The migration also back-fills any existing rows that used old Hub-style values to readable names.
- **Multi-file scan pattern**: `fs.readdirSync(dir).filter(f => f.startsWith("tasks-") && f.endsWith(".json"))`. If that list is empty, fall back to `readFromZoho("tasks.json")`.
- **`source_meta` — omit null/undefined keys** using a helper like `Object.fromEntries(Object.entries(obj).filter(([,v]) => v != null))` to keep the JSONB lean.
- **Pass 2 chunk-update** — individual `.update().eq("id", ...)` calls per row, batched via a chunk loop with 100ms delay. There's no built-in bulk update in Supabase JS; this is the correct pattern for a one-time migration.
- **Skip tasks with no project match** — if `projectMap.get(zohoProjectId)` returns undefined, push to `errors` and `skipped++`.
- **`start_date` already exists on tasks** (added in migration 035 as `date` type) — cast ISO string with `new Date(str).toISOString().split("T")[0]` or just pass the string directly (Postgres accepts ISO dates).
- **`completed_on` is a new column** — pass as `null` when `t.completed_on` is falsy; cast to ISO string when present.

---

## File Changes

| Action | File |
|--------|------|
| Create | `supabase/migrations/042_tasks_import_columns.sql` |
| Modify | `src/app/api/admin/zoho-import/tasks/route.ts` |

---

## Code Context

### Current tasks import route (full file)

```ts
// src/app/api/admin/zoho-import/tasks/route.ts  (current — full rewrite needed)
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  readFromZoho, resolveProjectId, resolveTasklistId, resolveUserId,
  buildUserCache, clearUserCache, mapPriority, mapTaskStatus,
  adminClient, ImportResult,
} from "@/lib/migrate/zoho-import";

// ZohoTaskRaw type, POST handler: auth guard → readFromZoho("tasks.json") →
// per-row resolveProjectId/resolveTasklistId → upsert one-by-one (no milestone,
// no parent_task_id, no completion_percentage, no depth, no source_meta)
```

### tasklists route — lookup map pattern to follow

```ts
// Pre-build lookup maps — two DB queries instead of one per row
const { data: projectRows } = await adminClient.from("projects").select("id, zoho_project_id");
const projectMap = new Map((projectRows ?? []).map((p) => [String(p.zoho_project_id), p.id]));

const { data: milestoneRows } = await adminClient.from("milestones").select("id, external_id");
const milestoneMap = new Map((milestoneRows ?? []).map((m) => [String(m.external_id), m.id]));

// Batch upsert in chunks
for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
  const chunk = rows.slice(i, i + CHUNK_SIZE);
  const { error } = await adminClient.from("tasklists").upsert(chunk, { onConflict: "external_id" });
  if (i + CHUNK_SIZE < rows.length) await new Promise<void>((r) => setTimeout(r, CHUNK_DELAY_MS));
}
```

### tasks table — current columns

```sql
-- From migration 025 + 033 + 034 + 035:
tasks (
  id uuid primary key,
  project_id uuid not null → projects,
  parent_task_id uuid null → tasks (self-ref),
  tasklist_id uuid null → tasklists,        -- added 035
  milestone_id uuid null → milestones,      -- added 033
  external_id text unique,                  -- added 035; null for Hub-native
  title text not null,
  description text,
  priority text check (low|normal|high|critical) default 'normal',
  status text default 'Open',               -- free-form after migration 042 drops constraint
  due_date date,
  start_date date,                          -- added 035
  assignees uuid[],
  estimate_hours numeric(5,2),
  labels text[],
  position numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
  -- MISSING: completion_percentage, is_completed, depth, completed_on, source_meta
)
```

### Zoho status values (16 distinct, stored verbatim)

```
Open · In Progress · Closed · Ready for QA/QC · Post-live QA/QC · QA Check
Client Validation · For Client Approval · Ready to Merge · Roadblock · Todo
Ready for Code Review · Backlog · Ready for Post QA/QC · Completed task
```

Use `t.status?.name ?? "Open"` directly. Do NOT call `mapTaskStatus`.

### Zoho task shape (key fields only)

```ts
{
  id: "1512955000019700014",          // external_id
  name: "Project Management",         // → title
  description: "<div>...</div>",      // HTML
  priority: "none"|"low"|"medium"|"high",
  status: { id: "...", name: "Open", color: "#a9b2c0", color_hexcode: "..." },
  is_completed: false,
  completion_percentage: 0,           // 0–100
  depth: 0,                           // 0 = task, 1–6 = subtask
  start_date: "2026-06-08T07:35:00.000Z",
  end_date: "2026-06-08T11:35:00.000Z",      // → due_date
  completed_on: "2026-04-20T14:42:07.739Z",  // nullable
  project: { id: "...", name: "..." },
  tasklist: { id: "...", name: "..." },
  milestone: { id: "...", name: "None"|"Phase 1..." },
  parental_info: {                    // present on subtasks only (61% of tasks)
    parent_task_id: "1512955000019358023",
    root_task_id: "1512955000019358023"
  },
  owners_and_work: { owners: [{ email, name }], ... },
  log_hours: { billable_hours, non_billable_hours, total_hours },
  association_info: { has_comments, has_attachments, has_reminder, has_recurrence },
  billing_type: "non_billable"|"billable",
  created_by: { zpuid, name, email },
  updated_by: { zpuid, name, email },  // 29% populated
  teams: [...],                        // 10% populated
  tags: [...],                         // very sparse
  _zoho_project_id: "..."              // synthetic field added by our export
}
```

---

## Implementation Steps

1. **Create migration** `supabase/migrations/042_tasks_import_columns.sql`:
   - Drop `tasks_status_check` constraint; set default to `'Open'`; back-fill existing rows from old Hub values to readable Zoho-style names
   - `alter table tasks add column completion_percentage integer not null default 0`
   - `alter table tasks add column is_completed boolean not null default false`
   - `alter table tasks add column depth integer not null default 0`
   - `alter table tasks add column completed_on timestamptz`
   - `alter table tasks add column source_meta jsonb not null default '{}'`
   - `create index tasks_depth_idx on tasks(depth) where depth > 0`

2. **Rewrite `src/app/api/admin/zoho-import/tasks/route.ts`**:
   - Keep auth guard (unchanged)
   - Multi-file scan: `readdirSync(_from_zoho/).filter(f => f.startsWith("tasks-") && f.endsWith(".json"))` → read + concat; fallback to `readFromZoho("tasks.json")`
   - Pre-build three lookup maps (projects, tasklists, milestones) — same pattern as tasklists route
   - Build `rows` array with all new columns populated
   - Pass 1: chunk upsert `rows` on `external_id` (CHUNK_SIZE = 50)
   - Pass 2: fetch `{ id, external_id }` from tasks → build `taskMap` → collect parent updates → chunk-update (CHUNK_SIZE = 50, 100ms delay)
   - Return extended result: `{ imported, updated, skipped, errors, parents_resolved }`

---

## Acceptance Criteria

- [x] Migration 042 applies cleanly; `tasks_status_check` constraint is dropped; 5 new columns added
- [x] `status` stores Zoho's exact name (e.g. `"Ready for QA/QC"`, `"Roadblock"`) — no mapping
- [x] Import reads all `tasks-*.json` batch files from `_from_zoho/` automatically
- [x] `milestone_id` is correctly resolved (null when milestone.name = "None")
- [x] `completion_percentage`, `is_completed`, `depth`, `completed_on`, `source_meta` are populated
- [x] Pass 2 sets `parent_task_id` for subtasks; `parents_resolved` count in response
- [x] Re-running import is idempotent (upsert on `external_id`, same result each time)
- [x] No per-row DB queries — only pre-built lookup maps
- [x] 6,946 tasks import without timeout
- [x] SSE streaming with two-phase progress bars — verified in browser
