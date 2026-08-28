-- Migration 126: Zoho Desk Knowledge Base articles (task 336)
-- Receives imported Zoho Desk KB articles from _from_zoho/desk-kb.json (the
-- { articles, categories } file produced by GET /api/admin/zoho-export/desk-kb).
-- KB articles are global content — no customer_id, no soft matching (unlike `accounts`
-- / `contacts`). The full HTML body lands in `answer` (from the per-article Get Article
-- enrichment pass — List Articles never returns it).
--
--   external_id            text unique — Zoho article id, the import upsert conflict key
--   title                  text not null
--   permalink              text — Zoho article permalink slug
--   answer                 text — full HTML body (Get Article)
--   summary                text
--   status                 text — Published | Draft | Review | Unpublished | Expired | ...
--   latest_version_status  text — Zoho `latestVersionStatus`
--   category_name          text / category_id text / root_category_id text — from the
--                          article's embedded `category` object
--   tags                   text[] — Zoho `tags`
--   author_id / author_name  text — Zoho `author`
--   permission             text — Zoho article `permission` (ALL / AGENTS / REGISTERED_USERS)
--   view_count / like_count / dislike_count  integer
--   web_url                text — Zoho Desk deep link when present
--   created_time / modified_time  timestamptz — Zoho `createdTime` / `modifiedTime`
--   source_meta            jsonb — the full raw article object, for forward-compat

create table kb_articles (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,
  title text not null,
  permalink text,
  answer text,
  summary text,
  status text,
  latest_version_status text,
  category_name text,
  category_id text,
  root_category_id text,
  tags text[],
  author_id text,
  author_name text,
  permission text,
  view_count integer,
  like_count integer,
  dislike_count integer,
  web_url text,
  created_time timestamptz,
  modified_time timestamptz,
  source_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table kb_articles enable row level security;

-- RLS mirrors `accounts` (migration 125) exactly — internal staff read; a pm-write policy
-- for parity only (the import writes through the service-role adminClient and bypasses RLS).
create policy "kb_articles_staff_read"
  on kb_articles for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create policy "kb_articles_pm_write"
  on kb_articles for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

create index kb_articles_status_idx on kb_articles(status);
create index kb_articles_category_id_idx on kb_articles(category_id) where category_id is not null;
