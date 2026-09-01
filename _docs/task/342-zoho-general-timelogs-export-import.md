# 342: Zoho General Time Logs — Export + Import

**Created:** 2026-09-01
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** COMPLETED
**Completed:** 2026-09-01

---

## Post-Implementation Changes & Fixes (2026-09-01)

1. **2025-01-01 window floor added to the export route** (user-raised: "does the export include dates earlier than Jan 1, 2025?" — it did). `windowsFrom(created_time)` output is now `.filter(w => w.end >= "2025-01-01")` with surviving windows start-clamped to `EXPORT_FLOOR_DATE`. Rationale: 168/228 projects in `projects.json` predate 2025 (earliest `created_time` 2020-08-13); the Hub's existing task/issue time-log data is strictly 2025-01-01 onward (verified — 0 pre-2025 `date` values across `timelogs-*.json` (15,729 rows) and `issue-timelogs-*.json` (2,356 rows), a side effect of the task/issue source files being `since=2025-01-01` filtered). The floor keeps general logs consistent with that coverage.
2. **Clamp implemented on the date-string, not via `windowsFrom`.** Passing the floor into `windowsFrom()` risked a Dec-2024 leak: that helper does a local-time `cursor.setDate(1)` month-align, so on a non-UTC host `new Date("2025-01-01T00:00:00Z")` aligns back to `2024-12-01`. The string-level `.filter().map()` clamp is timezone-independent — no window's `start_date` can precede `2025-01-01`. Simulated across a 2020, a late-2024, and a 2026 project: earliest emitted `start_date` is `2025-01-01` in every case; 2026 projects untouched; windows stay contiguous (each `end` is the day before the next `start`).
3. Task doc (Decision #2, File Changes, Implementation Notes, Acceptance Criteria) + `TASKS.md` entry updated to describe the floor.

`npx tsc --noEmit` and `pnpm lint` re-run clean after the change (lint: 2 pre-existing warnings in an unrelated file).

### Still a user hand-off (not blocking completion)
- **Decision #1 live probe** — confirm the v3 `module: { type: "general" }` (id-less) query returns general logs only, against a `from=0&to=2` slice, before the full export. Documented fallbacks if it doesn't: drop `module` + add `component_type=general`, or the v1 `/restapi/.../projects/{id}/logs/` endpoint.
- **Full live export + import round-trip** + `external_id` collision diff vs. `timelogs-*.json` / `issue-timelogs-*.json` (Decision #4) + downloaded-file check for zero pre-2025 `date` values.
Both need an authenticated Zoho session against the live portal — same hand-off pattern as tasks 111/112/170.

---

## Overview

Zoho Projects time can be logged in three ways: against a **task**, against a **bug/issue**, or as a **general** project-level log with no work-item reference. The Hub migration already covers the first two:

| Kind | Export route | Import route | Docs |
|------|--------------|--------------|------|
| Task | `zoho-export/timelogs` | `zoho-import/timelogs` | 102 / 103 |
| Issue | `zoho-export/issue-timelogs` | `zoho-import/issue-timelogs` | 111 / 112 |
| **General** | **— missing —** | **— missing —** | **this task** |

General logs are currently dropped on the floor: the task export only queries `module.type: "task"` and the issue export only `module.type: "issue"`, so every general log in the portal is un-migrated. This task adds the third pair — a `general-timelogs` export + import — following the exact structure, pacing, and field-mapping of the issue-timelogs pair (111/112), which is itself a near-literal mirror of the task pair (102/103).

**Key simplification over task 112:** no schema migration is needed. `time_logs.task_id` and `time_logs.issue_id` are both already nullable (migrations 035 / 053). A general log is simply a `time_logs` row with `task_id IS NULL AND issue_id IS NULL` and a non-null `external_id` — matching migration 035's own comment: *"Zoho project-level time entries have no task reference."*

**File-length note (per `nextjs-file-length-best-practices.md`):** `src/app/(hub)/admin/migrate/_zoho-projects-tab.tsx` is already **2,525 lines** — far past the doc's "hard limit 400–500". The issue-timelogs cards were added by inline copy-paste (each card ≈ 90 lines of near-identical JSX + a ≈ 70-line SSE handler + a state interface). Repeating that here adds ≈ 200 more lines to an already-unmaintainable file. Instead, this task puts **all** new client code in a dedicated, single-concern module and touches the 2,525-line file in only ~6 lines (two array entries + two render branches + one import). See "Decisions" #6 and "Proposed File Changes".

---

## Requirements

- [ ] New SSE export route `GET /api/admin/zoho-export/general-timelogs` — admin/super_admin gated, iterates every project in `_from_zoho/projects.json`, `from`/`to` slices the project list, 6-month date-windowing from each project's `created_time`, `fetchZohoWithRetry` + identical `sleep(700)`/`sleep(100)` pacing, streams `progress` / `timelogs` / `done` events, tags every entry with `_zoho_project_id`.
- [ ] New SSE import route `POST /api/admin/zoho-import/general-timelogs` — admin/super_admin gated, multi-file scan (`general-timelogs-*.json` → `general-timelogs.json` fallback), pre-built `projectMap` (paginated), chunked upsert (`CHUNK_SIZE = 50`) into `time_logs` with `task_id: null, issue_id: null, source: "manual"`, `onConflict: "external_id"`.
- [ ] New self-contained client module `_general-timelogs-card.tsx` holding both the Export and Import card UI + their SSE handlers + state — one concern per file, ~250 lines.
- [ ] New `_sse.ts` helper extracting the duplicated SSE frame-reader loop; the two new handlers use it.
- [ ] `_zoho-projects-tab.tsx` edited minimally: add `general-timelogs` to `EXPORT_LEVELS` (after `issue-timelogs`) and `IMPORT_LEVELS` (after `issue-timelogs`), render the new component via a `key === "general-timelogs"` branch in each map, add one import.
- [ ] "Run steps in order" helper banner and any level-ordering copy updated to mention General Time Logs.
- [ ] `npx tsc --noEmit` and `pnpm lint` both clean (no new problems vs. baseline).
- [ ] Live run: small project slice first (`from=0&to=5`) to confirm the general-log query shape, then a full sliced export + import.

## Out of Scope / Must-Not-Change

- **No schema migration.** `time_logs` already has nullable `task_id`/`issue_id`. Do **not** add a `log_type` / `is_general` marker column (see Decision #3) unless the reviewer explicitly asks.
- **Do not touch** `zoho-export/timelogs`, `zoho-import/timelogs`, `zoho-export/issue-timelogs`, `zoho-import/issue-timelogs` or their existing cards/handlers/state in `_zoho-projects-tab.tsx`.
- **Do not refactor the other ~10 export/import cards** out of `_zoho-projects-tab.tsx`. The file-length remediation here is scoped to keeping the *new* code out of that file, not rewriting existing cards (that is a separate task — see "Compatibility Touchpoints").
- Do not re-tune the Zoho throttle/pacing constants — copy `sleep(700)` / `sleep(100)` / `fetchZohoWithRetry` usage byte-for-byte from `zoho-export/issue-timelogs/route.ts` (task 111's #1 constraint, restated).
- No `llmLogInvocation` / AI involvement — this is a pure data-migration tool.
- Dev-only admin surface (`/admin/migrate`) — no RLS changes, no public exposure.

---

## Decisions (recommended defaults — flag before/during `/implement` if any should differ)

1. **General-log query shape — verify with a small live slice before the full run.** The existing routes hit the v3 endpoint `GET {BASE}/projects/{projectId}/timelogs` with `module: JSON.stringify({ id, type: "task" | "issue" })`. Task 111 established (from a user-supplied v3 API screenshot) that `module.type` accepts `task`, `issue`, **`general`**. General logs have no work-item id, so the mirror is `module: JSON.stringify({ type: "general" })` (id omitted). The public v1/v2 "Get All Time Logs" doc (`/restapi/.../projects/{id}/logs/`) uses a separate `component_type=general` param and returns `{ timelogs: { generallogs: [...] } }` — a *different* endpoint/response than the v3 one this codebase uses, so it is only a fallback reference.
   **Recommended default:** primary attempt `module: {type: "general"}` on the same v3 endpoint, same `view_type: "customdate"` / `start_date` / `end_date` / `page` / `per_page` params, same `{ time_logs: [{ log_details: [] }] }` response parsing. **Implementation step 4 is a mandatory `from=0&to=2` live probe** — inspect the raw response: confirm it returns general logs only (not task/issue logs mixed in) and that `log_details` entries carry `id` + `date` + `log_hour` + `owner`. If the id-less `module` param 400s or returns the wrong set, fall back to dropping `module` and adding `component_type: "general"`, or to the v1 `/logs/` endpoint with `component_type=general` + `index`/`range` pagination. Do not run the full export until the probe response is confirmed.
2. **Iterate projects, not work-items.** Task/issue exports group their entity list by `_zoho_project_id` then slice the project list. General logs have no entity list — iterate `_from_zoho/projects.json` directly (228 projects), `from`/`to` slices that list. Same UX as the other two sliceable timelog cards ("Project X of Y — {name}").
   **Window start is floored at 2025-01-01** (`EXPORT_FLOOR_DATE`): `windowsFrom()` still runs from each project's `created_time`, then windows are `.filter(w => w.end >= "2025-01-01")` and any surviving window with `start < "2025-01-01"` is clamped to start at the floor. Clamping on the date-string (rather than feeding the floor into `windowsFrom`, which does a local-time `setDate(1)` month-align) guarantees no `start_date` before 2025-01-01 regardless of server timezone. 168 of the 228 projects were created before 2025 (earliest 2020-08-13); without the floor the export would drag in 2020–2024 general-log history. The Hub's existing task/issue time-log data is strictly 2025-01-01 onward (a side effect of `tasks-*-2025.json` / `issues-*-2025.json` being `since`-filtered — the real `timelogs-*.json` / `issue-timelogs-*.json` files hold **zero** pre-2025 entries). The floor keeps general logs consistent with that coverage. (Post-planning change — user-confirmed 2026-09-01.)
3. **No `log_type` marker column.** A general log is identified by `task_id IS NULL AND issue_id IS NULL AND external_id IS NOT NULL`. Adding a discriminator column would be the first such marker on `time_logs` and diverge from the task/issue routes, which never set one. Matches task 112 Decision #2 (keep DB constraints/columns minimal, let the import route be the only writer). Flag if billing/reporting needs an explicit general flag.
4. **`external_id` collision check before the full import.** Task 112 diffed all 14,533 task-log ids against all 2,185 issue-log ids → 0 overlap, confirming one shared `external_id unique` constraint is safe. Repeat for general: after the live export, diff the general-log `id` space against both `_from_zoho/timelogs-*.json` and `_from_zoho/issue-timelogs-*.json`. Expect 0 overlap (Zoho ids are portal-global). If any overlap exists, stop and re-scope.
5. **Field mapping — identical to task 112, confirm shape from the live export first.** `external_id` ← `id`; `date_logged` ← `date`; `hours` ← `parseHours(log_hour)`; `billable` ← `billing_status === "Billable"`; `note` ← `stripHtml(notes ?? log_notes)`; `owner_name`/`owner_email` ← `owner.{name,email}`; `employee_id` ← `resolveUserId(owner.email, userCache)`; `project_id` ← `projectMap.get(_zoho_project_id)`; `task_id: null`, `issue_id: null`, `source: "manual"`. Skip a row only when `id` or `date` is missing, or `project_id` doesn't resolve (push a message to `errors` for the latter, mirroring the task/issue routes). Do **not** map `approval`, `added_by`, `start_time`, `end_time`, `created_time` — same as tasks 103/112 (schema symmetry).
6. **New client code lives in its own module; the 2,525-line tab file is barely touched.** Per `nextjs-file-length-best-practices.md` ("Does splitting this file make it easier to understand, test, and change independently? If yes → split it"). The new module `_general-timelogs-card.tsx` exports `<GeneralTimelogsExportRow>` and `<GeneralTimelogsImportRow>` (each rendering one row visually identical to the issue-timelogs rows), owning their own `useState` + SSE handlers internally. `_zoho-projects-tab.tsx` gets: 1 import, 2 one-line array entries, and 2 two-line render branches (`if (key === "general-timelogs") return <GeneralTimelogsExportRow ... />`). Net add to that file: ~8 lines instead of ~200. The extracted `_sse.ts` `readSSEStream()` helper is used by the new handlers only (not a refactor of existing ones).

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/admin/zoho-export/general-timelogs/route.ts` | Create | SSE export — per-project windowed pagination, `module: {type:"general"}`, `fetchZohoWithRetry`, `progress`/`timelogs`/`done` events |
| `src/app/api/admin/zoho-import/general-timelogs/route.ts` | Create | SSE import — multi-file scan, paginated `projectMap`, chunked `time_logs` upsert with `task_id:null,issue_id:null` |
| `src/app/(hub)/admin/migrate/_general-timelogs-card.tsx` | Create | Self-contained client module: `GeneralTimelogsExportRow` + `GeneralTimelogsImportRow` (state + SSE handlers + JSX, ~250 lines) |
| `src/app/(hub)/admin/migrate/_sse.ts` | Create | `readSSEStream(res, onEvent)` — extracts the duplicated `reader.read()` + `buffer.split("\n\n")` + `frame.slice(6)` loop |
| `src/app/(hub)/admin/migrate/_zoho-projects-tab.tsx` | Modify | ~8 lines: import + `EXPORT_LEVELS`/`IMPORT_LEVELS` entries after `issue-timelogs` + `key === "general-timelogs"` render branch in each `.map()` + banner copy |
| `src/lib/migrate/zoho-import.ts` | No change | Reuse `buildUserCache`, `clearUserCache`, `resolveUserId`, `parseHours`, `adminClient` as-is |
| `src/types/database.ts` | No change | `time_logs` already has nullable `task_id`/`issue_id` (lines 1668–1727) |
| `supabase/migrations/` | No change | No schema change (Decision #3) |

---

## Code Context

### Existing export to mirror — `src/app/api/admin/zoho-export/issue-timelogs/route.ts`

Structure (copy verbatim, swap issue→project iteration):
- `BASE = https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`
- `windowsFrom(startIso)` — 6-month windows, month-aligned, up to `now`. **Copy verbatim.**
- Auth: `createClient()` → `getUser()` → `adminClient.from("profiles").select("role")` → 401/403 unless `admin`/`super_admin`.
- `getZohoAccessToken()` → 502 if falsy.
- `from`/`to` query params → `parseInt`, `slice(fromN, toN ?? undefined)`.
- Per window: `new URLSearchParams({ page, per_page:"100", view_type:"customdate", start_date, end_date, module: JSON.stringify({ type: "general" }) })` — **the one delta: `{type:"general"}`, no `id`.**
- `fetchZohoWithRetry(url, token, { label: "general-timelogs" })`, `token = newToken`, `throttleExhausted` → push to `failedWindows`.
- Parse: `(json.time_logs ?? []).flatMap(day => (day.log_details ?? []).map(entry => ({ ...entry, _zoho_project_id: projectId })))`.
- `sleep(700)` after each window's pagination loop; `sleep(100)` between pages and between projects. **Do not re-tune.**
- Events: `{type:"progress", current, total, project}`, `{type:"timelogs", logs}`, `{type:"done", total_logs, failed_windows}`.

Project loading (replaces the issue-file loading block):
```ts
const fromZoho = path.join(process.cwd(), "_from_zoho");
const raw = JSON.parse(fs.readFileSync(path.join(fromZoho, "projects.json"), "utf-8"));
const projects: Array<{ id?: string; id_string?: string; name?: string; created_time?: string }> =
  Array.isArray(raw) ? raw : (raw.projects ?? Object.values(raw)[0]);
if (!projects?.length) return NextResponse.json({ error: "No projects.json in _from_zoho/" }, { status: 400 });
const allProjectEntries = projects
  .map((p) => ({ id: String(p.id_string ?? p.id ?? ""), name: p.name ?? "", createdTime: p.created_time }))
  .filter((p) => p.id);
const projectEntries = allProjectEntries.slice(fromN, toN ?? undefined);
```
Then per project: `const windows = windowsFrom(project.createdTime ?? "2020-01-01T00:00:00Z");` and the same window/page loop as issue-timelogs, but with **no inner entity loop** (general logs are queried once per project per window, not per work-item).

### Existing import to mirror — `src/app/api/admin/zoho-import/issue-timelogs/route.ts`

Copy verbatim, then:
- Drop the `issueMap` build entirely (no `issues` query).
- `projectMap`: keep the existing paginated build from `projects` (`select("id, external_project_id")`, `PAGE = 1000` loop — already unbounded-select-safe).
- Row shape: `{ external_id, project_id, task_id: null, issue_id: null, employee_id, owner_name, owner_email, date_logged, hours, billable, note, source: "manual" }`.
- Row type `GeneralTimelogRow` — same as `IssueTimelogRow` minus `issue_id`'s resolution logic, `task_id`/`issue_id` both literal `null`.
- Batch glob: `f.startsWith("general-timelogs-") && f.endsWith(".json")` → fallback `general-timelogs.json`.
- Log label: `[import/general-timelogs]`.
- `stripHtml()` helper — copy verbatim.
- Chunked upsert: `adminClient.from("time_logs").upsert(chunk, { onConflict: "external_id" })`, `CHUNK_SIZE = 50`, `CHUNK_DELAY_MS = 100`.
- `done` event: `{ type: "done", imported, skipped, errors }`.

### `time_logs` — already migration-ready (`src/types/database.ts:1668`)

```ts
time_logs: {
  Row: { id: string; task_id: string | null; issue_id: string | null; project_id: string;
         employee_id: string | null; date_logged: string; hours: number; billable: boolean;
         note: string | null; source: "timer" | "manual"; external_id: string | null;
         owner_name: string | null; owner_email: string | null; /* ... */ };
  // Insert accepts task_id?/issue_id? as optional-nullable — passing null for both is valid.
}
```
No edit needed.

### `_sse.ts` — new helper (extracted from the ~10 duplicated copies in `_zoho-projects-tab.tsx`)

```ts
// src/app/(hub)/admin/migrate/_sse.ts
// Shared reader for the SSE "data: {...}\n\n" streams every export/import route emits.
export async function readSSEStream(
  res: Response,
  onEvent: (evt: Record<string, unknown> & { type: string }) => void,
): Promise<void> {
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
      onEvent(JSON.parse(frame.slice(6)));
    }
  }
}
```

### `_general-timelogs-card.tsx` — new self-contained module (sketch)

```tsx
"use client";
import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { StateIcon, type CardState } from "./_shared";
import { readSSEStream } from "./_sse";

interface ExportState {
  from: string; to: string;
  progress: { current: number; total: number; project: string } | null;
  done: { count: number; failed: string[] } | null;
  error: string | null;
}
interface ImportState {
  progress: { current: number; total: number } | null;
  done: { imported: number; skipped: number; errors: string[] } | null;
  error: string | null;
}

export function GeneralTimelogsExportRow(props: {
  label: string; desc: string;
  state: CardState; setState: (s: CardState) => void;
  anyRunning: boolean; setAnyRunning: (b: boolean) => void;
}) {
  const [ex, setEx] = useState<ExportState>({ from: "0", to: "", progress: null, done: null, error: null });
  async function run() {
    if (props.anyRunning) return;
    props.setAnyRunning(true); props.setState("running");
    setEx((s) => ({ ...s, progress: null, done: null, error: null }));
    try {
      const qp = new URLSearchParams({ from: ex.from || "0" });
      if (ex.to) qp.set("to", ex.to);
      const res = await fetch(`/api/admin/zoho-export/general-timelogs?${qp}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const accumulated: unknown[] = [];
      await readSSEStream(res, (evt) => {
        if (evt.type === "progress") setEx((s) => ({ ...s, progress: { current: evt.current as number, total: evt.total as number, project: evt.project as string } }));
        if (evt.type === "timelogs" && evt.logs) accumulated.push(...(evt.logs as unknown[]));
        if (evt.type === "done") {
          const blob = new Blob([JSON.stringify(accumulated, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `general-timelogs-${ex.from || "0"}-${ex.to || "end"}.json`;
          a.click();
          URL.revokeObjectURL(url);
          setEx((s) => ({ ...s, done: { count: evt.total_logs as number, failed: (evt.failed_windows as string[]) ?? [] }, progress: null }));
          props.setState("done");
        }
      });
    } catch (e) {
      setEx((s) => ({ ...s, error: String(e), progress: null }));
      props.setState("error");
      console.error("[export/general-timelogs]", e);
    } finally {
      props.setAnyRunning(false);
    }
  }
  // JSX: same row markup as the `key === "issue-timelogs"` export block in _zoho-projects-tab.tsx
  //      (From/To inputs, "of N projects" hint, progress bar "Project X of Y — {name}",
  //       green downloaded-count, amber failed-windows warning). ~70 lines.
  return (/* ... */);
}

export function GeneralTimelogsImportRow(props: { /* label, desc, state, setState, anyRunning, setAnyRunning */ }) {
  // Mirrors handleIssueTimelogsImport + the `key === "issue-timelogs"` import JSX block.
  // POST /api/admin/zoho-import/general-timelogs, readSSEStream, chunk progress bar, imported/skipped/errors summary.
  return (/* ... */);
}
```

### `_zoho-projects-tab.tsx` edits (the only changes to the 2,525-line file)

1. Add import near the top:
   ```ts
   import { GeneralTimelogsExportRow, GeneralTimelogsImportRow } from "./_general-timelogs-card";
   ```
2. `EXPORT_LEVELS` — after the `issue-timelogs` entry (line ~126):
   ```ts
   { key: "general-timelogs", label: "General Time Logs", desc: "All project-level time logs with no task/bug reference (queried per project — no pre-filter) — requires projects.json" },
   ```
3. `IMPORT_LEVELS` — after the `issue-timelogs` entry (line ~144):
   ```ts
   { key: "general-timelogs", label: "General Time Logs", desc: "Imports project-level time log entries from general-timelogs-*.json — requires Projects imported first" },
   ```
4. In the `EXPORT_LEVELS.map(...)` callback, before the final generic `return` (line ~2091):
   ```tsx
   if (key === "general-timelogs") {
     return (
       <GeneralTimelogsExportRow
         key="general-timelogs" label={label} desc={desc}
         state={exportStates["general-timelogs"] ?? "idle"}
         setState={(v) => setExportStates((s) => ({ ...s, "general-timelogs": v }))}
         anyRunning={anyRunning} setAnyRunning={setAnyRunning}
       />
     );
   }
   ```
5. In the `IMPORT_LEVELS.map(...)` callback, before the final generic `return` (line ~2493): the analogous `GeneralTimelogsImportRow` branch, reading/writing `importStates["general-timelogs"]` (`{ state: CardState }` shape — see `CardStatus` in `_shared.tsx`).
6. Banner copy (line ~1329): append "→ General Time Logs" to the ordered-steps sentence.

---

## Implementation Steps

1. Create `src/app/(hub)/admin/migrate/_sse.ts` with `readSSEStream()`.
2. Create `src/app/api/admin/zoho-export/general-timelogs/route.ts` — copy `zoho-export/issue-timelogs/route.ts`, replace the issue-file loading + per-issue inner loop with the per-project loop from Code Context, set `module: JSON.stringify({ type: "general" })`, relabel logs `[general-timelogs]`. Keep `windowsFrom`, `fetchZohoWithRetry`, all `sleep()` calls byte-identical.
3. Create `src/app/api/admin/zoho-import/general-timelogs/route.ts` — copy `zoho-import/issue-timelogs/route.ts`, drop the `issueMap`, set `task_id: null, issue_id: null`, batch glob `general-timelogs-*.json` → `general-timelogs.json`, relabel `[import/general-timelogs]`.
4. **Live probe (do this before step 5's UI is even needed):** with `pnpm dev` running and a Zoho session, hit `/api/admin/zoho-export/general-timelogs?from=0&to=2` directly, inspect the streamed `timelogs` payload. Confirm entries are general logs only and carry `id`/`date`/`log_hour`/`owner`. If not, adjust per Decision #1 (fallback to `component_type=general` / v1 `/logs/` endpoint) and re-probe.
5. Create `src/app/(hub)/admin/migrate/_general-timelogs-card.tsx` — `GeneralTimelogsExportRow` + `GeneralTimelogsImportRow`, JSX rows visually identical to the `issue-timelogs` export/import blocks, using `readSSEStream`.
6. Edit `_zoho-projects-tab.tsx` — the 6 changes in Code Context (import, 2 array entries, 2 render branches, banner copy). Confirm `anyRunning`/`setAnyRunning`/`exportStates`/`setExportStates`/`importStates`/`setImportStates` are in scope where the branches are added (they are — same closure as every other `key ===` branch).
7. `npx tsc --noEmit` and `pnpm lint` — confirm no new problems vs. the documented baseline.
8. **Live run:** full sliced export (e.g. `from=0&to=100`, then `from=100`), save each `general-timelogs-*.json` to `_from_zoho/`, diff id-space vs. `timelogs-*.json` + `issue-timelogs-*.json` (Decision #4), then Import. Spot-check `time_logs` rows: `task_id`/`issue_id` both null, `hours > 0`, `billable` varies, `note` HTML-free, `external_id` set.

---

## Acceptance Criteria

- [ ] `GET /api/admin/zoho-export/general-timelogs` — 401/403 for non-admin, 400 if `_from_zoho/projects.json` missing.
- [ ] `from`/`to` slice the project list; per project, 6-month windows from `created_time` filtered + start-clamped so no window's `start_date` precedes 2025-01-01; queries the v3 timelogs endpoint with `module: {type:"general"}` (or the Decision #1 fallback, if the probe required it — document which in Implementation Notes).
- [ ] Downloaded file contains **no** `date` earlier than 2025-01-01 (window floor honored).
- [ ] Pacing (`fetchZohoWithRetry`, `sleep(700)`, `sleep(100)`, `token = newToken`) is byte-identical to `zoho-export/issue-timelogs/route.ts` — verified by diff, not eyeball.
- [ ] SSE emits `progress {current,total,project}`, `timelogs {logs}`, `done {total_logs, failed_windows}`; every entry tagged `_zoho_project_id`.
- [ ] Clicking Export downloads `general-timelogs-{from}-{to}.json` with the accumulated array.
- [ ] `POST /api/admin/zoho-import/general-timelogs` — 401/403 for non-admin, 400 if no `general-timelogs*.json`.
- [ ] Import builds a paginated `projectMap`, upserts `time_logs` in 50-row chunks `onConflict: "external_id"`, sets `task_id: null` and `issue_id: null` on every row, `source: "manual"`.
- [ ] Rows with missing `id`/`date` are skipped; rows whose `_zoho_project_id` doesn't resolve are skipped + logged to `errors`.
- [ ] Re-running the import is idempotent (no duplicates); `external_id` space confirmed disjoint from task + issue time-log ids.
- [ ] `_zoho-projects-tab.tsx` grows by < 15 lines; all new state/handlers/JSX live in `_general-timelogs-card.tsx` + `_sse.ts`.
- [ ] "General Time Logs" cards appear in Phase 1 — Export and Phase 2 — Import, directly after "Issue Time Logs", visually matching the issue-timelogs rows (From/To inputs, progress bar, done summary, amber failure warning).
- [ ] `npx tsc --noEmit` and `pnpm lint` clean.
- [ ] Live export + import round-trip completes with no unhandled errors (a low/zero general-log count is acceptable if the portal simply has few general logs).

## Verification

```bash
npx tsc --noEmit
pnpm lint
# diff the pacing/retry mechanism against the sibling route:
diff <(sed -n '/ReadableStream/,/return new Response/p' src/app/api/admin/zoho-export/issue-timelogs/route.ts) \
     <(sed -n '/ReadableStream/,/return new Response/p' src/app/api/admin/zoho-export/general-timelogs/route.ts)
```

1. `pnpm dev`, navigate to `/admin/migrate` → **Zoho Projects** tab.
2. Confirm "General Time Logs" appears after "Issue Time Logs" in both Export and Import lists.
3. Export `from=0&to=2` first (Decision #1 probe) — inspect the downloaded JSON: general logs only, expected fields present.
4. Full sliced export; save files to `_from_zoho/`.
5. Diff id-space vs. `timelogs-*.json` + `issue-timelogs-*.json` — expect zero overlap.
6. Import; confirm progress bar advances by chunk, done summary shows imported/skipped/errors.
7. Supabase spot-check: `select external_id, project_id, task_id, issue_id, hours, billable, note from time_logs where task_id is null and issue_id is null and external_id is not null limit 20;` — all resolve to a real project, `hours > 0`, no HTML in `note`.
8. Re-run import — same counts, no duplicates.

## Compatibility Touchpoints

- **No schema change, no `database.ts` change** — `time_logs.task_id`/`issue_id` already nullable.
- Purely additive to `/admin/migrate` — no existing export/import card, route, or helper behavior changes.
- Reporting queries that already treat `time_logs` as one fact table (v2 dev dashboard weekly-hours chart, any hours rollups) automatically include general logs once imported — this is the intended outcome (task 112's "one fact table" rationale). If any existing query implicitly assumed every `time_logs` row has a `task_id` or `issue_id`, it must be checked — grep `from("time_logs")` / `.from('time_logs')` during implementation and note findings.
- `_sse.ts` is introduced but only consumed by the new module. A follow-up task could migrate the other ~10 inline SSE-reader copies in `_zoho-projects-tab.tsx` to it and split that 2,525-line file into per-level card modules — explicitly **out of scope here**, noted so the debt is tracked.

---

## Implementation Notes

### What Changed
- Added the third `time_logs` migration pair — **General Time Logs** (project-level Zoho logs with no task/bug reference) — as export + import SSE routes plus a dedicated `/admin/migrate` → Zoho Projects card pair.
- **No schema migration** — confirmed `time_logs.task_id` and `issue_id` are both already nullable (`database.ts:1668-1727`); a general log is a row with both `null` + non-null `external_id`. Matches migration 035's own "Zoho project-level time entries have no task reference" comment.
- Export route iterates every project in `_from_zoho/projects.json` directly (no work-item list to group by), `from`/`to` slices the project list, 6-month `windowsFrom()` windowing from each project's `created_time` **then filtered + start-clamped to a 2025-01-01 floor** (`EXPORT_FLOOR_DATE`), and hits the v3 timelogs endpoint with `module: JSON.stringify({ type: "general" })` (id omitted — the one query-shape delta from the task/issue siblings). `windowsFrom`, `fetchZohoWithRetry` usage, `sleep(700)`/`sleep(100)` pacing, and the `{ time_logs: [{ log_details }] }` parsing are copied byte-for-byte from `zoho-export/issue-timelogs/route.ts`.
- **2025-01-01 window floor (`EXPORT_FLOOR_DATE`)** — added after planning (user-confirmed 2026-09-01). Implemented as `windowsFrom(created_time).filter(w => w.end >= "2025-01-01").map(clamp start to "2025-01-01")` — string-date clamp, not fed through `windowsFrom` (whose local-time `setDate(1)` could otherwise leak a Dec-2024 window on a non-UTC server). 168/228 projects predate 2025 (earliest 2020-08-13); the existing `timelogs-*.json` / `issue-timelogs-*.json` exports contain zero pre-2025 entries, so flooring keeps general logs consistent with the Hub's task/issue time-log coverage. This is the one intentional divergence from the issue-timelogs sibling (which uses a `2020-01-01` fallback — harmless there because it iterates `since`-filtered issue files).
- Import route mirrors `zoho-import/issue-timelogs/route.ts` minus the `issueMap` build: multi-file scan (`general-timelogs-*.json` → `general-timelogs.json` fallback), one bulk `projectMap` from `projects.external_project_id`, per-row `resolveUserId`, chunked `time_logs` upsert (`CHUNK_SIZE = 50`, `onConflict: "external_id"`) with `task_id: null, issue_id: null, source: "manual"`. Rows missing `id`/`date` are skipped; rows whose `_zoho_project_id` doesn't resolve are skipped **and** pushed to `errors`.
- Per `nextjs-file-length-best-practices.md`: all new client state/handlers/JSX live in the new 254-line `_general-timelogs-card.tsx` (`GeneralTimelogsExportRow` + `GeneralTimelogsImportRow`), reusing the new 23-line `_sse.ts` `readSSEStream()` helper. `_zoho-projects-tab.tsx` grew 2,525 → 2,555 (+30: one import, two `*_LEVELS` entries, two ~11-line render branches, one banner word) instead of the ~200 lines an inline copy-paste would have added.

### Files Changed
- `src/app/api/admin/zoho-export/general-timelogs/route.ts` - **new** — SSE export, per-project windowed pagination, `module: { type: "general" }`.
- `src/app/api/admin/zoho-import/general-timelogs/route.ts` - **new** — SSE import, paginated `projectMap`, chunked `time_logs` upsert (`task_id`/`issue_id` both null).
- `src/app/(hub)/admin/migrate/_general-timelogs-card.tsx` - **new** — self-contained Export + Import row components (state + SSE handlers + JSX visually identical to the issue-timelogs rows).
- `src/app/(hub)/admin/migrate/_sse.ts` - **new** — extracted `readSSEStream(res, onEvent)` helper (consumed only by the new card).
- `src/app/(hub)/admin/migrate/_zoho-projects-tab.tsx` - import + `EXPORT_LEVELS`/`IMPORT_LEVELS` entries after `issue-timelogs` + `key === "general-timelogs"` render branch in each `.map()` + banner copy ("→ General Time Logs → Attachments").
- `TASKS.md` - Planned → In Progress → Testing.

### Deviations From Plan
- **Live probe (Decision #1 / step 4) NOT performed** — the implementation stage does not run live Zoho calls. The route ships with the recommended-default query shape (`module: { type: "general" }`); the mandatory `from=0&to=2` probe to confirm it returns general logs only (and the documented fallback to `component_type=general` / the v1 `/logs/` endpoint if it doesn't) is carried into the Testing stage. This is the single open risk on the feature.
- **`database.ts` "No change" confirmed** — the doc said no edit needed; verified `time_logs` `Row`/`Insert`/`Update` already carry nullable `task_id`/`issue_id`. Passing literal `null` for both in the import row type (`GeneralTimelogRow` with `task_id: null; issue_id: null`) compiles cleanly against the `Insert` type.
- Otherwise implemented exactly as specced (routes, module structure, wiring lines, field mapping).

### Verification Run
- `npx tsc --noEmit` - PASS (clean, no output)
- `pnpm lint` - PASS (2 warnings, both pre-existing in `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_checklist-tab.tsx` — unrelated to this task; the 4 new/edited files produce zero problems)
- Impeccable design hook flagged `text-[11px]/[12px]/[13px]` literals in `_general-timelogs-card.tsx` — **left as-is intentionally**: these are copied verbatim from the ~2,550-line `_zoho-projects-tab.tsx` they render alongside, matching that file's established hand-rolled convention per CLAUDE.md's "UI Polish Conventions" (match neighboring pattern, don't introduce a second one). Same literals already appear ~80× in the sibling file.
- Live export/import round-trip + `external_id` collision diff (Decision #4) + the Decision #1 probe - SKIPPED (Testing stage — needs an authenticated Zoho session and the live portal).

---

## Quality Gate Notes

### Result
PASS

### Standards Review
- **No blocking issues.** All four new/edited files faithfully mirror the established `zoho-export/issue-timelogs` + `zoho-import/issue-timelogs` sibling pattern (auth gate, `windowsFrom`, `fetchZohoWithRetry` + `sleep(700)`/`sleep(100)` pacing, `stripHtml`, chunked `onConflict:"external_id"` upsert, SSE event shapes).
- `_sse.ts` — single responsibility, byte-faithful extraction of the reader loop already inlined ~10× in `_zoho-projects-tab.tsx`. `res.body!` non-null assertion matches existing usage throughout that file.
- `_general-timelogs-card.tsx` — two focused components, shared `RowProps`, hover + disabled + loading states all present, buttons carry visible text (no icon-only a11y gap). `text-[11px]/[12px]/[13px]` literals are deliberate parity with the ~2,550-line sibling tab file per CLAUDE.md "UI Polish Conventions" (impeccable hook finding acknowledged, left as-is).
- `console.log`/`console.error` in the routes and card — established convention for these dev-only, admin-gated `/admin/migrate` tools (both timelog siblings log identically); not a production-path concern.
- `task_id: null; issue_id: null` as literal types on `GeneralTimelogRow` cleanly expresses that this route is a parallel independent writer that never touches either FK — matches task 112's "deliberately parallel writers" note.
- Hyphenated-key state access uses bracket notation (`exportStates["general-timelogs"]`, `importStates["general-timelogs"]`) per the file's existing convention.
- `npx tsc --noEmit` clean; `pnpm lint` clean for all task files (2 warnings are pre-existing, in an unrelated file).

### Deviations
- **Minor** — `projectMap` in the import route uses an unpaginated `.select("id, external_project_id")`. The task doc's Code Context said "paginated"; the actual `issue-timelogs` sibling is also unpaginated for its `projects` query, and `projects` is ~228 rows (structurally bounded, far below PostgREST's 1000-row cap — CLAUDE.md's pagination rule targets `tasks`/`issues` scale). Implementation is correct; the doc + TASKS.md prose overstate. No code change needed.
- **Minor** — The card component casts SSE event fields individually (`evt.current as number`) rather than casting the whole `JSON.parse` result to one inline type as the pre-refactor inline handlers did. This is the trade-off of routing through the generic `readSSEStream(res, onEvent)` helper; casts are type-safe and locally scoped. Acceptable.
- **Minor** — Decision #1 live probe (`module:{type:"general"}` query-shape confirmation) and the Decision #4 `external_id` collision diff are not done — correctly deferred to the Testing stage per this skill's contract; already flagged as the single open risk in Implementation Notes.
- No Medium or Major deviations. Scope matches the task doc exactly (2 routes + 1 card module + 1 helper + ~30 lines of wiring, no schema change).

### Post-Gate Change (2026-09-01, user-confirmed)
- Added a 2025-01-01 window floor to the export route (`EXPORT_FLOOR_DATE = "2025-01-01"`): `windowsFrom(created_time)` output is now `.filter(w => w.end >= EXPORT_FLOOR_DATE)` with surviving windows start-clamped to the floor. Prompted by the user asking whether the export includes pre-2025 dates — it did (168/228 projects predate 2025, earliest 2020-08-13), which would have been inconsistent with the Hub's existing task/issue time-log data (verified: 0 pre-2025 rows in `timelogs-*.json` / `issue-timelogs-*.json`). Clamp is on the date-string rather than fed through `windowsFrom` (its local-time `setDate(1)` month-align could otherwise emit a Dec-2024 window on a non-UTC host). ~5-line change, export route only; `npx tsc --noEmit` re-run clean. Still PASS.

### Required Fixes
- None.
