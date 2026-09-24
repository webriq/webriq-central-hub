-- Migration 151: Wiki page history, per-user drafts, conflict-checked saves (task 402)
--
-- Depends on 149 (wiki_pages / wiki_page_versions). Written, not applied by the agent.
--
--   wiki_pages.revision          integer bumped on EVERY content/status save — the optimistic-
--                                concurrency token. Separate from `version`, which keeps task 399's
--                                publish-only meaning (the `v{n}` badge).
--   wiki_page_versions           becomes the full revision log: one immutable row per save /
--                                publish / restore (`kind`). Pre-existing rows are publish
--                                snapshots from task 399 → kind 'publish', revision null.
--   wiki_page_drafts             one autosaved draft per (page, user). Owner-only RLS — nobody else
--                                can read another user's draft content.
--   wiki_page_draft_holders()    security definer — exposes WHO holds a draft on a page (name,
--                                email, timestamps), never the content.
--   wiki_save_page()             security invoker (RLS still applies) — conditional update on
--                                `revision = p_base_revision` + snapshot insert + own-draft delete,
--                                all in one transaction. Stale base → SQLSTATE P0409 (route → 409).
--   wiki_restore_revision()      security invoker — re-saves a snapshot through wiki_save_page()
--                                as a kind 'restore' revision.

alter table wiki_pages add column revision int not null default 0;

alter table wiki_page_versions
  add column revision int,
  add column kind text not null default 'publish' check (kind in ('save', 'publish', 'restore')),
  add column tags text[] not null default '{}',
  add column status text check (status in ('draft', 'published', 'archived')),
  add column restored_from uuid references wiki_page_versions(id) on delete set null;

create index wiki_page_versions_page_created_idx on wiki_page_versions(page_id, created_at desc);

-- Drafts ---------------------------------------------------------------------------------------

create table wiki_page_drafts (
  page_id uuid not null references wiki_pages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  content_html text not null default '',
  tags text[] not null default '{}',
  base_revision int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (page_id, user_id)
);

create trigger set_updated_at_wiki_page_drafts
  before update on wiki_page_drafts
  for each row execute function update_updated_at_column();

alter table wiki_page_drafts enable row level security;

create policy "wiki_page_drafts_owner_all"
  on wiki_page_drafts for all to authenticated
  using (user_id = auth.uid() and get_my_role() in ('admin', 'super_admin', 'pm', 'developer'))
  with check (user_id = auth.uid() and get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create or replace function wiki_page_draft_holders(p_page_id uuid)
returns table (user_id uuid, full_name text, email text, updated_at timestamptz, base_revision int)
language sql stable security definer
set search_path = public
as $$
  select d.user_id, p.full_name, u.email::text, d.updated_at, d.base_revision
  from wiki_page_drafts d
  join profiles p on p.id = d.user_id
  left join auth.users u on u.id = d.user_id
  where d.page_id = p_page_id
    and d.user_id <> auth.uid()
    and get_my_role() in ('admin', 'super_admin', 'pm', 'developer', 'hr')
  order by d.updated_at desc;
$$;

grant execute on function wiki_page_draft_holders(uuid) to authenticated;

-- Conflict-checked save ------------------------------------------------------------------------

create or replace function wiki_save_page(
  p_page_id uuid,
  p_base_revision int,
  p_title text default null,
  p_content_html text default null,
  p_tags text[] default null,
  p_status text default null,
  p_kind text default 'save',
  p_restored_from uuid default null
)
returns wiki_pages
language plpgsql security invoker
set search_path = public
as $$
declare
  saved wiki_pages;
begin
  if get_my_role() not in ('admin', 'super_admin', 'pm', 'developer') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from wiki_pages where id = p_page_id) then
    raise exception 'page not found' using errcode = 'P0404';
  end if;

  -- RHS column references read the pre-update row, so `status <> 'published'` is the OLD status:
  -- version bumps only on a transition into published (task 399 semantics, unchanged).
  update wiki_pages set
    title = coalesce(p_title, title),
    content_html = coalesce(p_content_html, content_html),
    tags = coalesce(p_tags, tags),
    status = coalesce(p_status, status),
    version = case when p_status = 'published' and status <> 'published' then version + 1 else version end,
    revision = revision + 1,
    updated_by = auth.uid()
  where id = p_page_id and revision = p_base_revision
  returning * into saved;

  if saved.id is null then
    raise exception 'revision conflict' using errcode = 'P0409';
  end if;

  insert into wiki_page_versions (page_id, version, revision, kind, title, content_html, tags, status, restored_from, edited_by)
  values (saved.id, saved.version, saved.revision, p_kind, saved.title, saved.content_html, saved.tags, saved.status, p_restored_from, auth.uid());

  delete from wiki_page_drafts where page_id = p_page_id and user_id = auth.uid();

  return saved;
end;
$$;

grant execute on function wiki_save_page(uuid, int, text, text, text[], text, text, uuid) to authenticated;

create or replace function wiki_restore_revision(p_page_id uuid, p_revision_id uuid, p_base_revision int)
returns wiki_pages
language plpgsql security invoker
set search_path = public
as $$
declare
  snap wiki_page_versions;
begin
  select * into snap from wiki_page_versions where id = p_revision_id and page_id = p_page_id;
  if snap.id is null then
    raise exception 'revision not found' using errcode = 'P0404';
  end if;

  -- Status/version untouched: a restore brings back content, it doesn't (un)publish. Pre-151
  -- (legacy, revision null) snapshots never recorded tags — keep the page's current tags for those
  -- rather than wiping them with the column default '{}'.
  return wiki_save_page(
    p_page_id, p_base_revision, snap.title, snap.content_html,
    case when snap.revision is null then null else snap.tags end,
    null, 'restore', snap.id
  );
end;
$$;

grant execute on function wiki_restore_revision(uuid, uuid, int) to authenticated;
