# Task 112 — Zoho Issue Time Logs Import: `issue_id` Column + Chunked SSE Upsert

> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Date:** 2026-07-07
> **Status:** COMPLETED
> **Completed:** 2026-07-07
> **Live run (2026-07-07):** Clicked Import on the "Issue Time Logs" card at `/v2/admin/migrate` — **2,185 imported · 0 skipped, 0 errors**. Matches expectations exactly: all 969 distinct issues referenced across the 2,185 time-log entries were already resolvable against the `issues` table (populated by task 108), so every row resolved `issue_id` cleanly with nothing left in the `errors` array.
> **Investigation:** No formal `/understand` run. Grounded via direct analysis in-session: read both real export files (`_from_zoho/issue-timelogs-0-50.json`, `issue-timelogs-50-100.json`, 2,185 records total), diffed their `id` space against the existing `_from_zoho/timelogs-*.json` (14,533 records) to confirm zero collisions, read `supabase/migrations/035_zoho_decommission_schema.sql` + `051_issues_table.sql` for the current `time_logs`/`issues` schemas, read `src/lib/migrate/zoho-import.ts` to confirm `resolveIssueId()` already exists (added for task 110), and read the current `src/app/api/admin/zoho-import/timelogs/route.ts` + `migrate/page.tsx` Time Logs import section as the direct model for this task. Treat all record counts and field-presence stats below as grounded, not estimated.

---

## Overview

This is the deferred follow-up flagged in task 111's decision #3: import the already-exported, already-verified Issue Time Logs data into Supabase. It is the Issue-scoped sibling of task 103 (Task Timelogs Import) and should mirror that route almost exactly — multi-file scan, pre-built lookup maps (no per-row DB calls), chunked SSE upsert — with one schema addition and one field-mapping delta.

**Core decision this task locks in: reuse the existing `time_logs` table.** Do **not** create a new `issue_time_logs` table. Add one new nullable column, `issue_id uuid null references issues(id)`, instead. This is the opposite precedent from task 110 (Issue Comments), which *did* need a dedicated `issue_comments` table — but only because `task_comments.task_id` is `NOT NULL`, which forced a new table. `time_logs.task_id` is **already nullable** (migration 035, comment: *"Zoho project-level time entries have no task reference"*), so the same blocking constraint doesn't exist here. Two further facts confirm reuse is safe, not just convenient:

1. **Zero ID collision.** Diffed all 14,533 Task time-log `id`s against all 2,185 Issue time-log `id`s — 0 overlap. Both can safely share one `external_id unique` constraint on the same table.
2. **One fact table, one set of reporting queries.** `time_logs` already backs the v2 dev dashboard's weekly-hours chart and any future hours reporting. Splitting Issue-logged hours into a second table would require every such query to `UNION` two tables for what is conceptually one fact (time logged against work, whether the work item is a Task or an Issue).

---

## Decisions (resolved before spec — recommended defaults, flag before/during `/implement` if any should differ)

1. **Schema: add `time_logs.issue_id` (nullable FK → `issues.id`), not a new table.** See rationale above. Mirrors the existing `task_id` column exactly (nullable, `on delete set null` — a deleted issue shouldn't cascade-delete its historical time logs).
2. **No CHECK constraint enforcing `task_id`/`issue_id` mutual exclusivity.** Grepped every migration in `supabase/migrations/` for two-nullable-FK mutual-exclusivity patterns — none exist anywhere in this codebase. The established precedent here is to keep DB constraints minimal and let the import route be the only writer that sets either column (this route only ever sets `issue_id`, never `task_id`; the existing Task timelogs route only ever sets `task_id`, never `issue_id`). Recommended default: skip the CHECK constraint. Flag if you'd rather have the extra safety net given this is financial/billing-adjacent data.
3. **Do not capture `created_time`/`last_modified_time` (the true original Zoho timestamps) in a new column.** Both are present on 100% of the 2,185 records, and losing them once Zoho is decommissioned is a real, permanent loss — but the existing Task Timelogs import (task 103) already has this exact same gap (its `created_at` is import-time only, not Zoho's original timestamp), and retrofitting that is out of scope for this task. Recommended default: skip, for schema/behavior symmetry with the Task version. Flag if you want this task to *also* backfill the Task version's gap (larger scope — would need a re-import of all 14,533 existing rows).
4. **Do not map `approval`, `added_by`, `start_time`, `end_time` to any column.** Same reasoning as #3 — these have no equivalent on the Task version either, and are low-signal in this dataset specifically: `approval.status` is `"Approved"` on all 2,185 records (no discriminating value), `added_by` differs from `owner` in only 1.4% of rows (31/2,185), and `start_time`/`end_time` (93.8% present) are redundant with the already-computed `hours` field. Not worth new columns.
5. **Notes field:** identical to task 103 — use `notes`, HTML-stripped via the same local regex helper, falling back to `log_notes` if absent. 99.5% of records (2,175/2,185) have both fields present and 99.5% of those (2,165/2,175) are byte-identical between the two — same low-risk pattern as the Task version.
6. **Issue resolution failures:** identical to task 103's task-resolution design — distinguish "no issue reference at all" (`module_detail.id` absent — not expected here, but handle defensively) from "issue reference present but not yet in Hub" (`module_detail.id` present, `issueMap` lookup miss). The latter still imports the row with `issue_id: null` and pushes a message to `errors`, it does not skip the row.
7. **File scan glob:** `issue-timelogs-*.json` (matches the export's own naming from task 111 — project-index slices, e.g. `issue-timelogs-0-50.json`), falling back to singular `issue-timelogs.json` if no batch files exist. Mirrors task 103's `timelogs-*.json` → `timelogs.json` fallback pattern exactly.
8. **Prerequisite ordering:** task 108 (Issues import) must already have run — `issue_id` resolution depends on the `issues` table being populated. All 969 distinct issues referenced across the two real export files resolve cleanly against the 1,049 issues already in `_from_zoho/issues-*.json`, confirming this import is unblocked today.

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/053_time_logs_issue_id.sql` | Create | Adds nullable `issue_id uuid references issues(id) on delete set null` + index to `time_logs` |
| `src/app/api/admin/zoho-import/issue-timelogs/route.ts` | Create | New SSE import route — multi-file scan, pre-built `projectMap`/`issueMap`, chunked upsert |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | Modify | Add `IssueTimelogsImportState` interface, `IMPORT_LEVELS` entry, state hook, `handleIssueTimelogsImport()`, `key === "issue-timelogs"` JSX block |
| `src/lib/migrate/zoho-import.ts` | No changes | Reuse `readFromZoho`, `resolveIssueId`, `buildUserCache`, `resolveUserId`, `parseHours`, `adminClient` as-is |
| `src/types/database.ts` | Modify | Add `issue_id` to `time_logs`'s `Row`/`Insert`/`Update` + a new `time_logs_issue_id_fkey` entry in `Relationships` |

---

## Code Context

### Migration — `supabase/migrations/053_time_logs_issue_id.sql` (full file, new)

```sql
-- Migration 053: time_logs.issue_id — Issue Time Logs Import (task 112)
-- Reuses the existing time_logs table instead of a new issue_time_logs table:
-- task_id is already nullable (migration 035), so the same nullable-FK pattern
-- extends cleanly to issues. Confirmed zero external_id collision between the
-- existing Task time-log rows and the new Issue time-log import batch.

alter table time_logs
  add column issue_id uuid references issues(id) on delete set null;

create index time_logs_issue_id_idx on time_logs(issue_id) where issue_id is not null;
```

### Confirmed actual field shape (sampled from `_from_zoho/issue-timelogs-0-50.json`)

```json
{
  "owner": { "zpuid": "1512955000010419263", "name": "Ulrick Sanchez", "email": "ulrick.sanchez@webriq.services" },
  "date": "2026-04-01",
  "created_time": "2026-04-01T07:05:34.295Z",
  "module_detail": { "prefix": "A8U4-I1", "name": "#20055 Fwd: Re: Fix Needed - Partially Shipped?", "id": "1512955000017787007", "type": "bug" },
  "notes": "Time log details:\nStart Time -04-01-2026 10:33 AM End Time -04-01-2026 03:05 PM \nTime spent - 03:36",
  "log_notes": "Time log details:\nStart Time -04-01-2026 10:33 AM End Time -04-01-2026 03:05 PM \nTime spent - 03:36",
  "last_modified_time": "2026-04-01T07:05:37.649Z",
  "approval": { "status": "Approved", "name": "Ulrick Sanchez", "email": "ulrick.sanchez@webriq.services" },
  "end_time": "03:05 PM",
  "project": { "name": "...", "id": "..." },
  "type": "issue",
  "start_time": "10:33 AM",
  "added_by": { "name": "Ulrick Sanchez", "email": "ulrick.sanchez@webriq.services" },
  "billing_status": "Non Billable",
  "id": "1512955000018868089",
  "log_hour": "03:36",
  "_zoho_project_id": "1512955000000081363"
}
```

Note `module_detail.type` reads `"bug"` here (Zoho's own internal label for the Issues module in this API's response), while the entry-level `type` field reads `"issue"` — both are cosmetic Zoho quirks confirmed during task 111, not something this import needs to branch on. Only `module_detail.id` matters for resolution.

### New route (model closely on task 103's actual shipped route — `src/app/api/admin/zoho-import/timelogs/route.ts`)

```ts
// src/app/api/admin/zoho-import/issue-timelogs/route.ts — new
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createClient } from "@/lib/supabase/server";
import {
  adminClient,
  buildUserCache,
  clearUserCache,
  resolveUserId,
  parseHours,
  readFromZoho,
  type ImportResult,
} from "@/lib/migrate/zoho-import";

type ZohoIssueTimelogRaw = {
  id?: string;
  date?: string;
  log_hour?: string;
  billing_status?: string;
  notes?: string;
  log_notes?: string;
  owner?: { name?: string; email?: string };
  module_detail?: { id?: string; type?: string };
  _zoho_project_id?: string;
  [key: string]: unknown;
};

function stripHtml(s: string | null | undefined): string | null {
  return s ? s.replace(/<[^>]*>/g, "").trim() || null : null;
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Multi-file scan — mirrors task 103's timelogs-*.json / timelogs.json pattern
  const dir = path.join(process.cwd(), "_from_zoho");
  const batchFiles = fs.readdirSync(dir).filter((f) => f.startsWith("issue-timelogs-") && f.endsWith(".json")).sort();

  let logs: ZohoIssueTimelogRaw[] = [];
  if (batchFiles.length > 0) {
    for (const file of batchFiles) logs.push(...readFromZoho<ZohoIssueTimelogRaw>(file));
  } else {
    if (!fs.existsSync(path.join(dir, "issue-timelogs.json"))) {
      return NextResponse.json({ error: "No issue-timelogs-*.json files found in _from_zoho/" }, { status: 400 });
    }
    logs = readFromZoho<ZohoIssueTimelogRaw>("issue-timelogs.json");
  }

  clearUserCache();
  const userCache = await buildUserCache();

  // Pre-built lookup maps — no per-row DB calls, same shape as tasks/route.ts and task 103's timelogs route
  const { data: projectRows } = await adminClient.from("projects").select("id, zoho_project_id");
  const projectMap = new Map((projectRows ?? []).map((p) => [String(p.zoho_project_id), p.id as string]));

  const { data: issueRows } = await adminClient.from("issues").select("id, external_id").not("external_id", "is", null);
  const issueMap = new Map((issueRows ?? []).map((i) => [String(i.external_id), i.id as string]));

  const errors: string[] = [];
  let skipped = 0;
  const rows: Record<string, unknown>[] = [];

  for (const log of logs) {
    const externalId = String(log.id ?? "");
    const dateLogged = log.date ?? null;
    if (!externalId || !dateLogged) { skipped++; continue; }

    const projectId = projectMap.get(String(log._zoho_project_id ?? ""));
    if (!projectId) { skipped++; continue; }

    let issueId: string | null = null;
    const zohoIssueId = log.module_detail?.id;
    if (zohoIssueId) {
      issueId = issueMap.get(String(zohoIssueId)) ?? null;
      if (!issueId) errors.push(`timelog ${externalId}: unresolved issue module_detail.id=${zohoIssueId} (not yet imported)`);
    }

    rows.push({
      external_id: externalId,
      issue_id: issueId,
      project_id: projectId,
      employee_id: await resolveUserId(log.owner?.email, userCache),
      owner_name: log.owner?.name ?? null,
      owner_email: log.owner?.email ?? null,
      date_logged: dateLogged,
      hours: parseHours(log.log_hour ?? "0:00"),
      billable: log.billing_status === "Billable",
      note: stripHtml(log.notes ?? log.log_notes ?? null),
      source: "manual" as const,
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      const CHUNK_SIZE = 50;
      let imported = 0;

      try {
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE);
          const { error } = await adminClient.from("time_logs").upsert(chunk, { onConflict: "external_id" });
          if (error) errors.push(`chunk ${i}-${i + chunk.length}: ${error.message}`);
          else imported += chunk.length;

          send({ type: "progress", current: Math.min(i + CHUNK_SIZE, rows.length), total: rows.length });
          if (i + CHUNK_SIZE < rows.length) await new Promise<void>((r) => setTimeout(r, 100));
        }

        send({ type: "done", imported, skipped, errors } satisfies { type: string } & ImportResult);
        controller.close();
      } catch (e) {
        send({ type: "error", message: String(e) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
}
```

Note: unlike task 103's Task Timelogs route (which streams the whole `POST` body per-request without an early `try/catch` around row-building), this draft keeps row-building outside the stream and only starts the SSE stream once `rows` is ready — matching how task 111's *export* route structures itself. Confirm this against whatever task 103 actually shipped (`src/app/api/admin/zoho-import/timelogs/route.ts`) and match its exact control flow if it differs from this sketch — the working route is the ground truth, this Code Context is a model, not a copy-paste source.

### `migrate/page.tsx` — current relevant line numbers (as of task 111, before this task's changes)

- `TimelogsImportState` interface: `page.tsx:68-72` — add `IssueTimelogsImportState` (same shape) directly after it.
- `IMPORT_LEVELS` array: `page.tsx:101-113` — add the new entry directly after the existing `timelogs` entry (`page.tsx:111`):
  ```ts
  { key: "issue-timelogs", label: "Issue Time Logs", desc: "Imports time log entries from issue-timelogs-*.json — requires Issues imported first" },
  ```
- State hook: `page.tsx:192-196` (`timelogsImport` useState) — add `issueTimelogsImport` state directly after it, same shape as `timelogsImport`.
- Handler: `page.tsx:795-854` (`handleTimelogsImport`) — add `handleIssueTimelogsImport()` directly after it closes (~`page.tsx:855`), same structure, POSTing to `/api/admin/zoho-import/issue-timelogs` and updating `importStates["issue-timelogs"]` (bracket notation — hyphenated key, same rule already established for `issue-comments`/`attachment-meta`/`issue-timelogs` export state in this same file).
- JSX render block: `page.tsx:1601-1665` (`if (key === "timelogs")`) — add `if (key === "issue-timelogs")` directly after it closes (~`page.tsx:1666`), before `if (key === "attachments")` (`page.tsx:1667`). Same structure as the `timelogs` block, with `importStates["issue-timelogs"]`/`issueTimelogsImport` substituted throughout.

### `time_logs` type in `src/types/database.ts` — add `issue_id` alongside existing `task_id`

Current shape (`Row`/`Insert`/`Update` all need the new nullable field; `Relationships` needs a new FK entry mirroring the existing `time_logs_task_id_fkey`):
```ts
time_logs: {
  Row: {
    id: string;
    task_id: string | null;
    issue_id: string | null;   // new
    project_id: string;
    employee_id: string | null;
    date_logged: string;
    hours: number;
    billable: boolean;
    note: string | null;
    source: "timer" | "manual";
    timesheet_id: string | null;
    external_id: string | null;
    owner_name: string | null;
    owner_email: string | null;
    created_at: string;
  };
  // Insert/Update mirror Row with `issue_id?: string | null;` added in the same position as `task_id?`
  Relationships: [
    { foreignKeyName: "time_logs_task_id_fkey"; columns: ["task_id"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["id"]; },
    { foreignKeyName: "time_logs_issue_id_fkey"; columns: ["issue_id"]; isOneToOne: false; referencedRelation: "issues"; referencedColumns: ["id"]; },  // new
    { foreignKeyName: "time_logs_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"]; }
  ];
}
```

---

## Implementation Steps

1. Write and apply `supabase/migrations/053_time_logs_issue_id.sql` (adds `issue_id` column + partial index).
2. Update `src/types/database.ts`'s `time_logs` entry — add `issue_id` to `Row`/`Insert`/`Update`, add the new `Relationships` FK entry.
3. Create `src/app/api/admin/zoho-import/issue-timelogs/route.ts` per Code Context — multi-file scan (`issue-timelogs-*.json` → `issue-timelogs.json` fallback), pre-built `projectMap`/`issueMap` (bulk queries, no per-row calls), `stripHtml()` + notes/log_notes fallback, chunked SSE upsert (`CHUNK_SIZE = 50`).
4. In `src/app/v2/(hub)/admin/migrate/page.tsx`:
   a. Add `IssueTimelogsImportState` interface after `TimelogsImportState` (`:68-72`).
   b. Add the `issue-timelogs` entry to `IMPORT_LEVELS` after `timelogs` (`:111`).
   c. Add the `issueTimelogsImport` state hook after `timelogsImport` (`:192-196`).
   d. Add `handleIssueTimelogsImport()` after `handleTimelogsImport()` closes (~`:855`).
   e. Add the `if (key === "issue-timelogs")` JSX block after the `key === "timelogs"` block closes (~`:1666`), before `if (key === "attachments")` (`:1667`).
5. Run `npx tsc --noEmit` and `pnpm lint`.

---

## Notes for Implementation Agent

- **This route only ever sets `issue_id`, never `task_id`** — the existing Task Timelogs route only ever sets `task_id`, never `issue_id`. Do not add cross-population logic between the two; they are deliberately parallel, independent writers into the same table.
- **Reuse `resolveIssueId` is NOT actually called in the hot loop** — despite existing in `zoho-import.ts`, this route (like task 103's Task version) should build a bulk `issueMap` via one `select` query instead, for the same N+1-avoidance reason task 103 flagged for `resolveTaskId`. `resolveIssueId` stays available for any future single-row use case, but this bulk-import path should not call it per-row.
- **Every hyphenated-key state access must use bracket notation** (`importStates["issue-timelogs"]`) — same rule already established elsewhere in this file for `issue-comments`/`attachment-meta`/`issue-timelogs` (export side).
- **Do not add a `time_logs.task_id`/`issue_id` mutual-exclusivity CHECK constraint** unless explicitly asked — see Decision #2. This keeps the migration minimal and consistent with the rest of the schema.
- **Do not retrofit the existing Task Timelogs rows with Zoho's original `created_time`** — see Decision #3. That is a larger, separate scope than this task.
- **Spot-check after import**: confirm `issue_id` is populated for rows where `module_detail.id` resolves (969 of the 2,185 rows reference a distinct issue, all 969 confirmed resolvable against the already-imported `issues` table), and that rows where the issue doesn't resolve still import with `issue_id: null` plus an `errors` entry, not a skip.
- **This is a dev-only admin tool** (`/v2/admin/migrate`, already auth-gated) — no RLS changes needed beyond what `time_logs` already has, no public exposure.

---

## Implementation Notes

### What Changed
- Added `supabase/migrations/053_time_logs_issue_id.sql` — nullable `issue_id uuid references issues(id) on delete set null` + partial index on `time_logs`, exactly as specced (no new table).
- Created `src/app/api/admin/zoho-import/issue-timelogs/route.ts` — new SSE import route, issue-scoped sibling of `zoho-import/timelogs/route.ts`.
- Added `issue_id` to `time_logs`'s `Row`/`Insert`/`Update` + a `time_logs_issue_id_fkey` `Relationships` entry in `src/types/database.ts`.
- Added all 5 planned pieces to `src/app/v2/(hub)/admin/migrate/page.tsx`: `IssueTimelogsImportState` interface (after `TimelogsImportState`), `issue-timelogs` entry in `IMPORT_LEVELS` (after `timelogs`), `issueTimelogsImport` state hook (after `timelogsImport`), `handleIssueTimelogsImport()` (after `handleTimelogsImport()` closes), and the `key === "issue-timelogs"` JSX block (after the `timelogs` block, before `attachments`).

### Deviations From Plan
- **Read the actual shipped `zoho-import/timelogs/route.ts` before writing the new route, rather than trusting the task doc's Code Context sketch verbatim** — the real route's control flow differs slightly (map-building and row-building happen inside the SSE stream's `start()` callback with `console.log` instrumentation throughout, `total`/`current` computed via `Math.ceil`/`Math.floor` chunk-index arithmetic rather than byte offsets). Matched the real pattern exactly instead of the doc's simplified sketch, per the doc's own explicit instruction ("the working route is the ground truth, this Code Context is a model, not a copy-paste source").
- **Paginated the `issues` lookup query in a `PAGE = 1000` loop**, which the task doc's Code Context sketch did not do (it used a single unbounded `.select()`). The real shipped Task Timelogs route paginates its `tasks` query for exactly this reason (Supabase/PostgREST's 1000-row default cap — the same bug class that hit task 103's `tasks` lookup and task 110's `issues` lookup). Since `issues` has 1,049 rows — over the cap — an unbounded select would have silently dropped ~49 issues and produced spurious "unresolved issue" errors on this import. Caught by comparing against the real Task Timelogs route rather than the doc's sketch, before running anything against real data.
- No other deviations — field mapping (`log_hour`→`hours` via `parseHours`, `billing_status === "Billable"`, `notes`/`log_notes` fallback via `stripHtml`, `owner`→`owner_name`/`owner_email`), file-scan glob (`issue-timelogs-*.json`→`issue-timelogs.json` fallback), chunk size (50), and the "unresolved but not skipped" error-handling for missing `issue_id` all match the spec exactly.

### Verification Run
- `npx tsc --noEmit` — PASS (clean, no errors)
- `pnpm lint` — PASS (same 44 pre-existing baseline problems — 8 errors/36 warnings — as task 111's own documented baseline; confirmed via grep that none touch `issue-timelogs/route.ts`, `migrate/page.tsx`, or `database.ts`)
- Migration not yet applied to the live database and route not yet run against real data — that's the one remaining acceptance criterion ("Live run against the real 2,185-record dataset completes with no unhandled errors"), left for the Testing stage per this skill's own contract (implementation stage does not run live migrations/data imports).

---

## Acceptance Criteria

- [x] `supabase/migrations/053_time_logs_issue_id.sql` adds a nullable `issue_id uuid references issues(id) on delete set null` column + partial index; no new table created
- [x] `POST /api/admin/zoho-import/issue-timelogs` requires admin/super_admin auth — 401/403 matching every other import route
- [x] Route reads all `issue-timelogs-*.json` files in `_from_zoho/` (or falls back to `issue-timelogs.json`), 400s with a clear error if none exist
- [x] `hours` is correctly parsed from `log_hour` via the existing `parseHours()` helper
- [x] `issue_id` resolves via `module_detail.id` against a pre-built `issueMap` (bulk query, not per-row `resolveIssueId` calls) — paginated in 1000-row pages given `issues` has 1,049 rows
- [x] Unresolved issue references (`module_detail.id` present but not found in `issues`) are logged to `errors` without skipping the row
- [x] `billable` correctly reflects `billing_status === "Billable"`
- [x] `note` contains HTML-stripped text from `notes`/`log_notes` (fallback to `log_notes` if `notes` absent)
- [x] No per-row DB queries for project/issue resolution — only pre-built lookup maps + the existing batched user cache
- [x] Import streams via SSE with chunked progress (`CHUNK_SIZE = 50`), matching the Task Timelogs import UX
- [x] Re-running import is idempotent (upsert on `external_id`) — confirmed no `external_id` collision exists with the already-imported 14,533 Task time-log rows
- [x] `migrate/page.tsx` shows a working "Issue Time Logs" import card with progress bar + done summary, directly after "Time Logs" in the import list — confirmed via screenshot, 2026-07-07
- [x] `npx tsc --noEmit` and `pnpm lint` both clean
- [x] Live run against the real 2,185-record dataset completes with no unhandled errors — confirmed 2026-07-07: 2,185 imported, 0 skipped, 0 errors

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

1. Confirm task 108 (Issues import) has already been run — `issues` table must be populated before this import can resolve `issue_id`.
2. Apply migration 053, confirm `time_logs.issue_id` column exists via Supabase dashboard or `\d time_logs`.
3. Start dev server: `pnpm dev`.
4. Navigate to `/v2/admin/migrate`. Confirm the "Issue Time Logs" card appears in Phase 1 — Import, after "Time Logs".
5. Click Import. Confirm progress bar advances by chunk, done summary shows imported/skipped/error counts.
6. Spot-check in Supabase: query a few `time_logs` rows by `external_id` (sample from `_from_zoho/issue-timelogs-0-50.json`) and confirm `issue_id` is populated where `module_detail.id` resolves, `hours > 0`, `billable` varies, `note` has no HTML tags, `task_id` is `null` on every imported row (this route never sets it).
7. Confirm total imported count is 2,185 (or 2,185 minus any genuinely skipped rows — expect 0 skips given both files were fully validated in-session) and re-running the import is a no-op upsert (same count, no duplicates).

---

## Compatibility Touchpoints

- **Hard prerequisite: task 108 (Issues import) must already be complete.** `issue_id` resolution reads from the `issues` table; running this import before task 108 will resolve 0 issues and populate `errors` for all 969 referenced issues.
- New column + new route only — no changes to the existing Task Timelogs export/import routes, no changes to `time_logs.task_id` behavior.
- Purely additive to `migrate/page.tsx` (new interface, new array entry, new state, new handler, new JSX block) — no existing import card's behavior changes.
- `EXPORT_LEVELS` is untouched — export already shipped in task 111, this task is import-only.
