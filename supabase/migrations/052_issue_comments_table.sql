-- Migration 052: Issue Comments Table (Zoho Issue Comments import)
-- Adds the `issue_comments` table to receive imported Zoho Issue Comments (task 109 export → task 110 import).
--
-- Design mirrors migration 051's `issues` table, NOT `task_comments`:
--   task_comments.task_id is NOT NULL and its RLS includes a live author-insert policy
--   (author_id = auth.uid()) for the Hub's live commenting feature. Issue Comments has no
--   such live-compose UI yet — this table is pure imported historical data, so RLS mirrors
--   `issues`' own staff-read/pm-write pattern instead of task_comments' 3-policy split.
--
--   external_id  text unique — Zoho comment ID, the import dedup key
--   issue_id     uuid not null FK -> issues — every comment always belongs to exactly one issue
--   author_id    uuid nullable FK -> auth.users, ON DELETE SET NULL — Zoho commenters may not
--                have Hub accounts (same reasoning as task_comments' migration 035 fix)
--   updated_at   NEW vs task_comments — real data showed 256/2285 (11.2%) of comments were
--                edited after creation (last_modified_time != created_time); worth capturing
--                since it's free and task_comments never tracked this
--   source_meta  jsonb — added_by (full raw object), added_via, attachment metadata (no file
--                migration — see task 110 doc decision #7)
--
--   Deliberately NOT stored anywhere (measured zero value from the real export):
--   last_modified_by (100% identical to added_by), reactions (0% non-empty),
--   third_party_service_details (0% non-empty), can_edit_comment/can_delete_comment
--   (caller-relative permission flags), _zoho_project_id (100% redundant with issue_id's
--   own project_id)

create table issue_comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text,
  author_email text,
  body text not null,
  external_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_meta jsonb default '{}'
);

alter table issue_comments enable row level security;

create policy "issue_comments_staff_read"
  on issue_comments for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create policy "issue_comments_pm_write"
  on issue_comments for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

create index issue_comments_issue_id_idx on issue_comments(issue_id);
