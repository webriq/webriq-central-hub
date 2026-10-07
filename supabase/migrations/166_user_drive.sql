-- Migration 166: personal Drive (task 436) — per-user private files + folders with optional
-- sharing to users / roles. Written, NOT applied by the agent (storage/RLS-migration convention).
--
-- Why new tables instead of customer_assets: customer_assets.customer_id is NOT NULL, its RLS is
-- "any authenticated user", and allowed_roles/allowed_user_ids mean NULL = everyone — the inverse
-- of a personal drive. Here NO share row means "only the owner".
--
-- Access model (see drive_folder_level / drive_file_level):
--   level 3 = owner · 2 = edit · 1 = view · 0 = none. `client` is always 0.
--   A share on a folder is inherited by every descendant (recursive walk up the parent chain).
--   There is deliberately NO admin / super_admin override.
--   Non-owner editors may change a folder only when they hold edit on its PARENT — i.e. never the
--   shared root itself — and may delete a file only when they hold edit on its folder.
--
-- Uses get_my_role() (migration 026) — never replicate the role lookup inline.
-- Storage: private bucket `user-drive`; no storage.objects policies — every read/write goes
-- through server-signed URLs minted after an app-level access check (like `customer-assets`).
-- Deleting a user cascades the DB rows but ORPHANS their Storage objects (same trade-off as
-- tasks 339/350; a sweep is a follow-up).

-- ── tables ─────────────────────────────────────────────────────────────────────────────────
create table if not exists drive_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  parent_folder_id uuid references drive_folders(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists drive_folders_name_uq
  on drive_folders (owner_id, coalesce(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index if not exists drive_folders_owner_idx  on drive_folders (owner_id, parent_folder_id);
create index if not exists drive_folders_parent_idx on drive_folders (parent_folder_id);

create table if not exists drive_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  uploaded_by uuid references profiles(id) on delete set null,
  folder_id uuid references drive_folders(id) on delete cascade,
  file_name text not null check (char_length(btrim(file_name)) between 1 and 255),
  file_path text not null unique,
  file_size bigint,
  file_mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists drive_files_owner_idx  on drive_files (owner_id, folder_id);
create index if not exists drive_files_folder_idx on drive_files (folder_id);

create table if not exists drive_shares (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references drive_folders(id) on delete cascade,
  file_id uuid references drive_files(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text check (role in ('admin', 'super_admin', 'pm', 'developer', 'hr', 'marketing')),
  permission text not null check (permission in ('view', 'edit')),
  added_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint drive_shares_resource_ck check ((folder_id is not null) <> (file_id is not null)),
  constraint drive_shares_grantee_ck  check ((user_id is not null) <> (role is not null))
);
create unique index if not exists drive_shares_folder_user_uq on drive_shares (folder_id, user_id) where folder_id is not null and user_id is not null;
create unique index if not exists drive_shares_folder_role_uq on drive_shares (folder_id, role)    where folder_id is not null and role is not null;
create unique index if not exists drive_shares_file_user_uq   on drive_shares (file_id, user_id)   where file_id is not null and user_id is not null;
create unique index if not exists drive_shares_file_role_uq   on drive_shares (file_id, role)      where file_id is not null and role is not null;
create index if not exists drive_shares_user_idx on drive_shares (user_id) where user_id is not null;
create index if not exists drive_shares_role_idx on drive_shares (role)    where role is not null;

-- ── integrity triggers ──────────────────────────────────────────────────────────────────────
-- owner_id is immutable, and a child must share its parent's owner — so a non-owner editor can
-- never move an item into someone else's tree and silently change who owns it.
create or replace function drive_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function drive_folders_integrity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.owner_id <> old.owner_id then
    raise exception 'drive_owner_immutable' using errcode = '42501';
  end if;
  if new.parent_folder_id is not null and
     not exists (select 1 from drive_folders p where p.id = new.parent_folder_id and p.owner_id = new.owner_id) then
    raise exception 'drive_owner_mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function drive_files_integrity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.owner_id <> old.owner_id then
    raise exception 'drive_owner_immutable' using errcode = '42501';
  end if;
  if new.folder_id is not null and
     not exists (select 1 from drive_folders p where p.id = new.folder_id and p.owner_id = new.owner_id) then
    raise exception 'drive_owner_mismatch' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists drive_folders_touch on drive_folders;
create trigger drive_folders_touch before update on drive_folders for each row execute function drive_touch_updated_at();
drop trigger if exists drive_files_touch on drive_files;
create trigger drive_files_touch before update on drive_files for each row execute function drive_touch_updated_at();
drop trigger if exists drive_folders_integrity_trg on drive_folders;
create trigger drive_folders_integrity_trg before insert or update on drive_folders for each row execute function drive_folders_integrity();
drop trigger if exists drive_files_integrity_trg on drive_files;
create trigger drive_files_integrity_trg before insert or update on drive_files for each row execute function drive_files_integrity();

-- ── security-definer helpers (RLS-bypass anti-recursion pattern, migrations 121/127) ───────
create or replace function drive_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(get_my_role()::text in ('admin', 'super_admin', 'pm', 'developer', 'hr', 'marketing'), false);
$$;

-- Highest access the caller holds on a folder: 3 owner · 2 edit · 1 view · 0 none.
create or replace function drive_folder_level(p_folder_id uuid) returns int
language sql stable security definer set search_path = public as $$
  with recursive chain as (
    select f.id, f.parent_folder_id, f.owner_id, 0 as depth from drive_folders f where f.id = p_folder_id
    union all
    select f.id, f.parent_folder_id, f.owner_id, c.depth + 1
    from drive_folders f join chain c on f.id = c.parent_folder_id
    where c.depth < 50
  )
  select case when not drive_is_staff() then 0 else coalesce(max(
    case
      when c.owner_id = auth.uid() then 3
      else coalesce((
        select max(case s.permission when 'edit' then 2 else 1 end)
        from drive_shares s
        where s.folder_id = c.id and (s.user_id = auth.uid() or s.role = get_my_role()::text)
      ), 0)
    end
  ), 0) end
  from chain c;
$$;

-- Highest access on a file: owner, a direct share, or whatever its folder grants.
create or replace function drive_file_level(p_file_id uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when not drive_is_staff() then 0 else coalesce((
    select greatest(
      case when f.owner_id = auth.uid() then 3 else 0 end,
      coalesce((
        select max(case s.permission when 'edit' then 2 else 1 end)
        from drive_shares s
        where s.file_id = f.id and (s.user_id = auth.uid() or s.role = get_my_role()::text)
      ), 0),
      case when f.folder_id is not null then drive_folder_level(f.folder_id) else 0 end
    )
    from drive_files f where f.id = p_file_id
  ), 0) end;
$$;

create or replace function drive_owns_folder(p_folder_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from drive_folders f where f.id = p_folder_id and f.owner_id = auth.uid()) and drive_is_staff();
$$;

create or replace function drive_owns_file(p_file_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from drive_files f where f.id = p_file_id and f.owner_id = auth.uid()) and drive_is_staff();
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────────────
alter table drive_folders enable row level security;
alter table drive_files   enable row level security;
alter table drive_shares  enable row level security;

-- Folders
drop policy if exists drive_folders_select on drive_folders;
create policy drive_folders_select on drive_folders for select to authenticated
  using (drive_folder_level(id) >= 1);

drop policy if exists drive_folders_insert on drive_folders;
create policy drive_folders_insert on drive_folders for insert to authenticated
  with check (
    drive_is_staff() and (
      (parent_folder_id is null and owner_id = auth.uid())
      or (parent_folder_id is not null and drive_folder_level(parent_folder_id) >= 2)
    )
  );

drop policy if exists drive_folders_update on drive_folders;
create policy drive_folders_update on drive_folders for update to authenticated
  using (owner_id = auth.uid() and drive_is_staff()
         or (parent_folder_id is not null and drive_folder_level(parent_folder_id) >= 2))
  with check (
    (parent_folder_id is null and owner_id = auth.uid())
    or (parent_folder_id is not null and drive_folder_level(parent_folder_id) >= 2)
  );

drop policy if exists drive_folders_delete on drive_folders;
create policy drive_folders_delete on drive_folders for delete to authenticated
  using (owner_id = auth.uid() and drive_is_staff()
         or (parent_folder_id is not null and drive_folder_level(parent_folder_id) >= 2));

-- Files
drop policy if exists drive_files_select on drive_files;
create policy drive_files_select on drive_files for select to authenticated
  using (drive_file_level(id) >= 1);

drop policy if exists drive_files_insert on drive_files;
create policy drive_files_insert on drive_files for insert to authenticated
  with check (
    drive_is_staff() and uploaded_by = auth.uid() and (
      (folder_id is null and owner_id = auth.uid())
      or (folder_id is not null and drive_folder_level(folder_id) >= 2)
    )
  );

-- Rename / move. A direct file-level `edit` share allows a rename; the API additionally
-- restricts moves to owners / folder editors (RLS cannot compare old vs new folder_id).
drop policy if exists drive_files_update on drive_files;
create policy drive_files_update on drive_files for update to authenticated
  using (drive_file_level(id) >= 2)
  with check (
    drive_file_level(id) >= 2
    or (folder_id is null and owner_id = auth.uid())
    or (folder_id is not null and drive_folder_level(folder_id) >= 2)
  );

drop policy if exists drive_files_delete on drive_files;
create policy drive_files_delete on drive_files for delete to authenticated
  using (
    (owner_id = auth.uid() and drive_is_staff())
    or (folder_id is not null and drive_folder_level(folder_id) >= 2)
  );

-- Shares: visible to the grantee and the owner of the shared item; only the owner writes.
drop policy if exists drive_shares_select on drive_shares;
create policy drive_shares_select on drive_shares for select to authenticated
  using (
    drive_is_staff() and (
      user_id = auth.uid()
      or role = get_my_role()::text
      or (folder_id is not null and drive_owns_folder(folder_id))
      or (file_id is not null and drive_owns_file(file_id))
    )
  );

drop policy if exists drive_shares_insert on drive_shares;
create policy drive_shares_insert on drive_shares for insert to authenticated
  with check (
    added_by = auth.uid() and (
      (folder_id is not null and drive_owns_folder(folder_id))
      or (file_id is not null and drive_owns_file(file_id))
    )
  );

drop policy if exists drive_shares_update on drive_shares;
create policy drive_shares_update on drive_shares for update to authenticated
  using (
    (folder_id is not null and drive_owns_folder(folder_id))
    or (file_id is not null and drive_owns_file(file_id))
  );

drop policy if exists drive_shares_delete on drive_shares;
create policy drive_shares_delete on drive_shares for delete to authenticated
  using (
    (folder_id is not null and drive_owns_folder(folder_id))
    or (file_id is not null and drive_owns_file(file_id))
  );

-- ── storage bucket ──────────────────────────────────────────────────────────────────────────
-- Keep allowed_mime_types in lockstep with ALLOWED_MIME_TYPES (customer-asset-storage.ts) +
-- POWERPOINT_MIME_TYPES + DRIVE_MEDIA_MIME_TYPES (src/lib/drive/constants.ts) — task 418 lesson: a type
-- allowed in code but missing here 400s at upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-drive',
  'user-drive',
  false,
  209715200, -- 200MB
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/html', 'text/markdown', 'text/plain', 'text/csv',
    'image/x-icon', 'image/vnd.microsoft.icon',
    'application/zip', 'application/x-zip-compressed', 'application/vnd.rar', 'application/x-rar-compressed',
    'text/javascript', 'application/javascript', 'video/mp2t', 'application/xml', 'text/xml',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
    'application/vnd.oasis.opendocument.presentation',
    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
on conflict (id) do nothing;
