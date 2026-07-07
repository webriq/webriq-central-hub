# Task 111 — Zoho Issue Time Logs Export: Per-Issue SSE Streaming

> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Date:** 2026-07-06
> **Status:** COMPLETED
> **Completed:** 2026-07-07
> **Implementation Notes:** Both planned file changes made exactly as specced, no deviations. `src/app/api/admin/zoho-export/issue-timelogs/route.ts` created verbatim from Code Context. **Verified the throttle/pacing parity requirement explicitly, per the task doc's own acceptance criterion**: ran `diff` against `zoho-export/timelogs/route.ts` line-by-line — every difference is exactly the intended task→issue delta (naming, dropped `log_hours` pre-filter per decision #1, `module.type: "issue"` vs `"task"`). The throttle/retry mechanism itself is byte-identical: same `fetchZohoWithRetry(url, token, { label: ... })` call shape, same `token = newToken` reassignment, same `await sleep(700)` with the identical `// stay under Zoho's 200 req/2 min rolling limit` comment, same `await sleep(100)` at both the inter-page and inter-project call sites, same `windowsFrom()` 6-month windowing helper copied verbatim. Nothing was "improved" or re-tuned. `src/app/v2/(hub)/admin/migrate/page.tsx` got all 5 additions verbatim: `IssueTimelogsExportState` interface (after `TimelogsExportState`), `EXPORT_LEVELS` entry (after `timelogs`), `issueTimelogsExport` state hook (after `timelogsExport`), `handleIssueTimelogsExport()` (after `handleTimelogsExport()` closes), and the `key === "issue-timelogs"` JSX block (after the `timelogs` export block, before `attachment-meta`) — hyphenated-key state access uses bracket notation (`exportStates["issue-timelogs"]`) per the established convention. `IMPORT_LEVELS` was not touched — export-only scope confirmed. `npx tsc --noEmit` clean. `pnpm lint` — same 44 pre-existing problems (8 errors/36 warnings) as baseline, confirmed via `grep` that none touch the 2 changed files. **Per CLAUDE.md, no git commit was made** and this ran directly on `main`, no worktree.
>
> **Live run (2026-07-07):** Two project-slice runs — `from=0&to=50` and `from=0&to=100` — against the real portal, downloaded as `_from_zoho/issue-timelogs-0-50.json` (1,410 logs, 45 of the 50 projects in slice had ≥1 log) and `_from_zoho/issue-timelogs-50-100.json` (775 logs, 28 of the remaining 28 projects had ≥1 log). **2,185 total time-log entries** across **73 of the 78 projects** from task 107's export; the other 5 projects logged zero time on issues (acceptable, per this doc's own Acceptance Criteria note). Verified directly against both downloaded files (not just trusting the UI): zero overlap in `_zoho_project_id` between the two slices (confirms full non-overlapping coverage, no double-counted or skipped projects), and 100% of entries carry `_zoho_project_id` (0 missing). Both files download only on the SSE `"done"` event (the `catch` block never reaches the `URL.createObjectURL`/`a.click()` download code) — their existence and well-formed JSON is itself proof neither run hit an unhandled error. `module_detail.type` on every entry reads `"bug"` (Zoho's own internal label for the Issues module in this API's response — not a defect, the request `module.type: "issue"` param is a separate field from the response's `module_detail.type`).
> **Investigation:** No formal `/understand` run. Spec is grounded in reading the existing Timelogs export/import routes in full (`zoho-export/timelogs/route.ts`, `zoho-import/timelogs/route.ts`), checking `supabase/migrations/035_zoho_decommission_schema.sql` for `time_logs`' actual current schema, running a live check that `_from_zoho/issues-*.json` (1049 records) has zero `log_hours` fields, and the user confirming + providing an official Zoho Projects API doc screenshot for the "Get Time Logs" endpoint showing `module.type` accepts `task`, `issue`, `general`. Treat `## Code Context` as grounded.

---

## Overview

Add a new export endpoint that pulls **time logs for Issues** from Zoho Projects, mirroring the existing Task Timelogs export (`zoho-export/timelogs/route.ts`, task 102) almost exactly — same per-project grouping/slicing, same 6-month date-windowing, same `fetchZohoWithRetry` + `sleep(700)` pacing (already throttle-hardened from task 102's own history) — but iterating **Issues** (from `_from_zoho/issues-*.json`) instead of Tasks, and calling the timelogs endpoint with `module: {id: issueId, type: "issue"}` instead of `type: "task"`.

Confirmed via the user-supplied Zoho API doc screenshot (`Time Logs > Bulk Time Logs > Get Time Logs`): the `module` param's `type` field is documented as accepting exactly `task`, `issue`, or `general` — the same endpoint definition already in use, just a different accepted value. Same request/response shape otherwise (`page`, `per_page`, `view_type: "customdate"`, `start_date`, `end_date`; response `{ log_hours: {...}, time_logs: [{ date, log_details: [...] }] }`) — the existing parsing logic (`json.time_logs ?? []` → `flatMap` over `log_details`) needs no changes.

**Scope is export-only**, continuing the same split this codebase already uses repeatedly (Issues: 107→108; Issue Comments: 109→110). A follow-up **Issue Time Logs Import** task is natural future work once this export is verified live — see the schema note in decision #3 below for why that follow-up will likely be simpler than task 110's was.

**Decisions made during scoping:**

1. **No `log_hours` pre-filter available — must query all 1049 issues, not a subset.** The existing Task Timelogs export only bothers calling the timelogs endpoint for tasks where `log_hours.total_hours !== "00:00"` (a cheap pre-filter using a summary field Zoho already includes on each task record). A live check of all 1049 records in `_from_zoho/issues-*.json` found **zero** with a `log_hours` field — Zoho's Issues list endpoint doesn't surface that summary the way Tasks does. This means the export must iterate every issue with a windowed date-range call, most of which will likely return empty logs. This is a real volume difference from the Task version, not a bug to fix — just a scoping fact that makes `from`/`to` slicing (already present on the Task version) more important here, not less.
2. **Reuse the exact per-project grouping/slicing pattern**, not a flat issue-count slice. Issues are grouped by `_zoho_project_id` (same tag already present on every issue record from task 107's export), then `from`/`to` slices the resulting project list — identical structure to the existing Timelogs export's `tasksByProject` grouping. Keeps the UI and mental model consistent with every other sliceable export card (Tasks, Issues, Timelogs).
3. **Schema note for the future import task, not addressed here:** `time_logs.task_id` is **already nullable** (migration 035, comment: "Zoho project-level time entries have no task reference") — unlike `task_comments`/`issues`, which required a whole new dedicated table for their Issue-scoped counterparts. This means a future Issue Time Logs import will likely just need **one new nullable `issue_id` column** added to the existing `time_logs` table (with `task_id`/`issue_id` mutually exclusive, both nullable), not a new `issue_time_logs` table. Flagging this now so whoever specs that follow-up doesn't default to copying the "new dedicated table" pattern from tasks 108/110 without checking this first.
4. **No `_zoho_issue_id` tag needed on each log entry.** The existing Task version doesn't tag `_zoho_task_id` either — every returned time log entry already carries its own `module_detail.id`/`module_detail.type` from Zoho directly (confirmed by the import route's `log.module_detail?.id` usage and the doc screenshot's sample response). Only `_zoho_project_id` needs tagging, exactly matching the existing pattern.
5. **No `filter` or `fetch_by_modified_time` params.** The doc screenshot shows these as available on this endpoint, but the existing Task version doesn't use them and there's no requirement to add sophistication beyond what's already proven — stay consistent with the established minimal param set (`page`, `per_page`, `view_type`, `start_date`, `end_date`, `module`).

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/admin/zoho-export/issue-timelogs/route.ts` | Create | New SSE export route — per-project grouping/slicing, per-issue windowed pagination, `fetchZohoWithRetry` |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | Modify | Add `IssueTimelogsExportState` interface, `EXPORT_LEVELS` entry, state hook, `handleIssueTimelogsExport()`, and a `key === "issue-timelogs"` JSX render block |

---

## Code Context

### New route — `src/app/api/admin/zoho-export/issue-timelogs/route.ts` (full file, new)

```ts
// dev-only export endpoint — fetches timelogs per issue via SSE.
// Groups issues by project for progress; fetches each issue's logs with module param (type: "issue").
// Mirrors zoho-export/timelogs/route.ts (Tasks version) — see task 111 doc for the two deltas:
// no log_hours pre-filter available on issues (must query all), and module.type is "issue" not "task".
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken, fetchZohoWithRetry } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// API caps customdate at 6 months — generate windows from a start date to today
function windowsFrom(startIso: string) {
  const windows: Array<{ start: string; end: string }> = [];
  const now = new Date();
  const cursor = new Date(startIso);
  cursor.setDate(1); // align to month start

  while (cursor <= now) {
    const start = cursor.toISOString().split("T")[0];
    const endCursor = new Date(cursor);
    endCursor.setMonth(endCursor.getMonth() + 6);
    endCursor.setDate(endCursor.getDate() - 1);
    const end = endCursor > now ? now.toISOString().split("T")[0] : endCursor.toISOString().split("T")[0];
    windows.push({ start, end });
    cursor.setMonth(cursor.getMonth() + 6);
  }

  return windows;
}

type ZohoIssue = {
  id?: string;
  id_string?: string;
  _zoho_project_id?: string;
  created_time?: string;
  project?: { id?: string; name?: string };
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  const params = new URL(request.url).searchParams;
  const fromN = parseInt(params.get("from") ?? "0", 10);
  const toRaw = params.get("to");
  const toN = toRaw ? parseInt(toRaw, 10) : undefined;

  const fromZoho = path.join(process.cwd(), "_from_zoho");
  const issueFiles = fs.readdirSync(fromZoho).filter(f => (f.startsWith("issues-") && f.endsWith(".json")) || f === "issues.json");
  if (issueFiles.length === 0) {
    return NextResponse.json({ error: "No issues-*.json files found in _from_zoho/" }, { status: 400 });
  }

  // Load all issues across all issue files — no log_hours pre-filter available (see task 111 decision #1)
  const allIssues: ZohoIssue[] = [];
  for (const fileName of issueFiles) {
    const raw = JSON.parse(fs.readFileSync(path.join(fromZoho, fileName), "utf-8"));
    const issues: ZohoIssue[] = Array.isArray(raw) ? raw : (raw.issues ?? Object.values(raw)[0] as ZohoIssue[]);
    allIssues.push(...issues);
  }

  // Group issues by project for progress tracking — same shape as the Tasks version
  const issuesByProject = new Map<string, { name: string; issues: ZohoIssue[] }>();
  for (const issue of allIssues) {
    const pid = issue._zoho_project_id ?? issue.project?.id ?? "";
    if (!pid) continue;
    if (!issuesByProject.has(pid)) issuesByProject.set(pid, { name: issue.project?.name ?? pid, issues: [] });
    issuesByProject.get(pid)!.issues.push(issue);
  }

  const allProjectEntries = [...issuesByProject.entries()];
  const projectEntries = allProjectEntries.slice(fromN, toN ?? undefined);
  console.log(`[issue-timelogs] ${allIssues.length} issues across ${allProjectEntries.length} projects — exporting slice [${fromN}–${toN ?? allProjectEntries.length}] (${projectEntries.length} projects)`);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let totalLogs = 0;
      const failedIssueWindows: string[] = [];

      for (let i = 0; i < projectEntries.length; i++) {
        const [projectId, { name: projectName, issues }] = projectEntries[i];
        const projectLogs: unknown[] = [];

        for (const issue of issues) {
          const issueId = String(issue.id_string ?? issue.id);
          const windowStart = issue.created_time ?? "2020-01-01T00:00:00Z";
          const windows = windowsFrom(windowStart);

          for (const { start, end } of windows) {
            let page = 1;

            while (true) {
              const qp = new URLSearchParams({
                page: String(page),
                per_page: "100",
                view_type: "customdate",
                start_date: start,
                end_date: end,
                module: JSON.stringify({ id: issueId, type: "issue" }),
              });
              const url = `${BASE}/projects/${projectId}/timelogs?${qp}`;
              const { res, token: newToken, throttleExhausted } = await fetchZohoWithRetry(url, token, { label: "issue-timelogs" });
              token = newToken;

              if (!res.ok) {
                if (throttleExhausted) {
                  failedIssueWindows.push(`${issueId} ${start}→${end}`);
                  console.log(`[issue-timelogs] Giving up on issue=${issueId} ${start}→${end} — rolling-throttle retries exhausted`);
                } else {
                  console.log(`[issue-timelogs] ${res.status} issue=${issueId} ${start}→${end}:`, await res.text());
                }
                break;
              }

              const json = await res.json() as {
                time_logs?: Array<{ log_details?: unknown[] }>;
                page_info?: { has_next_page?: boolean };
              };
              const logDetails = (json.time_logs ?? []).flatMap((day) =>
                (day.log_details ?? []).map((entry) => ({
                  ...(entry as Record<string, unknown>),
                  _zoho_project_id: projectId,
                }))
              );
              projectLogs.push(...logDetails);

              if (!json.page_info?.has_next_page) break;
              page++;
              await sleep(100);
            }

            await sleep(700); // stay under Zoho's 200 req/2 min rolling limit
          }
        }

        console.log(`[issue-timelogs] project="${projectName}" issues=${issues.length} logs=${projectLogs.length}`);
        totalLogs += projectLogs.length;
        send({ type: "progress", current: i + 1, total: projectEntries.length, project: projectName });
        send({ type: "timelogs", logs: projectLogs });
        await sleep(100);
      }

      send({ type: "done", total_logs: totalLogs, failed_windows: failedIssueWindows });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

This is a near-literal mirror of `zoho-export/timelogs/route.ts` — variable names/comments changed from task→issue, `module.type` changed from `"task"` to `"issue"`, source file changed from `tasks-*.json` to `issues-*.json`, and the `log_hours`-based pre-filter removed (per decision #1, since issues don't carry that field). The `windowsFrom()` helper, `fetchZohoWithRetry` usage, and `sleep(700)`/`sleep(100)` pacing are copied verbatim — this pacing is already throttle-tested (task 102's own history), so there's no repeat of task 109's "guess pacing, discover via live throttle" cycle here.

### `migrate/page.tsx` — new type interface (add after `TimelogsExportState`, `src/app/v2/(hub)/admin/migrate/page.tsx:52-58`)

```ts
interface IssueTimelogsExportState {
  from: string;
  to: string;
  progress: { current: number; total: number; project: string } | null;
  done: { count: number; failed: string[] } | null;
  error: string | null;
}
```

### `EXPORT_LEVELS` — new entry (`src/app/v2/(hub)/admin/migrate/page.tsx:87-88`)

Insert right after the existing `timelogs` entry:

```ts
{ key: "issue-timelogs", label: "Issue Time Logs", desc: "All time logged against issues (paginated per issue, all 1049 queried — no pre-filter available) — requires Issues exported first" },
```

**Hyphenated key — use bracket notation for all state access** (`exportStates["issue-timelogs"]`), same rule already established for `issue-comments` and `attachment-meta` in this same file.

### New state hook (add after `timelogsExport`, `src/app/v2/(hub)/admin/migrate/page.tsx:169-174`)

```ts
const [issueTimelogsExport, setIssueTimelogsExport] = useState<IssueTimelogsExportState>({
  from: "0",
  to: "",
  progress: null,
  done: null,
  error: null,
});
```

### New handler (add after `handleTimelogsExport` closes, `src/app/v2/(hub)/admin/migrate/page.tsx:496-566`)

```ts
async function handleIssueTimelogsExport() {
  if (anyRunning) return;
  setAnyRunning(true);
  setExportStates((s) => ({ ...s, "issue-timelogs": "running" }));
  setIssueTimelogsExport((s) => ({ ...s, progress: null, done: null, error: null }));

  try {
    const qp = new URLSearchParams({ from: issueTimelogsExport.from || "0" });
    if (issueTimelogsExport.to) qp.set("to", issueTimelogsExport.to);
    const res = await fetch(`/api/admin/zoho-export/issue-timelogs?${qp}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const accumulated: unknown[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        if (!frame.startsWith("data: ")) continue;
        const evt = JSON.parse(frame.slice(6)) as {
          type: string;
          current?: number;
          total?: number;
          project?: string;
          logs?: unknown[];
          total_logs?: number;
          failed_windows?: string[];
        };

        if (evt.type === "progress") {
          setIssueTimelogsExport((s) => ({
            ...s,
            progress: { current: evt.current!, total: evt.total!, project: evt.project! },
          }));
        }
        if (evt.type === "timelogs" && evt.logs) {
          accumulated.push(...evt.logs);
        }
        if (evt.type === "done") {
          const blob = new Blob([JSON.stringify(accumulated, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          const toLabel = issueTimelogsExport.to || "end";
          a.download = `issue-timelogs-${issueTimelogsExport.from || "0"}-${toLabel}.json`;
          a.click();
          URL.revokeObjectURL(url);
          setIssueTimelogsExport((s) => ({
            ...s,
            done: { count: evt.total_logs!, failed: evt.failed_windows ?? [] },
            progress: null,
          }));
          setExportStates((s) => ({ ...s, "issue-timelogs": "done" }));
        }
      }
    }
  } catch (e) {
    setIssueTimelogsExport((s) => ({ ...s, error: String(e), progress: null }));
    setExportStates((s) => ({ ...s, "issue-timelogs": "error" }));
    console.error("[export/issue-timelogs]", e);
  } finally {
    setAnyRunning(false);
  }
}
```

### New JSX render block (insert after the `key === "timelogs"` block closes, `src/app/v2/(hub)/admin/migrate/page.tsx:1154-1231`, before the `key === "attachment-meta"` block at `:1233`)

```tsx
if (key === "issue-timelogs") {
  const isRunning = exportStates["issue-timelogs"] === "running";
  const pct = issueTimelogsExport.progress
    ? Math.round((issueTimelogsExport.progress.current / issueTimelogsExport.progress.total) * 100)
    : 0;

  return (
    <div key="issue-timelogs" className="py-2 border-b border-slate-100 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
            {label}
            <StateIcon state={exportStates["issue-timelogs"] ?? "idle"} />
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
          {!isRunning && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <label className="text-[11px] text-slate-500">From</label>
              <input
                type="number"
                min={0}
                value={issueTimelogsExport.from}
                onChange={(e) => setIssueTimelogsExport((s) => ({ ...s, from: e.target.value }))}
                className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
              />
              <label className="text-[11px] text-slate-500">To</label>
              <input
                type="number"
                min={0}
                value={issueTimelogsExport.to}
                placeholder="all"
                onChange={(e) => setIssueTimelogsExport((s) => ({ ...s, to: e.target.value }))}
                className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
              />
              <span className="text-[11px] text-slate-400">of projects with issues</span>
            </div>
          )}
        </div>
        {!isRunning && (
          <button
            onClick={handleIssueTimelogsExport}
            disabled={anyRunning}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={11} />
            Export
          </button>
        )}
      </div>
      {isRunning && issueTimelogsExport.progress !== null ? (
        <div className="mt-2">
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate">
            Project {issueTimelogsExport.progress.current} of {issueTimelogsExport.progress.total} — {issueTimelogsExport.progress.project}
          </div>
        </div>
      ) : null}
      {exportStates["issue-timelogs"] === "done" && issueTimelogsExport.done !== null ? (
        <div className="mt-1 text-[11px]">
          <div className="text-green-600">{issueTimelogsExport.done.count} logs downloaded</div>
          {issueTimelogsExport.done.failed.length > 0 ? (
            <div className="text-amber-600 mt-0.5 truncate" title={issueTimelogsExport.done.failed.join(", ")}>
              {issueTimelogsExport.done.failed.length} window(s) failed after retries — re-run with from/to to retry
            </div>
          ) : null}
        </div>
      ) : null}
      {issueTimelogsExport.error !== null ? (
        <div className="mt-1 text-[11px] text-red-600">{issueTimelogsExport.error}</div>
      ) : null}
    </div>
  );
}
```

This mirrors the `key === "timelogs"` block exactly, including the from/to project-slice inputs.

---

## Implementation Steps

1. Create `src/app/api/admin/zoho-export/issue-timelogs/route.ts` exactly as specified in Code Context.
2. In `src/app/v2/(hub)/admin/migrate/page.tsx`:
   a. Add `IssueTimelogsExportState` interface after `TimelogsExportState` (line 58).
   b. Add the `issue-timelogs` entry to `EXPORT_LEVELS` after `timelogs` (line 88). Do **not** add anything to `IMPORT_LEVELS` — this task is export-only.
   c. Add the `issueTimelogsExport` state hook after `timelogsExport` (line 174).
   d. Add `handleIssueTimelogsExport()` after `handleTimelogsExport()` closes (~line 566).
   e. Add the `if (key === "issue-timelogs")` JSX block after the `key === "timelogs"` block closes (~line 1231), before `if (key === "attachment-meta")` (line 1233).
3. Run `npx tsc --noEmit` and `pnpm lint`.

---

## Notes for Implementation Agent

- **This is export-only.** Do not create a `time_logs.issue_id` column, an import route, or an `issue_time_logs` table — that's deliberately deferred to a follow-up task (decision #3). Do not add anything to `IMPORT_LEVELS`.
- **Every hyphenated-key state access must use bracket notation** (`exportStates["issue-timelogs"]`) — same rule as `issue-comments`/`attachment-meta` in this same file. Dot notation will not compile.
- **Do not add a `log_hours` pre-filter** — issues don't have that field (confirmed: 0/1049 in the real export). All issues in the slice get queried, which is expected and not a bug.
- **`module: JSON.stringify({ id: issueId, type: "issue" })`** — this is the one functional delta from the Tasks version, confirmed both by the user and by the official Zoho API doc (`module.type` accepts `task`/`issue`/`general`). Everything else about the request/response shape is unchanged.
- **Reuse `fetchZohoWithRetry` and the exact `sleep(700)`/`sleep(100)` pacing from the Tasks version verbatim** — this pacing is already throttle-proven (task 102's own history establishing it, and task 109 later re-confirming the same class of limit exists on a different endpoint). Do not invent a different cadence.
- **`from`/`to` slice over projects, not over raw issue count** — matches the existing Tasks Timelogs / Issues export UX exactly, so a partial run behaves the same way a user already expects from the sibling cards.
- **Sonnet requested by user override** (default recommendation for this shape of task would have been haiku — it's a near-literal structural mirror of an already-implemented, already-throttle-hardened pattern, with no new schema and only one confirmed parameter-value change — but the user explicitly asked to bump this task to sonnet, specifically to ensure zero deviation in the batching/throttle-guard mechanism given this route queries all 1049 issues with no pre-filter, a materially larger and more throttle-exposed call volume than the Tasks version ever has to handle in one run).
- **Throttle/rate-limit guard must be byte-for-byte identical to the Tasks Timelogs version, not just "similar."** This is the single most important constraint on this task. Every pacing constant, every retry call, every backoff — `fetchZohoWithRetry(url, token, { label: ... })` with `token = newToken` reassigned after every call, `sleep(700)` after every date-window's pagination loop finishes, `sleep(100)` between paginated pages within a window, `sleep(100)` between projects — must match `zoho-export/timelogs/route.ts` exactly, not be re-derived, re-tuned, or "improved." Task 109's own history is the cautionary tale here: a route that copied an *outdated* retry pattern (instead of the already-fixed one sitting one file away) tripped Zoho's rolling throttle twice in a row before it got fixed, costing two full 9+ minute waits during live testing. This route queries roughly 3-5x the entities the Tasks version typically touches per run (no `log_hours` pre-filter — see decision #1) and therefore has strictly *more* exposure to that same throttle, not less. Copy the proven pacing, do not attempt to tune it "for efficiency."

---

## Acceptance Criteria

- [x] `GET /api/admin/zoho-export/issue-timelogs` requires admin/super_admin auth — 401/403 matching every other export route
- [x] Route reads all `issues-*.json` files in `_from_zoho/` (or `issues.json`), groups by `_zoho_project_id`, returns 400 with a clear error if none exist
- [x] `from`/`to` query params slice the grouped project list, matching the existing Tasks Timelogs / Issues export convention
- [x] For each issue in the slice, generates 6-month date windows from `created_time`, calls the timelogs endpoint with `module: {id: issueId, type: "issue"}`, and paginates via `page_info.has_next_page`
- [x] Uses `fetchZohoWithRetry` with the same `sleep(700)`/`sleep(100)` pacing as the Tasks version — no re-introduction of an unsafe pacing guess
- [x] Diffed against `zoho-export/timelogs/route.ts` line-by-line for the throttle/retry/pacing mechanism specifically (not just "looks similar") — every `fetchZohoWithRetry` call, `token = newToken` reassignment, and `sleep()` call site matches 1:1, confirmed before considering this task done, not just before the first live test
- [x] SSE stream emits `progress` (current/total/project), `timelogs` (batch per project), and a final `done` (total_logs, failed_windows) event — mirrors the existing Timelogs export shape exactly
- [x] Every log entry is tagged with `_zoho_project_id`
- [x] `migrate/page.tsx` shows an "Issue Time Logs" card in Phase 1 — Export, directly after "Time Logs", with From/To project-slice inputs, a progress bar reading "Project X of Y — {name}", a downloaded-count message, and an amber failed-windows warning when `failed_windows` is non-empty
- [x] Clicking Export downloads `issue-timelogs-{from}-{to}.json` containing the accumulated array
- [x] Live run against the real portal completes with no unhandled errors (a low or zero total log count is an acceptable, expected outcome given issues may log little to no time — not itself a failure signal) — confirmed 2026-07-07, see Implementation Notes
- [x] `npx tsc --noEmit` and `pnpm lint` both clean

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

1. Ensure `_from_zoho/issues-*.json` exists from task 107's export.
2. Start dev server: `pnpm dev`.
3. Navigate to `/v2/admin/migrate`. Confirm the "Issue Time Logs" card appears in Phase 1 — Export, after "Time Logs".
4. Run a small slice first (e.g. `from=0&to=5`) given the volume concern (decision #1) — confirm progress advances per project and the request count/duration feels proportionate to issue count in that slice, not stuck.
5. Inspect the downloaded file: confirm log entries carry `_zoho_project_id` and the raw Zoho fields (`date`, `log_details` contents, `owner`, `module_detail` with `type: "issue"`) are preserved unmodified.
6. If a slice's issues have zero logged time, confirm the run still completes cleanly (empty batches are valid, not errors) rather than treating a low count as broken.

---

## Compatibility Touchpoints

- New route only — no changes to existing export/import routes, no schema changes, no changes to `IMPORT_LEVELS`.
- Purely additive to `migrate/page.tsx` (new interface, new array entry, new state, new handler, new JSX block) — no existing card's behavior changes.
- Sets up (but does not implement) a straightforward follow-up: adding a nullable `time_logs.issue_id` column, since `task_id` is already nullable — see decision #3.
