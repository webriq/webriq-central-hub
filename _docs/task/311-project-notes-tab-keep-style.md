# 311: Project Notes Tab — Google Keep-Style Notes, Folders & Collaborator Sharing (v2 + Legacy)

**Created:** 2026-08-26
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Add a "Notes" tab to the project detail page — present on **both** `/projects/legacy/[projectId]` and `/projects/v2/[projectId]`, since both variants already render the exact same shared `ProjectDetail` component (`src/app/(hub)/projects/_shared/_project-detail.tsx`) and tab-strip (`_project-detail-tab-strip.tsx`) behind two thin per-variant `page.tsx` wrappers — this is the same pattern the Files/Access/Members/Status Report/Time Logs tabs already follow (see `_files-tab.tsx`, task 276), so Notes slots in beside them rather than needing two parallel implementations.

Visually and functionally it should read as a project-scoped Google Keep, per the three reference screenshots: a "Take a note…" capture bar at the top, pinned notes in their own section above the rest (image 1), notes groupable into user-created folders (image 2's left-rail labels, scoped down to this one project instead of a whole app), and a note editor (image 3) with a title, a body, a background-color picker, pin toggle, and an "add collaborator" control that shares the note to a specific person with either **view** or **edit** permission. A note opened by someone other than its author shows "Shared by `<author name>`".

This is a genuinely new data domain for the Hub (three new tables + RLS), not a re-skin of an existing feature, and it touches the shared tab-strip/detail component both route variants depend on — hence **deep** tier.

### Scope decisions (please flag in review if any of these should change)

- **Staff-only feature.** Notes are an internal PM/Dev tool, not customer-facing — gated to `admin`, `super_admin`, `pm`, `developer` (same role set `_get-project-detail-data.ts` already uses for `allMembers`, and the same set `desk_agents`'s RLS uses). The Notes tab pill is hidden for any other role that can reach this page (`client`, `marketing`), mirroring how the tab-strip already hides `status_report` from `developer`.
- **Private by default, shared explicitly.** A note is visible only to its author, any user explicitly added as a collaborator, and `admin`/`super_admin` (oversight parity with every other staff table in this app). There is no "whole project team can see every note" mode — that's the real Google Keep behavior the screenshots are modeling.
- **Collaborator picker draws from `allMembers`**, already fetched by `getProjectDetailData()` and already passed into `ProjectDetail` — no new staff-directory fetch needed. Known limitation to call out, not solve here: a `developer` collaborator who has no `project_members` row and no assigned task on this project cannot open the project page at all (`isProjectVisibleToCurrentUser`, `src/app/(hub)/projects-old/_project-access.ts`), so sharing a note to them doesn't itself grant them access to see it. `admin`/`super_admin`/`pm` always have project visibility, so this only affects developer-to-developer shares outside the assigned team.
- **Out of scope** (present in the reference screenshots' generic Keep toolbar but not part of what was asked, and not worth the added surface area right now): reminders/due dates on notes, image attachments inside a note, rich text/per-character text color, undo/redo, a trash/restore flow (delete is a hard delete, matching how e.g. asset deletes already work in this app), checklist-style notes, and cross-project note search. Archiving **is** included (it's a single boolean, directly visible as an icon in image 3's toolbar, and cheap).
- **Plain text body**, not the Tiptap rich editor already used for task descriptions (`_task-description-editor.tsx`) — real Google Keep notes are plain text; adding rich formatting isn't part of the ask.

## Requirements

- [ ] "Notes" tab appears in the project detail tab strip on both `/projects/v2/[projectId]` and `/projects/legacy/[projectId]`, hidden for `client`/`marketing`.
- [ ] Notes render in a Keep-style grid: a "Take a note…" capture bar opens the note editor; a **Pinned** section renders above an **Others** section (pinned notes always float to the top); an **Archived** view is reachable separately (not mixed into the main grid).
- [ ] Users can create a folder (scoped to the current project) to group notes, rename it, and delete it (deleting a folder unfiles its notes rather than deleting them).
- [ ] Note editor (image 3 shape): Title, body, pin toggle, background color picker (fixed palette), folder assignment, archive action, delete action, "add collaborator" control.
- [ ] Adding a collaborator shares the note to that specific person with a chosen permission — **view** (read-only) or **edit** (can change title/body/color/pin/archive, cannot delete unless also the author or an admin).
- [ ] A note opened by a collaborator (not its author) displays "Shared by `<author full name>`".
- [ ] All reads/writes are enforced by Postgres RLS (author/collaborator/admin visibility and edit rules), not just client-side gating.
- [ ] UI follows `_final_design/guide/central-hub-design-system.md` tokens (existing `#F4F6FB`/`#E2E7F2`/`#0B1533`/`#3A4565`/`#5F6A88`/`#007BFF` palette already used throughout `_project-detail.tsx` and its sibling tabs) — no new ad hoc color system except the small, deliberate note background-color palette described below.
- [ ] Every new `.tsx` file stays within `nextjs-file-length-best-practices.md` guidance (soft warning ~250-300 lines) by following the same wrapper/presentational split the Files tab already uses.

## Out of Scope / Must-Not-Change

- Reminders, image attachments inside notes, rich text/text-color formatting, undo/redo, trash/restore, checklist notes, cross-project note search — see Scope decisions above.
- Do not touch `tasks.notes` (an unrelated pre-existing free-text column on the `tasks` table) — naming collision only, no relation to this feature's new `notes` table.
- Do not change `_files-tab.tsx`, `_access-tab.tsx`, `_members-tab.tsx`, `_status-report-tab.tsx`, `_time-logs-tab.tsx`, or any onboarding-workspace file — Notes is additive, siblings stay as-is.
- Do not grant `client`/`marketing` any notes visibility.
- Do not extend `isProjectVisibleToCurrentUser` / developer project-access rules to accommodate note sharing — out of scope per the known limitation above.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/120_project_notes.sql` | Create | `notes`, `note_folders`, `note_collaborators` tables + RLS + indexes |
| `src/types/database.ts` | Modify | Hand-add `notes` / `note_folders` / `note_collaborators` table types (this repo has no `gen-types` script — types are hand-maintained, see `desk_agents` entry as the template) |
| `src/app/(hub)/projects/_shared/_project-detail-tab-strip.tsx` | Modify | Add `"notes"` to `DetailTabId`, add its pill to `BASE_TABS`, hide it for `client`/`marketing` |
| `src/app/(hub)/projects/_shared/_project-detail.tsx` | Modify | Add `"notes"` to `PrimaryTab`, render `<NotesTab />` when `primaryTab === "notes"` |
| `src/app/(hub)/projects/_shared/_notes-tab.tsx` | Create | Data-wrapping component (fetch + mutate), thin, mirrors `_files-tab.tsx` |
| `src/app/(hub)/projects/_shared/_notes/_notes-types.ts` | Create | Shared TS types (`NoteRow`, `NoteFolder`, `NoteCollaborator`) + `NOTE_COLORS` static Tailwind class map |
| `src/app/(hub)/projects/_shared/_notes/_notes-board.tsx` | Create | Capture bar + folder rail + Pinned/Others/Archived sections + grid |
| `src/app/(hub)/projects/_shared/_notes/_note-card.tsx` | Create | Individual Keep-style card (title, body preview, pin, color, "Shared by", collaborator avatars) |
| `src/app/(hub)/projects/_shared/_notes/_note-editor-modal.tsx` | Create | Create/edit modal matching image 3 |
| `src/app/(hub)/projects/_shared/_notes/_note-color-picker.tsx` | Create | Small popover, fixed pastel swatch palette |
| `src/app/(hub)/projects/_shared/_notes/_note-collaborator-picker.tsx` | Create | Search-to-add person picker (reuses `allMembers`) + per-person view/edit toggle, modeled on `_permission-picker.tsx`'s `PermissionFields` |
| `src/app/(hub)/projects/_shared/_notes/_note-folder-rail.tsx` | Create | Slim left rail: All notes / Pinned / one row per folder + "New folder" / Archived |
| `src/app/api/projects/[projectId]/notes/route.ts` | Create | `GET` list (own + shared + admin-visible), `POST` create |
| `src/app/api/projects/[projectId]/notes/[noteId]/route.ts` | Create | `PATCH` update, `DELETE` |
| `src/app/api/projects/[projectId]/notes/[noteId]/collaborators/route.ts` | Create | `POST` add collaborator |
| `src/app/api/projects/[projectId]/notes/[noteId]/collaborators/[userId]/route.ts` | Create | `PATCH` change permission, `DELETE` remove |
| `src/app/api/projects/[projectId]/notes/folders/route.ts` | Create | `GET` list, `POST` create folder |
| `src/app/api/projects/[projectId]/notes/folders/[folderId]/route.ts` | Create | `PATCH` rename, `DELETE` |
| `src/app/(hub)/projects/v2/[projectId]/(tabs)/notes/page.tsx` | Create | Thin V2 route wrapper, mirrors `(tabs)/files/page.tsx` exactly |
| `src/app/(hub)/projects/legacy/[projectId]/(tabs)/notes/page.tsx` | Create | Thin Legacy route wrapper, mirrors `(tabs)/files/page.tsx` exactly |

## Code Context

### `_project-detail-tab-strip.tsx` — add the pill (`src/app/(hub)/projects/_shared/_project-detail-tab-strip.tsx:12-57`)

```tsx
export type DetailTabId =
  | "overview" | "timeline" | "tasks" | "issues" | "milestones"
  | "files" | "notes" | "access" | "members" | "status_report" | "time_logs";

const BASE_TABS: { id: DetailTabId; label: string }[] = [
  { id: "tasks", label: "Tasks" },
  { id: "issues", label: "Issues" },
  { id: "milestones", label: "Milestones" },
  { id: "files", label: "Files" },
  { id: "notes", label: "Notes" },
  { id: "access", label: "Access" },
  { id: "members", label: "Members" },
  { id: "status_report", label: "Status Report" },
  { id: "time_logs", label: "Time Logs" },
];
// ...
const tabs = [OVERVIEW_TAB, ...(variant === "v2" ? [TIMELINE_TAB] : []), ...BASE_TABS]
  .filter((tab) => tab.id !== "status_report" || role !== "developer")
  .filter((tab) => tab.id !== "notes" || (role !== "client" && role !== "marketing"));
```

### `_project-detail.tsx` — wire the tab (`src/app/(hub)/projects/_shared/_project-detail.tsx:45`, `:700-706`)

```tsx
type PrimaryTab = "tasks" | "issues" | "milestones" | "files" | "notes" | "access" | "members" | "status_report" | "time_logs";
// ...
import { NotesTab } from "./_notes-tab";
// ...
{primaryTab === "notes" && (
  <NotesTab
    projectId={project.id}
    currentUserId={currentUserId}
    currentUserRole={currentUserRole}
    allMembers={allMembers}
  />
)}
```

### `_files-tab.tsx` — the wrapper/presentational split to replicate (`src/app/(hub)/projects/_shared/_files-tab.tsx`)

Full file already read during planning — `_notes-tab.tsx` should follow the exact same shape: `useState` for loading/data, one `useEffect` fetching everything in parallel on mount, one small `handleX` async function per mutation that optimistically updates local state then calls the matching API route, and a thin JSX return that hands everything off to a presentational component (`_notes/_notes-board.tsx` playing the role `FilesTabPresentational` plays for Files).

### `desk_agents` migration (`supabase/migrations/118_desk_agents_table.sql`) — RLS style template

```sql
create policy "desk_agents_staff_read"
  on desk_agents for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));
```

`get_my_role()` is the `security definer` helper from migration 026 — always call it, never replicate its logic inline (per this repo's own convention, see CLAUDE.md).

### Proposed migration body (`supabase/migrations/120_project_notes.sql`)

```sql
-- Migration 120: Project Notes — Google Keep-style notes, folders, collaborator sharing (task 311)

create table note_folders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  folder_id uuid references note_folders(id) on delete set null,
  title text,
  content text,
  color text not null default 'default',
  is_pinned boolean not null default false,
  is_archived boolean not null default false,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table note_collaborators (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references notes(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  permission text not null check (permission in ('view', 'edit')),
  added_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (note_id, user_id)
);

alter table note_folders enable row level security;
alter table notes enable row level security;
alter table note_collaborators enable row level security;

create policy "note_folders_staff_read" on note_folders for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));
create policy "note_folders_insert" on note_folders for insert to authenticated
  with check (get_my_role() in ('admin', 'super_admin', 'pm', 'developer') and created_by = auth.uid());
create policy "note_folders_update" on note_folders for update to authenticated
  using (created_by = auth.uid() or get_my_role() in ('admin', 'super_admin'));
create policy "note_folders_delete" on note_folders for delete to authenticated
  using (created_by = auth.uid() or get_my_role() in ('admin', 'super_admin'));

create policy "notes_select" on notes for select to authenticated
  using (
    created_by = auth.uid()
    or get_my_role() in ('admin', 'super_admin')
    or exists (select 1 from note_collaborators nc where nc.note_id = notes.id and nc.user_id = auth.uid())
  );
create policy "notes_insert" on notes for insert to authenticated
  with check (get_my_role() in ('admin', 'super_admin', 'pm', 'developer') and created_by = auth.uid());
create policy "notes_update" on notes for update to authenticated
  using (
    created_by = auth.uid()
    or get_my_role() in ('admin', 'super_admin')
    or exists (select 1 from note_collaborators nc where nc.note_id = notes.id and nc.user_id = auth.uid() and nc.permission = 'edit')
  );
create policy "notes_delete" on notes for delete to authenticated
  using (created_by = auth.uid() or get_my_role() in ('admin', 'super_admin'));

create policy "note_collaborators_select" on note_collaborators for select to authenticated
  using (
    user_id = auth.uid()
    or get_my_role() in ('admin', 'super_admin')
    or exists (select 1 from notes n where n.id = note_collaborators.note_id and n.created_by = auth.uid())
  );
create policy "note_collaborators_insert" on note_collaborators for insert to authenticated
  with check (
    get_my_role() in ('admin', 'super_admin')
    or exists (select 1 from notes n where n.id = note_collaborators.note_id and n.created_by = auth.uid())
  );
create policy "note_collaborators_update" on note_collaborators for update to authenticated
  using (
    get_my_role() in ('admin', 'super_admin')
    or exists (select 1 from notes n where n.id = note_collaborators.note_id and n.created_by = auth.uid())
  );
create policy "note_collaborators_delete" on note_collaborators for delete to authenticated
  using (
    get_my_role() in ('admin', 'super_admin')
    or exists (select 1 from notes n where n.id = note_collaborators.note_id and n.created_by = auth.uid())
  );

create index notes_project_id_idx on notes(project_id);
create index notes_folder_id_idx on notes(folder_id) where folder_id is not null;
create index note_folders_project_id_idx on note_folders(project_id);
create index note_collaborators_note_id_idx on note_collaborators(note_id);
create index note_collaborators_user_id_idx on note_collaborators(user_id);
```

Per this repo's established pattern (see task 174/176 in `TASKS.md`), **write the migration file but do not apply it** — the user applies migrations directly.

### `database.ts` template to follow (`src/types/database.ts:1064-1092`, the `desk_agents` entry)

```tsx
desk_agents: {
  Row: { id: string; external_id: string; /* ... */ };
  Insert: { id?: string; external_id: string; /* ... */ };
  Update: { id?: string; external_id?: string; /* ... */ };
  Relationships: [];
};
```

Add three matching entries for `notes`, `note_folders`, `note_collaborators`, with `Relationships` pointing at their real FKs (e.g. `notes.folder_id -> note_folders.id`, `note_collaborators.note_id -> notes.id`), same shape as the `issue_comments -> issues` example a few lines below `desk_agents` in that file.

### Collaborator picker precedent (`src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_permission-picker.tsx`)

`PermissionFields` already implements "search staff, click to add, pill with an X to remove" against a `StaffPerson[]` list — `_note-collaborator-picker.tsx` should follow the same interaction shape but source people from the `allMembers` prop (already `{ id, full_name, avatar_url, role }[]`) instead of a separate `staffDirectory` fetch, and add a view/edit toggle per selected person instead of a role-toggle row (there are no roles to pick here, just one of two permissions per person).

### Route param convention (`src/app/api/projects/[projectId]/members/route.ts`)

Confirmed: `[projectId]` under `src/app/api/projects/` resolves to `project.id` (the UUID), used directly as `.eq("project_id", projectId)` — **not** the human-readable `project_id` display column. The new Notes routes must follow this same convention (`ProjectDetail` already has `project.id` in scope to pass down).

### Design tokens (`_final_design/guide/central-hub-design-system.md`)

Reuse existing tokens for all chrome (bars, buttons, inputs, the tab pill itself already matches this). For the note **background-color palette** specifically: do not reuse an existing phase-hue or semantic (`--ok`/`--warn`/`--late`) tint verbatim — the guide states a phase hue "is never reused for a non-phase meaning," and note-card backgrounds are a distinct, larger-surface use than the small state chips those tints exist for. Introduce a small, dedicated set of ~6 pastel note colors (default/white, yellow, green, blue, purple, peach, gray) at a similarly restrained saturation — exact hex values are an implementation-time/design-QA detail (see Implementation Steps — `/frontend-design` and `/impeccable` are explicitly requested for this pass), not something to lock down at planning time. Keep them as a static `Record<NoteColor, { bg: string; border: string }>` Tailwind-class lookup map (never construct class name strings dynamically), per this repo's existing dynamic-styling convention.

## Implementation Steps

1. Write `supabase/migrations/120_project_notes.sql` (tables, RLS, indexes) per Code Context above. Do not run/apply it.
2. Hand-add `notes` / `note_folders` / `note_collaborators` entries to `src/types/database.ts`.
3. Build the API routes under `src/app/api/projects/[projectId]/notes/**` using `createClient()` (session-scoped) so RLS enforces visibility/edit rules transparently — do not reach for `adminClient` here (regular reads/writes, not the documented onboarding exception). List endpoints should embed `note_collaborators(user:profiles(id, full_name, avatar_url))` and the author's `profiles.full_name` via a join so the UI never needs a second round trip for "Shared by X".
4. Build `_notes-tab.tsx` (data wrapper) + the `_notes/` presentational files, following the `_files-tab.tsx` split. Keep each file within the file-length guideline; if `_notes-board.tsx` or `_note-editor-modal.tsx` grow past ~250-300 lines, extract further rather than let one file absorb everything (this is exactly why `_create-task-modal.tsx` pulls in `CollapsibleSection`/`DateTimeFieldPicker`/etc. as separate files instead of inlining them).
5. Wire `_project-detail-tab-strip.tsx` and `_project-detail.tsx` per Code Context above.
6. Add the two thin `notes/page.tsx` route files (v2 and legacy), copying `(tabs)/files/page.tsx` verbatim except `activeTab="notes"` and the metadata title suffix.
7. Run `/frontend-design` and/or `/impeccable` against the finished Notes tab for final visual polish and QA, per the user's explicit request — this is the pass where the note-color palette's exact hex values and card/grid spacing get finalized against the design system, not before.
8. Manually exercise the golden path in a browser per this repo's UI-change convention: create a note, pin it, put it in a new folder, change its color, share it to a second staff account with view permission (confirm they can open but not edit it) and with edit permission (confirm they can edit but not delete unless they're also an admin), archive a note, delete a note, delete a folder with notes in it (confirm the notes survive, unfiled).

## Acceptance Criteria

- [ ] Notes tab visible and functionally identical in shape on both `/projects/v2/[projectId]/notes` and `/projects/legacy/[projectId]/notes`; hidden from `client`/`marketing`.
- [ ] Pinned notes always render above unpinned notes; archived notes never appear in the main grid.
- [ ] Folders can be created, renamed, deleted; deleting a folder unfiles (does not delete) its notes.
- [ ] A note's color, title, body, pin state, folder, and archive state can all be edited from the editor modal and persist after reload.
- [ ] Sharing a note to a collaborator with `view` lets them open/read it but not edit or delete it (confirmed via RLS, not just hidden UI controls).
- [ ] Sharing a note to a collaborator with `edit` lets them change its content but a `DELETE` attempt from that account is rejected unless they are also the author or an admin/super_admin.
- [ ] A collaborator (not the author) sees "Shared by `<author full name>`" on the note.
- [ ] Users outside the author/collaborator/admin set cannot see the note at all, even via direct API call (verify with a second, unrelated staff account).
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] UI has been run through `/frontend-design` or `/impeccable` and visually matches the design system's restrained palette/typography rules (no Space Grotesk in note bodies, no gradient/glassmorphism, pill radii/shadows consistent with the rest of the project detail page).

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual browser pass (no test runner configured in this repo):
# - Create/pin/archive/delete a note on /projects/v2/[projectId]/notes
# - Repeat on /projects/legacy/[projectId]/notes
# - Create a folder, move a note into it, delete the folder, confirm the note is unfiled not deleted
# - Share a note view-only to a second staff account, confirm read-only access
# - Share a note edit-capable to a second staff account, confirm edit works, delete is rejected
# - Confirm a third, unrelated staff account cannot see the note (GET returns it filtered out / 404 on direct fetch)
```

## Compatibility Touchpoints

- No changes to Zoho sync, MCP tool registry (`_docs/mcp-tools.md`), or cron routes — none of this feature touches those surfaces.
- `src/types/database.ts` is hand-maintained in this repo (no `gen-types` script found in `package.json`) — the three new table entries must be added by hand, matching the existing `desk_agents`/`issue_comments` shape exactly so `Database["public"]["Tables"]["notes"]` etc. resolve correctly everywhere they're used.
- Migration file is additive only (three new tables) — no existing table/column changes, no backfill needed.

## Implementation Notes

### What Changed
- Added `notes`, `note_folders`, `note_collaborators` tables + RLS (migration 120) and their hand-written `database.ts` entries.
- Added the full Notes tab UI (`_notes-tab.tsx` data wrapper + `_notes/` presentational components: board, card, editor modal, color picker, collaborator picker, folder rail) and wired it into `_project-detail-tab-strip.tsx` / `_project-detail.tsx`.
- Added the REST routes under `/api/projects/[projectId]/notes/**` (list/create, update/delete, folders CRUD, collaborator share/permission/unshare), all using `createClient()` so RLS is the actual enforcement layer.
- Added the two thin `notes/page.tsx` route wrappers (v2 and legacy), copied from the Files tab's pages per the plan.

### Files Changed
- `supabase/migrations/120_project_notes.sql` - new tables/RLS/indexes (written, not applied — see Verification Run)
- `src/types/database.ts` - hand-added `note_folders`/`notes`/`note_collaborators` table types ahead of `desk_agents`
- `src/app/api/projects/[projectId]/notes/route.ts` - GET (list active/archived via `?archived=`), POST (create)
- `src/app/api/projects/[projectId]/notes/[noteId]/route.ts` - PATCH (partial update), DELETE
- `src/app/api/projects/[projectId]/notes/[noteId]/collaborators/route.ts` - POST (share, upsert on conflict)
- `src/app/api/projects/[projectId]/notes/[noteId]/collaborators/[userId]/route.ts` - PATCH (change permission), DELETE (unshare)
- `src/app/api/projects/[projectId]/notes/folders/route.ts` - GET (list), POST (create)
- `src/app/api/projects/[projectId]/notes/folders/[folderId]/route.ts` - PATCH (rename), DELETE
- `src/app/(hub)/projects/_shared/_notes/_notes-types.ts` - shared types + fixed note-color Tailwind lookup maps
- `src/app/(hub)/projects/_shared/_notes/_note-color-picker.tsx` - background-color popover
- `src/app/(hub)/projects/_shared/_notes/_note-collaborator-picker.tsx` - share/permission popover, sourced from `allMembers`
- `src/app/(hub)/projects/_shared/_notes/_note-card.tsx` - grid card (pin, color, "Shared by", quick actions)
- `src/app/(hub)/projects/_shared/_notes/_note-folder-rail.tsx` - left rail (All notes / folders / New folder / Archived)
- `src/app/(hub)/projects/_shared/_notes/_notes-board.tsx` - capture bar + Pinned/Others/Archived layout
- `src/app/(hub)/projects/_shared/_notes-tab.tsx` - data wrapper (fetch + all mutations), mirrors `_files-tab.tsx`
- `src/app/(hub)/projects/_shared/_project-detail-tab-strip.tsx` - added `"notes"` tab id/pill, role-gated to staff
- `src/app/(hub)/projects/_shared/_project-detail.tsx` - added `"notes"` to `PrimaryTab`, renders `<NotesTab />`
- `src/app/(hub)/projects/v2/[projectId]/(tabs)/notes/page.tsx` - new V2 route wrapper
- `src/app/(hub)/projects/legacy/[projectId]/(tabs)/notes/page.tsx` - new Legacy route wrapper

### Deviations From Plan
- The task doc's proposed tab-strip filter (`role !== "client" && role !== "marketing"`) turned out to be a no-op: `_get-project-detail-data.ts`'s `currentUserRole` is only ever populated for `admin`/`super_admin`/`pm`/`developer` (its own `profilesRes` query is scoped to those four roles) — a client/marketing/hr viewer's `role` is `null` there, not the literal string `"client"`/`"marketing"`, so the denylist form would never actually hide the pill. Shipped as an allowlist instead: `["admin", "super_admin", "pm", "developer"].includes(role ?? "")`.
- `_note-collaborator-picker.tsx`'s permission control is a plain `<select>` (Can view / Can edit) rather than the pill-toggle shape `_permission-picker.tsx`'s role toggles use — a two-option exclusive choice reads more clearly as a dropdown than as two mutually-exclusive pills; functionally equivalent.
- Ran into `/impeccable`'s automatic design-hook scan on every file write (not called explicitly as a slash command — it appears to run as a background hook in this repo). It flagged several `text-[12px]`/`text-[10.5px]` instances against `DESIGN.md`'s documented type ramp (13/11/9.5/22/15/28). Fixed the ones in new Notes files by moving to on-ramp sizes (13px body text, 11px small labels) where that was a clean, no-cost change. Left two categories unchanged, treated as false positives: (1) the note editor's "Close" button at 12px — `DESIGN.md`'s own Buttons section documents "default `8px 15px` padding / 12px text", so 12px is actually on-ramp for buttons, just not cross-referenced by the hook's typography-table check; (2) pre-existing `text-[12px]` instances inside `_project-detail.tsx` and `_project-detail-tab-strip.tsx` that the hook re-flagged on every edit to those files — those lines predate this task and are the exact pattern the new Notes tab pill (`text-[12px]`) matches for visual consistency with its sibling tab pills; rewriting them would be an unrelated, out-of-scope change to shared files per the task doc's "do not broaden scope" boundary. Did not run any `/impeccable hooks ignore-*` command, since suppressing a rule requires explicit user confirmation first (per the hook's own instructions) and these are cosmetic, not functional, findings.
- `/frontend-design` / `/impeccable` were not run as an explicit interactive pass (step 7 of the plan) — the automatic per-file hook above provided continuous, lower-cost feedback during the build instead. Recommend an explicit `/impeccable` or `/frontend-design` pass once the migration is applied and the tab is visually reviewable end-to-end in a browser, per the task doc's original intent.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 remaining warnings are pre-existing, in an unrelated file — `onboarding-workspace/_checklist-tab.tsx`)
- Migration `120_project_notes.sql` - written, **not applied** (per this repo's established convention — see task doc's Code Context note re: tasks 174/176 — the user applies migrations directly)
- Manual browser walkthrough (create/pin/archive/delete/share/folder flows) - SKIPPED: blocked on the migration above (the `notes`/`note_folders`/`note_collaborators` tables don't exist in the live database yet, so every API call in this feature would 500 until it's applied) and on having an authenticated staff session to test with. `pnpm dev` was started standalone as a smoke check — the app builds and serves `200` on `/` with no compile errors from the new code; it was then stopped. **Next step for the user:** apply migration 120, then exercise the acceptance-criteria checklist (create/pin/folder/color/share-view/share-edit/archive/delete/cross-account visibility) in a browser.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Read every changed/new file in full (`_notes-tab.tsx`, all 6 files in `_notes/`, all 6 new API route files, the two page wrappers, the migration, the `database.ts` diff, and the two edited shared files). No dead code, no `any`/untyped escape hatches, no deep nesting, consistent naming, intentional error handling throughout (mirrors the existing `.../assets/[assetId]` route's lookup-then-mutate-then-check-affected-rows shape).
- Fixed two real issues found during review (both applied, see below) rather than just noting them, since they were small and within the same files: a loose `Record<string, unknown>` patch parameter narrowed to a proper `Partial<Pick<NoteRow, ...>>`, and a genuinely dead `disabled:cursor-not-allowed` Tailwind class on an input that's toggled via `readOnly` (which never matches the `disabled:` variant) — replaced with a `cn()` conditional keyed off `readOnly`.
- Found and fixed one functional inconsistency: the editor modal gated the entire "add collaborator" control behind `isAuthor` (literal `note.created_by === currentUserId`), but migration 120's `note_collaborators_insert`/`_update`/`_delete` RLS policies already grant admin/super_admin the same sharing rights as the author (the task doc's own stated "oversight parity" goal). An admin managing a note they didn't personally author would have hit a working RLS-side share but had no UI control to trigger it. Regated to `permission === "owner"` (the existing `getNotePermission` helper, which already treats admin/super_admin as owner) so the UI matches the already-shipped server behavior; removed the now-unused `isAuthor` variable.
- Left the `/impeccable` background hook's remaining font-size findings unchanged, per the rationale already recorded in Implementation Notes' Deviations section (12px is separately documented as the default button-text size in `DESIGN.md`'s own Buttons section; the `_project-detail.tsx`/`_project-detail-tab-strip.tsx` findings are pre-existing lines outside this task's changed scope). No new findings introduced beyond those already addressed during implementation.
- Verified the file-length guideline still holds after the two edits above: `_notes-tab.tsx` 225 lines, `_note-editor-modal.tsx` 200 lines — both comfortably under the ~250-300 soft-warning threshold.
- Re-ran `npx tsc --noEmit` and `pnpm lint` after all fixes — both clean (lint's 2 warnings are the same pre-existing, unrelated `onboarding-workspace/_checklist-tab.tsx` warnings noted in Implementation Notes).

### Deviations
- Minor: the two fixes above (patch-type narrowing, dead Tailwind class) are implementation cleanups within already-declared file scope, not scope changes.
- Minor: the `isAuthor` → `permission === "owner"` regate is a correctness fix that makes the UI consistent with already-implemented, already-planned RLS behavior (admin oversight parity was explicit in the task doc's Scope Decisions) — not new product scope, just closing a gap between two mechanisms built in the same task.
- All deviations already recorded in Implementation Notes (role-filter allowlist fix, `<select>` vs pill-toggle for permission, `/impeccable` automatic-hook vs explicit interactive pass) remain accurate and are not reclassified here.

### Required Fixes
- None.

## Completion Note (2026-08-26)

Marked Completed at the user's explicit request. The Notes feature (tables, RLS, API routes, UI) is finished and verified by inspection/`tsc`/`lint` throughout. Migration 120 **has been applied** to the remote database and the user began live testing — which is what surfaced the RLS infinite-recursion bug documented above under "Post-Ship Fix: RLS Infinite Recursion," fixed by `supabase/migrations/121_fix_note_collaborators_rls_recursion.sql`. That follow-up migration is written but **not yet applied**. Whoever applies migration 121 should re-run the original Acceptance Criteria checklist above (create/pin/folder/color/share-view/share-edit/archive/delete/cross-account visibility) — it was blocked by the recursion bug on the first attempt.

## Post-Ship Fix: RLS Infinite Recursion (found during task 313 live testing)

After the user applied migration 120 and began browser-testing (during task 313's work), every `GET`/`POST` against `/api/projects/[projectId]/notes` returned 500 with Postgres error `42P17: infinite recursion detected in policy for relation "note_collaborators"`.

**Root cause**: `notes_select`/`notes_update` subquery `note_collaborators` to check collaborator visibility, while all four `note_collaborators_*` policies subquery `notes` right back to check authorship — a genuine mutual RLS reference that Postgres detects as infinite recursion on essentially every query against either table. This was a defect in migration 120 as originally written, not caught before this because the migration hadn't been applied/browser-tested yet (see this doc's own Verification Run note above).

**Fix**: `supabase/migrations/121_fix_note_collaborators_rls_recursion.sql` (written, not yet applied — same "user applies migrations directly" convention as 120). Adds two `security definer` helper functions (`is_note_author`, `is_note_collaborator`) — the same RLS-bypass pattern this repo already uses for `get_my_role()`/`get_my_customer_id()` (migration 026) — and rewrites the five affected policies (`notes_select`, `notes_update`, `note_collaborators_select`/`_insert`/`_update`/`_delete`) to call them instead of subquerying the other table directly. Since a security-definer function's internal queries run under its owner's privileges, they don't re-trigger the other table's RLS, breaking the cycle. No behavior change to who can see/edit/share what — same visibility rules, just expressed without a circular subquery.

**Action needed**: apply migration 121 (after 120, if not already applied) before continuing the Notes browser walkthrough.
