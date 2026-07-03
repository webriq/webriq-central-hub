# Task 107 — Zoho Issues Export: Per-Project SSE Streaming (with From/To/Since)

> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Recommended Model:** haiku
> **Date:** 2026-07-03
> **Status:** Completed
> **Completed:** 2026-07-03
> **Investigation:** `/understand` ran before this spec. Findings embedded below.
> **Implementation Notes:** Three iterations before leaving TESTING. **v1:** Built against a portal-wide `/issues` endpoint based on the first API doc excerpt supplied — wrong. **v2 (correction):** User supplied the real "Get Project Issues" endpoint — `/portal/{portalId}/projects/{projectId}/issues`, per-project with `page`/`per_page` required, matching Tasks' shape. Rewrote `route.ts` to loop `_from_zoho/projects.json` and paginate per project, tagging records with `_zoho_project_id`; added `failed_project_ids` tracking via `fetchZohoWithRetry`'s `throttleExhausted` flag (task 105's failure-visibility pattern); UI progress switched from `{page, count}` to `{current, total, project}` with a percentage bar matching the Tasks card. **v3 (from/to/since):** User asked for the same From/To/Since inputs the Tasks card has. Added `from`/`to`/`since` to `IssuesExportState`, wired them into `handleIssuesExport`'s query string, added the input row to the JSX card, and added matching `searchParams` parsing + newest-first project sort/slice + per-issue `since` filter (on `created_time`) to `route.ts` — copied verbatim from `tasks/route.ts`. Download filename is now `issues-{from}-{toLabel}-{sinceYear}.json`. `npx tsc --noEmit` and `pnpm lint` (scoped to the two changed files) clean after every iteration. **Per CLAUDE.md, no git commit was made** — all changes are in the working tree uncommitted, ready for manual review/commit.
> **Live Run Result (2026-07-03):** User ran a real export from `/v2/admin/migrate` with `from=0, to=50, since=2025-01-01` → `_from_zoho/issues-0-50-2025.json`, **141 issue records across 50 projects**, no errors, no `failed_project_ids`. Verified against the sibling `tasks-0-50-2025.json` (3286 records, same 0–50 project slice) that both exports share the same convention: top-level flat JSON array, one entry per Zoho record, each tagged with `_zoho_project_id`. Field sets differ as expected (Issues: `id, prefix, name, project, description, flag, created_time, created_by, status, assignee, severity, added_via, subscription_type, _zoho_project_id`; Tasks: adds `milestone, tasklist, priority, owners_and_work, duration, completion_percentage, log_hours`, etc.) — different Zoho entities, same export shape. Notable: unlike Tasks, Zoho's issue payload already includes a native `project` object (in addition to our injected `_zoho_project_id`), so issues carry project context directly from the API. No fixes needed post-verification — feature works as specced on the first live run.

---

## Overview

Add an "Issues" export function to the Zoho export admin tools (`/v2/admin/migrate`), mirroring the existing Tasks export card exactly — including its From/To/Since inputs. Zoho's "Get Project Issues" endpoint is **per-project**, same shape as Tasks:

```
GET https://projectsapi.zoho.com/api/v3/portal/{portalId}/projects/{projectId}/issues?page=1&per_page=10&sort_by=ASC(created_time)&view_id=...&issue_ids=...
```

`page` and `per_page` are **required** query parameters per Zoho's docs. A companion "Get Issue Details" endpoint (`GET /projects/{projectId}/issues/{issueId}`) exists for single-issue fetches — not needed for a bulk export, out of scope.

**Final decisions (after two rounds of correction from the initial scoping):**
1. **Export shape: SSE streaming with progress**, per-project loop over `_from_zoho/projects.json` — identical structure to `tasks/route.ts`, records tagged with `_zoho_project_id`.
2. **Naming: "Issues"** — matches Zoho's own API/UI terminology. Filename: `issues-{from}-{toLabel}-{sinceYear}.json` (matches Tasks' `tasks-{from}-{toLabel}-{sinceYear}.json` convention).
3. **From/To/Since inputs**, identical to the Tasks card: `from`/`to` slice the newest-first-sorted project list; `since` filters each issue's `created_time`. No `view_id`/`issue_ids` inputs (Zoho-specific filter params) — only the from/to/since slicing pattern was requested.

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/admin/zoho-export/issues/route.ts` | Create | SSE export route — loops `projects.json` (from/to slice), paginates Zoho's per-project `/issues` endpoint (since filter on `created_time`) |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | Modify | Add `IssuesExportState` type (with from/to/since), `issuesExport` state, `handleIssuesExport` handler, `EXPORT_LEVELS` entry, JSX branch with From/To/Since inputs |

---

## Code Context

### Route — `src/app/api/admin/zoho-export/issues/route.ts` (full file, as implemented)

```ts
// dev-only export endpoint — SSE stream of issues per project (paginated within each project),
// with from/to project slice and since date filter — same as tasks/route.ts.
import { NextRequest } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken, fetchZohoWithRetry } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

  let token = await getZohoAccessToken();
  if (!token) return new Response(JSON.stringify({ error: "No Zoho token" }), { status: 502 });

  const projectsFile = path.join(process.cwd(), "_from_zoho", "projects.json");
  if (!fs.existsSync(projectsFile)) {
    return new Response(JSON.stringify({ error: "projects.json not found in _from_zoho/" }), { status: 400 });
  }

  const params = request.nextUrl.searchParams;
  const fromN = parseInt(params.get("from") ?? "0", 10);
  const toRaw = params.get("to");
  const toN = toRaw ? parseInt(toRaw, 10) : undefined;
  const since = params.get("since") ?? null;
  const sinceMs = since ? new Date(since).getTime() : null;

  const { projects: rawProjects } = JSON.parse(fs.readFileSync(projectsFile, "utf-8")) as {
    projects: Array<Record<string, unknown>>;
  };

  // Sort newest first then slice to requested range
  const sorted = [...rawProjects].sort((a, b) => {
    const ta = new Date(String(a.created_time ?? "")).getTime();
    const tb = new Date(String(b.created_time ?? "")).getTime();
    return tb - ta;
  });
  const slice = sorted.slice(fromN, toN ?? undefined);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let totalIssues = 0;
      const failedProjectIds: string[] = [];
      const perPage = 100;

      for (let i = 0; i < slice.length; i++) {
        const project = slice[i];
        const projectId = String(project.id_string ?? project.id);
        const projectName = String(project.name ?? projectId);
        const projectIssues: unknown[] = [];
        let page = 1;

        while (true) {
          const qp = new URLSearchParams({ page: String(page), per_page: String(perPage) });
          const url = `${BASE}/projects/${projectId}/issues?${qp}`;
          const { res, token: newToken, throttleExhausted } = await fetchZohoWithRetry(url, token, { label: "issues" });
          token = newToken;

          if (throttleExhausted) {
            failedProjectIds.push(projectId);
            console.log(`[issues] Giving up on project=${projectId} — rolling-throttle retries exhausted`);
            break;
          }
          if (!res.ok) {
            console.log(`[issues] ${res.status} project=${projectId}:`, await res.text().catch(() => ""));
            break;
          }

          const json = await res.json() as {
            issues?: Array<Record<string, unknown>>;
            page_info?: { has_next_page?: boolean };
          };
          const rawBatch = json.issues ?? [];
          let batch: Array<Record<string, unknown>> = rawBatch.map((it) => ({
            ...it,
            _zoho_project_id: projectId,
          }));

          if (sinceMs !== null) {
            batch = batch.filter((it) => {
              const ct = it.created_time;
              if (!ct) return true;
              return new Date(String(ct)).getTime() >= sinceMs;
            });
          }

          projectIssues.push(...batch);

          if (json.page_info?.has_next_page === false || rawBatch.length < perPage) break;
          page++;
          await sleep(100);
        }

        totalIssues += projectIssues.length;
        send({ type: "progress", current: i + 1, total: slice.length, project: projectName });
        send({ type: "issues", issues: projectIssues });
        await sleep(100);
      }

      send({ type: "done", total_issues: totalIssues, failed_project_ids: failedProjectIds });
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

Note: the pagination stop condition checks `rawBatch.length < perPage` (the raw API page size), not the `since`-filtered `batch.length` — otherwise a page that gets mostly filtered out by `since` would look like "last page" and stop pagination early. This mirrors `tasks/route.ts`'s exact behavior.

### `migrate/page.tsx` — state type (as implemented)

```ts
interface IssuesExportState {
  from: string;
  to: string;
  since: string;
  progress: { current: number; total: number; project: string } | null;
  done: { count: number; failed: string[] } | null;
  error: string | null;
}
```

### `migrate/page.tsx` — state hook default (as implemented)

```ts
const [issuesExport, setIssuesExport] = useState<IssuesExportState>({
  from: "0",
  to: "",
  since: "2025-01-01",
  progress: null,
  done: null,
  error: null,
});
```

### `migrate/page.tsx` — `EXPORT_LEVELS` entry

```ts
{ key: "issues", label: "Issues", desc: "All issues/bugs (paginated per project) — can run independently" },
```

Inserted after the `tasks` entry, before `comments`.

### `migrate/page.tsx` — `handleIssuesExport` handler (as implemented)

```ts
async function handleIssuesExport() {
  if (anyRunning) return;
  setAnyRunning(true);
  setExportStates((s) => ({ ...s, issues: "running" }));
  setIssuesExport((s) => ({ ...s, progress: null, done: null, error: null }));

  try {
    const qp = new URLSearchParams({ from: issuesExport.from || "0" });
    if (issuesExport.to) qp.set("to", issuesExport.to);
    if (issuesExport.since) qp.set("since", issuesExport.since);

    const res = await fetch(`/api/admin/zoho-export/issues?${qp}`);
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
          issues?: unknown[];
          total_issues?: number;
          failed_project_ids?: string[];
        };

        if (evt.type === "progress") {
          setIssuesExport((s) => ({
            ...s,
            progress: { current: evt.current!, total: evt.total!, project: evt.project! },
          }));
        }
        if (evt.type === "issues" && evt.issues) {
          accumulated.push(...evt.issues);
        }
        if (evt.type === "done") {
          const blob = new Blob([JSON.stringify(accumulated, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          const sinceYear = issuesExport.since ? issuesExport.since.split("-")[0] : "all";
          const toLabel = issuesExport.to || "end";
          a.download = `issues-${issuesExport.from || "0"}-${toLabel}-${sinceYear}.json`;
          a.click();
          URL.revokeObjectURL(url);
          setIssuesExport((s) => ({
            ...s,
            done: { count: evt.total_issues!, failed: evt.failed_project_ids ?? [] },
            progress: null,
          }));
          setExportStates((s) => ({ ...s, issues: "done" }));
        }
      }
    }
  } catch (e) {
    setIssuesExport((s) => ({ ...s, error: String(e), progress: null }));
    setExportStates((s) => ({ ...s, issues: "error" }));
    console.error("[export/issues]", e);
  } finally {
    setAnyRunning(false);
  }
}
```

### `migrate/page.tsx` — JSX branch (as implemented, From/To/Since inputs + percentage-bar layout, both matching the Tasks card)

```tsx
if (key === "issues") {
  const isRunning = exportStates.issues === "running";
  const pct = issuesExport.progress
    ? Math.round((issuesExport.progress.current / issuesExport.progress.total) * 100)
    : 0;

  return (
    <div key="issues" className="py-2 border-b border-slate-100 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
            {label}
            <StateIcon state={exportStates.issues ?? "idle"} />
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
          {!isRunning && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <label className="text-[11px] text-slate-500">From</label>
              <input
                type="number"
                min={0}
                value={issuesExport.from}
                onChange={(e) => setIssuesExport((s) => ({ ...s, from: e.target.value }))}
                className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
              />
              <label className="text-[11px] text-slate-500">To</label>
              <input
                type="number"
                min={0}
                value={issuesExport.to}
                placeholder="all"
                onChange={(e) => setIssuesExport((s) => ({ ...s, to: e.target.value }))}
                className="w-16 text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
              />
              <label className="text-[11px] text-slate-500">Since</label>
              <input
                type="date"
                value={issuesExport.since}
                onChange={(e) => setIssuesExport((s) => ({ ...s, since: e.target.value }))}
                className="text-[11px] text-slate-800 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400"
              />
            </div>
          )}
        </div>
        {!isRunning && (
          <button
            onClick={handleIssuesExport}
            disabled={anyRunning}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={11} />
            Export
          </button>
        )}
      </div>
      {isRunning && issuesExport.progress !== null ? (
        <div className="mt-2">
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate">
            Project {issuesExport.progress.current} of {issuesExport.progress.total} — {issuesExport.progress.project}
          </div>
        </div>
      ) : null}
      {exportStates.issues === "done" && issuesExport.done !== null ? (
        <div className="mt-1 text-[11px]">
          <div className="text-green-600">{issuesExport.done.count} issues downloaded</div>
          {issuesExport.done.failed.length > 0 ? (
            <div className="text-amber-600 mt-0.5 truncate" title={issuesExport.done.failed.join(", ")}>
              {issuesExport.done.failed.length} project(s) failed after retries — re-run to retry
            </div>
          ) : null}
        </div>
      ) : null}
      {issuesExport.error !== null ? (
        <div className="mt-1 text-[11px] text-red-600">{issuesExport.error}</div>
      ) : null}
    </div>
  );
}
```

---

## Implementation Steps

1. Create `src/app/api/admin/zoho-export/issues/route.ts` per Code Context — auth/role-gate boilerplate copied verbatim from `tasks/route.ts`, `from`/`to`/`since` parsing + newest-first project sort/slice copied verbatim from `tasks/route.ts`, per-project pagination loop hitting `/projects/{projectId}/issues` using `fetchZohoWithRetry` (`src/lib/zoho/index.ts:86`).
2. In `migrate/page.tsx`: add `IssuesExportState` (with from/to/since), `issuesExport` state hook, `issues` entry in `EXPORT_LEVELS`, `handleIssuesExport`, and the `if (key === "issues")` JSX branch (From/To/Since inputs + progress bar).
3. Run `npx tsc --noEmit` and `pnpm lint` — confirm both changed files type-check and lint cleanly.

---

## Notes for Implementation Agent

- **Per-project, same shape as Tasks** — loop `_from_zoho/projects.json` (sliced by from/to), hit `/projects/{projectId}/issues` for each, tag every record with `_zoho_project_id`. `page` and `per_page` are Zoho-required query params.
- **`since` filters issues, not projects** — `from`/`to` slice which *projects* get looped (same as Tasks); `since` filters individual *issues* by `created_time` within each project's paginated results. Don't conflate the two.
- **Pagination stop condition uses the raw (pre-`since`-filter) batch length** — `rawBatch.length < perPage`, not the filtered `batch.length`. If `since` filters out most of a page, that page could still be a "full" page from Zoho's perspective and there may be more pages to fetch.
- **`page_info.has_next_page` may not be present** in every Zoho response shape seen in this codebase's docs — the stop condition uses `json.page_info?.has_next_page === false || rawBatch.length < perPage` defensively.
- **Use `fetchZohoWithRetry`** (`src/lib/zoho/index.ts:86`, added in task 105) for 429/rolling-throttle/401 resilience.
- **Failure visibility, not silent skip** — a project whose throttle retries are exhausted is pushed to `failedProjectIds` and surfaced in the `done` SSE event (`failed_project_ids`), matching task 105's pattern for `attachment-meta`/`timelogs`.
- **Auth/role-gate boilerplate is copy-paste identical** to every other `zoho-export/*` route (Supabase session → `profiles.role` must be `admin` or `super_admin` via `adminClient`).
- **Scope is export-only** — no Hub-side issues/bugs table, no import route (`zoho-import/issues`). Mirrors how Tasks export (089) shipped before Tasks import (090) was scoped separately later.

---

## Acceptance Criteria

- [x] `GET /api/admin/zoho-export/issues` requires admin/super_admin auth — 401 if unauthenticated, 403 if wrong role
- [x] Route accepts `from`/`to`/`since` query params; `from`/`to` slice the newest-first-sorted project list, `since` filters issues by `created_time`
- [x] Route loops sliced projects and paginates `/projects/{projectId}/issues` per project via required `page`/`per_page` params
- [x] Route uses `fetchZohoWithRetry` for all Zoho fetches; throttle-exhausted projects are tracked, not silently dropped
- [x] SSE stream emits `progress` (`{current, total, project}`), `issues` (batch array tagged with `_zoho_project_id`), and `done` (`{total_issues, failed_project_ids}`) events
- [x] `migrate/page.tsx` shows a new "Issues" card in the Phase 1 — Export section, positioned after "Tasks", with From/To/Since inputs and a percentage progress bar — visually matching the Tasks card
- [x] Clicking Export downloads `issues-{from}-{toLabel}-{sinceYear}.json` on completion; a failure warning line appears if any project's retries were exhausted
- [x] `npx tsc --noEmit` and `pnpm lint` both clean on the two changed files

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

1. Start dev server: `pnpm dev`
2. Navigate to `/v2/admin/migrate`
3. Confirm the Issues card shows From/To/Since inputs identical in style/position to the Tasks card
4. Click Export — confirm the progress bar and "Project N of M — {name}" line update as it loops projects
5. Confirm `issues-{from}-{toLabel}-{sinceYear}.json` downloads automatically when the export completes
6. Open the downloaded file — confirm it's a JSON array of issue objects matching Zoho's issue shape (`id`, `prefix`, `name`, `status`, `assignee`, `severity`, `_zoho_project_id`, etc.)
7. Try a narrow `from`/`to` range and confirm only that project slice is exported; try a `since` date and confirm older issues are excluded
8. Confirm the button is disabled (via `anyRunning`) while any other export/import card is running

---

## Compatibility Touchpoints

- No schema, packaging, or install-surface impact — new admin-only dev tool route plus a UI card addition, following the Tasks export pattern exactly (including its from/to/since inputs).
