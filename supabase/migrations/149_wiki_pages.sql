-- Migration 149: Wiki pages (task 395; product catalog widened to all 6 mockup spaces by task 399)
--
-- Activates the /kb "Wiki" tab (previously a stub) with a real, DB-backed product wiki:
--   wiki_pages          one row per page, nested via parent_id, scoped to a `product` (the
--                       "space" in the UI — task 399 widened this to the full 6-space catalog
--                       from _final_design/wiki/wiki-mockup.html: PipelineForge | PublishForge |
--                       CiteForge | StackShift I | StackShift II | Citation Grader. Not the
--                       ProductName type (task 395's original narrower 4-entry choice) and not
--                       the CLASSIFICATIONS enum, which is project-engagement tracks, not
--                       products — Wiki spaces are their own independent, fixed list.
--   wiki_page_versions  append-only publish history — one row per publish transition (not every
--                       content-changing save, task 399), powers the info rail's version count +
--                       contributor avatar stack
--
-- Not the same feature as the pre-existing kb_articles (imported Zoho Desk KB articles) or
-- kb_entries/kb_corrections (LLM-orchestration knowledge base, matched via embeddings) — those
-- are untouched by this migration.
--
-- RLS follows the migration 059 precedent (get_my_role(), staff-wide read / narrower write):
--   read:  admin, super_admin, pm, developer, hr  — matches department-map.ts's existing HR->/kb
--          route allowlist
--   write: admin, super_admin, pm, developer      — matches the existing description-image
--          upload role check (src/app/api/projects/[projectId]/notes/description-images/route.ts)
-- client/marketing get neither — Wiki is internal-only, same posture as Project Notes.

create table wiki_pages (
  id uuid primary key default gen_random_uuid(),
  product text not null check (product in ('PipelineForge', 'PublishForge', 'CiteForge', 'StackShift I', 'StackShift II', 'Citation Grader')),
  parent_id uuid references wiki_pages(id) on delete cascade,
  title text not null,
  content_html text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order int not null default 0,
  version int not null default 1,
  tags text[] not null default '{}',
  created_by uuid references profiles(id) on delete set null,
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index wiki_pages_product_idx on wiki_pages(product);
create index wiki_pages_parent_id_idx on wiki_pages(parent_id) where parent_id is not null;

create trigger set_updated_at_wiki_pages
  before update on wiki_pages
  for each row execute function update_updated_at_column();

create table wiki_page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references wiki_pages(id) on delete cascade,
  version int not null,
  title text not null,
  content_html text not null,
  edited_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index wiki_page_versions_page_id_idx on wiki_page_versions(page_id);

alter table wiki_pages enable row level security;
alter table wiki_page_versions enable row level security;

create policy "wiki_pages_staff_read"
  on wiki_pages for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer', 'hr'));

create policy "wiki_pages_staff_write"
  on wiki_pages for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create policy "wiki_page_versions_staff_read"
  on wiki_page_versions for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer', 'hr'));

create policy "wiki_page_versions_staff_insert"
  on wiki_page_versions for insert to authenticated
  with check (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));
