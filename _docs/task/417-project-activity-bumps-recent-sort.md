# 417: Project Activity Bumps — Make "Recently accessed" Follow Real Work (Task 416 Follow-up)

**Created:** 2026-10-02
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Task 416 added the per-user "Recently accessed" sort (default on every classification tab and Legacy). It currently measures **opens only**: `RecordProjectView` fires once when the user enters `/projects/{v2,legacy}/[projectId]/**` (throttled 5 min per session). Review question: does working on a project count — modifying/commenting/changing status on a task or ticket, running the timer, logging time? Today **no**, unless the user happened to be inside that project's pages; work done from the cross-project Tasks page, Time Logs page, the header timer widget, or a notification deep link never bumps the project, and activity after the initial open never re-bumps (the layout persists across tab clicks).

Decision: **add activity bumps.** When the signed-in user performs a qualifying write on a task or ticket belonging to a project, that project's `last_accessed_at` for that user is refreshed server-side, so recency follows what the user actually worked on, wherever in the app they did it.

## Requirements

**What counts (qualifying writes, by the acting user)**
- [ ] **Tasks:** create (`POST /api/v2/projects/[projectId]/tasks`), update incl. status/assignee/fields (`PATCH /api/v2/tasks/[taskId]`), create subtask (`POST …/tasks/[taskId]/subtasks`).
- [ ] **Task comments:** post (`POST /api/v2/tasks/[taskId]/comments`) and edit (`PATCH …/comments/[commentId]`, task 411).
- [ ] **Tickets (issues):** create (`POST /api/v2/projects/[projectId]/tickets`), update incl. status (`PATCH /api/v2/tickets/[ticketId]`).
- [ ] **Ticket comments:** post (`POST /api/v2/projects/[projectId]/tickets/[ticketId]/comments`) and edit (`PATCH …/comments/[commentId]`).
- [ ] **Timer:** `POST /api/v2/timer/start` and `POST /api/v2/timer/resume` bump the timer's `project_id` (stop/pause/breaks do not — they don't signal new work on a project; the log produced by stop is covered below).
- [ ] **Time logged:** `POST /api/v2/time-logs`, `POST /api/v2/tasks/[taskId]/time-logs`, `POST /api/v2/tickets/[ticketId]/time-logs`, and the time log written by `POST /api/v2/timer/stop` (bump that log's project). Edits/deletes of existing logs do not bump.
- [ ] Reads, deletes, attachment uploads, assignee-only list views, and admin import routes do **not** bump. (Delete/attachments are listed as deliberate non-goals; revisit only on request.)

**Semantics**
- [ ] A bump sets the acting user's `project_views.last_accessed_at = now()` (upsert; creates the row if the user never opened the project). It does **not** increment `access_count` (that stays "number of opens", still only a tie-breaker). Only the acting user's row changes — assigning a task to someone else does not bump their recency.
- [ ] Server-side throttle inside the SQL function: skip the write if the row was touched in the last 60 s (rapid edits/comments on one project cost one write per minute, not one per request).
- [ ] Best-effort and non-blocking: the bump runs after the response is sent (`after()` from `next/server`), swallows and logs failures, and can never change a route's status code or payload. Works (silently no-ops) before the migration is applied.
- [ ] Deleted projects are never bumped (the open recorder already skips them; the touch function must too).
- [ ] No UI change: label stays "Recently accessed"; the ordering rules from task 416 (viewed first by last access desc, then access_count desc; unviewed after in newest order) are unchanged.

## Out of Scope / Must-Not-Change

- No new sort option, no activity feed, no "last activity by anyone" (global) ordering — still strictly per-user.
- `record_project_view()` and the open recorder from 416 stay as they are.
- Desk Inbox / Desk Tickets workflows (not project-scoped writes), milestones, files, notes, project settings, membership changes: not bumped in this task. (Filing an issue from an Inbox thread that creates a project ticket goes through the ticket-create route — covered only if that route is the one used; verify, do not add new wiring.)
- Zoho import/export routes and any `adminClient` backfill: never bump.
- `access_count` semantics unchanged; no schema change to `project_views` beyond the function below.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/157_touch_project_view.sql` | Create | `touch_project_view(p_project_id uuid)`: `security invoker` SQL fn; skips deleted projects; upsert setting `last_accessed_at = now()` only when the existing row is older than 60 s; never touches `access_count` on update (initial insert uses the table default of 1). Grant to `authenticated`. **Written, not applied.** |
| `src/types/database.ts` | Modify | Add `touch_project_view` to `Functions`. |
| `src/lib/projects/touch-project.ts` | Create | `touchProject(projectId)`, `touchProjectForTask(taskId)`, `touchProjectForTicket(ticketId)`. Each schedules work with `after()`, uses `createClient()` (caller's session/RLS), resolves the project UUID where needed, wraps everything in try/catch + `console.warn`. |
| `src/app/api/v2/projects/[projectId]/tasks/route.ts` (POST) | Modify | `touchProject(project.id)` on success. |
| `src/app/api/v2/tasks/[taskId]/route.ts` (PATCH) | Modify | `touchProjectForTask`. |
| `src/app/api/v2/tasks/[taskId]/subtasks/route.ts` (POST) | Modify | same. |
| `src/app/api/v2/tasks/[taskId]/comments/route.ts` (POST), `…/comments/[commentId]/route.ts` (PATCH) | Modify | same. |
| `src/app/api/v2/projects/[projectId]/tickets/route.ts` (POST) | Modify | `touchProject`. |
| `src/app/api/v2/tickets/[ticketId]/route.ts` (PATCH) | Modify | `touchProjectForTicket`. |
| `src/app/api/v2/projects/[projectId]/tickets/[ticketId]/comments/route.ts` (POST), `…/[commentId]/route.ts` (PATCH) | Modify | same. |
| `src/app/api/v2/timer/start/route.ts`, `timer/resume/route.ts`, `timer/stop/route.ts` | Modify | start/resume → `touchProject(timer.project_id)`; stop → project of the log it writes. |
| `src/app/api/v2/time-logs/route.ts` (POST), `tasks/[taskId]/time-logs/route.ts` (POST), `tickets/[ticketId]/time-logs/route.ts` (POST) | Modify | bump after a successful insert. |
| `_docs/task/416-…md`, `CLAUDE.md` | Modify (docs stage) | Document that recency = opens ∪ qualifying activity. |

## Code Context

### Task 416 pieces being extended

```sql
-- 156: project_views(user_id, project_id, last_accessed_at, access_count), own-row RLS,
--      record_project_view(p_project_id) = upsert + access_count + 1   (opens)
```

```ts
// api/v2/tasks/[taskId]/comments/route.ts (POST) — returns 201 after insert; no project id in scope,
// only taskId → use touchProjectForTask(taskId) which selects tasks.project_id inside after().
```

### Suggested helper shape

```ts
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";

export function touchProject(projectId: string | null | undefined) {
  if (!projectId) return;
  after(async () => {
    try {
      const supabase = await createClient();   // request-scoped cookies are available inside after()
      const { error } = await supabase.rpc("touch_project_view", { p_project_id: projectId });
      if (error) console.warn(`[touch-project] ${error.message}`);
    } catch (e) { console.warn("[touch-project] failed", e); }
  });
}
```

Verify against the installed Next 16 docs (`node_modules/next/dist/docs/`, per AGENTS.md) that `after()` may read `cookies()` in a Route Handler; if not, create the client before scheduling and capture it in the closure. Do not use `adminClient` (must remain the caller's own row via RLS).

### Notes

- Routes hit by the cross-project Tasks page, Time Logs page, header timer widget and notification deep links are the same `/api/v2/*` routes, so bumping server-side covers every entry point (this is the point of the task).
- Legacy and v2 projects share these routes — no per-listing branching.
- Timer `project_id` in the request body is the project **UUID** (see `timer/start`: `tasks … .eq("project_id", projectId)`); no display-id resolution needed there.
- Ensure bump happens only on `res.ok` paths (after the successful insert/update), never on validation or permission failures.

## Implementation Steps

1. Write migration 157 + `database.ts` types.
2. Add `touch-project.ts` (confirm `after()` + cookies behaviour in Next 16 docs).
3. Wire each route above after its success path; keep diffs to one or two lines per route.
4. `npx tsc --noEmit`, `pnpm lint`.
5. Browser/API acceptance after migrations 156 + 157 are applied.

## Acceptance Criteria

- [ ] Commenting on a task/ticket, changing a task/ticket status, creating a task/ticket/subtask, starting/resuming the timer, and logging time each move that project to the top of the acting user's "Recently accessed" list — including when done from the cross-project Tasks page, Time Logs page, or the header timer **without opening the project**.
- [ ] Someone else's assignment/edit does not change the assignee's order; reads, deletes, attachments, log edits/deletes, timer stop/pause/break do not bump (stop's resulting time log does).
- [ ] Repeated actions within 60 s on one project cause at most one write; `access_count` is unchanged by activity.
- [ ] A failing/absent `touch_project_view` (migration unapplied) leaves every route's response identical to today.
- [ ] Deleted projects are not bumped.
- [ ] `tsc` and lint clean; no `adminClient` use.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Apply 156 + 157, then in the browser: from /dashboard/tasks comment on a task of an unopened project -> listing shows it first;
# log time from /dashboard/timelogs on another project -> it moves above; start timer from the header; confirm via SQL that access_count is unchanged by activity.
```

## Compatibility Touchpoints

- New migration 157 (written, not applied) depends on 156; apply both in order.
- Adds a small post-response write to ~13 high-traffic routes; keep them best-effort and cheap (60 s server throttle).
- CLAUDE.md `projects` navigation bullet / task 416 notes should say recency = opens ∪ qualifying activity (docs stage).

## Implementation Notes

### What Changed
- Added `touch_project_view()` (migration 157, **written, not applied**; depends on 156): upserts the acting user's `project_views.last_accessed_at = now()`, skips soft-deleted projects, leaves `access_count` untouched on update, and no-ops if the row was touched < 60 s ago.
- New `src/lib/projects/touch-project.ts` (`touchProject`, `touchProjectForTask`, `touchProjectForTicket`): schedule the RPC in `after()` (post-response), under the caller's own session (confirmed in the Next 16 docs that `cookies()` is readable inside `after()` in Route Handlers), all errors logged and swallowed.
- Wired into 14 routes, each after its success path: task create, task PATCH (skipped when the body is position-only drag reordering), subtask create, task comment create + edit, ticket create, ticket PATCH, ticket comment create + edit, timer start, timer resume, timer stop (only when a time log was written), and the three time-log POSTs (`/time-logs`, task, ticket).

### Files Changed
- `supabase/migrations/157_touch_project_view.sql` (new), `src/types/database.ts` (function type), `src/lib/projects/touch-project.ts` (new).
- `src/app/api/v2/projects/[projectId]/tasks/route.ts`, `…/tickets/route.ts`, `…/tickets/[ticketId]/comments/route.ts`, `…/comments/[commentId]/route.ts`
- `src/app/api/v2/tasks/[taskId]/route.ts`, `…/subtasks/route.ts`, `…/comments/route.ts`, `…/comments/[commentId]/route.ts`, `…/time-logs/route.ts`
- `src/app/api/v2/tickets/[ticketId]/route.ts`, `…/time-logs/route.ts`
- `src/app/api/v2/timer/start/route.ts`, `resume/route.ts` (added `project_id` to its select), `stop/route.ts`
- `src/app/api/v2/time-logs/route.ts`

### Deviations From Plan
- Position-only task PATCH (board reorder) does not bump — a small addition consistent with "cosmetic reordering is not work" (the plan listed "update incl. status/assignee/fields").
- Timer stop bumps only when `hours > 0` and the log insert succeeds (that is when a time log is actually produced).
- Verified-only, not changed: Inbox → ticket filing is not wired separately (plan said verify, not add); it is covered only if it goes through the ticket-create route.

### Verification Run
- `npx tsc --noEmit` - PASS (no errors outside stale `.next` validator entries)
- `eslint src/app/api/v2 src/lib/projects` - PASS
- Browser/API acceptance - SKIPPED (requires migrations 156 + 157 applied and an authenticated session)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Two maintainability fixes applied during the gate: (1) `touch-project.ts` had two copies of the try/catch + RPC call — collapsed into one private `touch(label, resolve)`; (2) the planned `touchProjectForTicket` export was never used (ticket routes already hold `project_id`), so it was removed rather than left as dead code. `touchProjectForTask` is the only id-resolving variant (task-comment routes). `tsc` + ESLint clean after the refactor.
- No blocking issues: each of the 14 call sites runs only on a success path, adds one line, uses the caller's session (no `adminClient`), and cannot change a route's response; the SQL function is `security invoker`, skips deleted projects, throttles at 60 s, and leaves `access_count` alone.
- Accepted observations: first-ever activity on a never-opened project inserts a row with the table default `access_count = 1` (counts as one "visit" for tie-breaking only); a user whose RLS hides a project writes nothing (the function's select returns no row); post-response writes happen on every qualifying request that isn't throttled in SQL (the throttle saves the write, not the RPC round-trip).

### Deviations
- Minor: position-only task PATCH does not bump; timer stop bumps only when a log is written (both documented in Implementation Notes). `touchProjectForTicket` dropped from the planned helper surface (unused).
