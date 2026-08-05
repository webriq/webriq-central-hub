# 214: Task Detail — "Time Logs" Tab (Check, Edit, Add Manual Entries)

**Created:** 2026-08-05
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Add a third "Time Logs" tab to the task detail page's tab panel (currently Attachments/Comments,
task 211/213), similar to Zoho's "Log Hours" tab (reference screenshot). It lists every time-log
entry recorded against the task, grouped by date with a daily-hours subtotal, lets a developer
add a manual entry (for time they forgot to track with Start Timer) and edit/delete their own
past entries. This is a manual-entry safety net alongside the existing `TaskTimerButton` —
it does not replace or touch the timer.

**Decisions confirmed with the user before planning (do not re-litigate during implementation):**

1. **Visibility/edit scope — "All task logs, self-edit only."** Every viewer with access to the
   task sees every entry logged against it by any user (matches the reference screenshot), but a
   developer can only add/edit/delete their **own** entries. PM/admin/hr stay read-only, matching
   what they already have. This requires a new RLS migration (see below) — the current
   `time_logs_developer_own` policy (migration 026) only lets a developer see their own rows.
2. **No billing-type field.** `time_logs.billable` exists but the manual-add form does not expose
   it. New rows are inserted with `billable: false`, same default the timer's auto-insert
   (`api/v2/timer/stop/route.ts`) already uses.

## Requirements

- [ ] New DB migration granting developers read access to **all** `time_logs` rows (not just
      their own), so the tab can show everyone's entries on a shared task.
- [ ] `GET /api/v2/tasks/[taskId]/time-logs` — list every entry for the task, newest date first,
      with a resolved display name per entry and a `can_edit` flag for the current user.
- [ ] `POST /api/v2/tasks/[taskId]/time-logs` — developer-only, assignee-of-task-only, creates a
      manual entry (`source: "manual"`, `billable: false`).
- [ ] `PATCH /api/v2/tasks/[taskId]/time-logs/[timeLogId]` — owner-only, edits `date_logged`,
      `hours`, `note`.
- [ ] `DELETE /api/v2/tasks/[taskId]/time-logs/[timeLogId]` — owner-only.
- [ ] New "Time Logs" tab added to the existing Attachments/Comments pill-tab panel on the task
      detail page, following its established keep-all-tabs-mounted pattern (task 213).
- [ ] Tab content: total-hours summary, entries grouped by `date_logged` (desc) with a per-day
      subtotal, avatar + hours + note + relative timestamp per entry, edit/delete affordance
      shown only on the current user's own entries, "Add Time Log" control, empty state, loading
      skeleton.
- [ ] Visual language matches `_final_design/guide/central-hub-design-system.md` tokens, using
      the same inline-hex convention already in every sibling file in this directory (no
      `dark:`/`bg-background` classes — see CLAUDE.md's UI Polish Conventions).
- [ ] Every new/modified file respects `nextjs-file-length-best-practices.md` — split the tab
      body and the add/edit form into separate files rather than growing one large component.

## Out of Scope / Must-Not-Change

- The `TaskTimerButton` / `active_timers` / `TimerContext` flow — untouched. This tab is the
  manual-entry fallback next to it, not a replacement.
- No "Start Timer" control is added inside this tab — the existing timer entry points
  (project task list rows, floating widget) are unchanged.
- No Billable/Non-Billable toggle in the add/edit form (confirmed with user — see Decision 2).
- No start/end "Time Period" (clock-in/clock-out) fields — the reference screenshot shows one,
  but `time_logs` has no columns for it and adding one is unrequested schema growth. Manual
  entries capture `date_logged` + decimal `hours` only, same granularity as the existing
  `estimate_hours` field elsewhere on this page.
- Do not touch `time_logs_manager_read` or `time_logs_developer_own` (migration 026/048) —
  add a new, additive SELECT policy instead of editing theirs, so PM/admin/hr read-all and
  developer own-row-write behavior are provably unchanged.
- No changes to Zoho import/export routes that also write `time_logs`
  (`zoho-export/timelogs`, `zoho-import/timelogs`, `zoho-export/issue-timelogs`,
  `zoho-import/issue-timelogs`) — imported rows must keep displaying correctly (they carry
  `owner_name`/`owner_email` instead of a resolvable `employee_id`).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/094_time_logs_developer_read_all.sql` | Create | Additive RLS SELECT policy: developer role reads all `time_logs` rows, not just their own |
| `src/app/api/v2/tasks/[taskId]/time-logs/route.ts` | Create | GET (list, name-resolved) + POST (manual add, developer+assignee only) |
| `src/app/api/v2/tasks/[taskId]/time-logs/[timeLogId]/route.ts` | Create | PATCH (edit own) + DELETE (delete own) |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-time-logs.tsx` | Create | Tab body — fetch, group by date, render list/summary/empty/loading states |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_time-log-form.tsx` | Create | Shared inline add/edit form (date, hours, note) |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` | Modify | Add `"timelogs"` to `PanelTab`, third pill button, mount `TaskTimeLogs` |
| `src/types/database.ts` | No change expected | `time_logs` Row/Insert/Update types already cover every field this feature needs |

## Code Context

### Current `time_logs` RLS (migration 026, unchanged by this task — only additive)

```sql
create policy "time_logs_manager_read"
  on time_logs for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'hr'));   -- widened to include super_admin in 048

create policy "time_logs_developer_own"
  on time_logs for all to authenticated
  using (get_my_role() = 'developer' and employee_id = auth.uid())
  with check (get_my_role() = 'developer' and employee_id = auth.uid());
```

New migration to add (permissive policies OR together — this does not loosen writes, which
stay governed by `time_logs_developer_own`'s own USING/WITH CHECK):

```sql
-- Migration 094: time_logs — developer read-all (Task Detail "Time Logs" tab, task 214)
-- time_logs_developer_own (migration 026) only lets a developer see their OWN rows. The new
-- Time Logs tab needs to show every entry logged against a task (like task_comments_staff_read,
-- migration 048, does for comments) so a developer can see teammates' logged hours on a shared
-- task. Write access is untouched — still own-row only, via time_logs_developer_own.
create policy "time_logs_developer_read_all"
  on time_logs for select to authenticated
  using (get_my_role() = 'developer');
```

### `time_logs` table shape (`src/types/database.ts:1307-1381`)

```ts
time_logs: {
  Row: {
    id: string; task_id: string | null; issue_id: string | null; project_id: string;
    employee_id: string | null; date_logged: string; hours: number; billable: boolean;
    note: string | null; source: "timer" | "manual"; timesheet_id: string | null;
    external_id: string | null; owner_name: string | null; owner_email: string | null;
    created_at: string;
  };
  // Insert/Update mirror Row with everything but task/project/date/hours optional-or-required
  // as expected; see full type at the file/line above.
}
```

### Precedent: `api/v2/timer/start/route.ts` — role + assignee gate to copy for POST

```ts
const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
if (profile?.role !== "developer") {
  return NextResponse.json({ error: "Only developers can start a task timer" }, { status: 403 });
}
// ...
const { data: task } = await supabase.from("tasks").select("id, assignees, project_id").eq("id", taskId).maybeSingle();
if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
if (!task.assignees?.includes(user.id)) {
  return NextResponse.json({ error: "You must be assigned to this task to time it" }, { status: 403 });
}
```
Mirror this exact gate in the new POST route (message: `"You must be assigned to this task to log time"`),
reading `project_id` off the fetched `task` row instead of taking it from the client body.

### Precedent: `api/v2/tasks/[taskId]/comments/route.ts` — name resolution + list/create shape

Use the same `authorIds` batch-fetch-then-`Map` pattern for `employee_id → profiles.full_name`,
falling back to the row's own `owner_name`/`owner_email` (populated on Zoho-imported rows,
which have no `employee_id`) exactly like `resolveAuthorName()` falls back to
`author_name`/`author_email`.

### Precedent: `_task-attachments-comments-panel.tsx` (full current file, 53 lines) — tab shell to extend

```tsx
type PanelTab = "attachments" | "comments";

export function TaskAttachmentsCommentsPanel({ projectId, taskId }: { projectId: string; taskId: string }) {
  const [tab, setTab] = useState<PanelTab>("attachments");
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] overflow-hidden">
      <div className="flex items-center px-[18px] py-3 border-b border-[#EDF0F7]">
        <div className="flex items-center gap-1 bg-[#F4F6FB] rounded-full p-1">
          {(["attachments", "comments"] as const).map((t) => ( /* pill button */ ))}
        </div>
      </div>
      <div className="p-[18px]">
        <div className={cn(tab !== "attachments" && "hidden")}><TaskAttachments projectId={projectId} taskId={taskId} /></div>
        <div className={cn(tab !== "comments" && "hidden")}><TaskComments taskId={taskId} /></div>
      </div>
    </div>
  );
}
```
Add `"timelogs"` to the tuple, add a third pill labeled `"Time Logs"`, add a third
`<div className={cn(tab !== "timelogs" && "hidden")}><TaskTimeLogs taskId={taskId} /></div>`.
Keep the "stay mounted, toggle `hidden`" approach — task 213 established this specifically so
switching tabs doesn't refetch/remount.

### `OwnerChip` (`../../../_pm-shared.tsx:257`) — avatar to reuse

```tsx
export function OwnerChip({ name }: { name: string }) { /* initials circle, AVATAR_COLORS[name.charCodeAt(0) % ...] */ }
```

### Design tokens (`_final_design/guide/central-hub-design-system.md`) — already match this directory's inline hex

```
--blue: #007BFF   --ink: #0B1533   --muted: #5F6A88   --line: #E2E7F2   --bg: #F4F6FB
```
No new tokens needed — reuse the exact hex values already used throughout `_task-comments.tsx` /
`_task-detail.tsx` (do not introduce `dark:` or CSS-variable classes; see CLAUDE.md).

## Implementation Steps

1. Write and note migration `094_time_logs_developer_read_all.sql` (SQL only — do not attempt to
   apply/run it; the user runs migrations).
2. Build `GET`/`POST` in `api/v2/tasks/[taskId]/time-logs/route.ts`, modeled on the comments
   route's name-resolution pattern and the timer/start route's role+assignee gate.
3. Build `PATCH`/`DELETE` in `api/v2/tasks/[taskId]/time-logs/[timeLogId]/route.ts` — fetch the
   row first, 403 if `employee_id !== user.id`, else validate and mutate.
4. Build `_time-log-form.tsx` — controlled `date`/`hours`/`note` inputs (decimal hours, `step="0.5"`,
   matching the sidebar's existing `estimate_hours` input at `_task-detail.tsx:260-277`), Save/Cancel,
   inline `useState` error text (no toast — none of this codebase's forms use one), shared by both
   add and edit flows via an `initial` prop.
5. Build `_task-time-logs.tsx` — fetch on mount, group by `date_logged`, render total-hours
   summary line, per-day sections with subtotal headers, per-entry rows (`OwnerChip`, hours, note,
   `formatRelativeTime(created_at)`, edit/trash icons gated on `can_edit`), empty state (icon + "No
   time logged yet" + "+ Add Time Log" primary action per CLAUDE.md's UI Polish Conventions),
   loading skeleton matching `_task-comments.tsx`'s pulsing-bar pattern.
6. Wire delete behind a `confirm()` (matches `_task-detail.tsx`'s existing task-delete pattern —
   no confirmation modal component exists in this codebase yet).
7. Extend `_task-attachments-comments-panel.tsx`: add `"timelogs"` to `PanelTab`, add the third
   pill button labeled "Time Logs", mount `<TaskTimeLogs taskId={taskId} />` in a third
   hidden-toggled `div`.
8. Run `npx tsc --noEmit` and `pnpm lint`; browser-verify: view as a developer assigned to a task
   (add/edit/delete own entry, see a teammate's entry read-only), and as PM/admin (see all
   entries, no add/edit/delete controls rendered at all).

## Acceptance Criteria

- [ ] "Time Logs" tab appears alongside Attachments/Comments on the task detail page, same pill
      switcher, same keep-mounted behavior (no refetch on tab-switch-back).
- [ ] Every user who can view the task sees every time-log entry logged against it, grouped by
      date with a correct per-day and overall total.
- [ ] A developer assigned to the task can add a manual entry (date + hours + optional note);
      it appears immediately without a full page reload.
- [ ] A developer can edit or delete only their own entries; another user's entries render
      without edit/delete controls.
- [ ] PM/admin/hr can view the full log list but see no add/edit/delete controls anywhere in
      the tab.
- [ ] A developer who is not assigned to the task gets a 403 from `POST`, matching the timer's
      existing assignee gate.
- [ ] Zoho-imported rows (no `employee_id`, only `owner_name`/`owner_email`) still render a
      correct display name and are not editable by anyone in this UI.
- [ ] No `dark:`/`bg-background` classes introduced; every new file stays within the file-length
      guidance (split further if a file is trending past ~250 lines).

## Verification

```bash
npx tsc --noEmit
pnpm lint
```
Manual/browser: sign in as a developer, open a task assigned to them, add a time log, confirm it
appears grouped under today's date with correct total; edit it, delete it; sign in as PM/admin
and confirm the same task's Time Logs tab is read-only and shows the same entries.

## Compatibility Touchpoints

- New migration must be applied by the user (never auto-run per CLAUDE.md's git/migration
  conventions) before the new read policy takes effect — until then, developers will only see
  their own entries (a graceful degrade, not a crash).
- Does not affect the MCP tool inventory (`_docs/mcp-tools.md`) — no new `server.registerTool`
  calls.
- Does not affect Zoho export/import routes or their throttling/retry helpers.

## Implementation Notes

### What Changed
- Added migration 094: additive `time_logs_developer_read_all` SELECT policy so any developer
  can read every `time_logs` row (write access stays own-row only via the pre-existing
  `time_logs_developer_own` policy).
- Added `GET`/`POST` at `api/v2/tasks/[taskId]/time-logs` — GET returns `{ entries, canAdd }`
  (name-resolved, `can_edit` computed per row); POST is gated to `role === 'developer'` and
  `task.assignees.includes(user.id)`, mirroring `timer/start/route.ts`'s exact gate.
- Added `PATCH`/`DELETE` at `api/v2/tasks/[taskId]/time-logs/[timeLogId]` — both explicitly
  verify `employee_id === user.id` before mutating, returning 403 otherwise.
- Added `_time-log-form.tsx` — shared inline add/edit form (date, decimal hours, optional note),
  switched by an `initial` prop, following `_comment-editor.tsx`'s reuse pattern.
- Added `_task-time-logs.tsx` — tab body: fetch on mount, group entries by `date_logged` with
  per-day and overall totals, loading skeleton, empty state (icon + message + "+ Add Time Log"),
  per-entry edit/delete icons gated on `can_edit`, "Add Time Log" button gated on `canAdd`.
- Modified `_task-attachments-comments-panel.tsx` — added `"timelogs"` to `PanelTab`, a
  `TAB_LABEL` map (small refactor to keep the label switch readable at three tabs instead of a
  ternary), and a third keep-mounted `hidden`-toggled pane rendering `TaskTimeLogs`.

### Files Changed
- `supabase/migrations/094_time_logs_developer_read_all.sql` - new additive RLS read policy
- `src/app/api/v2/tasks/[taskId]/time-logs/route.ts` - list + create manual entries
- `src/app/api/v2/tasks/[taskId]/time-logs/[timeLogId]/route.ts` - edit/delete own entries
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_time-log-form.tsx` - shared add/edit form
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-time-logs.tsx` - tab body
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` - third tab wiring

### Deviations From Plan
- GET's response shape is `{ entries, canAdd }` rather than a bare array (unlike the sibling
  comments/attachments GETs) — needed so the client can hide the "Add Time Log" control entirely
  for non-developers/non-assignees per the acceptance criteria, without a second round-trip or
  prop-drilling `currentUserRole`/`currentUserId` into this subtree (neither is currently passed
  down to sibling tab components). Documented inline in the route file.
- No realtime subscription was added for this tab (unlike Comments/Attachments post-task-213) —
  not requested, and left as a natural, separately-scoped follow-up rather than silently expanding
  this task's surface.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (no output/warnings)
- Browser/manual verification - SKIPPED (not run in this session; recommend testing as both a
  developer assigned to a task and as PM/admin before shipping, per the task doc's Verification
  section)
