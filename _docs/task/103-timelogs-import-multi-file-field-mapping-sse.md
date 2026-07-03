# Task 103 — Timelogs Import: Field-Mapping Fixes, Multi-File Scan & SSE Upsert

> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Date:** 2026-07-02
> **Status:** COMPLETED
> **Completed:** 2026-07-02
> **Verified:** DB-checked after re-run — 14,533/14,533 imported, 0 rows with `hours=0`, 0 rows with `task_id=null`, 657 `billable=true`, 0 rows with unstripped HTML in `note`. All four original bugs confirmed fixed against live data.
> **Investigation:** `/understand` ran before this spec. Findings embedded below.
> **Implementation Notes:** Route and migrate page match the spec's design exactly — multi-file scan (`timelogs-*.json` sorted, fallback to `timelogs.json`), pre-built `projectMap`/`taskMap`, `stripHtml()` local helper, unresolved `module_detail.id` logged to `errors` without skipping the row, chunked SSE upsert (`CHUNK_SIZE = 50`). `npx tsc --noEmit` clean; `pnpm lint` clean on both changed files.
>
> **Post-implementation fix (2026-07-02, same day):** first live run against the real `_from_zoho/timelogs-*.json` data (14,533 records) produced 13,058 "unresolved task" errors (90%) — the `taskMap` query (`adminClient.from("tasks").select("id, external_id").not("external_id","is",null)`) had no `.range()` pagination, so it silently hit Supabase/PostgREST's 1000-row default select limit and only captured ~1,000 of the 6,946 tasks. Task 090's own notes explicitly flagged this exact gotcha for the tasks import ("Paginate to avoid Supabase's 1000-row default limit") and it was missed here. Fixed by paginating the tasks fetch in 1000-row pages (same loop shape as `tasks/route.ts` pass 2). Verified live: 6,946 tasks exist, all 5,482 distinct `module_detail.id` values referenced by the timelogs resolve once paginated (0 unresolved). Also added `console.log`/`console.error` at file-scan, map-build, per-chunk-failure, and fatal-catch points per user request, since the SSE `errors` array reaching the browser wasn't mirrored to server logs. Import is idempotent (`onConflict: "external_id"`) — re-running after this fix will backfill `task_id` on the previously-imported rows.

---

## Problem

`POST /api/admin/zoho-import/timelogs` (`src/app/api/admin/zoho-import/timelogs/route.ts`) cannot import the newly-exported `_from_zoho/timelogs-{0-25,25-50,50-75,75-100}.json` files (14,533 records, 100 unique projects, verified no duplicate `id`s across files):

1. **Wrong filename** — reads `readFromZoho("timelogs.json")`, which doesn't exist. Only the four chunked files exist (the export UI added `from`/`to` project-index slicing after task 102 shipped; the import side was never updated to match — see `src/app/v2/(hub)/admin/migrate/page.tsx:117-123` `timelogsExport` state defaulting to `from: "0", to: "25"`). Route currently 400s immediately.
2. **`log.log_hours` doesn't exist** — the real field is `log_hour` (singular, e.g. `"00:30"`). Every row silently falls back to `parseHours("0:00")` → **every imported `hours` value is 0.**
3. **`log.task?.id` doesn't exist** — there is no `task` key. The task reference lives at `module_detail.id` (confirmed present on all 14,533 sampled records, `type: "task"` + `module_detail.type: "task"`). As written, `taskId` is always `null` → **every row loses its task link**, indistinguishable from genuinely taskless entries (which migration 035 added nullable `task_id` to support, but none were found in this export).
4. **`billing_status` casing** — actual values are `"Billable"` / `"Non Billable"` (capitalized, with a space). Comparison against lowercase `"billable"` never matches → **`billable` is always `false`.**
5. **`log.note` doesn't exist** — real fields are `notes` and `log_notes` (identical HTML-wrapped content in sampled records, e.g. `<div>project updates</div>`) → **notes are silently dropped.**
6. **No batching** — single synchronous `POST`, one `.upsert()` per record in a `for` loop, plus a per-row DB round-trip for `resolveProjectId`/`resolveTaskId`/`resolveUserId`. At 14,533 records this risks hitting the platform request timeout before completing (same class of problem task 102 fixed on the export side, and task 090 fixed on the tasks-import side via pre-built lookup maps).

All four bugs (#2–#5) are **silent, no-error data corruption** — the route runs and returns 200, but every row's `hours`, `task_id`, `billable`, and `note` are wrong. This was never caught because the route was never run against real exported data (filename bug #1 would have blocked it immediately).

The `time_logs` DB schema itself is already correct and needs no changes — this is purely an import-route mapping problem.

---

## Decisions (resolved before spec — no user response received; used recommended defaults, flagged below)

1. **Notes field:** use `notes`, HTML-stripped via a local regex helper (`<[^>]*>` → `""`, then `.trim()`). Falls back to `log_notes` if `notes` is absent.
2. **Task resolution failures:** distinguish "Zoho had no task" (no `module_detail.id`) from "Zoho had a task but it's not yet in Hub" (`module_detail.id` present, lookup miss). The latter still imports the row with `task_id: null` but pushes a message to the existing `errors` array (`ImportResult` is not extended with a new field — the errors array already serves as the visibility mechanism).
3. **Import style:** SSE streaming, matching the `tasks` import (task 090) and the `timelogs` export (task 102) patterns exactly. Requires a new `handleTimelogsImport()` consumer + special-cased UI card in `migrate/page.tsx`.
4. **File fallback:** support both — scan `timelogs-*.json` batch files first (sorted), fall back to single `timelogs.json` if none found. Matches `tasks/route.ts`'s existing pattern exactly.

*(These are the "Recommended" options from the four clarifying questions asked at spec time; the user did not respond within the wait window. If any of these should be different, flag before/during `/implement`.)*

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/admin/zoho-import/timelogs/route.ts` | Rewrite | Multi-file scan, fixed field mapping, pre-built lookup maps, chunked SSE upsert |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | Modify | Add `TimelogsImportState`, `handleTimelogsImport()`, special-case `timelogs` card in `IMPORT_LEVELS.map()` |
| `src/lib/migrate/zoho-import.ts` | No changes | Reuse `readFromZoho`, `resolveUserId`, `buildUserCache`, `clearUserCache`, `parseHours`, `adminClient` as-is |

---

## Code Context

### Confirmed actual field shape (sampled from `_from_zoho/timelogs-0-25.json`, record 0 of 1746)

```json
{
  "owner": { "name": "Niña Anjerrie Baraquil", "email": "nina.baraquil@webriq.services", "zpuid": "..." },
  "date": "2026-06-24",
  "module_detail": { "prefix": "", "name": "Project Management", "id": "1512955000019700014", "type": "task" },
  "notes": "<div>project updates</div>",
  "log_notes": "<div>project updates</div>",
  "project": { "name": "All About Smiles (Seva Dental)", "id": "1512955000019693111" },
  "type": "task",
  "billing_status": "Non Billable",
  "id": "1512955000019693140",
  "log_hour": "00:30",
  "_zoho_project_id": "1512955000019693111"
}
```

No `log_hours`, `task`, `log_date`, or `note` keys exist anywhere in the export — those were the four field names the current (broken) `ZohoTimelogRaw` type declared.

### Current broken route (full file, to be replaced)

```ts
// src/app/api/admin/zoho-import/timelogs/route.ts — current
type ZohoTimelogRaw = {
  id?: string;
  log_hours?: string;            // BUG: real field is `log_hour`
  log_date?: string;
  date?: string;
  billing_status?: string;
  note?: string;                 // BUG: real fields are `notes` / `log_notes`
  owner?: { name?: string; email?: string };
  task?: { id?: string; id_string?: string };  // BUG: no `task` key exists, it's `module_detail`
  _zoho_project_id?: string;
  [key: string]: unknown;
};

export async function POST() {
  // ...auth guard (keep as-is)...

  let logs: ZohoTimelogRaw[];
  try {
    logs = readFromZoho<ZohoTimelogRaw>("timelogs.json");   // BUG: file doesn't exist
  } catch {
    return NextResponse.json({ error: "Could not read _from_zoho/timelogs.json" }, { status: 400 });
  }

  clearUserCache();
  const userCache = await buildUserCache();
  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };

  for (const log of logs) {                                  // BUG: no batching, per-row DB calls
    const externalId = String(log.id ?? "");
    const dateLogged = log.log_date ?? log.date ?? null;
    if (!externalId || !dateLogged) { result.skipped++; continue; }

    const projectId = await resolveProjectId(String(log._zoho_project_id ?? ""));  // per-row DB call
    if (!projectId) { result.skipped++; continue; }

    const zohoTaskId = log.task?.id_string ?? log.task?.id;    // BUG: always undefined
    const taskId = zohoTaskId ? await resolveTaskId(String(zohoTaskId)) : null;
    const employeeId = await resolveUserId(log.owner?.email, userCache);

    const { error } = await adminClient.from("time_logs").upsert(
      {
        external_id: externalId,
        task_id: taskId,
        project_id: projectId,
        employee_id: employeeId,
        owner_name: log.owner?.name ?? null,
        owner_email: log.owner?.email ?? null,
        date_logged: dateLogged,
        hours: parseHours(log.log_hours ?? "0:00"),           // BUG: always 0
        billable: log.billing_status === "billable",           // BUG: always false
        note: log.note ?? null,                                 // BUG: always null
        source: "manual" as const,
      },
      { onConflict: "external_id" }
    );
    // ...
  }
  return NextResponse.json(result);
}
```

### Multi-file scan pattern — `src/app/api/admin/zoho-import/tasks/route.ts:76-97`

```ts
const dir = path.join(process.cwd(), "_from_zoho");
const allTasks: ZohoTaskRaw[] = [];

const batchFiles = fs
  .readdirSync(dir)
  .filter((f) => f.startsWith("tasks-") && f.endsWith(".json"))
  .sort();

if (batchFiles.length > 0) {
  for (const file of batchFiles) {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    if (Array.isArray(parsed)) allTasks.push(...(parsed as ZohoTaskRaw[]));
  }
} else {
  const fallback = path.join(dir, "tasks.json");
  if (!fs.existsSync(fallback)) {
    return NextResponse.json({ error: "No task files found in _from_zoho/" }, { status: 400 });
  }
  const parsed = JSON.parse(fs.readFileSync(fallback, "utf-8"));
  allTasks.push(...(Array.isArray(parsed) ? (parsed as ZohoTaskRaw[]) : []));
}
```
For timelogs, use prefix `"timelogs-"` instead of `"tasks-"`, fallback filename `"timelogs.json"`.

### Pre-built lookup maps + chunked SSE upsert — `src/app/api/admin/zoho-import/tasks/route.ts:103-197` (single-pass shape needed here, no pass-2 parent resolution)

```ts
const { data: projectRows } = await adminClient.from("projects").select("id, zoho_project_id");
const projectMap = new Map((projectRows ?? []).map((p) => [String(p.zoho_project_id), p.id as string]));

const { data: taskRows } = await adminClient.from("tasks").select("id, external_id").not("external_id", "is", null);
const taskMap = new Map((taskRows ?? []).map((t) => [String(t.external_id), t.id as string]));

const CHUNK_SIZE = 50;
const CHUNK_DELAY_MS = 100;

for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
  const chunk = rows.slice(i, i + CHUNK_SIZE);
  const { error } = await adminClient.from("time_logs").upsert(chunk, { onConflict: "external_id" });
  const current = Math.floor(i / CHUNK_SIZE) + 1;
  // ...track imported/errors, send({ type: "progress", current, total })...
  if (i + CHUNK_SIZE < rows.length) await new Promise<void>((r) => setTimeout(r, CHUNK_DELAY_MS));
}
```

Note: `resolveProjectId`/`resolveTaskId` from `zoho-import.ts` are per-row DB calls — do NOT use them in the hot loop. Build the two maps above directly (same as tasks route does for `projectMap`/`tasklistMap`/`milestoneMap`) and look up in-memory. `buildUserCache()`/`resolveUserId()` are already batched (one query, cached) so those are fine to keep as-is.

### `time_logs` schema (already correct, no migration needed)

```sql
-- migration 025 + 035
time_logs (
  id uuid primary key,
  task_id uuid null references tasks(id),        -- made nullable in 035
  project_id uuid not null references projects(id),
  employee_id uuid null references auth.users(id),
  date_logged date not null,
  hours numeric(5,2) not null,
  billable boolean not null default true,
  note text,
  source text not null check (source in ('timer','manual')) default 'manual',
  timesheet_id uuid null,
  external_id text unique,      -- added 035, dedup key
  owner_name text,               -- added 035
  owner_email text,              -- added 035
  created_at timestamptz default now()
)
```

### SSE done-event shape — `tasks/route.ts:255` for reference

```ts
send({ type: "done", imported, skipped, parents_resolved: parentsResolved, errors });
```
For timelogs (single pass, no parent resolution): `send({ type: "done", imported, skipped, errors })`.

### UI: `TasksImportState` + `handleTasksImport()` — model for `TimelogsImportState`/`handleTimelogsImport()`

`src/app/v2/(hub)/admin/migrate/page.tsx:25-29, 349-415`:
```ts
interface TasksImportState {
  progress: { pass: 1 | 2; current: number; total: number } | null;
  done: { imported: number; skipped: number; parents_resolved: number; errors: string[] } | null;
  error: string | null;
}

async function handleTasksImport() {
  if (anyRunning) return;
  setAnyRunning(true);
  setImportStates((s) => ({ ...s, tasks: { state: "running" } }));
  setTasksImport({ progress: null, done: null, error: null });

  try {
    const res = await fetch("/api/admin/zoho-import/tasks", { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        if (!frame.startsWith("data: ")) continue;
        const evt = JSON.parse(frame.slice(6)) as { type: string; pass?: 1|2; current?: number; total?: number; imported?: number; skipped?: number; parents_resolved?: number; errors?: string[]; message?: string };

        if (evt.type === "progress") setTasksImport((s) => ({ ...s, progress: { pass: evt.pass!, current: evt.current!, total: evt.total! } }));
        if (evt.type === "done") {
          setTasksImport((s) => ({ ...s, progress: null, done: { imported: evt.imported!, skipped: evt.skipped!, parents_resolved: evt.parents_resolved!, errors: evt.errors ?? [] } }));
          setImportStates((s) => ({ ...s, tasks: { state: "done" } }));
        }
        if (evt.type === "error") throw new Error(evt.message ?? "Unknown error");
      }
    }
  } catch (e) {
    setTasksImport((s) => ({ ...s, error: String(e), progress: null }));
    setImportStates((s) => ({ ...s, tasks: { state: "error", errorMsg: String(e) } }));
  } finally {
    setAnyRunning(false);
  }
}
```

For timelogs: same shape but `progress: { current: number; total: number } | null` (no `pass` field — single pass), `done: { imported: number; skipped: number; errors: string[] } | null`.

### UI: special-cased `tasks` import card — model for `timelogs` import card

`migrate/page.tsx:702-789` (`IMPORT_LEVELS.map()`, `if (key === "tasks")` block) — has a two-phase progress bar (blue pass 1, violet pass 2). For timelogs, follow the single-progress-bar style already used in the `timelogs` **export** card at `migrate/page.tsx:597-666` (blue bar + `"Chunk {current} of {total}"` label instead of `"Project {current} of {total} — {project}"`), plus a done-state result line modeled on `tasksImport.done` rendering at `migrate/page.tsx:765-782` (imported/skipped/errors, errors capped at 3 + "+N more").

---

## Implementation Steps

1. **Rewrite `src/app/api/admin/zoho-import/timelogs/route.ts`**:
   - Keep the existing auth guard (admin/super_admin check) unchanged.
   - Multi-file scan: `fs.readdirSync(_from_zoho/).filter(f => f.startsWith("timelogs-") && f.endsWith(".json")).sort()`, concatenate; fall back to `timelogs.json` if none found (400 if neither exists).
   - Fix `ZohoTimelogRaw` type to match the confirmed real shape: `id`, `date`, `log_hour`, `billing_status`, `notes`, `log_notes`, `owner: { name, email }`, `module_detail: { id, type }`, `type`, `_zoho_project_id`.
   - Pre-build `projectMap` (from `projects.zoho_project_id`) and `taskMap` (from `tasks.external_id`) via two bulk `select` queries — do not call `resolveProjectId`/`resolveTaskId` per-row.
   - Keep `buildUserCache()`/`resolveUserId()` as-is (already batched).
   - Add a local `stripHtml(s: string | null | undefined): string | null` helper: `s ? s.replace(/<[^>]*>/g, "").trim() || null : null`.
   - Build `rows` array:
     - `external_id` = `String(log.id ?? "")`; `date_logged` = `log.date ?? null`; skip (increment `skipped`) if either missing.
     - `project_id` = `projectMap.get(String(log._zoho_project_id ?? ""))`; skip if not found.
     - `task_id`: if `log.module_detail?.id` is present, look up `taskMap.get(String(log.module_detail.id))`. If found, use it. If `module_detail.id` exists but the lookup misses, set `task_id: null` AND push `` `timelog ${externalId}: unresolved task module_detail.id=${log.module_detail.id} (not yet imported)` `` to `errors` — do NOT skip the row. If `module_detail.id` is absent entirely, `task_id: null` with no error (genuine taskless entry).
     - `employee_id` via `resolveUserId(log.owner?.email, userCache)`.
     - `owner_name`/`owner_email` from `log.owner`.
     - `hours` = `parseHours(log.log_hour ?? "0:00")`.
     - `billable` = `log.billing_status === "Billable"`.
     - `note` = `stripHtml(log.notes ?? log.log_notes ?? null)`.
     - `source: "manual"`.
   - Chunked SSE upsert: `CHUNK_SIZE = 50`, `CHUNK_DELAY_MS = 100`, `onConflict: "external_id"`, `send({ type: "progress", current, total })` per chunk.
   - Final: `send({ type: "done", imported, skipped, errors })`; wrap the stream body in `try/catch` → `send({ type: "error", message })` on failure (matches tasks route).
   - Response headers: `text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.

2. **Add `TimelogsImportState` + `handleTimelogsImport()` to `migrate/page.tsx`**:
   - Interface: `{ progress: { current: number; total: number } | null; done: { imported: number; skipped: number; errors: string[] } | null; error: string | null }`.
   - State: `const [timelogsImport, setTimelogsImport] = useState<TimelogsImportState>({ progress: null, done: null, error: null })`.
   - `handleTimelogsImport()`: mirror `handleTasksImport()` — POST to `/api/admin/zoho-import/timelogs`, SSE reader loop, `progress`/`done`/`error` event handling (no `pass` field to track).

3. **Special-case `timelogs` in `IMPORT_LEVELS.map()`** (after the existing `if (key === "tasks")` block, before the generic fallback card):
   - Button calls `handleTimelogsImport`.
   - Single progress bar (blue) with label `Chunk {current} of {total}` while running.
   - Done state: `{imported} imported · {skipped} skipped` line + errors list (cap at 3 + "+N more"), same rendering as the `tasks` card's done block.

---

## Notes for Implementation Agent

- **Sonnet recommended** — this isn't a pure copy-paste: it requires (a) precise field-mapping corrections verified against real exported data, where a wrong rename reintroduces silent corruption rather than a visible error; (b) switching from per-row DB calls to pre-built lookup maps at 14.5K-row scale (same class of fix as task 090); (c) a new resolution-failure-tracking design not present in any existing import route; (d) a cross-layer change (API route + SSE UI consumer + special-cased card).
- **The four field-mapping bugs are silent, not crash-y** — they won't surface in casual testing (the route returns 200 either way). After implementing, spot-check actual imported rows: confirm `hours` is nonzero for entries with `log_hour != "00:00"`, `billable = true` appears for at least some rows, `task_id` is populated for entries with `module_detail.type = "task"`, and `note` contains stripped text (not `<div>...</div>`).
- **Do not modify `src/lib/migrate/zoho-import.ts`** — `parseHours`, `buildUserCache`, `resolveUserId`, `readFromZoho`, `adminClient` are all already correct and reusable as-is. `resolveProjectId`/`resolveTaskId` exist in that file but should NOT be called per-row in this route (N+1 risk at 14.5K rows) — build local maps in the route instead, same pattern as `tasks/route.ts`.
- **Filename convention**: `timelogs-{from}-{to}.json` where `from`/`to` are project-index ranges (not dates or percentages) — "0-100" spans all 100 projects. Confirmed no `id` overlap across the four existing files.
- **`billing_status` has exactly two observed values**: `"Billable"` and `"Non Billable"` (capitalized, space-separated) — do not lowercase-compare.
- **`notes` and `log_notes` were identical in every sampled record** — using `notes` with `log_notes` as fallback covers the case where one is empty but not both are absent (unverified whether that case occurs in the wider dataset).
- **This is a dev-only admin tool** (`/v2/admin/migrate`, auth-gated by `admin`/`super_admin` role check already in the route) — no RLS changes, no public exposure.

---

## Acceptance Criteria

- [ ] Import reads all `timelogs-*.json` batch files from `_from_zoho/` automatically (or falls back to `timelogs.json` if none found)
- [ ] `hours` is correctly parsed from `log_hour` (e.g. `"00:30"` → `0.5`), not always `0`
- [ ] `task_id` resolves via `module_detail.id` against a pre-built `taskMap`, not always `null`
- [ ] `billable` correctly reflects `billing_status === "Billable"`, not always `false`
- [ ] `note` contains HTML-stripped text from `notes`/`log_notes`, not always `null`
- [ ] Unresolved task references (module_detail.id present but not found in Hub) are logged to `errors` without skipping the row
- [ ] No per-row DB queries for project/task resolution — only pre-built lookup maps (2 bulk queries) + the existing batched user cache
- [ ] Import streams via SSE with chunked progress (`CHUNK_SIZE = 50`), matching the tasks import UX
- [ ] Re-running import is idempotent (upsert on `external_id`)
- [ ] All 14,533 records import without a request timeout
- [ ] Migrate page shows a working progress bar + done summary for the Time Logs import row

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

1. Start dev server: `pnpm dev`
2. Navigate to `/v2/admin/migrate`
3. Ensure `_from_zoho/timelogs-0-25.json` … `timelogs-75-100.json` are present (already exported)
4. Click **Import** on the Time Logs row
5. Verify: progress bar advances with chunk count; done summary shows imported/skipped/error counts
6. Spot-check in Supabase: query a few `time_logs` rows by `external_id` and confirm `hours > 0`, `billable` varies, `task_id` is populated where expected, `note` has no HTML tags
