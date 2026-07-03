# Task 104 — Attachments Export/Import Fix: Multi-File Scan, SSE, Failure Visibility + DB Index/Constraint

> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Date:** 2026-07-02
> **Status:** TESTING
> **Completed:** 2026-07-02
> **Investigation:** `/understand` ran before this spec. Findings embedded below.
> **Implementation Notes:** All 4 file changes match the spec exactly, including the mid-spec correction against the real Zoho API docs (project-level `?entity_type=task&entity_id={taskId}` endpoint, singular `json.attachment` envelope, `attachment_id`/`name`/`size`(string)/`download_url`/`trashed` field mapping). `npx tsc --noEmit` and `pnpm lint` both clean on all 4 changed files. Not yet run live — needs migration 049 applied, then Export → Import clicked in `/v2/admin/migrate` (auth-gated browser flow, can't be curled directly). Spot-check after running: confirm a sample `attachment-meta.json` record matches the documented shape, confirm `trashed: true` rows are skipped, confirm `size` is a populated integer (not null/string) in the DB.
>
> **Post-implementation hardening (2026-07-02, same day):** user ran the export live and stopped it mid-run (675/6946 tasks, ~13 min remaining) over crash-safety and token-expiry concerns — this is the highest-call-volume export in the migration (~6,946 sequential calls). Found that `timelogs/route.ts` (the other long-running export) had already accumulated hardening never ported back to `attachment-meta`: `from`/`to` task-index slicing, a 401 auto-refresh-and-retry (fetch fresh token via `getZohoAccessToken()`, retry once), and a 9-minute wait + retry on Zoho's `URL_ROLLING_THROTTLES_LIMIT_EXCEEDED` 400 error. Ported all three into `attachment-meta/route.ts`, matching `timelogs/route.ts`'s pattern exactly. Since exports can now be chunked, `zoho-import/attachments/route.ts` was also switched from single-file `readFromZoho("attachment-meta.json")` to a multi-file scan (`attachment-meta-*.json`, sorted, concatenated, fallback to single file) — same pattern as the tasks/timelogs imports. Download filename convention: `attachment-meta-{from}-{to}.json`.
>
> **Post-implementation pacing fix (2026-07-02, same day, second round):** first chunked run (`0-500`) tripped the `URL_ROLLING_THROTTLES_LIMIT_EXCEEDED` throttle at ~task 200, requiring the 9-minute reactive wait added above. Root cause: the per-request `sleep(200)` between tasks allows up to ~600 requests/2min in theory, well over Zoho's 200-req/2min rolling limit for this portal (the same limit `timelogs/route.ts` already calibrates for, per its own comment). Fixed by raising the pacing to `sleep(700)` — matching timelogs' proven-safe cadence — so the limit is avoided proactively instead of relying on the reactive 9-minute-wait-and-retry-once fallback (which only retries once per task; if the throttle hadn't actually cleared, the next task would trip it again and stall repeatedly). This roughly triples full-run time (6,946 tasks × 700ms ≈ 81 min total, vs. the original ≈23 min estimate) — expected and worth it to avoid repeated 9-minute stalls. Chunking makes this manageable: a 500-task chunk now takes ≈6 min instead of ≈1.7 min.

---

## Problem

`GET /api/admin/zoho-export/attachment-meta` and `POST /api/admin/zoho-import/attachments` are the last unrun piece of the Zoho decommission migration (task 079) — the `attachments` table is currently empty (0 rows) and no `_from_zoho/attachment-meta.json` exists. Investigation found these are not simply "untested," they are actively broken or high-risk:

1. **Export route hardcodes `tasks.json`** (`attachment-meta/route.ts:27-30`) — 400s immediately. `_from_zoho/` only has the 5 slice files from task 089's rewrite (`tasks-0-50-2025.json` … `tasks-150-200-2025.json`), not a single `tasks.json`. Same bug class as task 103's bug #1, just on the export leg. Sibling exports (`comments`, `timelogs`) were already fixed to scan for both naming conventions; `attachment-meta` was never revisited.
2. **Export route calls the wrong Zoho endpoint entirely.** Current code fetches `GET /projects/{projectId}/tasks/{taskId}/attachments` (task-nested path). **Confirmed against the official Zoho Projects API docs** (user-provided, `projects.zoho.com/api-docs#attachments-get_project_attachments`): the real endpoint is `GET /projects/{projectId}/attachments?entity_type=task&entity_id={taskId}` — a project-level path with `entity_type`/`entity_id` as required query params, not a task-nested route. The task-nested URL the code currently calls does not exist in the Zoho API at all.
3. **Export route reads the wrong response envelope key even if the URL were fixed.** Current code reads `json.attachments` (plural). The real response wraps results in `json.attachment` (**singular** — confirmed from the docs' sample response). `(json.attachments ?? [])` always evaluates to `[]`, so even with the URL bug fixed, every task would silently report zero attachments.
4. **`ZohoAttachmentRaw` field names were guessed wrong.** Confirmed against the real sample response: real field is `attachment_id` (not `id`), `name` (not `file_name`/`filename`), `size` is a **string** (`"198091"`, not `file_size`/`size` as a number — needs `parseInt`), `download_url` (this one guess happened to be correct). The response also includes a `trashed: boolean` field not previously captured at all — worth filtering out trashed files rather than importing them as if active.
5. **Import uses per-row `resolveTaskId()`** (single-row query per attachment) instead of a pre-built map — same N+1 risk class as task 103's bug #6 (though likely far fewer rows than the 14,533 timelogs).
6. **Failed downloads/uploads are completely silent.** If a Zoho fetch or Storage upload fails, the row still counts as `imported` with `storage_path: ""` and `errors` stays empty — indistinguishable from full success. This is the same silent-failure pattern task 103 was created to eliminate, just a new instance of it.
7. **Export is a single blocking call** over all 6,946 tasks (~23 min at 200ms/task) with no progress feedback, unlike the SSE-rewritten `tasks`/`comments`/`timelogs` exports.

Separately, a DB-structure review of the `attachments` table (done in conversation, not part of the original `/understand` run) confirmed the existing single polymorphic table (`entity_type` + `entity_id`, no per-type tables) is the right design — RLS on `attachments` is role-based only (`admin`/`pm`/`developer`, migration 026/048), not per-project/customer scoped, so there's no need for `entity_id` to be a real per-type FK for policy joins. Splitting into `project_attachments`/`task_attachments`/`comment_attachments` was explicitly considered and rejected — **not open for reconsideration in this task.** Two structural gaps were found and should ship with this fix:
   - No index on `(entity_type, entity_id)` — every query is "attachments for this task/project/comment."
   - No CHECK constraint on `entity_type` — a typo (`"Task"` vs `"task"`) silently creates an unqueryable orphan row.

---

## Decisions (resolved via clarifying questions before this spec)

1. **Export style:** rewrite to SSE streaming, matching `tasks`/`comments`/`timelogs` exports. Progress event per task iterated (out of 6,946), regardless of how many actually have attachments.
2. **Import style:** pre-built `taskMap` (paginated, avoids N+1) instead of per-row `resolveTaskId()`. Stream progress via SSE — actual downloads/uploads stay sequential (inherent to per-file network I/O), but progress is now visible instead of one blocking `POST`.
3. **Failure visibility:** surface failed downloads/uploads in the result's `errors` array (same fix pattern as task 103) instead of silently leaving `storage_path: ""` indistinguishable from success. The row still imports with the `source_url` fallback — this is additive visibility, not a behavior change to the fallback itself.
4. **DB structure:** keep the single polymorphic `attachments` table (no separate per-module tables). Add composite index `(entity_type, entity_id)` and a CHECK constraint restricting `entity_type` to `('task', 'project', 'comment')` — `'task'` is the only value populated today; `'project'`/`'comment'` are reserved for anticipated future parents (out of scope to actually populate in this task — Zoho's project-level Documents library and comment-level attachments are separate, unbuilt features, not touched here).

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/049_attachments_index_constraint.sql` | Create | Composite index + `entity_type` CHECK constraint |
| `src/app/api/admin/zoho-export/attachment-meta/route.ts` | Rewrite | Multi-file tasks scan (fix bug #1) + SSE streaming |
| `src/app/api/admin/zoho-import/attachments/route.ts` | Rewrite | Multi-file scan (attachment-meta batch files, if export ever chunks), pre-built `taskMap`, SSE progress, surfaced download/upload errors |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | Modify | Add `AttachmentMetaExportState`/`handleAttachmentMetaExport()` + `AttachmentsImportState`/`handleAttachmentsImport()`, special-case both cards in `EXPORT_LEVELS.map()`/`IMPORT_LEVELS.map()` |

---

## Code Context

### Migration 049 — full SQL

```sql
-- Composite index: every query filters attachments by parent (entity_type, entity_id)
create index if not exists attachments_entity_idx on attachments(entity_type, entity_id);

-- Restrict entity_type to known values — prevents a typo from creating a silently
-- unqueryable orphan row. 'task' is the only value populated today; 'project' and
-- 'comment' are reserved for anticipated future parents (not built in this task).
alter table attachments
  add constraint attachments_entity_type_check
  check (entity_type in ('task', 'project', 'comment'));
```

### Current `attachments` table schema (migration 025 + 035)

```sql
create table attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  storage_path text not null,
  filename text not null,
  size bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
-- migration 035 additions:
alter table attachments
  add column external_id text unique,   -- source system attachment ID
  add column source_url text;           -- original CDN URL; fallback if storage upload failed
```

RLS (migration 026, updated 048) — role-based only, no per-entity scoping:
```sql
create policy "attachments_staff_read" on attachments for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'));
create policy "attachments_pm_write" on attachments for all to authenticated
  using (get_my_role() in ('admin', 'pm')) with check (get_my_role() in ('admin', 'pm'));
create policy "attachments_developer_insert" on attachments for insert to authenticated
  with check (get_my_role() = 'developer' and uploaded_by = auth.uid());
```

### Current export route (full file, to be replaced) — `src/app/api/admin/zoho-export/attachment-meta/route.ts`

```ts
// dev-only export endpoint — fetches attachment metadata for every task.
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type RawTask = { id?: string; id_string?: string; _zoho_project_id?: string; [key: string]: unknown };

export async function GET() {
  // ...auth guard (keep as-is)...

  const token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  const tasksFile = path.join(process.cwd(), "_from_zoho", "tasks.json");   // BUG: doesn't exist
  if (!fs.existsSync(tasksFile)) {
    return NextResponse.json({ error: "tasks.json not found in _from_zoho/ — export tasks first" }, { status: 400 });
  }

  const tasks = JSON.parse(fs.readFileSync(tasksFile, "utf-8")) as RawTask[];
  const all: unknown[] = [];

  for (const task of tasks) {                                              // BUG: blocking, no progress
    const taskId = String(task.id_string ?? task.id);
    const projectId = String(task._zoho_project_id ?? "");
    if (!taskId || !projectId) continue;

    const res = await fetch(`${BASE}/projects/${projectId}/tasks/${taskId}/attachments`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });

    if (res.ok) {
      const json = await res.json() as { attachments?: unknown[] };
      const attachments = (json.attachments ?? []).map((a) => ({
        ...(a as Record<string, unknown>),
        _zoho_task_id: taskId,
        _zoho_project_id: projectId,
      }));
      all.push(...attachments);
    }
    await sleep(200);
  }

  return new NextResponse(JSON.stringify(all, null, 2), { /* ...headers... */ });
}
```

### Current import route (full file, to be replaced) — `src/app/api/admin/zoho-import/attachments/route.ts`

```ts
// dev-only import endpoint — reads _from_zoho/attachment-meta.json, downloads files
// from Zoho CDN, uploads to Supabase Storage (project-assets bucket), upserts to attachments.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readFromZoho, resolveTaskId, adminClient, ImportResult } from "@/lib/migrate/zoho-import";
import { getZohoAccessToken } from "@/lib/zoho";

type ZohoAttachmentRaw = {
  id?: string;              // WRONG — real field is attachment_id, see corrected type below
  file_name?: string;
  filename?: string;
  file_size?: number;
  size?: number;
  download_url?: string;
  download_link?: string;
  url?: string;
  _zoho_task_id?: string;
  [key: string]: unknown;
};

export async function POST() {
  // ...auth guard (keep as-is)...

  let attachments: ZohoAttachmentRaw[];
  try {
    attachments = readFromZoho<ZohoAttachmentRaw>("attachment-meta.json");   // single-file only
  } catch {
    return NextResponse.json({ error: "Could not read _from_zoho/attachment-meta.json" }, { status: 400 });
  }

  const token = await getZohoAccessToken();
  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };

  for (const att of attachments) {                                          // BUG: no batching
    const externalId = String(att.id ?? "");
    const filename = att.file_name ?? att.filename ?? "";
    if (!externalId || !filename) { result.skipped++; continue; }

    const taskId = await resolveTaskId(String(att._zoho_task_id ?? ""));    // BUG: per-row DB call
    if (!taskId) { result.skipped++; continue; }

    const sourceUrl = att.download_url ?? att.download_link ?? att.url ?? "";

    let storagePath = "";
    if (token && sourceUrl) {
      try {
        const fileRes = await fetch(sourceUrl, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
        if (fileRes.ok) {
          const blob = await fileRes.blob();
          const safeName = `zoho/${att._zoho_task_id}/${externalId}_${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          const { error: uploadError } = await adminClient.storage.from("project-assets").upload(safeName, blob, { upsert: true });
          if (!uploadError) storagePath = safeName;
          // BUG: uploadError is swallowed — not pushed to result.errors
        }
        // BUG: !fileRes.ok is swallowed — not pushed to result.errors
      } catch {
        // Non-blocking — source_url is the fallback
        // BUG: exception swallowed — not pushed to result.errors
      }
    }

    const { error } = await adminClient.from("attachments").upsert(
      {
        external_id: externalId,
        entity_type: "task",
        entity_id: taskId,
        storage_path: storagePath,
        filename,
        size: att.file_size ?? att.size ?? null,
        source_url: sourceUrl || null,
      },
      { onConflict: "external_id" }
    );

    if (error) result.errors.push(`attachment ${externalId}: ${error.message}`);
    else result.imported++;
  }

  return NextResponse.json(result);
}
```

### Corrected `ZohoAttachmentRaw` type + row mapping (use this, not the guessed version above)

```ts
type ZohoAttachmentRaw = {
  attachment_id?: string;   // external_id
  name?: string;            // filename
  type?: string;            // mime type — not currently a column, not required
  size?: string;             // STRING per real API — parseInt before writing to `size bigint`
  download_url?: string;
  trashed?: boolean;        // skip attachments where trashed === true
  entity_id?: string;       // matches the task ID we queried by — not needed for parsing (already known from loop)
  entity_type?: string;
  _zoho_task_id?: string;   // synthetic field added by the export route (see request query params)
  [key: string]: unknown;
};

// ...inside the loop:
const externalId = String(att.attachment_id ?? "");
const filename = att.name ?? "";
if (!externalId || !filename) { result.skipped++; continue; }
if (att.trashed === true) { result.skipped++; continue; }   // don't import deleted-in-Zoho files

const sourceUrl = att.download_url ?? "";
const fileSize = att.size ? parseInt(att.size, 10) : null;   // size is a string in the real response
```
Use `fileSize` in place of `att.file_size ?? att.size ?? null` when building the upsert row.

### Confirmed real Zoho API contract (official docs, `projects.zoho.com/api-docs#attachments`)

**Request:**
```
GET /api/v3/portal/{portalId}/projects/{projectId}/attachments?entity_type=task&entity_id={taskId}
Authorization: Zoho-oauthtoken {token}
```
Both `entity_type` and `entity_id` are **required query params** — `entity_type=task`, `entity_id={taskId}` (the Zoho task ID). This replaces the task-nested path the current code uses.

**Response (200):**
```json
{
  "attachment": [
    {
      "attachment_id": "170876000015530007",
      "name": "coder 1.jpg",
      "type": "image/jpeg",
      "size": "198091",
      "entity_id": "170876000015496423",
      "entity_type": "task",
      "created_by": "703961433",
      "created_time": "1712723408594",
      "associated_by": "703961433",
      "associated_by_name": "Monica Hemsworth",
      "preview_url": "https://previewengine-accl.zoho.com/thumbnail/...",
      "download_url": "https://download-accl.zoho.com/v1/workdrive/download/...",
      "permanent_url": "https://workdrive.zoho.com/file/...",
      "trashed": false
    }
  ]
}
```
Key points:
- Envelope key is **`attachment`** (singular), not `attachments`.
- `attachment_id` is the external ID (was guessed as `id`).
- `name` is the filename (was guessed as `file_name`/`filename`).
- `size` is a **string** — must `parseInt(att.size, 10)` before writing to the `size bigint` column.
- `download_url` was already correct.
- `trashed: boolean` — filter these out (`if (att.trashed) continue` / skip), don't import deleted-in-Zoho files as if active.
- `created_time`/`associated_time_long` are epoch-millisecond strings, not currently mapped to any column — not required for this task (no `created_time` column on `attachments`), but note for context if a future task wants upload timestamps.

**Possible errors** (per docs): `404 RESOURCE_NOT_FOUND`, `400 INVALID_PARAMETER_VALUE` (bad `entity_type`), `400 REQUIRED_PARAMETER_MISSING`. Treat a non-200 response the same way the current code does (skip that task's attachments, don't fail the whole export) — a `404`/`400` for one task shouldn't be fatal to the run.

### Multi-file scan pattern to follow — `src/app/api/admin/zoho-export/comments/route.ts:27-31`

```ts
const dir = path.join(process.cwd(), "_from_zoho");
const taskFiles = fs.readdirSync(dir).filter((f) => /^tasks(-\d.*)?\.json$/.test(f)).sort();
if (taskFiles.length === 0) {
  return NextResponse.json({ error: "No tasks files found in _from_zoho/ — export tasks first" }, { status: 400 });
}
let tasks: RawTask[] = [];
for (const file of taskFiles) {
  const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
  if (Array.isArray(parsed)) tasks.push(...parsed);
}
```
Apply the same `tasks(-\d.*)?\.json` scan to `attachment-meta/route.ts` in place of the hardcoded `tasks.json` path.

### SSE export pattern to follow exactly — `src/app/api/admin/zoho-export/timelogs/route.ts` (post task-102 rewrite; same shape as `tasks`/`comments` exports)

```ts
const encoder = new TextEncoder();
const stream = new ReadableStream({
  async start(controller) {
    const send = (obj: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
    const all: unknown[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const taskId = String(task.id_string ?? task.id);
      const projectId = String(task._zoho_project_id ?? "");
      if (taskId && projectId) {
        const qp = new URLSearchParams({ entity_type: "task", entity_id: taskId });
        let res = await fetch(`${BASE}/projects/${projectId}/attachments?${qp}`, {
          headers: { Authorization: `Zoho-oauthtoken ${token}` },
        });
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10);
          await sleep(retryAfter * 1000);
          res = await fetch(`${BASE}/projects/${projectId}/attachments?${qp}`, {
            headers: { Authorization: `Zoho-oauthtoken ${token}` },
          });
        }
        if (res.ok) {
          const json = await res.json() as { attachment?: unknown[] };   // envelope key is singular "attachment"
          const items = (json.attachment ?? []).map((a) => ({ ...(a as Record<string, unknown>), _zoho_task_id: taskId, _zoho_project_id: projectId }));
          all.push(...items);
          send({ type: "attachments", items });
        }
        // 404/400 for a single task (per docs' "Possible Errors") is not fatal — just skip it, matches current non-blocking behavior
      }
      send({ type: "progress", current: i + 1, total: tasks.length });
      await sleep(200);
    }

    send({ type: "done", total_attachments: all.length });
    controller.close();
  },
});
return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } });
```
Include the 429 retry (copy verbatim from `tasks`/`timelogs` export pattern) — this loop makes ~6,946 sequential Zoho calls, the highest-volume export in the migration, so it's the most likely to hit a rate limit.

### Pre-built taskMap pattern (post task-103 pagination fix) — `src/app/api/admin/zoho-import/timelogs/route.ts`

```ts
const taskRows: Array<{ id: string; external_id: string }> = [];
{
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data: page } = await adminClient
      .from("tasks")
      .select("id, external_id")
      .not("external_id", "is", null)
      .range(from, from + PAGE - 1);
    if (!page || page.length === 0) break;
    taskRows.push(...(page as Array<{ id: string; external_id: string }>));
    if (page.length < PAGE) break;
    from += PAGE;
  }
}
const taskMap = new Map(taskRows.map((t) => [String(t.external_id), t.id]));
```
**Must paginate** — this is the exact bug found and fixed in task 103 (Supabase/PostgREST's 1000-row default select limit silently truncated an unpaginated query). Copy this pagination loop verbatim; do not repeat the unpaginated version.

### UI: `TimelogsExportState`/`handleTimelogsExport()` and `TimelogsImportState`/`handleTimelogsImport()` — model for attachment states/handlers

`src/app/v2/(hub)/admin/migrate/page.tsx` already has both patterns fully built for timelogs (task 102/103):
- Export: `TimelogsExportState { progress: {current,total,project}|null; done: {count}|null; error }`, `handleTimelogsExport()` reads SSE frames, accumulates into an array, downloads as JSON blob on `done`.
- Import: `TimelogsImportState { progress: {current,total}|null; done: {imported,skipped,errors}|null; error }`, `handleTimelogsImport()` reads SSE frames, updates progress/done state.

Mirror both exactly for `AttachmentMetaExportState`/`handleAttachmentMetaExport()` (SSE event fields: `current`, `total`, `items` instead of `logs`, `total_attachments` instead of `total_logs`; download filename `attachment-meta.json`) and `AttachmentsImportState`/`handleAttachmentsImport()` (identical shape to `TimelogsImportState`/`handleTimelogsImport()` — `progress: {current,total}`, `done: {imported,skipped,errors}`).

Special-case both in `EXPORT_LEVELS.map()` (`if (key === "attachment-meta")`, after the existing `if (key === "timelogs")` block) and `IMPORT_LEVELS.map()` (`if (key === "attachments")`, after the existing `if (key === "timelogs")` block) — reuse the single-progress-bar card layout (blue bar, `"Task {current} of {total}"` for export, `"Attachment {current} of {total}"` for import) and the done-summary rendering (`imported · skipped` line + errors capped at 3 + "+N more"), same as the Time Logs cards added in task 103.

---

## Implementation Steps

1. **Create migration `supabase/migrations/049_attachments_index_constraint.sql`**:
   - `create index if not exists attachments_entity_idx on attachments(entity_type, entity_id);`
   - `alter table attachments add constraint attachments_entity_type_check check (entity_type in ('task', 'project', 'comment'));`

2. **Rewrite `src/app/api/admin/zoho-export/attachment-meta/route.ts`**:
   - Keep auth guard unchanged.
   - Replace hardcoded `tasks.json` read with the multi-file scan (`/^tasks(-\d.*)?\.json$/` pattern from `comments/route.ts`); 400 if no matching files found.
   - **Fix the request URL**: `${BASE}/projects/${projectId}/attachments?entity_type=task&entity_id=${taskId}` — NOT the task-nested path the current code uses. See "Confirmed real Zoho API contract" below.
   - **Fix the response parsing**: read `json.attachment` (singular), not `json.attachments`.
   - Convert to `ReadableStream` SSE: per-task fetch with 429 retry (copy from `tasks`/`timelogs` export), `send({type:"progress", current, total})` and `send({type:"attachments", items})` per task, `send({type:"done", total_attachments})` at the end.
   - Response headers: `text/event-stream`, `no-cache`, `keep-alive`.

3. **Rewrite `src/app/api/admin/zoho-import/attachments/route.ts`**:
   - Keep auth guard unchanged; keep `readFromZoho<ZohoAttachmentRaw>("attachment-meta.json")` (single file is fine — the export in step 2 does not slice/chunk, unlike tasks/timelogs).
   - **Use the corrected `ZohoAttachmentRaw` type and field mapping** (see "Corrected `ZohoAttachmentRaw` type + row mapping" in Code Context) — `attachment_id` not `id`, `name` not `file_name`/`filename`, `download_url` (unchanged), `size` parsed from string via `parseInt`. These are now confirmed against official Zoho API docs, not guessed — do not reintroduce the old fallback-chain guesses.
   - **Skip attachments where `trashed === true`** — don't import deleted-in-Zoho files as if active.
   - Replace `resolveTaskId()` per-row calls with a pre-built, paginated `taskMap` (copy the pagination loop from `timelogs/route.ts` verbatim — this is the exact bug task 103 fixed, do not reintroduce the unpaginated version).
   - Convert to SSE: wrap in `ReadableStream`, loop attachments sequentially (download + upload must stay sequential — real per-file network I/O), `send({type:"progress", current, total})` after each attachment.
   - When a Zoho fetch fails (`!fileRes.ok`), when a Storage upload fails (`uploadError`), or when the `try/catch` around the download+upload catches an exception: push a message to `errors` (e.g. `` `attachment ${externalId}: zoho fetch failed (${fileRes.status})` `` / `` `attachment ${externalId}: storage upload failed: ${uploadError.message}` `` / `` `attachment ${externalId}: download/upload error: ${e}` ``) — the row still upserts with `storage_path: ""` and the `source_url` fallback (do not change that fallback behavior, only add visibility).
   - `send({type:"done", imported, skipped, errors})` at the end.

4. **Add `AttachmentMetaExportState`/`handleAttachmentMetaExport()` and `AttachmentsImportState`/`handleAttachmentsImport()` to `migrate/page.tsx`**, mirroring the timelogs export/import state+handler shapes exactly (see Code Context above for field-name mapping).

5. **Special-case both in `EXPORT_LEVELS.map()`/`IMPORT_LEVELS.map()`**, reusing the Time Logs card layout (progress bar + done summary + capped error list).

---

## Notes for Implementation Agent

- **Sonnet recommended** — schema migration + two SSE route rewrites + UI state/handlers across 3 layers (DB, API, UI), plus judgment calls on where to surface new error paths without changing existing fallback behavior.
- **Field names and the request URL are now confirmed against official Zoho Projects API docs** (`projects.zoho.com/api-docs#attachments-get_project_attachments`), not guessed — see "Confirmed real Zoho API contract" and "Corrected `ZohoAttachmentRaw` type" in Code Context. Use those, not the old fallback-chain guesses (`file_name ?? filename`, `download_url ?? download_link ?? url`, `id`, numeric `size`). Still worth a quick spot-check on the first live export (read one sample record from the downloaded `attachment-meta.json`, confirm it matches the documented shape) since docs can occasionally lag the live API — but this is a sanity check now, not a blind discovery step like task 103 had to do for timelogs.
- **`size` is a string in the real API response** (`"198091"`) — parse with `parseInt(att.size, 10)` before writing to the `size bigint` column, don't write the string directly.
- **Skip `trashed: true` attachments** — the real response includes this field; importing trashed files as if active would pollute the Hub with deleted-in-Zoho content.
- **`attachments` table `entity_id` is not a real FK** (polymorphic — points to `tasks`, and in the future `projects`/`task_comments`, depending on `entity_type`). This is an accepted, deliberate design (see Problem section) — do not add a real foreign key or attempt to normalize into per-type tables in this task.
- **Only `entity_type = 'task'` will actually be populated by this task.** The CHECK constraint includes `'project'`/`'comment'` as reserved future values, but nothing in this task's scope writes those — don't build project-level Documents or comment-attachment import here, that's explicitly out of scope (see conversation: Zoho's project-level "Documents" library is a different, unbuilt feature).
- **429 retry matters more here than in prior exports** — ~6,946 sequential Zoho calls (once per task) is the highest call volume of any export route in this migration.
- **Import stays row-by-row for the actual file transfer** (download + Storage upload) — only the `taskMap` lookup and progress reporting change. Do not attempt to parallelize file uploads; that's a different, riskier change not requested here.
- **This is a dev-only admin tool** (`/v2/admin/migrate`, auth-gated by `admin`/`super_admin` role check already in both routes) — no RLS changes needed beyond the index/constraint migration.

---

## Acceptance Criteria

- [ ] Migration 049 applies cleanly; `attachments_entity_idx` and `attachments_entity_type_check` both exist
- [ ] Export reads all `tasks-*.json` (or `tasks.json` fallback) files, not just a hardcoded `tasks.json`
- [ ] Export calls `GET /projects/{projectId}/attachments?entity_type=task&entity_id={taskId}` — not the old task-nested path
- [ ] Export parses `json.attachment` (singular) — not `json.attachments`
- [ ] Export streams via SSE with per-task progress; download triggers as `attachment-meta.json` on completion
- [ ] Export includes 429 retry (same pattern as tasks/timelogs exports)
- [ ] Import maps `attachment_id`/`name`/`download_url`/`size` (parsed as int) correctly, per the confirmed API contract
- [ ] Import skips `trashed: true` attachments
- [ ] Import builds `taskMap` via a paginated bulk query (not per-row `resolveTaskId()`, not an unpaginated single query)
- [ ] Import streams via SSE with per-attachment progress
- [ ] Failed Zoho downloads and failed Storage uploads are pushed to `errors` (row still imports with `source_url` fallback, `storage_path: ""`)
- [ ] Migrate page shows working progress bars + done summaries for both Attachment Metadata export and Attachments import rows
- [ ] Re-running import is idempotent (upsert on `external_id`)
- [ ] After first live export, spot-check one sample record against the documented shape (sanity check, not blind discovery — docs are now the source of truth)

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

1. Apply migration 049 (`supabase db push` or equivalent per this project's migration workflow)
2. Start dev server: `pnpm dev`
3. Navigate to `/v2/admin/migrate`
4. Click **Export** on the Attachment Metadata row — verify progress bar advances "Task N of 6946", download triggers as `attachment-meta.json`
5. Open the downloaded file — sample a record, confirm actual field names against `ZohoAttachmentRaw`'s guesses; note any mismatch
6. Click **Import** on the Attachments row — verify progress bar advances, done summary shows imported/skipped/error counts
7. Spot-check in Supabase: query a few `attachments` rows by `external_id`, confirm `entity_id` resolves to a real `tasks.id`, `storage_path` is populated for successful uploads, and any failures appear in the returned `errors` list rather than being silently swallowed
