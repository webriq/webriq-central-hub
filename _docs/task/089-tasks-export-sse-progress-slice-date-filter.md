# Task 089 — Tasks Export: SSE Progress, Project Slice & Date Filter

> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Date:** 2026-06-29
> **Status:** TESTING
> **Completed:** 2026-06-29
> **Implementation Notes:** API route converted to SSE ReadableStream — no NextResponse, plain `new Response()` throughout. Client reads stream via `fetch` + `getReader()`, accumulates tasks array in closure, downloads blob on `type:"done"` event. Tasks row extracted from EXPORT_LEVELS.map with `key === "tasks"` branch; other rows unchanged. Progress bar uses `style={{ width: \`${pct}%\` }}` (runtime-computed, Tailwind exception). All TypeScript clean.

---

## Problem

The existing `GET /api/admin/zoho-export/tasks` route fetches all projects sequentially, accumulates
everything in memory, and returns a single blob. With 300+ projects this times out and gives zero
feedback. The user needs:

1. A `from`/`to` project slice so each export call is bounded and safe from timeout
2. A `since` date filter (YYYY-MM-DD) to skip old tasks (e.g. only 2025-present)
3. Projects sorted **newest first** so the most recent active work is exported first
4. Real-time progress bar + current project name in the UI while the export runs

---

## Requirements

### API — `GET /api/admin/zoho-export/tasks`

- **`from`** (integer, default `0`) — start index into the sorted project list
- **`to`** (integer, default all) — exclusive end index
- **`since`** (YYYY-MM-DD string, optional) — skip tasks whose `created_time` is before this date (application-level filter after fetching from Zoho)
- **Sort order** — sort projects by `created_time` descending (newest first) before slicing with `from`/`to`
- **Response format** — change from JSON blob to **Server-Sent Events (SSE)**:
  - `data: {"type":"progress","current":N,"total":M,"project":"Project Name"}`  — one per project processed
  - `data: {"type":"tasks","tasks":[...]}` — one per project that returned tasks (send even if empty so client can track)
  - `data: {"type":"done","total_tasks":N}` — final event when all projects in slice are done
- **Rate limiting** — keep existing 100ms sleep between projects; on 429 apply Retry-After backoff + one retry (same pattern as zoho-sync/tasklists route)

### UI — `src/app/v2/(hub)/admin/migrate/page.tsx`

The Tasks export row needs special handling (all other export rows keep the existing simple flow):

- Inline inputs below the Tasks row label (only visible, not a modal):
  - `From` — small number input (default `0`)
  - `To` — small number input (default blank = all)
  - `Since` — small date input (default `2025-01-01`)
- While running: replace the Export button area with a compact progress bar + `"Project X of Y — {project name}"` text
- On done: trigger browser download of accumulated tasks as `tasks.json`; show done state with task count
- On error: show error message, re-enable the Export button

---

## Notes for Implementation Agent

- **Sonnet required** — new SSE streaming pattern in Next.js App Router, cross-layer (API + UI), non-trivial client-side stream consumption.
- **SSE in Next.js App Router** — use `ReadableStream` + `TextEncoder`. Return `new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } })`. Do NOT use `NextResponse.json()`.
- **Client-side SSE consumption** — do NOT use `EventSource` (it doesn't support custom headers). Use `fetch` + `response.body.getReader()` + `TextDecoder` to read the stream chunk by chunk. Split by `\n\n` to get individual SSE frames, then strip `data: ` prefix and parse JSON.
- **Client accumulates tasks** — maintain a `tasks: unknown[]` array in component state. On each `type:"tasks"` event, push the received array. On `type:"done"`, serialize the accumulated array to a blob and trigger download.
- **Sort projects newest first** — `projects.sort((a, b) => new Date(b.created_time).getTime() - new Date(a.created_time).getTime())` before slicing. The `created_time` field exists on Zoho project objects in projects.json.
- **`since` filter** — after fetching tasks for a project, filter `json.tasks` to only include tasks where `task.created_time >= since`. Zoho returns `created_time` as a timestamp string.
- **Only tasks row is special** — all other export rows (`milestones`, `tasklists`, `comments`, `timelogs`, `attachment-meta`) keep the existing `handleExport` flow unchanged.
- **`anyRunning` lock** — keep the existing `anyRunning` guard so only one operation runs at a time.
- **Inputs default** — `from=0`, `to=""` (blank = all remaining), `since="2025-01-01"`.
- **Progress bar** — use a plain `<div>` with `style={{ width: \`${pct}%\` }}` inside a fixed-height container. Tailwind `style={{}}` exception applies here (runtime-computed percentage). Do not use an external progress component.
- **Total in slice** — the server sends `total` on each progress event. Use the first received `total` to size the progress bar denominator.

---

## File Changes

| Action | File |
|--------|------|
| Modify | `src/app/api/admin/zoho-export/tasks/route.ts` |
| Modify | `src/app/v2/(hub)/admin/migrate/page.tsx` |

---

## Code Context

### Current export route — full file (`src/app/api/admin/zoho-export/tasks/route.ts`)

```ts
const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function GET() {
  // auth check omitted for brevity
  const token = await getZohoAccessToken();
  const { projects } = JSON.parse(fs.readFileSync(projectsFile, "utf-8"));
  const all: unknown[] = [];

  for (const project of projects) {
    const projectId = String(project.id_string ?? project.id);
    let page = 1;
    while (true) {
      const params = new URLSearchParams({ page: String(page), per_page: "100" });
      const res = await fetch(`${BASE}/projects/${projectId}/tasks?${params}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` },
      });
      if (!res.ok) break;
      const json = await res.json() as { tasks?: unknown[]; page_info?: { has_next_page?: boolean } };
      const batch = (json.tasks ?? []).map((t) => ({ ...(t as Record<string, unknown>), _zoho_project_id: projectId }));
      all.push(...batch);
      if (!json.page_info?.has_next_page || batch.length < 100) break;
      page++;
      await sleep(100);
    }
    await sleep(100);
  }

  return new NextResponse(JSON.stringify(all, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="tasks.json"' },
  });
}
```

### SSE response pattern for Next.js App Router

```ts
const encoder = new TextEncoder();
const stream = new ReadableStream({
  async start(controller) {
    const send = (obj: object) =>
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

    for (let i = 0; i < slice.length; i++) {
      const project = slice[i];
      // ... fetch tasks ...
      send({ type: "progress", current: i + 1, total: slice.length, project: project.name });
      send({ type: "tasks", tasks: projectTasks });
      await sleep(100);
    }
    send({ type: "done", total_tasks: totalCount });
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

### Client SSE consumption pattern

```ts
const res = await fetch(`/api/admin/zoho-export/tasks?from=${from}&to=${to}&since=${since}`);
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
    const evt = JSON.parse(frame.slice(6));
    if (evt.type === "progress") { /* update progress state */ }
    if (evt.type === "tasks") accumulated.push(...evt.tasks);
    if (evt.type === "done") { /* trigger download from accumulated */ }
  }
}
```

### Current migrate page tasks export row (lines 143–162, simplified)

```tsx
{EXPORT_LEVELS.map(({ key, label, desc }) => (
  <div key={key} className="flex items-center justify-between gap-4 py-2 border-b ...">
    <div>
      <div className="text-[13px] font-medium">{label} <StateIcon state={exportStates[key]} /></div>
      <div className="text-[11px] text-slate-500">{desc}</div>
    </div>
    <button onClick={() => handleExport(key)} disabled={anyRunning} ...>
      <Download size={11} /> Export
    </button>
  </div>
))}
```

---

## Implementation Steps

1. **Update export route** (`src/app/api/admin/zoho-export/tasks/route.ts`):
   - Parse `from`, `to`, `since` from `request.nextUrl.searchParams`
   - Read + sort projects by `created_time` descending
   - Slice to `projects.slice(fromN, toN || undefined)`
   - Change response to SSE `ReadableStream` (see pattern above)
   - In the per-project loop: paginate tasks, apply `since` date filter on each batch, emit `progress` + `tasks` SSE events per project
   - Add 429 Retry-After handling (one retry) matching pattern in zoho-sync/tasklists route
   - Emit `done` event with total task count after loop

2. **Update migrate page** (`src/app/v2/(hub)/admin/migrate/page.tsx`):
   - Add state for tasks export: `tasksFrom` (string, "0"), `tasksTo` (string, ""), `tasksSince` (string, "2025-01-01"), `tasksProgress` (`{current: number, total: number, project: string} | null`), `tasksDone` (`{count: number} | null`)
   - Replace the tasks row in `EXPORT_LEVELS.map` with a special inline render (check `key === "tasks"` and render differently, or extract tasks row outside the map)
   - Inputs: 3 small inline text inputs (From / To / Since) below the label, only when state is idle or done
   - Export button calls a new `handleTasksExport()` that uses the fetch+ReadableStream SSE consumption pattern
   - While running: show compact progress bar (`<div>` with `style={{ width: \`${pct}%\` }}`) + `"Project {current} of {total} — {name}"` in `text-[11px]` below
   - On done: trigger blob download, show `"{count} tasks downloaded"` message
   - Keep the `anyRunning` guard

---

## Acceptance Criteria

- [ ] `GET /api/admin/zoho-export/tasks?from=0&to=50&since=2025-01-01` returns SSE stream
- [ ] Projects are sorted newest first (most recent `created_time` first)
- [ ] Tasks before `since` date are excluded from the output
- [ ] Progress events fire per project with accurate `current`/`total`
- [ ] UI shows progress bar + current project name while running
- [ ] On complete, `tasks.json` downloads automatically with only the sliced + filtered tasks
- [ ] Other export rows (milestones, tasklists, etc.) are unaffected
- [ ] 429 from Zoho triggers Retry-After wait + one retry before logging error
