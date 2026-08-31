# 337: Notes — Folder-Level Sharing & Public/Private Visibility (v2 + Legacy)

**Created:** 2026-08-31
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Testing

---

## Overview

Today a Notes note is shared one collaborator at a time (`note_collaborators`, tasks 311/313).
This task adds **folder-level sharing** so a folder manager can grant a whole folder's contents
to specific Hub users **and/or whole staff roles** in one action, on the Notes tab present on
both `/projects/legacy/[projectId]/notes` and `/projects/v2/[projectId]/notes` (same shared
`ProjectDetail` / `NotesTab` component behind two thin `page.tsx` wrappers — no parallel
implementation).

Because a folder is a shared project resource that anyone on staff can file their own private
notes into, folder sharing must **not** blanket-expose everyone's notes. The model agreed with
the requester:

### The visibility model (decided with the requester — flag in review if any should change)

**Folders get a `visibility`: `private` | `public` (default `private`).**

- **Private folder** — its notes are reachable only by the folder's manager, `admin`/`super_admin`,
  and the explicit **folder shares** (a list of specific users and/or roles, each with `view` or
  `edit`).
- **Public folder** — its notes are reachable by **any staff user** (`pm` / `developer` / `admin` /
  `super_admin`), regardless of whether they were explicitly shared the folder. Notes stay
  **staff-only** — `client` and `marketing` never see notes, and a "public" folder does not change
  that. Public-folder access is **`view` only** (no implicit edit).

**Notes get a `visibility`: `private` | `public` (default `private`).**

- A folder's audience (its shares, or all-staff for a public folder) can only ever see a note in
  that folder **if the note's own author has set that note to `public`.** A folder share never
  exposes a `private` note, and never exposes a note whose author has not opted it in. Each author
  controls their own notes; folder sharing is an *offer of an audience*, per-note opt-in is the
  *acceptance*.
- Any note author can flip their own note `public` / `private`. Flipping **to `public`** while the
  note sits in a shared or public folder shows a **confirmation dialog** naming the audience
  ("This note is in a shared folder. Making it public will let everyone <name the audience> see
  it."). Flipping back to `private` needs no confirmation.
- Per-note `note_collaborators` shares (task 311) are unchanged and orthogonal — an explicit
  collaborator sees a note regardless of its `visibility` or folder.

**Who can set folder visibility / manage folder shares:** the folder's `created_by` or
`admin`/`super_admin` — identical to who can already rename/delete the folder (migration 120
`note_folders_update` / `_delete`). Not every staff member.

**Folder-share targets:** individual users (from `allMembers`, already loaded) **and** roles
`pm` / `developer` / `admin` / `super_admin`. A role share means every current holder of that role
sees the folder's public notes.

## Requirements

- [ ] A folder manager can open a "Share folder" control from the folder rail (hover action next
      to Rename / Delete, only when `canManageFolder(folder)` is true).
- [ ] That control lets them: set the folder **Private/Public**; when Private, add/remove
      individual users and whole roles as shares, each at **view** or **edit**; change an existing
      share's permission; see the current share list.
- [ ] Folder-rail rows visually indicate a folder that is Public (globe icon) or has shares
      (users icon) — next to the existing count badge.
- [ ] The note editor gets a **Public / Private** toggle, shown to the note's **author** (and
      `admin`/`super_admin`) only when the note's folder is shared or public. Toggling **to
      Public** first shows an in-app confirmation dialog (never a browser `confirm()`) that names
      the folder's audience.
- [ ] A note is visible to a folder-share target / public-folder staff **only** when
      `notes.visibility = 'public'` **and** the folder grants that user access. Enforced by
      Postgres RLS, not just client gating.
- [ ] A folder-share target with `edit` permission can edit the folder's public notes
      (title/content/color/pin/archive) exactly like an `edit` per-note collaborator; cannot
      delete. Public-folder all-staff access is view-only.
- [ ] The existing "Shared with me" rail view (task 314) also lists public notes reachable via a
      folder share / public folder, not just per-note collaborations.
- [ ] Deleting a folder removes its shares (FK cascade) and unfiles its notes (`folder_id` → null,
      existing `on delete set null`), so those notes fall back to private / per-note-collaborator
      visibility.
- [ ] `npx tsc --noEmit` and `pnpm lint` clean. New `.tsx` files respect the ~250–300-line soft
      cap (`nextjs-file-length-best-practices.md`) via a shell/presentational split.

## Out of Scope / Must-Not-Change

- **No change to `note_collaborators`** (per-note sharing) behavior, its API routes, or its RLS.
- **No customer/marketing exposure.** "Public folder" = any *staff* user. Do not widen
  `notes` / `note_folders` RLS to `client` / `marketing`. The staff-only gate from task 311 stays.
- **No new global/cross-project page or nav item.** Everything stays inside the project Notes tab.
- **No "share to whole project team" special server path** — a folder share to specific users is
  the mechanism; selecting many users or a role is how you reach a team.
- **Do not apply the migration.** Write `supabase/migrations/127_*.sql`; the requester applies it
  to the remote DB (same policy as tasks 311/120/121 — Notes migrations are written, not applied,
  by the agent).
- Reminders, note attachments beyond what task 313 added, checklist notes, note trash/restore —
  still out of scope.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/127_note_folder_sharing.sql` | Create | `visibility` col on `note_folders` + `notes`; `note_folder_shares` table + RLS; security-definer helpers; rewrite `notes_select` / `notes_update` to add the folder path |
| `src/types/database.ts` | Modify | Add `visibility` to `note_folders` / `notes` Row/Insert/Update; add `note_folder_shares` table type with `Relationships[]` |
| `src/app/(hub)/projects/_shared/_notes/_notes-types.ts` | Modify | `NoteVisibility` type; `visibility` on `NoteRow` + `NoteFolder`; `NoteFolderShare` type + `shares` on `NoteFolder`; extend `getNotePermission` to honor a folder-permission lookup; add `folderPermissionForUser(folders, userId, role)` helper |
| `src/app/api/projects/[projectId]/notes/folders/route.ts` | Modify | `GET` embeds `shares:note_folder_shares(...)` + returns `visibility` |
| `src/app/api/projects/[projectId]/notes/folders/[folderId]/route.ts` | Modify | `PATCH` accepts `visibility` (enum-validated) alongside `name` |
| `src/app/api/projects/[projectId]/notes/folders/[folderId]/shares/route.ts` | Create | `GET` list folder shares; `POST` add a share (`{ user_id? , role? , permission }`) |
| `src/app/api/projects/[projectId]/notes/folders/[folderId]/shares/[shareId]/route.ts` | Create | `PATCH` change permission; `DELETE` remove a share |
| `src/app/api/projects/[projectId]/notes/[noteId]/route.ts` | Modify | `PATCH` accepts `visibility` (enum-validated) in the patch set |
| `src/app/(hub)/projects/_shared/_notes-tab.tsx` | Modify | Folder-share + folder-visibility + note-visibility mutations; recompute `sharedNotes`; compute + pass `folderPermission` map |
| `src/app/(hub)/projects/_shared/_notes/_note-folder-rail.tsx` | Modify | "Share folder" hover action + Public / shared indicators; new props |
| `src/app/(hub)/projects/_shared/_notes/_note-folder-share-dialog.tsx` | Create | Modal: Private/Public toggle + user & role multi-select + current-share list |
| `src/app/(hub)/projects/_shared/_notes/_note-editor-modal.tsx` | Modify | Public/Private toggle + confirm-to-public dialog; auto-create hook reuse (task 315) |
| `src/app/(hub)/projects/_shared/_notes/_note-card.tsx` | Modify | "Public" (globe) badge when the note is exposed via its folder |
| `src/app/(hub)/projects/_shared/_notes/_notes-board.tsx` | Modify | Thread `folderPermission` + folder-visibility props through to card/grid |
| `CLAUDE.md` | Modify | One line under Key Conventions documenting the folder-share / note-`visibility` model |

## Code Context

### Current RLS (migration 120, patched by 121)

`notes_select` = `created_by = auth.uid() OR get_my_role() in ('admin','super_admin') OR is_note_collaborator(id)`.
`notes_update` = same but `is_note_collaborator(id, 'edit')`.
`notes_delete` = author or admin only.
`note_folders` is readable by **all** staff already (`note_folders_staff_read`), so folder *rows*
need no RLS change — only note *contents* are gated. `note_folders_update` / `_delete` are already
`created_by = auth.uid() OR admin/super_admin` — reuse that as the folder-share manage gate.
Migration 121 established the pattern: **cross-table RLS checks must go through `security definer`
SQL helpers** (`is_note_author`, `is_note_collaborator`) to avoid `42P17` recursion. New helpers
here must follow suit.

### Migration 127 sketch

```sql
-- Migration 127: Notes folder-level sharing + public/private visibility (task 337)

alter table note_folders add column visibility text not null default 'private'
  check (visibility in ('private','public'));
alter table notes        add column visibility text not null default 'private'
  check (visibility in ('private','public'));

create table note_folder_shares (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references note_folders(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text check (role in ('pm','developer','admin','super_admin')),
  permission text not null check (permission in ('view','edit')),
  added_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  -- exactly one target: a user OR a role, never both/neither
  constraint note_folder_shares_target_ck check ((user_id is not null) <> (role is not null))
);
create unique index note_folder_shares_user_uq on note_folder_shares(folder_id, user_id) where user_id is not null;
create unique index note_folder_shares_role_uq on note_folder_shares(folder_id, role)    where role    is not null;
create index note_folder_shares_folder_idx on note_folder_shares(folder_id);
create index note_folder_shares_user_idx   on note_folder_shares(user_id) where user_id is not null;

alter table note_folder_shares enable row level security;

-- security-definer helpers (RLS-bypass pattern from migration 121) --------------
create or replace function is_note_folder_manager(p_folder_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from note_folders f where f.id = p_folder_id and f.created_by = auth.uid());
$$;

-- does folder visibility / an explicit share grant the current user access to
-- this folder's PUBLIC notes?  p_require_edit => only true if that access is 'edit'.
create or replace function can_access_note_folder(p_folder_id uuid, p_require_edit boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from note_folders f
    where f.id = p_folder_id
      and (
        (not p_require_edit
           and f.visibility = 'public'
           and get_my_role() in ('pm','developer','admin','super_admin'))
        or exists (
          select 1 from note_folder_shares s
          where s.folder_id = f.id
            and (s.user_id = auth.uid() or s.role = get_my_role())
            and (not p_require_edit or s.permission = 'edit')
        )
      )
  );
$$;
-- NOTE: p_folder_id null (unfiled note) => no matching row => false. Good.

-- notes: add the folder path -------------------------------------------------
drop policy if exists "notes_select" on notes;
create policy "notes_select" on notes for select to authenticated using (
  created_by = auth.uid()
  or get_my_role() in ('admin','super_admin')
  or is_note_collaborator(id)
  or (visibility = 'public' and folder_id is not null
      and (is_note_folder_manager(folder_id) or can_access_note_folder(folder_id)))
);

drop policy if exists "notes_update" on notes;
create policy "notes_update" on notes for update to authenticated using (
  created_by = auth.uid()
  or get_my_role() in ('admin','super_admin')
  or is_note_collaborator(id, 'edit')
  or (visibility = 'public' and folder_id is not null and can_access_note_folder(folder_id, true))
);
-- notes_delete unchanged (author / admin only)

-- note_folder_shares policies ---------------------------------------------------
create policy "note_folder_shares_select" on note_folder_shares for select to authenticated using (
  user_id = auth.uid()
  or role = get_my_role()
  or get_my_role() in ('admin','super_admin')
  or is_note_folder_manager(folder_id)
);
create policy "note_folder_shares_insert" on note_folder_shares for insert to authenticated with check (
  added_by = auth.uid()
  and (get_my_role() in ('admin','super_admin') or is_note_folder_manager(folder_id))
);
create policy "note_folder_shares_update" on note_folder_shares for update to authenticated using (
  get_my_role() in ('admin','super_admin') or is_note_folder_manager(folder_id)
);
create policy "note_folder_shares_delete" on note_folder_shares for delete to authenticated using (
  get_my_role() in ('admin','super_admin') or is_note_folder_manager(folder_id)
);
```

### `getNotePermission` extension (`_notes-types.ts`)

```ts
// key = folder_id, value = the current user's effective folder permission (only when > their
// per-note permission). Computed once in NotesTab from `folders` (visibility + RLS-filtered shares).
export function getNotePermission(
  note: NoteRow, currentUserId: string, currentUserRole: string | null,
  folderPermission?: Map<string, "view" | "edit">,
): NotePermission {
  if (note.created_by === currentUserId) return "owner";
  if (currentUserRole === "admin" || currentUserRole === "super_admin") return "owner";
  const collab = note.collaborators.find((c) => c.user_id === currentUserId);
  if (collab?.permission === "edit") return "edit";
  if (note.visibility === "public" && note.folder_id) {
    const fp = folderPermission?.get(note.folder_id);
    if (fp === "edit") return "edit";
    if (fp) return "view";
  }
  return "view"; // collaborator 'view', or folder 'view', or (shouldn't reach here) fallthrough
}
```

`folderPermissionForUser(folders, userId, role)` returns the `Map`: for each folder, `'edit'` if a
share row targets `userId`/`role` at edit; else `'view'` if a share targets them or
`folder.visibility === 'public'`; else omit.

### `NotesTab` — recomputed "Shared with me"

```ts
// task 314's sharedNotes, widened for folder-granted public notes
const folderPermission = useMemo(
  () => folderPermissionForUser(folders, currentUserId, currentUserRole), [folders, currentUserId, currentUserRole]);
const sharedNotes = useMemo(() => notes.filter((n) =>
  !n.is_archived && n.created_by !== currentUserId && (
    n.collaborators.some((c) => c.user_id === currentUserId) ||
    (n.visibility === "public" && n.folder_id != null && folderPermission.has(n.folder_id))
  )), [notes, currentUserId, currentUserRole, folderPermission]);
```

### UI anchor points

- **Folder rail** (`_note-folder-rail.tsx:125-148`) — the `canManageFolder(folder)` hover block
  currently holds Rename + Delete `IconTip` buttons. Add a `Share2` / `Users` button there opening
  `NoteFolderShareDialog`. Persistent Public/shared indicator goes near the count badge at
  `:120-123`.
- **Editor toolbar** (`_note-editor-modal.tsx:190-232`) — the left-hand `flex` holds color / share
  / archive / delete. Add the visibility toggle after the color picker, gated on
  `isLiteralAuthorOrAdmin && folderIsSharedOrPublic`. The confirm dialog is a local `useState`
  in-modal overlay (match `_note-editor-modal`'s own `fixed inset-0` pattern — **no** `window.confirm`).
  Auto-create-on-first-action already exists as `ensureNoteCreated()` (`:91-101`); reuse it so
  flipping Public on a not-yet-saved note in a shared folder creates it first, exactly like
  `handleShareMany` (`:103-107`).
- **`_note-folder-share-dialog.tsx`** — model on `_note-editor-modal.tsx` (overlay) + reuse
  `_note-collaborator-picker.tsx`'s checkbox multi-select + select-all + batch-permission shape
  for the user list; a parallel small checkbox list for the 4 roles. Watch the line cap — if it
  runs long, keep the dialog as the shell and extract the user+role picker into a sibling file.

### Design tokens

Reuse the existing Notes palette only — `#F4F6FB` / `#E2E7F2` / `#0B1533` / `#3A4565` /
`#5F6A88` / `#007BFF` / `#C0392B`, `rounded-[10px]`/`[14px]`, `text-[11px]`/`[13px]`,
`accent-[#007BFF]` checkboxes, `lucide-react` icons (`Globe`, `Lock`, `Users`, `Share2`). No new
color system. Tailwind classes only, no `style={{}}` except the existing borderColor pattern.

## Implementation Steps

1. **Migration 127** — columns, `note_folder_shares`, helpers, rewritten `notes_select`/`_update`,
   folder-share policies. Do **not** apply it.
2. **`database.ts`** — add the column + table types (`Relationships[]` on the new table:
   `folder_id`→`note_folders`, `user_id`→`profiles`, `added_by`→`profiles`).
3. **`_notes-types.ts`** — `NoteVisibility`, `visibility` on `NoteRow`/`NoteFolder`,
   `NoteFolderShare` + `shares` on `NoteFolder`, `getNotePermission` extra arg,
   `folderPermissionForUser`.
4. **API** — folders `GET` embed `shares` + `visibility`; folder `PATCH` accept `visibility`;
   new `folders/[folderId]/shares` (`GET`/`POST`) + `shares/[shareId]` (`PATCH`/`DELETE`); note
   `PATCH` accept `visibility`. All use `createClient()` (RLS), never `adminClient` — mirror the
   existing 403-on-zero-rows shape from the sibling collaborator routes.
5. **`_notes-tab.tsx`** — state + mutations: `setFolderVisibility`, `shareFolder`(batch users +
   roles), `changeFolderSharePermission`, `unshareFolder`, `changeNoteVisibility`; keep `folders`
   state's `shares` in sync; compute `folderPermission`; widen `sharedNotes`; pass new props down.
6. **`_note-folder-rail.tsx`** — "Share folder" hover action + indicators + `onShareFolder` prop.
7. **`_note-folder-share-dialog.tsx`** — new modal (visibility toggle, user multi-select, role
   multi-select, current-share list with per-row permission + remove).
8. **`_note-editor-modal.tsx`** — visibility toggle + confirm-to-public in-app dialog +
   `ensureNoteCreated()` reuse + `onChangeVisibility` prop.
9. **`_note-card.tsx` / `_notes-board.tsx`** — thread `folderPermission` + folder-visibility so
   `getNotePermission` is correct on cards, and render the "Public" badge on exposed notes.
10. **`CLAUDE.md`** — one Key-Conventions line.
11. `npx tsc --noEmit` + `pnpm lint`.

## Acceptance Criteria

- [ ] As folder manager: set a folder Public → a second staff user (never shared anything) sees
      that folder's **public** notes, does **not** see its **private** notes, and cannot edit.
- [ ] As folder manager: keep folder Private, add user B (view) and role `developer` (edit) →
      B sees public notes read-only; every developer can edit public notes in that folder; a
      `pm` who is not user B and was not shared sees nothing from that folder.
- [ ] Author flips their own note to Public inside a shared folder → confirmation dialog names the
      audience; on confirm, that note appears for the folder's audience; flipping back to Private
      immediately removes it for them (no dialog).
- [ ] A `private` note in a shared/public folder is **never** visible to the folder audience,
      even if authored by the folder manager.
- [ ] Folder-granted public notes show up in the recipient's "Shared with me" rail view.
- [ ] `edit`-granted folder-share user can change title/body/color/pin/archive on a public note,
      cannot delete it; view-granted and public-folder users get a read-only editor.
- [ ] Deleting the folder: shares vanish, notes unfile, and previously-exposed notes are no longer
      visible to the ex-audience.
- [ ] Per-note `note_collaborators` sharing still works unchanged for `private` notes.
- [ ] No `client` / `marketing` user can see any note via any folder path.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Browser acceptance (after the requester applies migration 127), on both
`/projects/legacy/<projectId>/notes` and `/projects/v2/<projectId>/notes`, with 3 test accounts
(a folder manager, a shared `view` user, an unshared same-role user) plus one `client` account to
confirm zero note exposure — walk the Acceptance Criteria list. RLS is the real gate: verify a
direct PATCH from a view-only folder-share user returns 403 (row visible, 0 rows updated), matching
the note-collaborator route precedent.

## Implementation Notes

### What Changed
- **Migration 127** (`127_note_folder_sharing.sql`, written **not applied**) — `visibility` text
  columns on `note_folders` + `notes` (default `'private'`, checked); `note_folder_shares` table
  (one target per row: `user_id` XOR `role`; partial unique indexes per target kind); security-
  definer helpers `is_note_folder_manager()` / `can_access_note_folder(p_folder_id, p_require_edit)`
  per migration 121's anti-recursion pattern; `notes_select` / `notes_update` rewritten to add the
  folder path; four `note_folder_shares_*` policies gated to folder manager / admin.
- **`database.ts`** — `visibility` on `note_folders` + `notes` Row/Insert/Update; new
  `note_folder_shares` table type with `Relationships[]` (folder_id → note_folders, user_id +
  added_by → profiles).
- **`_notes-types.ts`** — `NoteVisibility`, `NoteFolderShareRole`, `NoteFolderShare`; `visibility`
  on `NoteRow` + `NoteFolder`, optional `shares?` on `NoteFolder`; `getNotePermission` gained an
  optional `folderPermission` map arg (widens, never narrows); new `folderPermissionForUser()`.
- **API** — folders `GET` embeds `visibility` + `shares` with a **bare-select fallback** when the
  embed errors (migration 127 not applied yet); folder `PATCH` accepts `visibility` alongside/
  instead of `name`; new `folders/[folderId]/shares` (`GET`/`POST`, POST upserts on the partial
  unique index by re-`PATCH`ing permission on `23505`) + `shares/[shareId]` (`PATCH`/`DELETE`);
  note `PATCH` accepts `visibility`. All `createClient()` (RLS), 403-on-zero-rows shape.
- **`_notes-tab.tsx`** — `setFolderVisibility` / `shareFolder` (batched users + roles) /
  `changeFolderSharePermission` / `unshareFolder` / note `changeNoteVisibility` (via widened
  `patchNote`); `folderPermission` + `exposedFolderIds` memos; `sharedNotes` widened to include
  folder-granted public notes; renders `<NoteFolderShareDialog>` as an editor-modal-style sibling.
- **`_note-folder-rail.tsx`** — `Share2` hover action (manager-gated) + persistent Globe (public)
  / Users (has shares) indicator beside the count badge; `onShareFolder` prop.
- **`_note-folder-share-dialog.tsx`** (new, ~250 lines) — Private/Public segmented toggle;
  Private mode shows current-share list (per-row permission + remove), a 2×2 role checkbox grid,
  and a searchable people multi-select with a batch view/edit permission + Share button. Public
  mode hides share management and explains all-staff view-only access.
- **`_note-editor-modal.tsx`** — Globe/Lock visibility toggle after the collaborator picker,
  shown only to `permission === "owner"` when the note's folder is in `exposedFolderIds`; flip
  **to** public opens an in-app confirm overlay (`describeFolderAudience()` names the audience;
  reuses `ensureNoteCreated()` so an unsaved note is created first); flip back is immediate.
- **`_note-card.tsx` / `_notes-board.tsx`** — `folderPermission` + `isFolderExposed` threaded to
  every card; "Public" globe badge when `note.visibility === 'public'` and its folder is exposed.
- **`CLAUDE.md`** — one Key-Conventions bullet on the two sharing axes + the per-note opt-in model.

### Files Changed
- `supabase/migrations/127_note_folder_sharing.sql` - new migration (written, not applied)
- `src/types/database.ts` - column + table types
- `src/app/(hub)/projects/_shared/_notes/_notes-types.ts` - types + permission helpers
- `src/app/api/projects/[projectId]/notes/folders/route.ts` - GET embed + fallback
- `src/app/api/projects/[projectId]/notes/folders/[folderId]/route.ts` - PATCH visibility
- `src/app/api/projects/[projectId]/notes/folders/[folderId]/shares/route.ts` - new GET/POST
- `src/app/api/projects/[projectId]/notes/folders/[folderId]/shares/[shareId]/route.ts` - new PATCH/DELETE
- `src/app/api/projects/[projectId]/notes/[noteId]/route.ts` - PATCH visibility
- `src/app/(hub)/projects/_shared/_notes-tab.tsx` - mutations + wiring
- `src/app/(hub)/projects/_shared/_notes/_note-folder-rail.tsx` - share action + indicators
- `src/app/(hub)/projects/_shared/_notes/_note-folder-share-dialog.tsx` - new dialog
- `src/app/(hub)/projects/_shared/_notes/_note-editor-modal.tsx` - visibility toggle + confirm
- `src/app/(hub)/projects/_shared/_notes/_note-card.tsx` - Public badge + folder permission
- `src/app/(hub)/projects/_shared/_notes/_notes-board.tsx` - prop threading
- `CLAUDE.md` - Key Conventions bullet

### Deviations From Plan
- No new page.tsx wrapper edits — `NotesTab` is rendered inside the already-shared
  `_project-detail.tsx` (both `/projects/legacy` and `/projects/v2` go through
  `getProjectDetailData()`), so the new props are computed inside `NotesTab` and the two thin
  route wrappers needed no change.
- The plan's `NoteFolderShareDialog` sketch put role checkboxes as "a parallel small checkbox
  list"; implemented as a 2×2 grid to keep the dialog under the line cap without a sibling split.
- Impeccable design-hook `design-system-font-size` warnings on `text-[10px]` / `text-[12px]` in
  the new dialog/toggle are left as-is: the task's own Design-tokens section mandates reusing the
  existing Notes type scale (`text-[10px]` role tags, `text-[12px]` modal buttons already ship in
  `_note-collaborator-picker.tsx` / `_note-editor-modal.tsx`).

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (0 errors; 2 pre-existing warnings in an unrelated `_checklist-tab.tsx`)
- Browser acceptance - SKIPPED (blocked on the requester applying migration 127 to the remote DB)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. `npx tsc --noEmit` (project tsconfig) and `pnpm lint` both clean — 0
  errors; the only lint warnings are pre-existing in an unrelated file.
- Types: no new `any` escape hatches. The shares route narrows `role`/`permission` to typed
  unions after validation (`Role` alias, `perm`) rather than casting through `string`.
- RLS: new cross-table checks go through `security definer` helpers per migration 121; no
  recursion path back into `notes`. No policy references `client`/`marketing` — staff-only gate
  preserved.
- Error handling: every new route mirrors the sibling collaborator routes' 401 / 400 /
  403-on-zero-rows / 500 shape. `createClient()` (RLS) throughout — no `adminClient`.
- No debug logging beyond the existing `console.error` diagnostic convention. No secrets.
- `_note-folder-share-dialog.tsx` ≈ 255 lines — within the ~250–300 soft cap; shell +
  inline picker, no dynamic Tailwind class construction, `style={{}}`-free.

### Deviations
- **Minor** — folder-share manage helper `patchFolderState()` in `_notes-tab.tsx` is used once
  (folder visibility). Kept for symmetry with the other folder mutations and readability.
- **Minor** — an `edit`-granted folder-share user can still change a public note's `folder_id`
  via the editor's folder `<select>` (shown to any non-`view` permission, unchanged from task
  311). Moving it into a folder they lack edit on is silently rejected by RLS (0 rows updated);
  the client's optimistic state corrects on the next fetch. Not a regression — edit
  collaborators already had this latitude.
- **Minor** — folders `GET` falls back to a bare `select("*")` on *any* embed error, not only
  the migration-127-missing schema-cache error. Acceptable: the bare select carries the same
  RLS, and after 127 lands the enriched path succeeds normally. Documented in Compatibility
  Touchpoints and the route comment.
- **Minor** — `describeFolderAudience()` returns `"with folder access"` as a fallback when a
  private folder somehow has zero shares; the toggle is gated on `exposedFolderIds` so this
  branch is effectively unreachable, but it degrades safely rather than throwing.

### Required Fixes
- None.

## Compatibility Touchpoints

- **Migration 127 is written, not applied** by the agent — the requester runs it against the
  remote DB (precedent: tasks 311 / 120 / 121). Until applied, the folders `GET` embedding
  `shares` and any `visibility` write fail with a PostgREST schema-cache error; the tab should
  degrade (folders still list, sharing controls no-op) rather than crash — handle a missing
  `shares` key defensively.
- No packaging / install / adapter surface. No new env vars. No MCP tool changes
  (`_docs/mcp-tools.md` untouched — no `server.registerTool` added).
- `src/types/database.ts` must stay in sync with the migration (project convention).
