# Task 101 — Comments Export: SSE Streaming + Pagination

> **Priority:** HIGH
> **Type:** patch
> **Recommended Model:** haiku
> **Investigation:** /understand ran before this spec. Findings embedded below.
> **Status:** TESTING
> **Completed:** 2026-07-01
> **Implementation Notes:** Route fully converted to SSE. UI mirrors the tasks export pattern. TypeScript clean.

---

## Problem

`GET /api/admin/zoho-export/comments` is a blocking endpoint:
- Makes **one request per task** with no pagination — silently drops comments beyond Zoho's default page size
- Returns a single HTTP response — for large repos (1000+ tasks × 200ms sleep = 3+ min) this times out before completing
- The UI uses `handleExport` which calls `fetch().blob()` — it will stall indefinitely or error

The import route and UI wiring are already correct and do not need changes.

---

## Goal

- Convert the export to an **SSE stream** (matching the tasks export pattern exactly)
- Add **pagination per task** using `page_info.has_next_page` (same as tasks, line 100 of tasks route)
- Add a `handleCommentsExport()` SSE consumer in the migrate page that shows per-task progress and triggers a file download on `done`

---

## File Changes

| File | Change |
|------|--------|
| `src/app/api/admin/zoho-export/comments/route.ts` | Rewrite: SSE stream + pagination loop per task |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | Add `CommentsExportState`, `commentsExport` state, `handleCommentsExport()`, special-case `comments` in export map |

---

## Code Context

### Current comments export (full file — to be replaced)

`src/app/api/admin/zoho-export/comments/route.ts`:
```ts
// dev-only export endpoint — fetches comments for every task in tasks.json.
// Requires tasks.json to be exported first.
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
  // ... auth check ...
  for (const task of tasks) {
    const res = await fetch(`${BASE}/projects/${projectId}/tasks/${taskId}/comments`, { ... });
    // ONE request per task, no pagination
    const json = await res.json() as { comments?: unknown[] };
    all.push(...(json.comments ?? []));
    await sleep(200);
  }
  return new NextResponse(JSON.stringify(all, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="comments.json"' },
  });
}
```

### Tasks export SSE + pagination pattern (the model to follow)

`src/app/api/admin/zoho-export/tasks/route.ts:48–123`:
```ts
const encoder = new TextEncoder();
const stream = new ReadableStream({
  async start(controller) {
    const send = (obj: object) =>
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

    for (let i = 0; i < slice.length; i++) {
      const project = slice[i];
      let page = 1;

      while (true) {
        const qp = new URLSearchParams({ page: String(page), per_page: "100" });
        let res = await fetch(`${BASE}/projects/${projectId}/tasks?${qp}`, { ... });

        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10);
          await sleep(retryAfter * 1000);
          res = await fetch(...);
        }

        if (!res.ok) break;

        const json = await res.json() as {
          tasks?: Array<Record<string, unknown>>;
          page_info?: { has_next_page?: boolean };
        };

        const rawBatch = json.tasks ?? [];
        projectTasks.push(...batch);

        if (!json.page_info?.has_next_page || rawBatch.length < 100) break;
        page++;
        await sleep(100);
      }

      send({ type: "progress", current: i + 1, total: slice.length, project: projectName });
      send({ type: "tasks", tasks: projectTasks });
      await sleep(100);
    }

    send({ type: "done", total_tasks: totalTasks });
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
```

### Tasks export SSE consumer in UI (the model to follow for handleCommentsExport)

`src/app/v2/(hub)/admin/migrate/page.tsx:122–190` (`handleTasksExport`):
- Reads `res.body.getReader()`, decodes SSE frames split on `\n\n`
- On `progress` event: updates state for progress bar
- On `tasks` event: accumulates into array
- On `done` event: creates `Blob`, triggers `<a>` download, sets done state

### Tasks special-case in export map (the UI pattern for comments to follow)

`src/app/v2/(hub)/admin/migrate/page.tsx:311–388`:
```tsx
{EXPORT_LEVELS.map(({ key, label, desc }) => {
  if (key === "tasks") {
    // ... special card with progress bar + input controls ...
    return ( <div key="tasks"> ... </div> );
  }
  // default card
  return (
    <div key={key} className="flex items-center ...">
      ...
      <button onClick={() => handleExport(key)}>Export</button>
    </div>
  );
})}
```

---

## Implementation Steps

### 1. Rewrite `src/app/api/admin/zoho-export/comments/route.ts`

Replace the blocking `NextResponse` handler with an SSE `ReadableStream`. Mirror the tasks export exactly, adapting for comments:

- SSE event types:
  - `{ type: "progress", current: N, total: M, taskId: string }` — sent after each task
  - `{ type: "comments", comments: [...] }` — batch per task (may be empty)
  - `{ type: "done", total_comments: N }` — final event
- Pagination loop per task:
  ```ts
  let page = 1;
  while (true) {
    const qp = new URLSearchParams({ page: String(page), per_page: "100" });
    let res = await fetch(`${BASE}/projects/${projectId}/tasks/${taskId}/comments?${qp}`, { ... });
    // 429 retry (same as tasks)
    if (!res.ok) break;
    const json = await res.json() as {
      comments?: Array<Record<string, unknown>>;
      page_info?: { has_next_page?: boolean };
    };
    const rawBatch = json.comments ?? [];
    taskComments.push(...rawBatch.map(c => ({ ...c, _zoho_task_id: taskId, _zoho_project_id: projectId })));
    if (!json.page_info?.has_next_page || rawBatch.length < 100) break;
    page++;
    await sleep(100);
  }
  ```
- Keep the `await sleep(200)` between tasks (rate limit)
- Keep auth check (same admin/super_admin guard)
- Keep tasks.json dependency check

### 2. Add `CommentsExportState` interface to migrate page

```ts
interface CommentsExportState {
  progress: { current: number; total: number; taskId: string } | null;
  done: { count: number } | null;
  error: string | null;
}
```

Add to component state:
```ts
const [commentsExport, setCommentsExport] = useState<CommentsExportState>({
  progress: null,
  done: null,
  error: null,
});
```

### 3. Add `handleCommentsExport()` function

Mirror `handleTasksExport` exactly, adapting field names:
- `setExportStates((s) => ({ ...s, comments: "running" }))`
- Read SSE stream; on `progress` → update `commentsExport.progress`; on `comments` → accumulate into array; on `done` → blob download as `comments.json`, set done state
- On error: set `commentsExport.error` and `exportStates.comments = "error"`

### 4. Special-case `comments` in `EXPORT_LEVELS.map()`

Add an `if (key === "comments")` branch before the default return, similar to the `tasks` branch but without input controls (no slice/date params needed — comments always export for all tasks in tasks.json):

```tsx
if (key === "comments") {
  const isRunning = exportStates.comments === "running";
  return (
    <div key="comments" className="py-2 border-b border-slate-100 last:border-0">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
            {label}
            <StateIcon state={exportStates.comments ?? "idle"} />
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
        </div>
        {!isRunning && (
          <button
            onClick={handleCommentsExport}
            disabled={anyRunning}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={11} />
            Export
          </button>
        )}
      </div>
      {isRunning && commentsExport.progress !== null ? (
        <div className="mt-2">
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${Math.round((commentsExport.progress.current / commentsExport.progress.total) * 100)}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate">
            Task {commentsExport.progress.current} of {commentsExport.progress.total}
          </div>
        </div>
      ) : null}
      {exportStates.comments === "done" && commentsExport.done !== null ? (
        <div className="mt-1 text-[11px] text-green-600">{commentsExport.done.count} comments downloaded</div>
      ) : null}
      {commentsExport.error !== null ? (
        <div className="mt-1 text-[11px] text-red-600">{commentsExport.error}</div>
      ) : null}
    </div>
  );
}
```

---

## Notes for Implementation Agent

- The `style={{ width: ... }}` on the progress bar is acceptable — it's a computed percentage that cannot be expressed as a static Tailwind class (same pattern already used in the tasks export progress bar at line 373).
- Zoho API v3 comments endpoint URL: `${BASE}/projects/${projectId}/tasks/${taskId}/comments?page=N&per_page=100`. Same portal base URL as tasks. If the endpoint doesn't paginate (returns no `page_info`), the `has_next_page` check evaluates to falsy and the loop exits after one iteration — safe.
- The 429 retry pattern (read `Retry-After` header, sleep, re-fetch once) should be copied verbatim from the tasks export (lines 69–75 of tasks route). Don't simplify it.
- Do NOT touch the import route (`/api/admin/zoho-import/comments/route.ts`) — it is already correct.
- Do NOT modify `EXPORT_LEVELS` array — just add the `if (key === "comments")` branch in the render loop (after `if (key === "tasks")`).

---

## Verification

1. Start dev server: `pnpm dev`
2. Navigate to `/v2/admin/migrate`
3. Confirm a `tasks.json` exists in `_from_zoho/`
4. Click **Export** on the Comments row
5. Verify: progress bar appears and increments per task, download triggers on completion, file is named `comments.json`
6. Open the downloaded file — confirm comments have `_zoho_task_id` and `_zoho_project_id` fields
7. For a task with many comments: verify count is higher than Zoho's single-page limit (if observable)
