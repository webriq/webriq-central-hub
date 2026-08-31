-- Migration 127: Notes folder-level sharing + public/private visibility (task 337)
--
-- Adds a second sharing axis alongside per-note `note_collaborators` (migration 120/121):
--   * `note_folders.visibility` : 'private' | 'public'
--       - private → notes reachable only by the folder manager, admin/super_admin, and the
--         explicit folder shares below
--       - public  → notes reachable by ANY staff user (pm/developer/admin/super_admin), view-only
--   * `notes.visibility` : 'private' | 'public'
--       - a folder's audience can only ever see a note when the note's OWN author has opted it
--         to 'public'. A folder share never exposes a private note.
--   * `note_folder_shares` : per-folder grant list — each row targets exactly one of a user OR a
--     role, at 'view' or 'edit'.
--
-- Staff-only stays staff-only: no policy here references 'client' / 'marketing'. "Public folder"
-- means every *staff* user, nothing wider.
--
-- Anti-recursion: migration 121 established that cross-table RLS checks must go through
-- `security definer` SQL helpers (they run as owner, bypassing the read RLS of the table they
-- touch, so `notes` ⇄ `note_folder_shares` can't form a 42P17 recursion cycle). The new helpers
-- below follow that pattern exactly.

alter table note_folders add column visibility text not null default 'private'
  check (visibility in ('private', 'public'));
alter table notes        add column visibility text not null default 'private'
  check (visibility in ('private', 'public'));

create table note_folder_shares (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references note_folders(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text check (role in ('pm', 'developer', 'admin', 'super_admin')),
  permission text not null check (permission in ('view', 'edit')),
  added_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  -- exactly one target: a user OR a role, never both / neither
  constraint note_folder_shares_target_ck check ((user_id is not null) <> (role is not null))
);
create unique index note_folder_shares_user_uq on note_folder_shares(folder_id, user_id) where user_id is not null;
create unique index note_folder_shares_role_uq on note_folder_shares(folder_id, role)    where role    is not null;
create index note_folder_shares_folder_idx on note_folder_shares(folder_id);
create index note_folder_shares_user_idx   on note_folder_shares(user_id) where user_id is not null;

alter table note_folder_shares enable row level security;

-- ── security-definer helpers (RLS-bypass pattern from migration 121) ──────────────────────
create or replace function is_note_folder_manager(p_folder_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from note_folders f
    where f.id = p_folder_id and f.created_by = auth.uid()
  );
$$;

-- Does folder visibility / an explicit share grant the current user access to this folder's
-- PUBLIC notes?  p_require_edit => only true when that access is specifically 'edit'
-- (public-folder all-staff access is view-only, so it never satisfies p_require_edit).
create or replace function can_access_note_folder(p_folder_id uuid, p_require_edit boolean default false)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from note_folders f
    where f.id = p_folder_id
      and (
        (not p_require_edit
           and f.visibility = 'public'
           and get_my_role() in ('pm', 'developer', 'admin', 'super_admin'))
        or exists (
          select 1 from note_folder_shares s
          where s.folder_id = f.id
            and (s.user_id = auth.uid() or s.role = get_my_role())
            and (not p_require_edit or s.permission = 'edit')
        )
      )
  );
$$;
-- NOTE: p_folder_id null (an unfiled note) => no matching folder row => false. Correct.

-- ── notes: add the folder path to select / update ────────────────────────────────────────
drop policy if exists "notes_select" on notes;
create policy "notes_select" on notes for select to authenticated
  using (
    created_by = auth.uid()
    or get_my_role() in ('admin', 'super_admin')
    or is_note_collaborator(id)
    or (
      visibility = 'public'
      and folder_id is not null
      and (is_note_folder_manager(folder_id) or can_access_note_folder(folder_id))
    )
  );

drop policy if exists "notes_update" on notes;
create policy "notes_update" on notes for update to authenticated
  using (
    created_by = auth.uid()
    or get_my_role() in ('admin', 'super_admin')
    or is_note_collaborator(id, 'edit')
    or (
      visibility = 'public'
      and folder_id is not null
      and can_access_note_folder(folder_id, true)
    )
  );
-- notes_delete unchanged (author / admin only — a folder share never grants delete).

-- ── note_folder_shares policies ─────────────────────────────────────────────────────────
create policy "note_folder_shares_select" on note_folder_shares for select to authenticated
  using (
    user_id = auth.uid()
    or role = get_my_role()
    or get_my_role() in ('admin', 'super_admin')
    or is_note_folder_manager(folder_id)
  );

create policy "note_folder_shares_insert" on note_folder_shares for insert to authenticated
  with check (
    added_by = auth.uid()
    and (get_my_role() in ('admin', 'super_admin') or is_note_folder_manager(folder_id))
  );

create policy "note_folder_shares_update" on note_folder_shares for update to authenticated
  using (
    get_my_role() in ('admin', 'super_admin') or is_note_folder_manager(folder_id)
  );

create policy "note_folder_shares_delete" on note_folder_shares for delete to authenticated
  using (
    get_my_role() in ('admin', 'super_admin') or is_note_folder_manager(folder_id)
  );
