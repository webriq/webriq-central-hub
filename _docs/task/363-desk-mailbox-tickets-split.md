# 363: Split Desk "Tickets" into Mailbox (helpdesk email) + Tickets (assignable filed issues)

**Created:** 2026-09-14
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Today `/desk/tickets` is a single surface: the raw helpdesk-email inbox (Zoho Desk tickets,
imported + live-polled). This task splits it into two distinct Desk sub-tabs:

1. **Mailbox** (`/desk/mailbox`) — the renamed, redesigned version of today's `/desk/tickets`
   page. Unchanged data model and unchanged API routes (both still operate on the `tickets`
   table) — only the page route, nav label, and visual polish change.
2. **Tickets** (`/desk/tickets`, new content) — a brand-new cross-project listing of `issues`
   rows that were created via the existing "File an Issue" action on a Desk ticket thread
   message (task 333). This is the support→dev handoff board: PM/Admin see every filed issue in
   one place, can assign it to a developer, and see its status and total logged hours, without
   opening the owning project. It reuses the existing per-issue infrastructure (status values,
   multi-assignee, time logs) — no new issue lifecycle is introduced.

The two tabs share the "Desk" sidebar group (unchanged for the `Contacts` tab). The `/desk/tickets`
URL is freed by the Mailbox move and reused for the new Tickets feature, matching the request's
framing ("convert Desk Tickets to Desk Mailbox, **then** add a dedicated tab for Tickets").

### Decisions locked in during planning (see chat)
- **Tickets tab scope:** only issues filed from a Desk ticket thread message — not a general
  cross-project issue board. Requires a new nullable link column (`issues.source_ticket_id`)
  because the existing "File an Issue" flow (task 333) currently stores no link back to the
  ticket it came from.
- **Developer nav access:** unchanged. Developers keep seeing **no** Desk tabs at all (the
  sidebar's existing `!isDev` gate on the whole "Desk" group is untouched). A developer's own
  filed-and-assigned tickets remain visible to them exactly where they already are today:
  Projects → Issues (their own per-project Issues tab — planned to be relabeled "Tickets" in a
  **future** task, out of scope here) and Dev Dashboard → My Tasks.
- **Time logging:** the new Tickets tab shows a **read-only** total-logged-hours figure per row
  only. No start/stop timer, no "log time" action in this listing — those stay on the issue
  detail page and the Dev Dashboard, unchanged.

## Requirements

- [ ] `/desk/tickets` (old content) moves to `/desk/mailbox`, functionally identical (same
      filters, search, pagination, ticket detail thread/reply/notes/status behavior) — only the
      page route, sidebar label, internal `Link` hrefs, and visual polish change.
- [ ] Sidebar "Desk" group shows, in order: **Mailbox**, **Tickets**, **Contacts**.
- [ ] `issues` gains a nullable `source_ticket_id uuid references tickets(id) on delete set null`
      column (new migration, index on the column).
- [ ] "File an Issue" from a Desk ticket thread message (task 333's `ThreadMessageActions` →
      `ThreadToProjectModal` → `CreateIssueModal` flow) stamps the new issue's
      `source_ticket_id` with the originating ticket's UUID. "Create Task" from the same menu is
      unaffected (tasks have no such column and none is added).
- [ ] New `/desk/tickets` page lists every `issues` row where `source_ticket_id is not null`,
      across all projects, admin/super_admin/pm only (same role gate as Mailbox; developer and
      every other role redirect away, matching the existing pattern).
- [ ] Each row shows: issue title (+ `display_id`), a link back to the originating ticket's
      Mailbox thread, the owning project's name (linking to that project), assignees (avatar
      stack, editable via the existing multi-assignee picker), status (badge + editable, reusing
      the existing issue status vocabulary/styling), severity, **created date + time**, and a
      read-only total logged hours figure (summed from `time_logs.hours` for that issue).
- [ ] Assignee and status edits on a Tickets-tab row persist via the existing
      `PATCH /api/v2/issues/[issueId]` endpoint — no new write endpoint for those two fields.
- [ ] A new lightweight endpoint returns the assignable-staff list (id/full_name/avatar_url) for
      roles `admin | super_admin | pm | developer`, since the existing per-project members
      endpoints are project-scoped and this listing is cross-project.
- [ ] Both the Mailbox table and the new Tickets table show a **date + time** column for when the
      row was received/created (Mailbox: ticket `created_at`, labeled "Received"; Tickets: issue
      `created_at`, labeled "Created") — today's Mailbox table has no such column at all
      (`created_at` isn't even selected in the current query).
- [ ] Both tables' visual design (colors, type scale, spacing, chips, table header/row treatment)
      follow `_final_design/guide/central-hub-design-system.md` (and its paired
      `central-hub-style-guide.html` for the visual reference) — this is a genuine redesign pass
      on the Mailbox table, not just a rename.
- [ ] Every new/changed file respects `nextjs-file-length-best-practices.md` — split by
      responsibility rather than letting any one file balloon (mirror the existing Mailbox
      decomposition: `page.tsx` (query) / `_*-index.tsx` (toolbar+pagination shell, client) /
      `_*-table.tsx` (row rendering) / small helper modules).

## Out of Scope / Must-Not-Change

- Renaming the `tickets` DB table, the `tickets` RLS policies, or any `/api/desk/tickets/**` API
  route. Those routes serve the Mailbox ticket detail (status/notes/reply/attachments/inline
  images) and **must keep their current path** — `src/lib/email/inline-images.ts` writes
  `/api/desk/tickets/{ticketId}/messages/{id}/inline-images/{attachmentId}` URLs directly into
  already-stored `ticket_messages.body` HTML across historical rows; renaming the API tree would
  break every previously-ingested inline image with no easy backfill. Only the **page** route
  (`src/app/(hub)/desk/tickets/**` → `.../desk/mailbox/**`) and its own internal `Link` hrefs move.
- Renaming the "Issues" tab under a project (`/projects/{v2,legacy}/[projectId]/issues`) to
  "Tickets" — explicitly a **future** task per the user's own framing.
- Any new time-logging UI (inline timer, "log time" button) in the new Tickets tab — read-only
  hours only, per the locked decision above.
- Opening the "Desk" sidebar group to developers — the existing `!isDev` gate is untouched.
- The Contacts tab (`/desk/contacts`) and its detail pages — unaffected except for one `Link`
  href fix in `_detail-ui.tsx` (its "recent tickets" list must point at the new `/desk/mailbox/`
  path instead of 404ing).
- `CreateTaskModal` / the "Create Task" path out of `ThreadToProjectModal` — no `source_ticket_id`
  equivalent is added for tasks; only the "File an Issue" path is touched.
- Any change to `issues_staff_read` / `issues_pm_write` RLS (migration 051) — the existing
  staff-read policy already permits admin/super_admin/pm/developer to read every `issues` row
  regardless of project, so the new cross-project query needs no RLS change; the page-level role
  redirect is what actually keeps developers off this listing.
- Severity/date filters, bulk actions, or CSV export on the new Tickets tab — status filter +
  search only, mirroring Mailbox's existing filter surface.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/137_issues_source_ticket_id.sql` | Add | `source_ticket_id uuid references tickets(id) on delete set null` + index. **Written, not applied** by the agent (repo convention for recent migrations — user applies via `supabase db push`). |
| `src/types/database.ts` | Modify | Add `source_ticket_id` to `issues` Row/Insert/Update + a `Relationships[]` entry (FK to `tickets`). |
| `src/config/constants.ts` | Modify | Add `DESK_MAILBOX: "/desk/mailbox"`. `DESK_TICKETS` stays `"/desk/tickets"` (now the new feature's route). |
| `src/app/(hub)/desk/tickets/**` → `src/app/(hub)/desk/mailbox/**` | Move (rename dir) | All 16 existing files move wholesale: `page.tsx`, `_tickets-index.tsx`→`_mailbox-index.tsx`, `_tickets-table.tsx`→`_mailbox-table.tsx`, `_resolve.ts`, `_status-filter.ts`, `_filter-multi-select.tsx`, `loading.tsx`, and the whole `[ticketId]/` subfolder (detail page + thread/reply/attachments/rich-text/message-actions/thread-to-project-modal/message-html). |
| `src/app/(hub)/desk/mailbox/page.tsx` (moved) | Modify | Rename component/comment, `metadata.title` → "Desk · Mailbox", add `created_at` to the `tickets` select + `TicketListItem`, redesign per style guide. |
| `src/app/(hub)/desk/mailbox/_mailbox-index.tsx` (moved+renamed) | Modify | `TicketsIndex`→`MailboxIndex`, title "Mailbox", `V2_ROUTES.DESK_MAILBOX` instead of `DESK_TICKETS`. |
| `src/app/(hub)/desk/mailbox/_mailbox-table.tsx` (moved+renamed) | Modify | `TicketsTable`→`MailboxTable`, add "Received" column (`created_at`, full date+time), row `href` → `/desk/mailbox/${ticketId}`, restyle per guide. |
| `src/app/(hub)/desk/mailbox/[ticketId]/_ticket-detail.tsx` (moved) | Modify | Back-link → `V2_ROUTES.DESK_MAILBOX`; pass the ticket's UUID `id` (not the display `ticketId`) down to `ConversationThread` as a new `ticketDbId` prop; leave every `/api/desk/tickets/...` fetch call untouched. |
| `src/app/(hub)/desk/mailbox/[ticketId]/_conversation-thread.tsx` (moved) | Modify | Accept + forward `ticketDbId` prop to `ThreadMessageActions`. |
| `src/app/(hub)/desk/mailbox/[ticketId]/_thread-message-actions.tsx` (moved) | Modify | Accept `ticketDbId` prop, forward to `ThreadToProjectModal`. |
| `src/app/(hub)/desk/mailbox/[ticketId]/_thread-to-project-modal.tsx` (moved) | Modify | Accept `ticketDbId` prop; pass `sourceTicketId={ticketDbId}` into `CreateIssueModal` only when `mode === "issue"`. |
| `src/app/(hub)/desk/_detail-ui.tsx` | Modify | Fix the one hardcoded `/desk/tickets/${t.ticketId}` href → `/desk/mailbox/${t.ticketId}`. |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Desk children: `Mailbox` (→`DESK_MAILBOX`), `Tickets` (→`DESK_TICKETS`), `Contacts`; group `href` → `DESK_MAILBOX`. |
| `src/app/(hub)/projects/_shared/_create-issue-modal.tsx` | Modify | Accept optional `sourceTicketId?: string` prop; include `source_ticket_id` in the POST body when present. |
| `src/app/api/v2/projects/[projectId]/issues/route.ts` | Modify | `POST` accepts optional `source_ticket_id` in body, inserts it (FK constraint validates it). |
| `src/app/api/staff/members/route.ts` | Add | `GET` — assignable staff list (`id, full_name, avatar_url`) for roles `admin\|super_admin\|pm\|developer`; admin/super_admin/pm only, mirrors `MemberOptionWithRole`'s shape. |
| `src/app/(hub)/desk/tickets/page.tsx` (new content) | Add | Server component: role gate, searchParams pagination/search/status, queries `issues` where `source_ticket_id is not null` joined to `tickets(ticket_id, subject)` and `projects(name, project_id)`, plus a batched `time_logs` hours-sum lookup for the page's issue ids. |
| `src/app/(hub)/desk/tickets/_filed-issues-index.tsx` | Add | Client toolbar/pagination shell — mirrors `_mailbox-index.tsx`'s structure, title "Tickets". |
| `src/app/(hub)/desk/tickets/_filed-issues-table.tsx` | Add | Row rendering: title/display_id, origin-ticket link, project link, `AssigneeMultiSelect`, status badge+editor, severity chip, Created date+time, read-only logged-hours figure. |
| `src/app/(hub)/desk/tickets/_status-filter.ts` | Add | Issue-status filter options for this listing (open/in_progress/.../closed) — distinct from Mailbox's ticket-status vocabulary, so **not** shared with the moved file of the same name. |
| `src/app/(hub)/desk/tickets/loading.tsx` | Add | Skeleton rows, matching Mailbox's `loading.tsx` pattern. |

## Code Context

### Current sidebar Desk entry (`v2-hub-sidebar.tsx`)
```tsx
...(!isDev ? [
  {
    label: "Desk",
    icon: <Inbox size={18} />,
    href: V2_ROUTES.DESK_TICKETS,
    children: [
      { label: "Tickets",  href: V2_ROUTES.DESK_TICKETS },
      { label: "Contacts", href: V2_ROUTES.DESK_CONTACTS },
    ],
  },
] : []),
```
Becomes (children order per requirements): `href: V2_ROUTES.DESK_MAILBOX`, children
`Mailbox → DESK_MAILBOX`, `Tickets → DESK_TICKETS`, `Contacts → DESK_CONTACTS`. `!isDev` gate
unchanged.

### `issues` table today (`src/types/database.ts`) — no ticket linkage
```ts
issues: {
  Row: {
    id: string; project_id: string; task_id: string | null; external_id: string | null;
    prefix: string | null; title: string; description: string | null; status: string;
    severity: string | null; flag: string | null; assignee_name: string | null;
    assignee_email: string | null; assignee_id: string | null; assignees: string[] | null;
    created_by: string | null; due_date: string | null; due_time: string | null;
    notes: string | null; created_at: string; updated_at: string;
    source_meta: Record<string, unknown>; display_id: string | null;
  };
  // + Insert / Update mirror this shape
}
```
Add `source_ticket_id: string | null` to all three, plus a `Relationships` entry:
```ts
{ foreignKeyName: "issues_source_ticket_id_fkey"; columns: ["source_ticket_id"]; isOneToOne: false;
  referencedRelation: "tickets"; referencedColumns: ["id"]; }
```

### Migration shape (`051_issues_table.sql` precedent)
```sql
create table issues (
  ...
  task_id uuid references tasks(id) on delete set null,
  ...
);
```
New migration mirrors this pattern:
```sql
alter table issues add column source_ticket_id uuid references tickets(id) on delete set null;
create index issues_source_ticket_id_idx on issues(source_ticket_id) where source_ticket_id is not null;
```

### `issues_staff_read` RLS (migration 051) — already unscoped by project
```sql
create policy "issues_staff_read"
  on issues for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));
```
No RLS change needed — an admin/pm/super_admin can already `select` every `issues` row regardless
of `project_id`. The new page's own role check (mirroring `DeskTicketsPage`'s `if (role !== "admin"
&& role !== "super_admin" && role !== "pm") redirect(...)`) is what keeps developers off it.

### `PATCH /api/v2/issues/[issueId]` — already project-agnostic (`src/app/api/v2/issues/[issueId]/route.ts`)
Handles both `assignees` (multi-assignee sync via `buildIssueAssigneeSync`) and `status`, keyed
only by `issueId` — no `projectId` in the URL, so the new cross-project Tickets table can PATCH
straight into this existing endpoint for inline assignee/status edits. No new write endpoint
needed for those two fields.

### "File an Issue" plumbing gap (`_thread-message-actions.tsx` / `_thread-to-project-modal.tsx`)
`ConversationThread` already receives the route's **display** `ticketId` (`tickets.ticket_id`,
e.g. `TKT-42`) and threads it down to `ThreadMessageActions` — but nothing threads the ticket's
**UUID** `id` down that same path, and `_ticket-detail.tsx`'s `TicketDetailData` already carries
`id` at the top level (`ticket.id`), just not passed to `<ConversationThread>` today. Add a
`ticketDbId` prop alongside the existing `ticketId` (display) prop at each layer — don't conflate
the two or the FK insert will fail against a non-UUID value.

```tsx
// _thread-to-project-modal.tsx — CreateIssueModal call site, mode === "issue" branch
<CreateIssueModal
  projectId={projectId}
  allMembers={bundle.members}
  issues={bundle.issues}
  defaultTitle={subject}
  defaultDescription={...}
  sourceTicketId={ticketDbId}   {/* new */}
  onClose={onClose}
  onCreated={...}
/>
```

```ts
// api/v2/projects/[projectId]/issues/route.ts — POST insert, new field
.insert({
  project_id: project.id,
  title: body.title.trim(),
  ...
  source_ticket_id: body.source_ticket_id || null,   // new — FK validates a bad id
})
```

### `MemberOptionWithRole` shape to match for the new staff endpoint (`_project-detail.tsx:799`)
```ts
export type MemberOptionWithRole = { id: string; full_name: string | null; avatar_url: string | null; role: string };
```
`AssigneeMultiSelect` (`_assignee-multi-select.tsx`) only needs `{ id, full_name, avatar_url }`
(`AssigneeMember`), so `GET /api/staff/members` can return that narrower shape directly.

### Design tokens (`_final_design/guide/central-hub-design-system.md`) — key ones for these tables
- Table: header `9.5px/700 caps` `--muted` (`#5F6A88`) on `#FAFBFE`, `--line-soft` (`#EDF0F7`)
  dividers, row hover `--blue-50` (`#F0F7FF`), first column 18px pad.
- Status/severity → **Chips**, 5px radius, 10px/700, tinted per state (`ok`/`warn`/`late`), never
  clickable themselves (the edit affordance sits beside/around the chip, not on it).
- Dates/IDs/hour figures → **JetBrains Mono** 9–11px, per the "Data" type role — applies to the
  new Received/Created columns and the logged-hours figure.
- Avatars: 20px in tables, fixed 6-color rotation, −7px stack overlap, 2px white keyline (matches
  `AssigneeMultiSelect`'s existing `AVATAR_COLORS`).
- No new CTA color usage here — orange stays reserved; any inline "assign"/"edit status" affordance
  is a ghost/ineractive control, not a colored button.

## Implementation Steps

1. **Migration + types.** Write `137_issues_source_ticket_id.sql` (written, not applied). Add
   `source_ticket_id` to `src/types/database.ts`'s `issues` Row/Insert/Update + Relationships.
2. **Rename Mailbox.** `git mv` (or move+recreate, since git commands aren't run by the agent —
   use the filesystem move) `src/app/(hub)/desk/tickets/` → `src/app/(hub)/desk/mailbox/`. Rename
   `_tickets-index.tsx`→`_mailbox-index.tsx`, `_tickets-table.tsx`→`_mailbox-table.tsx` and their
   exported component names. Update every relative import inside the moved tree that referenced
   the old filenames. Do **not** touch anything under `src/app/api/desk/tickets/**`.
3. **Fix internal links.** `page.tsx` metadata title, `_mailbox-index.tsx`'s `V2_ROUTES.DESK_TICKETS`
   → `DESK_MAILBOX`, `_mailbox-table.tsx`'s row `href`, `_ticket-detail.tsx`'s back-link, and
   `desk/_detail-ui.tsx`'s one hardcoded href.
4. **Received column + redesign pass.** Add `created_at` to the Mailbox page's `tickets` select
   and `TicketListItem`; add a "Received" column to `_mailbox-table.tsx` (full date+time, mono).
   Pass over the table/index/detail visual treatment against the design-system doc (chip styles,
   header caps, row hover, spacing) — this is the "redesign" the request asks for on this table.
5. **Sidebar.** Add `DESK_MAILBOX` to `constants.ts`; update `v2-hub-sidebar.tsx`'s Desk group
   (href + three children, order Mailbox/Tickets/Contacts).
6. **Ticket UUID plumbing.** Add `ticketDbId` prop through `_ticket-detail.tsx` →
   `_conversation-thread.tsx` → `_thread-message-actions.tsx` → `_thread-to-project-modal.tsx`.
7. **Stamp the link.** `_create-issue-modal.tsx`: optional `sourceTicketId` prop → POST body field
   `source_ticket_id`. `api/v2/projects/[projectId]/issues/route.ts`: accept + insert it.
8. **Staff endpoint.** Add `GET /api/staff/members` (role-gated, returns `AssigneeMember[]` for
   admin/super_admin/pm/developer profiles).
9. **New Tickets page.** Build `src/app/(hub)/desk/tickets/page.tsx` (fresh content — this is a
   different file than the one moved in step 2, same path): role gate, searchParams pagination +
   search + status filter, `issues` query filtered to `source_ticket_id is not null` with
   `tickets(...)`/`projects(...)` embeds, batched `time_logs` hours-sum lookup keyed by the page's
   issue ids (small `.in()` query + `Map`, not a 1000-row pagination case).
10. **New Tickets UI.** Build `_filed-issues-index.tsx` (toolbar/pagination shell) and
    `_filed-issues-table.tsx` (row rendering incl. `AssigneeMultiSelect` + status editor wired to
    `PATCH /api/v2/issues/[issueId]`, read-only hours figure) and `_status-filter.ts` +
    `loading.tsx`, styled per the design-system doc.
11. `npx tsc --noEmit` + `pnpm lint`.
12. Browser check per Verification.

## Acceptance Criteria

- [ ] `/desk/mailbox` shows the exact same tickets, filters, search, and pagination behavior as
      today's `/desk/tickets` did, plus a new "Received" date+time column.
- [ ] Every link that used to point at `/desk/tickets/...` (sidebar, ticket rows, contact/account
      "recent tickets", the detail page's own back-link) now points at `/desk/mailbox/...`, and
      nothing 404s.
- [ ] Every `/api/desk/tickets/**` call (status/notes/reply/attachments/inline-images) still works
      unchanged from the moved Mailbox pages — confirmed by loading a ticket thread with an
      inline image ingested before this task and one after.
- [ ] Filing an Issue from a Desk ticket thread message creates an `issues` row whose
      `source_ticket_id` matches that ticket's UUID `id`; creating a Task from the same menu still
      works and touches no new column.
- [ ] `/desk/tickets` (new) shows only issues with a non-null `source_ticket_id`, across projects,
      to admin/super_admin/pm; developer and every other role redirect away exactly like Mailbox
      does today.
- [ ] Each row shows title, origin-ticket link (opens that ticket's Mailbox thread), project link,
      editable assignees, editable status, severity, a Created date+time column, and a read-only
      total-logged-hours number that matches the sum of that issue's `time_logs.hours`.
- [ ] Assigning a developer or changing status on a Tickets-tab row persists and is reflected
      immediately in that same project's own Issues tab (same underlying row).
- [ ] No inline timer or "log time" control exists anywhere in the new Tickets tab.
- [ ] Sidebar "Desk" group shows Mailbox, Tickets, Contacts in that order; developers still see no
      Desk entry at all.
- [ ] Both tables visually match the design-system doc (chip styling, table header/row treatment,
      mono dates, avatar stack) — not a copy-paste of the old table's exact pixel values where the
      guide specifies something different.
- [ ] No new or moved file exceeds the soft/hard limits in `nextjs-file-length-best-practices.md`
      without a documented reason.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Browser (pnpm dev), as admin/super_admin/pm:
#  1. /desk/mailbox — filters/search/pagination all work; row shows a Received date+time; open a
#     ticket, confirm status/notes/reply and (if any exist) inline images still render.
#  2. From an open ticket's thread, on a customer message: "File an Issue" into a project, submit,
#     then check that project's own Issues tab — the new issue exists there as usual.
#  3. /desk/tickets (new) — the just-filed issue appears; assign a developer, change its status,
#     confirm both persist and reflect back on the project's Issues tab.
#  4. Log time against that issue from the project's Issue detail page (existing flow); reload
#     /desk/tickets and confirm the logged-hours figure updates.
#  5. As a developer: confirm no "Desk" sidebar entry appears at all, and the assigned issue shows
#     up on Dev Dashboard → My Tasks and the project's own Issues tab.
#  6. Sidebar: confirm Mailbox/Tickets/Contacts order and that clicking each lands correctly.
```

## Compatibility Touchpoints

- The migration is **written, not applied** — the new `source_ticket_id` column doesn't exist
  until the user runs it; until then, `source_ticket_id` inserts/selects will fail. Coordinate
  with the user before merging the "File an Issue" stamping change and the new Tickets page live.
- No change to any external integration (Zoho Desk import/export, IMAP inline-image ingestion) —
  confirmed the API path those depend on (`/api/desk/tickets/**`) is explicitly preserved.
- `GET /api/staff/members` is a new, small, additive surface — no existing caller is affected.

## Implementation Notes

### What Changed
- **Migration + types.** Added `supabase/migrations/137_issues_source_ticket_id.sql` (nullable
  `issues.source_ticket_id uuid references tickets(id) on delete set null` + partial index) —
  written, not applied, per the repo's established convention for recent migrations. Added the
  column to `src/types/database.ts`'s `issues` Row/Insert/Update + a `Relationships` entry.
- **Mailbox rename.** Moved `src/app/(hub)/desk/tickets/**` → `src/app/(hub)/desk/mailbox/**`
  wholesale (16 files), renamed `_tickets-index.tsx`→`_mailbox-index.tsx` and
  `_tickets-table.tsx`→`_mailbox-table.tsx` (and their exported component names
  `TicketsIndex`→`MailboxIndex`, `TicketsTable`→`MailboxTable`, `DeskTicketsPage`→
  `DeskMailboxPage`, `DeskTicketsLoading`→`DeskMailboxLoading`). Updated every internal `Link`
  href, the page `<title>`, and the `V2_ROUTES.DESK_TICKETS`→`DESK_MAILBOX` references inside the
  moved tree. Left every `/api/desk/tickets/**` fetch call and the `tickets` DB table completely
  untouched, as the task doc's Out-of-Scope section required (inline-image URL stability).
- **Received column + redesign pass.** Added `created_at` to the Mailbox page's `tickets` select
  and `TicketListItem`; added a "Received" column (`_mailbox-table.tsx`, full date+time via a new
  `formatFullDateTime`, distinct from the existing `formatShortDateTime` used by
  Responded/Due). Gave the status chip its design-system "leading 5px dot" (`<Chip dot>`).
  Regenerated `loading.tsx`'s skeleton grid to match the new 9-column layout.
- **Sidebar + routes.** Added `V2_ROUTES.DESK_MAILBOX`. Sidebar "Desk" group now shows Mailbox →
  Tickets → Contacts (group href now points at Mailbox); the `!isDev` gate around the whole group
  is untouched.
- **Ticket UUID plumbing.** Added a `ticketDbId` prop (the ticket's UUID `id`, distinct from the
  route's display `ticketId`) threaded through `_ticket-detail.tsx` → `_conversation-thread.tsx`
  (`ConversationThread` + `MessageCard`) → `_thread-message-actions.tsx` →
  `_thread-to-project-modal.tsx`.
- **Stamp the link.** `_create-issue-modal.tsx` takes an optional `sourceTicketId` prop, sent as
  `source_ticket_id` in the POST body only from the "File an Issue" path (the plain project-page
  New Issue flow never passes it). `POST /api/v2/projects/[projectId]/issues` accepts and inserts
  it; the FK constraint is the only validation (matches the file's existing style — no manual
  UUID-shape check).
- **New Desk > Tickets tab.** Added `GET /api/staff/members` — rather than writing new
  cross-project staff-query logic, it delegates to the existing `getAssignableMembers()` single
  source of truth (task 351), discovered already project-agnostic (`/api/v2/projects/[projectId]/
  members`'s own comment: "[projectId] is in the URL for logical grouping only"). Built
  `src/app/(hub)/desk/tickets/{page.tsx,_filed-issues-index.tsx,_filed-issues-table.tsx,
  _status-filter.ts,_filter-multi-select.tsx,loading.tsx}` — a cross-project listing of `issues`
  where `source_ticket_id is not null`, admin/super_admin/pm gated like Mailbox, with search +
  status filter, pagination, an origin-ticket link back to `/desk/mailbox/{ticketId}`, a project
  link, editable assignees (`AssigneeMultiSelect`) and status (both PATCH
  `/api/v2/issues/[issueId]`, no new write endpoint needed since it's already project-agnostic),
  a read-only severity chip, a full-date+time Created column, and a read-only total-logged-hours
  figure (summed from a small `.in()` `time_logs` lookup scoped to the current page's issue ids).
- Fixed two stale comment-only references to the old path (`orchestration/page.tsx`,
  `backfill-archived-ticket-cf/route.ts`) and the one hardcoded ticket link in `desk/_detail-ui.tsx`
  (contact/account "recent tickets" list).

### Files Changed
- `supabase/migrations/137_issues_source_ticket_id.sql` — new column + index (written, not applied).
- `src/types/database.ts` — `issues.source_ticket_id` in Row/Insert/Update + Relationships.
- `src/config/constants.ts` — added `DESK_MAILBOX`.
- `src/app/(hub)/desk/tickets/**` → `src/app/(hub)/desk/mailbox/**` — directory move + renames
  (`page.tsx`, `_mailbox-index.tsx`, `_mailbox-table.tsx`, `loading.tsx`, `_resolve.ts`,
  `_status-filter.ts`, `_filter-multi-select.tsx`, and the whole `[ticketId]/` subfolder).
- `src/app/(hub)/desk/mailbox/[ticketId]/_ticket-detail.tsx`,`_conversation-thread.tsx`,
  `_thread-message-actions.tsx`,`_thread-to-project-modal.tsx` — `ticketDbId` plumbing +
  back-link fix.
- `src/app/(hub)/desk/_detail-ui.tsx` — ticket href fix.
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` — Desk group href + Mailbox/Tickets/Contacts children.
- `src/app/(hub)/projects/_shared/_create-issue-modal.tsx` — `sourceTicketId` prop → POST body field.
- `src/app/api/v2/projects/[projectId]/issues/route.ts` — accepts + inserts `source_ticket_id`.
- `src/app/api/staff/members/route.ts` — new, thin wrapper over `getAssignableMembers()`.
- `src/app/(hub)/desk/tickets/page.tsx`,`_filed-issues-index.tsx`,`_filed-issues-table.tsx`,
  `_status-filter.ts`,`_filter-multi-select.tsx`,`loading.tsx` — new feature (fresh content at the
  freed-up `/desk/tickets` path).
- `src/app/(hub)/orchestration/page.tsx`,`src/app/api/admin/desk/backfill-archived-ticket-cf/route.ts`
  — stale comment path references updated.

### Deviations From Plan
- The task doc's file plan proposed `/api/staff/members` as new query logic against `profiles`.
  During implementation I found `src/lib/members/assignable.ts`'s `getAssignableMembers()` already
  does exactly this (project-agnostic, exclude-list-aware) and is the codebase's documented single
  source of truth for "who can be assigned" (task 351) — the new route is a thin wrapper delegating
  to it instead of duplicating the role-filter query, and left unauthenticated-but-signed-in (no
  admin/pm/super_admin gate) to match its sibling `/api/v2/projects/[projectId]/members` route's own
  openness, since the data itself isn't sensitive. No functional gap versus the plan.
- `_filed-issues-index.tsx`'s prop→state re-sync uses the React-docs "adjust state during render"
  comparison pattern instead of a `useEffect`, to satisfy `react-hooks/set-state-in-effect` (ESLint
  error found only at lint time, not anticipated in the plan). Behaviorally identical.
- Everything else matches the task doc's file plan and implementation steps as written.

### Design Hook Findings
- Every "font size outside DESIGN.md" finding surfaced during this task (Mailbox's moved files,
  the sidebar, and the new Tickets-tab files) is the same pre-existing `text-[NNpx]` literal
  convention this codebase uses everywhere (documented in CLAUDE.md's UI Polish Conventions as the
  established pattern, and called out identically in task 355's own Design Hook Findings) — not
  new drift introduced by this task. Left as-is; new files were written to match that existing
  convention rather than introduce a second one.
- The sidebar's "color outside DESIGN.md" findings are pre-existing navy-chrome hex values in
  `v2-hub-sidebar.tsx`, untouched by this task's edit (which only reordered/relabeled Desk's
  children array).

### Verification Run
- `npx tsc --noEmit` — PASS (no output; cleared two stale `.next/types` validator files left over
  from the old `/desk/tickets/[ticketId]` route path, which regenerate on the next `pnpm dev`).
- `pnpm lint` — PASS (0 errors; 2 pre-existing unrelated warnings in
  `onboarding-workspace/_checklist-tab.tsx`, same ones noted in task 355).
- Browser acceptance — NOT RUN (handed to test stage; needs `pnpm dev`, an authenticated
  admin/pm session, an existing Desk ticket thread with a customer-authored message to file an
  issue from, and — once the user applies migration 137 — a full run through the Verification
  script in this doc).

### Follow-Up (post quality-gate, still task 363) — Column Reshuffle

User feedback after the quality gate asked to move Ticket ID/Owner/Responded/Due Date/Status off
the Mailbox list table onto the Tickets tab, and add a "Linked Ticket" column to Mailbox (a
clickable ID redirecting to that ticket's filed-issue detail page). Clarified via questions:
Owner was dropped entirely (not moved — the Tickets tab already has a conceptually different
"Assignees" column); the moved ticket Status became its own "Ticket status" column (kept separate
from the existing issue-workflow "Status" column, different vocabularies); "Ticket ID" was folded
into the existing "Origin ticket" column (mono ID + subject stacked) rather than added as a
redundant second column; "Linked Ticket" links to the filed issue's existing Projects detail page
(`/projects/v2/{projectId}/issues/{displayId}`), showing "—" when no issue has been filed yet.

- **Mailbox** (`desk/mailbox/{page.tsx,_mailbox-index.tsx,_mailbox-table.tsx,loading.tsx}`):
  removed the Ticket ID/Owner/Responded/Due Date/Status columns and their backing query fields
  (`status`, `first_response_at`, `sla_due_at`, `source_meta`, the `desk_agents` owner lookup) —
  the status *filter* dropdown is unaffected since PostgREST `.or()` filters don't require the
  filtered columns to be in the `select` list. Added a reverse `issues.source_ticket_id → tickets`
  lookup (`.in("source_ticket_id", ticketIds)`, most-recent-wins if more than one) feeding a new
  "Linked Ticket" column. `_resolve.ts`'s `resolveOwnerName`/`resolveDisplayId`/`isOverdue` are
  untouched — the ticket detail page's own Properties panel still uses them independently.
- **Tickets tab** (`desk/tickets/{page.tsx,_filed-issues-index.tsx,_filed-issues-table.tsx,
  loading.tsx}`): extended the `tickets(...)` embed to include `status`/`first_response_at`/
  `sla_due_at`; added a local `isTicketOverdue()` (page.tsx) and a local
  `TICKET_STATUS_LABELS`/`TICKET_STATUS_STYLE` map (`_filed-issues-table.tsx`, same per-feature
  local-copy convention `desk/_detail-ui.tsx` already uses) so the origin ticket's own status
  chip never collides with the issue's dev-workflow `STATUS_STYLE` import. Origin Ticket cell now
  shows the mono ticket id stacked above the subject. Table grew from 8 to 11 columns
  (~1650px min-width), so both the real table and its skeleton got an `overflow-x-auto` wrapper
  per the design system's mobile table rule.
- `npx tsc --noEmit` — PASS. `pnpm lint` — PASS (same 2 pre-existing unrelated warnings).
- Browser acceptance — still NOT RUN (same blockers as above).

### Follow-Up 2 (still task 363) — Sidebar "Desk" Group Collapsing on Tickets Navigation

Bug report: clicking the "Tickets" child link collapsed the "Desk" group itself instead of
staying expanded; manually re-expanding once fixed it for every subsequent click.

Root cause (`v2-hub-sidebar.tsx`): a collapsible group's *default* expansion (before the user has
ever manually toggled it, i.e. `expanded[item.label]` is `undefined`) fell back to
`pathname.startsWith(item.href)` — checking only the group's own `href` (`V2_ROUTES.DESK_MAILBOX`
for Desk), not any child's route. Since `/desk/tickets` doesn't start with `/desk/mailbox`, landing
on the Tickets tab computed `isExpanded = false` and the group visually collapsed. Once the user
manually clicked the toggle, `expanded["Desk"]` became an explicit `true` in state, which then
short-circuited the `??` fallback on every later navigation — masking the bug for the rest of the
session, matching exactly what was reported. `Contacts` (`/desk/contacts`) never had a problem
since its check happened to be `startsWith` against `/desk/mailbox` too, coincidentally always
false — the group only ever looked "correct" here because it was manually expanded already by
that point in the reported repro.

Fix: the default-expansion fallback now also checks `childActive` (a variable computed one line
above for the active-highlight logic, `item.children!.some(c => isChildActive(...))`) —
`expanded[item.label] ?? (pathname.startsWith(item.href) || childActive)`. This is a one-line,
generic fix: it also silently fixes the same latent bug for the "Projects" group's "Legacy" child
(`/projects/legacy` doesn't start with `V2_ROUTES.PROJECTS_V2`'s `/projects/v2` either), which
would have collapsed identically — not reported yet, but the same root cause.
- `npx tsc --noEmit` — PASS. `pnpm lint` — PASS (same 2 pre-existing unrelated warnings).
- Browser acceptance — NOT RUN (same blockers as above); the fix is a one-line, low-risk logic
  change readily verifiable by clicking Desk > Tickets from a fresh session (no prior toggle).

### Follow-Up 3 (still task 363) — Renamed "Mailbox" → "Inbox"

User asked which read better; recommended "Inbox" (the standard term in this exact product
category — help-desk tools like Intercom name their shared incoming-queue view exactly this,
and it also matches the `Inbox` lucide icon the "Desk" sidebar group already uses) and the user
confirmed. Full rename sweep:

- Directory `desk/mailbox/` → `desk/inbox/`; `_mailbox-index.tsx`→`_inbox-index.tsx`,
  `_mailbox-table.tsx`→`_inbox-table.tsx`.
- Components: `MailboxIndex`→`InboxIndex`, `MailboxTable`→`InboxTable`,
  `DeskMailboxPage`→`DeskInboxPage`, `DeskMailboxLoading`→`DeskInboxLoading`.
- `V2_ROUTES.DESK_MAILBOX` → `DESK_INBOX` (`"/desk/mailbox"` → `"/desk/inbox"`).
- Every `/desk/mailbox/...` literal href updated to `/desk/inbox/...`: `_inbox-table.tsx` row
  links, `desk/_detail-ui.tsx`'s ticket link, `_filed-issues-table.tsx`'s Origin Ticket link,
  `_ticket-detail.tsx`'s back-link (+ its label, "Back to Mailbox" → "Back to Inbox").
  `/api/desk/tickets/**` stays untouched, as established — it's keyed to the `tickets` DB table
  name, not this page route.
- Sidebar label "Mailbox" → "Inbox" (order unchanged: Inbox, Tickets, Contacts); page `<title>`
  "Desk · Mailbox" → "Desk · Inbox".
- Every doc comment referencing "Mailbox" across the touched files updated to "Inbox," except a
  few intentionally left as historical rename-chain notes (e.g. "renamed from Tickets then
  Mailbox by task 363") documenting the naming history rather than describing current behavior.
- Verified no unrelated "mailbox" occurrences were touched — several exist in
  `src/lib/email/*`/`src/lib/zoho/mail.ts`/`src/lib/validation/*` referring to the generic email
  concept (SMTP mailbox, IMAP `getMailboxLock`), unrelated to this feature; left alone.
- `npx tsc --noEmit` — PASS. `pnpm lint` — PASS (same 2 pre-existing unrelated warnings). Grepped
  for stray `DESK_MAILBOX`/`/desk/mailbox` after the sweep — none remain.
- Browser acceptance — NOT RUN (same blockers as above).

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. Every Requirements bullet, Out-of-Scope boundary, and file in the Proposed
  File Changes table was checked against the final diff:
  - Mailbox rename is content-identical to the original except the Received column + chip dot +
    9-column grid — no accidental behavior change to filters/search/pagination/thread actions.
  - Every `/api/desk/tickets/**` fetch call site and the `tickets` table/RLS are untouched, as the
    Out-of-Scope section required (verified by re-grepping for `desk/tickets` after the move: only
    comment-only stale references remained, both fixed).
  - `ticketDbId` is threaded as a required prop through all four layers with no missed call site
    (confirmed by a clean `tsc` — a missed site would have been a compile error).
  - "Create Task" path (`CreateTaskModal`) is untouched — only the `mode === "issue"` branch of
    `ThreadToProjectModal` gained `sourceTicketId`.
  - New Tickets tab has no time-logging UI (read-only hours span only), no severity edit control,
    no bulk actions, no CSV export, no RLS change, and the `!isDev` sidebar gate is untouched —
    all per the locked-in decisions and Out-of-Scope list.
  - `(issuesRes.data ?? []) as unknown as FiledIssueRow[]` in the new `page.tsx` is a broader
    single-cast than this codebase's more common per-field `(x as unknown as {...} | null)`
    pattern (`_load-detail-data.ts`, `_load-list-data.ts`, `orchestration/_content.tsx`), but the
    Mailbox `page.tsx` it was modeled on uses the same whole-row-cast shape (`as TicketRow[]`,
    without `unknown` — not needed there); `unknown` was only added here because `tsc` required it
    for the two new embedded relations. Consistent with an already-mixed codebase convention, not
    a new escape-hatch pattern — no action taken.
  - No dead code, no new `any`, no `style={{}}`, no debug logging, no secrets.
- File lengths: every new/moved file is within the soft-warning range except the pre-existing
  595-line `_ticket-detail.tsx` (was 594 before this task's 2-line edit) — not introduced by this
  task and not in its Requirements or File Changes as something to split.
- Design hook findings across every touched/new file are the same pre-existing `text-[NNpx]`
  literal convention CLAUDE.md documents as this codebase's established pattern (and the sidebar's
  flagged colors are pre-existing navy-chrome hex values this task didn't touch) — not new drift.

### Deviations
- Minor: `GET /api/staff/members` delegates to the existing `getAssignableMembers()` helper
  (discovered during implementation) instead of writing new query logic as the task doc's file
  plan implied — documented in Implementation Notes' Deviations section; no functional gap, less
  code than planned, and it reuses this codebase's single source of truth for "who's assignable"
  (task 351) rather than forking a second role list.
- Minor: the prop→state re-sync in `_filed-issues-index.tsx` uses React's "adjust state during
  render" pattern instead of a `useEffect`, to satisfy `react-hooks/set-state-in-effect` (an ESLint
  rule that only surfaced at lint time). Behaviorally identical to what the task doc anticipated.
- No Major or Medium deviations.

### Required Fixes
- None.
