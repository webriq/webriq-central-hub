-- Migration 120: Project Notes — Google Keep-style notes, folders, collaborator sharing (task 311)
--
-- Three new tables:
--   note_folders       — project-scoped folders to group notes
--   notes              — the notes themselves (title/content/color/pin/archive)
--   note_collaborators — per-note shares, each with its own view|edit permission
--
-- Visibility model (Google Keep-like — private by default, shared explicitly):
--   - author (created_by) always sees/edits/deletes their own notes
--   - admin/super_admin always see/edit/delete every note (oversight parity with every
--     other staff table in this app)
--   - an explicit collaborator sees the note; an 'edit'-permission collaborator can also
--     change it, but only the author or an admin/super_admin can delete it outright
--
-- Staff-only feature: base read/write access is gated to admin/super_admin/pm/developer via
-- get_my_role() (migration 026's security-definer helper) — client/marketing never see notes.

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

-- ── note_folders ─────────────────────────────────────────────────────────────────────────
create policy "note_folders_staff_read" on note_folders for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create policy "note_folders_insert" on note_folders for insert to authenticated
  with check (get_my_role() in ('admin', 'super_admin', 'pm', 'developer') and created_by = auth.uid());

create policy "note_folders_update" on note_folders for update to authenticated
  using (created_by = auth.uid() or get_my_role() in ('admin', 'super_admin'));

create policy "note_folders_delete" on note_folders for delete to authenticated
  using (created_by = auth.uid() or get_my_role() in ('admin', 'super_admin'));

-- ── notes ────────────────────────────────────────────────────────────────────────────────
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
    or exists (
      select 1 from note_collaborators nc
      where nc.note_id = notes.id and nc.user_id = auth.uid() and nc.permission = 'edit'
    )
  );

create policy "notes_delete" on notes for delete to authenticated
  using (created_by = auth.uid() or get_my_role() in ('admin', 'super_admin'));

-- ── note_collaborators ───────────────────────────────────────────────────────────────────
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
