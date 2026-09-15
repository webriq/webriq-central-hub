# 364: Rename "Issue" → "Ticket" Everywhere (Code + Routes + UI) + Desk Inbox "File a Ticket" Button

**Created:** 2026-09-14
**Priority:** HIGH
**Type:** refactor
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

The Hub currently has two unrelated things both partly named "ticket"/"issue," and task 363
already started disambiguating them:

- **`tickets` (DB table)** — Desk helpdesk emails. UI-labeled **"Inbox"** (task 363).
- **`issues` (DB table)** — per-project bug/work tracking. UI-labeled **"Issues"** today, on the
  project detail tab strip and everywhere else in code (`Issue` type, `CreateIssueModal`,
  `_issue-list-view.tsx`, etc.). Task 363's own new Desk **"Tickets"** tab already surfaces
  `issues` rows under the word "Ticket" — so today the word "Ticket" ambiguously means two
  different things depending on where you are (Desk vs. a project).

This task finishes the disambiguation: every user-facing and code-level "Issue" becomes "Ticket."
After this task, "Ticket" means exactly one thing everywhere: a project work-item (what's
currently called an Issue). The Desk "Tickets" tab (task 363) already uses this vocabulary
correctly and needs no conceptual change — just updated links once the project route moves.

### Decisions locked in during planning (see chat)

- **The `issues` DB table keeps its name.** `tickets` is already taken by the Desk email table.
  Renaming `issues` → `tickets` would collide; renaming the *other* table instead (to free up the
  name) was explicitly rejected as a much bigger, higher-risk change for a purely internal,
  never-user-visible identifier. So: **`issues` (table), `issue_comments` (table),
  `time_logs.issue_id` (column), `issues.assignee_id`/`.assignees`/etc. (columns), the
  `issues_staff_read`/`issues_pm_write`/`issues_developer_update`/`issues_developer_delete` RLS
  policy names — none of these change.** Only application-layer things change: TypeScript
  types/components/functions, route URLs, and UI copy.
- **New display ID marker: `-TKT####`** (e.g. `BDD824C501-TKT0001`), replacing the current
  `-I####` marker (e.g. `BDD824C501-I0001`). Needed because `tasks.display_id` already uses
  `-T####` in the *same* project — reusing that exact marker for the renamed Issues would make a
  Task and a Ticket display-ID-identical. `-TKT####` reads clearly as "ticket" and can't collide.
- **The route URL changes too**, not just the label: `/projects/{v2,legacy}/[projectId]/issues`
  (and nested `/issues/[issueId]`) become `/projects/{v2,legacy}/[projectId]/tickets` (and
  `/tickets/[ticketId]`). Bigger blast radius than a label-only change, but matches "no more Issue
  anywhere" end-to-end, including URLs a PM might bookmark or share.

## Requirements

- [ ] No `issues.display_id` value still ends in `-I####` after this task — new inserts get
      `-TKT####` via an updated trigger, and every existing row is backfilled in place (same
      numeric suffix, new marker).
- [ ] `/projects/v2/[projectId]/issues` and `/projects/legacy/[projectId]/issues` (both the
      `(tabs)/issues` list route and the `issues/[issueId]` detail route) move to `.../tickets`
      and `.../tickets/[ticketId]`. Every internal link generator (project detail tab strip, Desk
      Tickets tab's "Project" link, dashboards, `_task-issue-picker` results, breadcrumbs, etc.)
      points at the new path. The `[ticketId]` param continues to be `issues.display_id`, exactly
      as `[issueId]` was — only the segment name and the URL prefix change, not what value routes
      it (per the CLAUDE.md-documented exception already in place for this route).
- [ ] `/api/v2/issues/[issueId]/**` and `/api/v2/projects/[projectId]/issues/**` move to
      `/api/v2/tickets/[ticketId]/**` and `/api/v2/projects/[projectId]/tickets/**`. Every
      `fetch()` call site across the app is updated to the new path.
- [ ] Every shared component/type/function with "Issue" in its name is renamed to "Ticket": the
      `Issue` type alias, `IssueSeverity`, `CreateIssueModal`, `_issue-list-view.tsx` /
      `_issue-board-view.tsx` / `_issue-calendar-view.tsx` and their default exports, the
      `issues/[issueId]/_issue-*.tsx` component family (attachments, comments, comment editor,
      detail, quick-access panel, time logs) under both `projects/v2` and `projects/legacy`,
      `src/lib/issues/permissions.ts` (`getIssueEditPermission` → `getTicketEditPermission`,
      `issueAssigneeIds` → `ticketAssigneeIds`) and `src/lib/issues/assignee-sync.ts`
      (`buildIssueAssigneeSync` → `buildTicketAssigneeSync`) — directory renamed to
      `src/lib/tickets/`. See the full renaming dictionary in Code Context.
- [ ] Every visible UI string says "Ticket," never "Issue": the project detail tab strip label,
      the Desk sidebar (already correct — "Tickets," unaffected), empty states, button labels
      ("New Issue" → "New Ticket," "File an Issue" → "File a Ticket" — see the Inbox button
      requirement below), the Add/Edit Time Log picker ("Select Tasks/Issues" →
      "Select Tasks/Tickets," its "Issues" sub-tab → "Tickets"), toasts ("Issue created" →
      "Ticket created"), and any column header, filter label, or tooltip.
- [ ] `IssueSeverity`/severity vocabulary (`Show stopper`/`Critical`/`Major`/`Minor`/`None`) is
      unchanged — it's Zoho's own severity vocabulary (migration 051), unrelated to the word
      "Issue," and stays exactly as-is (only the *type name* `IssueSeverity` → `TicketSeverity`
      changes, not its values).
- [ ] On a Desk Inbox thread message (customer-authored), the kebab (⋮) action menu is replaced
      by a single, always-visible **"File a ticket"** button — no menu, no "Create Task" option
      (removed entirely, not just hidden). Clicking it opens the same project-picker →
      Create-Ticket-modal flow that "File an Issue" opened today, just relabeled and reached
      directly.
- [ ] The new Desk > Tickets tab (task 363) itself still works end-to-end once the project route
      moves: its "Origin ticket" and "Project" links, its `source_ticket_id`-stamping insert path,
      and its `PATCH` calls all point at the renamed API routes.
- [ ] Zoho's own naming is left alone where it describes *Zoho's* concept, not the Hub's: Zoho
      import/export routes (`zoho-import/issues`, `zoho-export/issue-comments`, etc.),
      `issues.prefix` (Zoho's own imported ID format, e.g. `"TC3-I1"`), and any comment describing
      what Zoho itself calls a field stay exactly as they are — see Out of Scope.

## Out of Scope / Must-Not-Change

- **The `issues` and `issue_comments` DB table names, and every column name on them**
  (`assignee_id`, `assignees`, `severity`, `flag`, `source_ticket_id`, etc.) — locked-in decision
  above. `time_logs.issue_id` also keeps its name (renaming it would touch the timer/timesheet
  code path for no UI benefit — nothing here is ever shown to a user).
- **RLS policy names** (`issues_staff_read`, `issues_pm_write`, `issues_developer_update`,
  `issues_developer_delete`) — internal Postgres identifiers, never surfaced, not worth the extra
  migration risk.
- **`issues.prefix`** — Zoho's own imported issue-ID format (e.g. `"TC3-I1"`). This is a
  *different* column from `display_id` and must not be touched, backfilled, or reasoned about as
  part of the marker-format change — it's historical Zoho data, not a Hub-generated ID.
- **Zoho import/export routes and their internal naming**: `api/admin/zoho-export/issues`,
  `api/admin/zoho-export/issue-comments`, `api/admin/zoho-export/issue-timelogs`,
  `api/admin/zoho-export/issue-attachment-meta`, `api/admin/zoho-export/issue-comment-attachment-meta`,
  and the matching `zoho-import/*` routes, plus `_from_zoho/issues.json`-style export file names.
  These describe *Zoho's own* "Issues" feature/API by its real name — renaming them to "tickets"
  would misdescribe what they actually import from. Same precedent as task 363 leaving
  `/api/desk/tickets/**` alone. The admin Migrate tab UI labels for these levels are similarly
  left alone (they're describing the Zoho export level, not a Hub-facing concept).
- **`src/app/(hub)/projects-old/**`** (the pre-v2, unlinked-from-nav original Hub implementation —
  no sidebar entry points at it, `V2_ROUTES` fully superseded it) — dead code, not worth the risk
  of touching. **Exception:** `projects-old/_pm-shared.tsx` is still actively imported by *live*
  v2/legacy code (`Issue`, `IssueSeverity`, `STATUS_LABEL`, etc. — confirmed importers include
  `projects/_shared/_issue-list-view.tsx` and `_components/timer-header-widget.tsx`) — its
  Issue-named exports ARE in scope (see Requirements), even though the file itself keeps living
  under `projects-old/`. Moving the file to a shared location is a separate concern, not this task.
- **Severity vocabulary values** (`Show stopper`/`Critical`/`Major`/`Minor`/`None`) — Zoho's own
  terms, unrelated to the Issue→Ticket rename, unchanged.
- **`time_logs`, timer, attachment, and comment CRUD behavior** — only the URLs/identifiers they
  hang off of change; no behavioral change to how time is logged, files are attached, or comments
  are posted.
- **Any change to the Mailbox→Inbox rename already shipped in task 363** — this task builds on
  top of it, doesn't redo it.

## Proposed File Changes

Given the scale (~100+ files touch a renamed identifier), this table groups by category/directory
rather than listing every file — apply the renaming dictionary (Code Context) uniformly within
each group. Directory/file **moves** are listed explicitly since those are the highest-risk
mechanical step; a missed rename inside a moved file surfaces immediately as a `tsc` error.

| Area | Action | Notes |
|------|--------|-------|
| `supabase/migrations/138_ticket_display_id_marker.sql` | Add | Replace `generate_issue_display_id()` → `generate_ticket_display_id()` (new `-TKT####` format), retarget the trigger, backfill existing `issues.display_id` values (`-I(\d+)$` → `-TKT\1`). Written, not applied (repo convention). |
| `src/types/database.ts` | No change | `issues`/`issue_comments` Row/Insert/Update shapes are unchanged — only `display_id` *values* change, not the column's type (still `string \| null`). |
| `src/app/(hub)/projects/v2/[projectId]/(tabs)/issues/**` → `.../(tabs)/tickets/**` | Move (rename dir) | `page.tsx`, `loading.tsx`. |
| `src/app/(hub)/projects/v2/[projectId]/issues/**` → `.../tickets/**` | Move (rename dir) | `[issueId]/` → `[ticketId]/`; `_issue-*.tsx` family → `_ticket-*.tsx` (attachments, attachments-comments-panel, comment-editor, comments, detail, quick-access-panel, time-logs) + `page.tsx`. |
| `src/app/(hub)/projects/legacy/[projectId]/(tabs)/issues/**` → `.../(tabs)/tickets/**` | Move (rename dir) | Same shape as v2. |
| `src/app/(hub)/projects/legacy/[projectId]/issues/**` → `.../tickets/**` | Move (rename dir) | Same shape as v2. |
| `src/app/(hub)/projects/_shared/_issue-list-view.tsx` → `_ticket-list-view.tsx` | Move + rename identifiers | Default export `IssueListView` → `TicketListView`; `IssueSortKey`/`IssueSortDir` → `TicketSortKey`/`TicketSortDir`. |
| `src/app/(hub)/projects/_shared/_issue-board-view.tsx` → `_ticket-board-view.tsx` | Move + rename identifiers | |
| `src/app/(hub)/projects/_shared/_issue-calendar-view.tsx` → `_ticket-calendar-view.tsx` | Move + rename identifiers | |
| `src/app/(hub)/projects/_shared/_create-issue-modal.tsx` → `_create-ticket-modal.tsx` | Move + rename identifiers | `CreateIssueModal` → `CreateTicketModal`; keep the `sourceTicketId` prop name as-is (already correctly named from task 363). |
| `src/app/(hub)/projects/_shared/_project-detail-tab-strip.tsx` | Modify | `DetailTabId`'s `"issues"` member → `"tickets"`; `BASE_TABS` entry `{ id: "tickets", label: "Tickets" }`. |
| `src/app/(hub)/projects/_shared/_project-detail-header.tsx` | Modify | Wherever it branches on `DetailTabId === "issues"`, update to `"tickets"`. |
| `src/app/(hub)/projects/_shared/_project-detail.tsx` (and its `_get-project-detail-data.ts`) | Modify | `issues`/`Issue`-named local variables, `updateIssue`/`addIssue`/`bulkDeleteIssues` callbacks → `updateTicket`/`addTicket`/`bulkDeleteTickets`; still queries the `issues` table (table name unchanged). |
| `src/lib/issues/` → `src/lib/tickets/` | Move (rename dir) | `permissions.ts` (`getIssueEditPermission`→`getTicketEditPermission`, `issueAssigneeIds`→`ticketAssigneeIds`, `IssueEditPermission`→`TicketEditPermission`), `assignee-sync.ts` (`buildIssueAssigneeSync`→`buildTicketAssigneeSync`, `IssueAssigneeSyncColumns`→`TicketAssigneeSyncColumns`). Update every importer. |
| `src/app/(hub)/projects-old/_pm-shared.tsx` | Modify (exports only) | `Issue` → `Ticket` type alias, `IssueSeverity` → `TicketSeverity`, `normalizeSeverity` stays (doesn't mention Issue). File itself stays under `projects-old/` (see Out of Scope). |
| `src/app/api/v2/issues/**` → `src/app/api/v2/tickets/**` | Move (rename dir) | `[issueId]/route.ts` → `[ticketId]/route.ts`, `[issueId]/time-logs/**` → `[ticketId]/time-logs/**`. |
| `src/app/api/v2/projects/[projectId]/issues/**` → `.../projects/[projectId]/tickets/**` | Move (rename dir) | Full subtree: attachments, attachments/sign, attachments/[attachmentId] (+file-url), comments, comments/[commentId] (+attachments, +file-url), comments/description-images, description-images. |
| `src/app/(hub)/dashboard/timelogs/_task-issue-picker.tsx` → `_task-ticket-picker.tsx` | Move + rename identifiers | `TaskIssuePicker`→`TaskTicketPicker`, `TaskIssueValue`→`TaskTicketValue`, `kind: "issue"`→`kind: "ticket"`, "Select Tasks/Issues"→"Select Tasks/Tickets", tab label "Issues"→"Tickets". |
| `src/app/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` | Modify | Update the picker import/prop names to match the rename above. |
| `src/app/api/v2/time-logs/route.ts` | Modify | `entryKind: "task" \| "issue" \| "general"` → `"task" \| "ticket" \| "general"` (internal computed label only, not persisted). |
| `src/app/(hub)/desk/tickets/**` (task 363's files) | Modify | Update every `/projects/v2/${projectId}/issues/...` link to `/projects/v2/${projectId}/tickets/...`; internal "Issue" wording in comments/UI copy → "Ticket" (e.g. "Issue title + display id" comment, "filed issue" phrasing) — the *feature* is unchanged, just its remaining internal Issue-vocabulary. |
| `src/app/(hub)/desk/inbox/[ticketId]/_thread-message-actions.tsx` | Modify | Replace the kebab-menu (`MoreVertical` trigger + popup with "Create Task"/"File an Issue" rows) with a single visible button, label "File a ticket," calling the same modal flow `mode="issue"` used today (rename that internal mode value too — see below). |
| `src/app/(hub)/desk/inbox/[ticketId]/_thread-to-project-modal.tsx` | Modify | Drop the `"task"` mode entirely (no more `CreateTaskModal` import/branch) — the component now only ever does the ticket-filing flow. Rename `mode` prop away or drop it since there's only one mode left; update heading text "File a Ticket from message." |
| `src/app/(hub)/desk/inbox/[ticketId]/_conversation-thread.tsx` | Modify | `<ThreadMessageActions>` still renders for `authorType === "client"` messages — no structural change beyond the button swap inside `ThreadMessageActions` itself. |
| `_docs/mcp-tools.md` (if any registered tool references issues) | Check | Verify no MCP tool scope/description needs updating; none found in initial research, re-check if the implementation stage discovers one. |
| `CLAUDE.md` | Modify (in `document` stage, not here) | The `issues` table bullet, the `issue_comments` bullet, and the task 363 bullet's "Issues tab... planned to be relabeled 'Tickets' in a future task" all need updating once this ships — flagged here, actioned by the `document` stage per the implement→ship chain. |

## Code Context

### Renaming dictionary (apply uniformly)

| Old | New |
|---|---|
| `Issue` (type, `= Database["public"]["Tables"]["issues"]["Row"]`) | `Ticket` |
| `IssueSeverity` | `TicketSeverity` |
| `IssueSortKey` / `IssueSortDir` | `TicketSortKey` / `TicketSortDir` |
| `CreateIssueModal` | `CreateTicketModal` |
| `IssueListView` (default export) | `TicketListView` |
| `IssueEditPermission` | `TicketEditPermission` |
| `getIssueEditPermission` | `getTicketEditPermission` |
| `issueAssigneeIds` | `ticketAssigneeIds` |
| `buildIssueAssigneeSync` | `buildTicketAssigneeSync` |
| `IssueAssigneeSyncColumns` | `TicketAssigneeSyncColumns` |
| `TaskIssuePicker` / `TaskIssueValue` | `TaskTicketPicker` / `TaskTicketValue` |
| `src/lib/issues/` | `src/lib/tickets/` |
| `issues/[issueId]` route segment (project detail) | `tickets/[ticketId]` |
| `/api/v2/issues/**`, `/api/v2/projects/[projectId]/issues/**` | `/api/v2/tickets/**`, `.../projects/[projectId]/tickets/**` |
| `issues.display_id` marker `-I####` | `-TKT####` |
| "New Issue" / "File an Issue" / "Issue created" / "No issues yet" (UI copy) | "New Ticket" / "File a Ticket" / "Ticket created" / "No tickets yet" |
| `issues` DB table, `issue_comments` DB table, `issues.*` columns, `time_logs.issue_id` | **unchanged** |
| `issues.prefix`, Zoho import/export route names | **unchanged** |

### Display ID trigger today (`089_task_issue_display_id.sql`) — what the new migration replaces

```sql
create or replace function generate_issue_display_id() returns trigger as $$
declare
  proj_base text; next_seq int;
begin
  if new.display_id is not null then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.project_id::text || ':issue'));
  select replace(project_id, '-PROJ-', '') into proj_base from projects where id = new.project_id;
  select coalesce(max(substring(display_id from '-I(\d+)$')::int), 0) + 1
  into next_seq from issues where project_id = new.project_id;
  new.display_id := proj_base || '-I' || lpad(next_seq::text, 4, '0');
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_generate_issue_display_id on issues;
create trigger trg_generate_issue_display_id
  before insert on issues for each row execute function generate_issue_display_id();
```

New migration 138 mirrors this exactly but produces `-TKT` instead of `-I` in both the sequence
regex (`'-I(\d+)$'` → `'-TKT(\d+)$'`) and the assembled string (`'-I'` → `'-TKT'`), renames the
function/trigger to `generate_ticket_display_id`/`trg_generate_ticket_display_id`, drops the old
function (`drop function if exists generate_issue_display_id() cascade` after the old trigger is
gone), and backfills:

```sql
update issues
set display_id = regexp_replace(display_id, '-I(\d+)$', '-TKT\1')
where display_id ~ '-I\d+$';
```

The existing `issues_display_id_key` unique constraint needs no change (same column).

### Tab strip → route segment coupling (`_project-detail-tab-strip.tsx`)

```tsx
export type DetailTabId = "overview" | "timeline" | "tasks" | "issues" | "milestones" | ...;
const BASE_TABS: { id: DetailTabId; label: string }[] = [
  { id: "tasks", label: "Tasks" },
  { id: "issues", label: "Issues" },
  ...
];
// elsewhere:
onClick={() => router.push(`${basePath}/${tab.id}`)}
```
`tab.id` IS the URL segment — renaming `"issues"` → `"tickets"` here is what actually moves the
route from the UI's perspective; the physical directory move (Proposed File Changes) is what
makes that URL resolve.

### Desk Inbox thread action — today's kebab menu (`_thread-message-actions.tsx`)

```tsx
<button onClick={toggleMenu} aria-label="Message actions">
  <MoreVertical size={14} />
</button>
{menuPos && (
  <div className="... menu ...">
    <button onClick={() => pick("task")}><ClipboardList .../> Create Task</button>
    <button onClick={() => pick("issue")}><Bug .../> File an Issue</button>
  </div>
)}
{modal && <ThreadToProjectModal mode={modal} ... />}
```
Becomes a single button, no menu state, no `"task"` mode:
```tsx
<button
  onClick={() => setModalOpen(true)}
  className="inline-flex items-center gap-1.5 ... /* ghost/small button per DESIGN.md */"
>
  <Bug size={14} /> File a ticket
</button>
{modalOpen && <ThreadToProjectModal ticketDbId={ticketDbId} subject={subject} message={message} onClose={...} />}
```
`ThreadToProjectModal`'s `mode` prop and its `CreateTaskModal` import/branch are deleted entirely
— it always renders the ticket-filing flow now.

### `Issue` type is the shared `issues` Row alias (`projects-old/_pm-shared.tsx:13`)

```ts
export type Issue = Database["public"]["Tables"]["issues"]["Row"];
```
Becomes `export type Ticket = Database["public"]["Tables"]["issues"]["Row"];` — the DB table name
inside the `Database` type path is unchanged (per the locked-in decision); only the local alias
renames. Every file that does `import type { Issue } from ".../_pm-shared"` needs its import and
usages updated to `Ticket`.

## Implementation Steps

1. **Migration.** Write `138_ticket_display_id_marker.sql` (function/trigger rename + format
   change + backfill), written not applied.
2. **Shared type layer.** `projects-old/_pm-shared.tsx`: `Issue`→`Ticket`, `IssueSeverity`→
   `TicketSeverity`. `tsc` will now surface every consumer that needs updating — work through them
   rather than guessing the full list up front.
3. **`src/lib/issues/` → `src/lib/tickets/`.** Move + rename function/type identifiers. Update
   every importer (API routes, `_project-detail.tsx`, ticket list/board/calendar views).
4. **Shared ticket components.** Move + rename `_issue-list-view.tsx`, `_issue-board-view.tsx`,
   `_issue-calendar-view.tsx`, `_create-issue-modal.tsx` under `projects/_shared/`. Update their
   internal identifiers per the dictionary and every importer.
5. **Tab strip + detail shell.** `_project-detail-tab-strip.tsx`'s `DetailTabId`/`BASE_TABS`,
   `_project-detail-header.tsx`, `_project-detail.tsx`'s `updateIssue`/`addIssue`/
   `bulkDeleteIssues` callbacks.
6. **Route moves — v2.** `projects/v2/[projectId]/(tabs)/issues` → `.../tickets`;
   `projects/v2/[projectId]/issues/[issueId]/**` → `.../tickets/[ticketId]/**` (move + rename the
   `_issue-*.tsx` family + `page.tsx` inside).
7. **Route moves — legacy.** Same shape as step 6 under `projects/legacy/[projectId]/`.
8. **API route moves.** `api/v2/issues/**` → `api/v2/tickets/**`;
   `api/v2/projects/[projectId]/issues/**` → `.../tickets/**`. Update every `fetch()` call site
   across the app (the moved view/modal components, `_project-detail.tsx`, Desk Tickets tab).
9. **Time Log picker.** `_task-issue-picker.tsx` → `_task-ticket-picker.tsx` (identifiers + UI
   copy per the dictionary); update `_time-log-entry-modal.tsx`'s import;
   `api/v2/time-logs/route.ts`'s `entryKind` literal.
10. **Desk Tickets tab (task 363) link fixups.** Update `/projects/v2/${projectId}/issues/...`
    links to `.../tickets/...` in `_filed-issues-table.tsx`; sweep remaining "Issue" wording in
    that feature's comments/UI copy to "Ticket."
11. **Desk Inbox "File a ticket" button.** `_thread-message-actions.tsx` (menu → button),
    `_thread-to-project-modal.tsx` (drop `mode`/task branch), update `_conversation-thread.tsx`'s
    prop passthrough if the removed `mode` prop was threaded there.
12. **UI copy sweep.** Grep the now-moved/renamed files (and any stragglers) for the literal
    string "Issue"/"issue" in JSX text, toasts, `aria-label`s, and empty states; replace with
    "Ticket"/"ticket" everywhere it refers to the Hub's own concept (not Zoho's).
13. `npx tsc --noEmit` repeatedly through the above — a missed rename inside a moved file surfaces
    immediately as a broken import; fix forward rather than batching all steps before checking.
14. `pnpm lint`.
15. Browser check per Verification.
16. Note the CLAUDE.md update needed (issues table bullet, issue_comments bullet, task 363's
    "planned to be relabeled" note) for the `document` stage to pick up.

## Acceptance Criteria

- [ ] `/projects/v2/{projectId}/tickets` and `/projects/legacy/{projectId}/tickets` render the
      list that used to be at `.../issues`; the old `.../issues` path no longer resolves (no
      redirect needed/expected — this is an internal rename, not a public URL contract).
      `/projects/v2/{projectId}/tickets/{displayId}` renders the detail page.
  - [ ] Creating a new ticket from a project shows "New Ticket" in the modal heading/button, and
      the created row's `display_id` ends in `-TKT####`.
  - [ ] An existing ticket (created before this task) shows a backfilled `-TKT####` display id,
      not the old `-I####`.
  - [ ] The Time Log picker's second tab says "Tickets," and a time log logged against a ticket
      through it works exactly as before.
  - [ ] Desk > Tickets tab (task 363): the "Origin ticket" and "Project" links both resolve
      correctly to the renamed routes; filing a new ticket from an Inbox thread message still
      stamps `source_ticket_id` and the row appears on this tab.
  - [ ] On a Desk Inbox thread's customer message, there is a single visible "File a ticket"
      button (no kebab menu, no "Create Task" anywhere in that surface). Clicking it opens the
      project picker → ticket-creation flow and behaves exactly as "File an Issue" did before.
  - [ ] `grep -rn "Issue" src/app src/lib --include="*.tsx" --include="*.ts"` (excluding
      `projects-old/**` other than `_pm-shared.tsx`, and every explicitly out-of-scope
      Zoho-naming file) returns nothing describing the Hub's own concept.
  - [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Browser (pnpm dev), as admin/pm:
#  1. /projects/v2/{id}/tickets — list renders, "New Ticket" works, display id ends -TKT####.
#  2. /projects/v2/{id}/tickets/{displayId} — detail page (attachments/comments/time-logs) works.
#  3. Same for /projects/legacy/{id}/tickets(/...).
#  4. Dashboard > Time Logs > Add Time Log — "Select Tasks/Tickets" picker, "Tickets" sub-tab.
#  5. Desk > Inbox — open a ticket thread with a customer message: confirm a single "File a
#     ticket" button (no kebab, no "Create Task"), file a ticket, confirm it lands correctly.
#  6. Desk > Tickets — the just-filed ticket appears; its "Origin ticket" and "Project" links
#     both resolve.
#  7. grep sweep per the acceptance criteria above.
```

## Compatibility Touchpoints

- The migration is **written, not applied** — `display_id` values keep their old `-I####` marker
  and new inserts fail against the *old* trigger function name if this ships to a DB where 138
  hasn't run yet and app code already expects `-TKT####` cosmetically (it doesn't validate the
  format, so this is display-only risk, not a hard break) — still, coordinate applying 138 with
  deploying this task's app code.
- No change to any external integration (Zoho import/export, IMAP inline images) — this task
  doesn't touch any of those routes.
- `CLAUDE.md` needs a follow-up documentation pass (flagged for the `document` stage) — several
  bullets describe "the `issues` table" and "Issues tab" by their pre-rename names.

## Implementation Notes

### What Changed
- **Migration.** `138_ticket_display_id_marker.sql` (written, not applied): replaces
  `generate_issue_display_id()`/`trg_generate_issue_display_id` with
  `generate_ticket_display_id()`/`trg_generate_ticket_display_id` producing `-TKT####`, drops the
  old function, and backfills every existing `issues.display_id` (`-I####` → `-TKT####`, same
  numeric suffix). `issues.prefix` untouched.
- **Shared type layer.** `projects-old/_pm-shared.tsx`: `Issue`→`Ticket`, `IssueSeverity`→
  `TicketSeverity` (the DB path stays `Database["public"]["Tables"]["issues"]["Row"]`).
- **`src/lib/issues/` → `src/lib/tickets/`.** `getIssueEditPermission`→`getTicketEditPermission`,
  `issueAssigneeIds`→`ticketAssigneeIds`, `buildIssueAssigneeSync`→`buildTicketAssigneeSync`,
  `IssueEditPermission`→`TicketEditPermission`, `IssueAssigneeSyncColumns`→
  `TicketAssigneeSyncColumns`.
- **Shared ticket components** (`projects/_shared/`): `_issue-list-view.tsx`→
  `_ticket-list-view.tsx` (`IssueListView`→`TicketListView`, `IssueSortKey`/`IssueSortDir`→
  `TicketSortKey`/`TicketSortDir`), `_issue-board-view.tsx`→`_ticket-board-view.tsx`,
  `_issue-calendar-view.tsx`→`_ticket-calendar-view.tsx`, `_create-issue-modal.tsx`→
  `_create-ticket-modal.tsx` (`CreateIssueModal`→`CreateTicketModal`).
- **`_project-detail-tab-strip.tsx`.** `DetailTabId`'s `"issues"` member and the `BASE_TABS` entry
  → `"tickets"` / "Tickets". **This was the actual project-detail page's real tab navigation bar**
  — distinct from `_project-detail.tsx`'s own separate local `PrimaryTab` type, which I renamed
  first and which gave false confidence; the tab strip itself was still silently offering a dead
  "Issues" tab (pointing at `.../issues`, a route that no longer exists) until caught by manual
  review, not by `tsc` (a string-literal union member with no matching value isn't a type error).
- **Route moves.** `projects/{v2,legacy}/[projectId]/(tabs)/issues` → `.../tickets`;
  `.../issues/[issueId]/**` → `.../tickets/[ticketId]/**` (`_issue-*.tsx` family →
  `_ticket-*.tsx`); `api/v2/issues/**` → `api/v2/tickets/**`;
  `api/v2/projects/[projectId]/issues/**` → `.../tickets/**`. Every `fetch()`/`Link` call site
  across the app updated to the new paths.
- **Time Log picker.** `_task-issue-picker.tsx` → `_task-ticket-picker.tsx`
  (`TaskIssuePicker`→`TaskTicketPicker`, `TaskIssueValue`→`TaskTicketValue`,
  `kind: "issue"`→`"ticket"`); `EntryKind` (`_time-logs-shared.ts`) `"issue"`→`"ticket"`; wired
  through `_time-log-entry-modal.tsx`, `_time-logs-table.tsx`, `api/v2/time-logs/route.ts`.
- **Dev Dashboard (My Tasks).** `DevWorkKind` (`_types.ts`) `"issue"`→`"ticket"`, `buildItemHref`'s
  route segment `"issues"`→`"tickets"`; `_digest-card.tsx`/`_work-list.tsx`'s `kind === "ticket"`
  checks; `_timer-card.tsx`'s route `segment`; `_ui.tsx`'s `TypeIcon` label; `_stat-strip.tsx`'s
  pluralized "ticket(s)" text.
- **Desk Inbox "File a ticket" button.** `_thread-to-project-modal.tsx` rewritten: dropped the
  `mode`/`"task"` branch and `CreateTaskModal` import entirely, now always renders the
  ticket-filing flow via `CreateTicketModal`, fetches `/tickets` (not `/issues`) from the project
  bundle. `_thread-message-actions.tsx` rewritten: kebab menu → single always-visible "File a
  ticket" button (`Bug` icon, ghost-button styling per DESIGN.md), no more `MoreVertical`/menu
  state.
- **Desk Tickets tab (task 363) fixups.** `_filed-issues-index.tsx`'s PATCH now targets
  `/api/v2/tickets/[id]` (was silently pointed at the now-dead `/api/v2/issues/[id]`).
  `_inbox-table.tsx`'s "Linked Ticket" link now points at `/tickets/` (was `/issues/`).
- **Legacy projects listing.** `_project-grid-view.tsx`'s issues `ProgressStat` → "tickets" label
  + `/tickets` href (was linking at a dead route); `_project-list-view.tsx`'s "Issues" column
  header/empty-state text → "Tickets"/"No tickets" (`issue_total`/`issue_done` fields kept — they
  mirror the `get_project_issue_counts` DB RPC's own naming, out of scope).
- **UI copy sweep** across every touched file: "New Issue"→"New Ticket", "Issue created"→"Ticket
  created", "Issue not found"→"Ticket not found", "File an Issue"→"File a Ticket", etc.

### Deviations From Plan / Discoveries
- **`entity_type: "issue"` (the `attachments` table's polymorphic-type column) was deliberately
  NOT renamed**, alongside `issues`/`issue_comments` table names — this is a genuinely
  DB-persisted value across existing rows, not a display string; renaming it without a
  backfill migration (not scoped here) would make old and new attachments invisible to each
  other's `.eq("entity_type", ...)` filters. The response's own ephemeral `source` field (computed
  fresh per-request, never persisted) WAS renamed `"issue"`→`"ticket"` since it's the same class
  of thing as `EntryKind`/`DevWorkKind` — safe to change with no backfill. Caught and reverted a
  first-pass mistake where the blanket rename touched a client-side `entity_type !== "ticket"`
  check without updating the (deliberately unchanged) server value it compares against.
- **`TaskTimerButton`'s `issueId` prop / `TimerEntityRef`'s `issueId` key / `active_timers.issue_id`
  plumbing (`timer-context.tsx`, `_task-timer-button.tsx`) were left unchanged** — same
  DB-mirroring rationale, explicitly noted in the task doc's spirit though not itemized by name
  originally. Every OTHER `issueId`-named prop in code the task doc did intend to rename (e.g. the
  Ticket Attachments/Comments panel family's own internal `issueId` prop) was renamed to
  `ticketId` — these are two different props that happen to share a name; only the
  timer/DB-mirroring one was preserved.
- **Found and fixed several bugs beyond the plan's explicit file list**, surfaced by systematic
  post-hoc grepping rather than being anticipated up front (the plan warned this would happen and
  budgeted for it): a `Database["public"]["Tables"]["issues"]` type path in
  `api/v2/tickets/[ticketId]/route.ts` got its string literal blanket-renamed to `"tickets"`,
  silently repointing the PATCH route's update type at the *Desk email* `tickets` table — caught
  via a `tsc` structural-mismatch error, not by inspection. Several API route files still
  destructured `{ issueId }` from `params` after their folder was renamed to `[ticketId]` — Next.js
  route param typing isn't checked by bare `tsc` (only by the dev/build-time route validator,
  which I had cleared), so these were only caught by manually grepping for `issue.` /`issueId`
  across the moved route tree. Two `storagePath` construction lines (`sign/route.ts`,
  `attachments/route.ts`) referenced an undefined `issue` variable after its declaration was
  renamed to `ticket` elsewhere in the same function.
- Everything else matches the task doc's plan.

### Known Remaining "Issue" Mentions (left as-is, verified non-functional)
- Zoho import/export routes/labels (`zoho-export/issues`, `zoho-import/issue-comments`, the admin
  Migrate tab's level labels) — out of scope per the task doc, describes Zoho's own feature name.
- `projects-old/**` route tree — dead/unlinked code; only fixed enough to keep it compiling
  (renamed its own copies of the shared view files + fixed broken imports), did not do a full
  identifier/UI-copy sweep there.
- A broad set of **comments only** (no user-facing text, no logic) across shared task/ticket
  infrastructure (`_attachment-dropzone.tsx`, `_comment-composer.tsx`, `_collapsible-section.tsx`,
  timer plumbing, etc.) still say "task/issue" in prose describing shared history — harmless,
  diminishing-returns to chase exhaustively; grepped to confirm none of them are logic or
  user-visible text.
- `issue_id`/`issue_display_id`/`issue_total`/`issue_done` and similar column-mirroring
  property/variable names — kept everywhere, per the DB-preservation decision.

### Files Changed
~150 files: migration, directory moves (route trees + `src/lib/tickets/`), shared component
renames, all Desk Inbox/Tickets fixups, Dev Dashboard, Time Logs, and the legacy projects listing.
See "What Changed" above for the categorized breakdown — too many individual files to list here
usefully; `git status`/`git diff` (run by the user, per this repo's no-git-for-the-agent rule) is
the authoritative file list.

### Verification Run
- `npx tsc --noEmit` — PASS (no output; run repeatedly through implementation, not just at the end).
- `pnpm lint` — PASS (0 errors; 2 pre-existing unrelated warnings in
  `onboarding-workspace/_checklist-tab.tsx`).
- Browser acceptance — NOT RUN (handed to test stage). Given the scale and the real bugs already
  found by static analysis alone, a live click-through is especially warranted before this ships:
  create a ticket, view/edit an existing one (both v2 and legacy), the Time Log picker's Tickets
  tab, Dev Dashboard My Tasks ticket rows + their timer, and the full Desk Inbox → "File a ticket"
  → Desk Tickets tab round trip.
- CLAUDE.md documentation pass (the `issues` table bullet, `issue_comments` bullet, and task 363's
  "planned to be relabeled in a future task" note) is **not done** — flagged in the task doc's
  Compatibility Touchpoints for the `document` stage to pick up.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Re-ran `npx tsc --noEmit` and `pnpm lint` fresh at the start of this pass (not just trusting the
  implementation stage's own run) — both still clean (0 errors; the same 2 pre-existing unrelated
  `_checklist-tab.tsx` warnings).
- Spot-verified, independent of the implementation stage's own claims, that the highest-risk fixes
  actually hold: `_project-detail-tab-strip.tsx` is fully clean of "issue" text and its `tickets`
  entry is wired correctly; both `_ticket-quick-access-panel.tsx` variants (v2/legacy) link at
  `/tickets/`, not `/issues/`; `_ticket-comments.tsx`'s realtime subscriptions still correctly
  target the real `issue_comments` table/`issue_id` column (not renamed) while its channel *names*
  (arbitrary labels) read "ticket_comments_"; the migration's backfill regex (`-I\d+$`) is
  idempotent-safe against rows already migrated to `-TKT####`; `_thread-to-project-modal.tsx`'s
  `CreateTicketModal` call passes `tickets={bundle.tickets}` matching that modal's actual (renamed)
  prop name; `_thread-message-actions.tsx` has no leftover unused imports (`MoreVertical`/
  `ClipboardList` fully removed) and no stray `console.log`.
- Found and fixed two more grammar artifacts during this pass that the implementation stage's own
  single-line string-match cleanup missed because the source comments wrapped across a line break
  ("File an\n  // Ticket" → renders as "File an Ticket" when read as prose): one in
  `_create-ticket-modal.tsx`, one in `api/v2/projects/[projectId]/tickets/route.ts`. Both are
  comment-only (no behavioral effect) but worth fixing for a task whose entire point is
  eliminating "Issue" wording. A broader line-wrap-aware regex swept the rest of the tree
  afterward and found no further instances of this specific pattern.
- No unused code, no new `any`/untyped escape hatches (the `as unknown as` casts added follow the
  exact precedent already established in this codebase — task 363's own `page.tsx` files, and
  `_load-detail-data.ts`/`_load-list-data.ts` elsewhere — for bridging PostgREST's array-typed
  embed inference on a `isOneToOne: false` relationship), no secrets/debug logging.
- Names accurately describe behavior post-rename (`getTicketEditPermission`, `ticketAssigneeIds`,
  `TicketListView`, `CreateTicketModal`, etc.) — no leftover misleading "Issue" identifiers in any
  file that received the full rename treatment.

### Deviations
- **Minor** — `entity_type: "issue"` (the `attachments` table's stored polymorphic-type value) and
  the storage path prefix `issues/{id}/...` were kept unchanged, beyond what the task doc's Out of
  Scope section named explicitly (it named tables/columns/RLS-policy-names/`.prefix`, not this
  specific stored *value* or storage convention). Correct call — these are exactly the same class
  of already-persisted, already-referenced-elsewhere identifier the task doc's broader "keep the
  DB layer stable" principle covers, and changing either without a real backfill would have
  produced exactly the kind of cross-version data-invisibility bug the task doc warned about for
  the table-name question. Documented in Implementation Notes' Deviations section.
- **Minor** — `TaskTimerButton`'s `issueId` prop / `TimerEntityRef`'s `issueId` key / the
  `active_timers.issue_id` plumbing were left unrenamed, again beyond the task doc's named list but
  consistent with its DB-mirroring principle — this prop key round-trips directly into a real
  `active_timers` column write. A *different*, unrelated `issueId` prop on the Ticket
  Attachments/Comments panel family (no DB mirroring, purely internal to those components) WAS
  renamed to `ticketId` — verified these two same-named-but-different props were not conflated.
- **Minor** — A broad set of code comments (no user-facing text, no logic) across shared
  task/ticket infrastructure still read "task/issue" in prose describing shared history
  (`_attachment-dropzone.tsx`, `_comment-composer.tsx`, timer plumbing, etc.). Verified none of
  these are logic, DB references, or anything a user would ever see — pure documentation drift,
  correctly deprioritized given the scale of this task.
- **Medium, disclosed not hidden** — Browser acceptance has still not been run. Given this task's
  size (~150 files) and that static analysis alone already surfaced multiple real, previously
  latent bugs (the dead tab-strip entry, the mis-pointed `Database` type, the undefined-variable
  storage-path references), a live click-through carries real, non-theoretical risk of finding
  something static analysis can't — this is called out plainly rather than treated as a
  formality, and the specific click-through path to run is spelled out in Implementation Notes'
  Verification Run section for the `test` stage.
- No Major deviations — every explicit Requirement and Out-of-Scope boundary in the task doc was
  honored; the scope discovered-and-fixed beyond the plan's own file list was all *bug fixing in
  service of the plan's stated intent* (routes/types silently pointing at dead/wrong targets),
  never new product scope.

### Required Fixes
- None.
