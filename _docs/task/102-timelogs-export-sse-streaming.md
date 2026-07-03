# Task 102 — Timelogs Export: SSE Streaming + 429 Handling

> **Priority:** HIGH
> **Type:** patch
> **Recommended Model:** haiku
> **Status:** TESTING
> **Completed:** 2026-07-01
> **Implementation Notes:** SSE stream route and migrate page UI match tasks/comments patterns exactly. TypeScript clean.

---

## Problem

`GET /api/admin/zoho-export/timelogs` has three blockers for large datasets:

1. **Blocking response** — accumulates all timelogs into `const all: unknown[]` and returns a single `NextResponse` at the end. For 250 projects with heavy timelog history this runs 10–30+ minutes before responding. The browser and Next.js proxy will timeout before completion.
2. **No 429 handling** — on rate limit the loop does `if (!res.ok) break`, silently dropping all remaining pages for that project. Silent data loss.
3. **No progress visibility** — the UI uses `handleExport("timelogs")` which calls `fetch().blob()` and appears frozen until done or errored.

---

## Goal

- Convert the export to an **SSE stream** (same pattern as tasks export)
- Add **429 retry** inside the pagination loop (same pattern as tasks export)
- Add `handleTimelogsExport()` SSE consumer in the migrate page with a progress bar per project
- Special-case the `timelogs` card in `EXPORT_LEVELS.map()` (same pattern as `tasks` and `comments`)

---

## File Changes

| File | Change |
|------|--------|
| `src/app/api/admin/zoho-export/timelogs/route.ts` | Rewrite: SSE stream + 429 retry |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | Add `TimelogsExportState`, `handleTimelogsExport()`, special-case `timelogs` in export map |

---

## Code Context

### Current timelogs export (full file — to be replaced)

`src/app/api/admin/zoho-export/timelogs/route.ts`:
```ts
// dev-only export endpoint — fetches time logs for every project.
import { NextResponse } from "next/server";
// ...auth + token checks...

const { projects } = JSON.parse(fs.readFileSync(projectsFile, "utf-8")) as { projects: Array<Record<string, unknown>> };
const all: unknown[] = [];

for (const project of projects) {
  const projectId = String(project.id_string ?? project.id);
  let page = 1;

  while (true) {
    const params = new URLSearchParams({ page: String(page), per_page: "100" });
    const res = await fetch(`${BASE}/projects/${projectId}/timelogs?${params}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });

    if (!res.ok) break;  // ← silently drops on 429

    const json = await res.json() as { time_logs?: Array<{ log_details?: unknown[] }>; page_info?: { has_next_page?: boolean } };
    const logDetails = (json.time_logs ?? []).flatMap((day) =>
      (day.log_details ?? []).map((entry) => ({
        ...(entry as Record<string, unknown>),
        _zoho_project_id: projectId,
      }))
    );
    all.push(...logDetails);

    if (!json.page_info?.has_next_page) break;
    page++;
    await sleep(100);
  }

  await sleep(100);
}

return new NextResponse(JSON.stringify(all, null, 2), {  // ← blocking, will timeout
  headers: { "Content-Type": "application/json", "Content-Disposition": '...' },
});
```

### Tasks export — SSE + 429 pattern to follow exactly

`src/app/api/admin/zoho-export/tasks/route.ts` (key shape):
```ts
const encoder = new TextEncoder();
const stream = new ReadableStream({
  async start(controller) {
    const send = (obj: object) =>
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

    for (let i = 0; i < slice.length; i++) {
      const project = slice[i];
      const projectId = String(project.id_string ?? project.id);
      const projectName = String(project.name ?? projectId);
      let page = 1;

      while (true) {
        const qp = new URLSearchParams({ page: String(page), per_page: "100" });
        let res = await fetch(`${BASE}/projects/${projectId}/tasks?${qp}`, {
          headers: { Authorization: `Zoho-oauthtoken ${token}` },
        });

        // 429: wait Retry-After then one retry
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10);
          await sleep(retryAfter * 1000);
          res = await fetch(`${BASE}/projects/${projectId}/tasks?${qp}`, {
            headers: { Authorization: `Zoho-oauthtoken ${token}` },
          });
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

### Comments export UI handler — model for handleTimelogsExport

`src/app/v2/(hub)/admin/migrate/page.tsx` — `handleCommentsExport()` (added in task 101):
```ts
async function handleCommentsExport() {
  if (anyRunning) return;
  setAnyRunning(true);
  setExportStates((s) => ({ ...s, comments: "running" }));
  setCommentsExport({ progress: null, done: null, error: null });

  try {
    const res = await fetch("/api/admin/zoho-export/comments");
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
        const evt = JSON.parse(frame.slice(6)) as { type: string; ... };

        if (evt.type === "progress") {
          setCommentsExport((s) => ({ ...s, progress: { current: evt.current!, total: evt.total!, taskId: evt.taskId! } }));
        }
        if (evt.type === "comments" && evt.comments) {
          accumulated.push(...evt.comments);
        }
        if (evt.type === "done") {
          // create Blob → <a>.click() → download
          setCommentsExport((s) => ({ ...s, done: { count: evt.total_comments! }, progress: null }));
          setExportStates((s) => ({ ...s, comments: "done" }));
        }
      }
    }
  } catch (e) {
    setCommentsExport((s) => ({ ...s, error: String(e), progress: null }));
    setExportStates((s) => ({ ...s, comments: "error" }));
  } finally {
    setAnyRunning(false);
  }
}
```

### Comments special-case UI card — model for timelogs card

`src/app/v2/(hub)/admin/migrate/page.tsx` — `if (key === "comments")` block:
- Progress bar using `style={{ width: \`${pct}%\` }}`
- "Task N of M" label while running
- "N comments downloaded" on done
- Error text on error
- Button hidden while running

---

## Implementation Steps

### 1. Rewrite `src/app/api/admin/zoho-export/timelogs/route.ts`

Remove `NextResponse` import. Convert to `ReadableStream` SSE following the tasks export pattern exactly:

**SSE events:**
```ts
{ type: "progress", current: i + 1, total: projects.length, project: projectName }
{ type: "timelogs", logs: logDetails }   // batch per project (may be empty)
{ type: "done", total_logs: totalLogs }  // final event
```

**Key differences from tasks export:**
- No `from`/`to`/`since` query params (export all projects)
- Response field is `json.time_logs` (not `json.tasks`) — nested as `time_logs[].log_details[]`
- Flatten with: `(json.time_logs ?? []).flatMap((day) => (day.log_details ?? []).map(entry => ({ ...entry, _zoho_project_id: projectId })))`
- 429 retry is identical — copy verbatim from tasks export
- `sleep(100)` between pages, `sleep(100)` between projects (same as tasks)

**Response headers:** `text/event-stream`, `no-cache`, `keep-alive`

### 2. Add `TimelogsExportState` interface to migrate page

After `CommentsExportState` (added in task 101):
```ts
interface TimelogsExportState {
  progress: { current: number; total: number; project: string } | null;
  done: { count: number } | null;
  error: string | null;
}
```

Add state:
```ts
const [timelogsExport, setTimelogsExport] = useState<TimelogsExportState>({
  progress: null,
  done: null,
  error: null,
});
```

### 3. Add `handleTimelogsExport()` function

After `handleCommentsExport()`. Mirror it exactly, adapting field names:
- Fetch `/api/admin/zoho-export/timelogs`
- On `progress` → update `timelogsExport.progress` with `{ current, total, project }`
- On `timelogs` → `accumulated.push(...evt.logs)`
- On `done` → blob download as `timelogs.json`, set `done: { count: evt.total_logs! }`, set `exportStates.timelogs = "done"`
- On error → set `timelogsExport.error`, `exportStates.timelogs = "error"`

### 4. Special-case `timelogs` in `EXPORT_LEVELS.map()`

Add `if (key === "timelogs")` branch after `if (key === "comments")`. No input controls needed (export all projects). Progress label: `"Project {current} of {total} — {project}"` (matches tasks export label).

Download filename: `"timelogs.json"`

Done label: `"{count} logs downloaded"`

---

## Notes for Implementation Agent

- The timelogs API response is nested: `time_logs[].log_details[]` — the flatMap must be preserved exactly as in the current route, just moved inside the SSE stream.
- The `rawBatch.length < 100` early-exit guard used in the tasks export is NOT needed here because timelogs pagination is per-day group, not a flat array — use only `!json.page_info?.has_next_page` to break.
- `style={{ width: \`${pct}%\` }}` on the progress bar is acceptable (computed percentage, same pattern as tasks and comments cards already in the file).
- Do NOT add `from`/`to` slice controls — timelogs export always runs for all projects. Keep the UI card simple (no inputs, just button + progress).
- The `accumulated` array in the UI handler holds ALL logs across all 250 projects before download — this is fine for a one-time migration tool running in a dev context.

---

## Verification

1. Start dev server: `pnpm dev`
2. Navigate to `/v2/admin/migrate`
3. Click **Export** on the Time Logs row
4. Verify: progress bar appears and shows project name + count incrementing
5. Verify: download triggers as `timelogs.json` on completion
6. Open file — confirm entries have `_zoho_project_id`, `owner`, `module_detail`, `billing_status`, `log_hour`, `date`
