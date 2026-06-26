-- Migration 035: Zoho Decommission Schema
-- Adds tables and columns needed for the one-time Zoho → Supabase migration.
--
-- Design principles:
--   external_id  text unique — the import dedup key per table; null for Hub-native rows
--   source_meta  jsonb       — single blob for Zoho-specific data that has no long-term
--                              Hub equivalent (status names, zpuids, timestamps, tags).
--                              Drop this column once the migration is verified complete.
--   First-class columns      — data with genuine ongoing value (dates, website URLs,
--                              owner display names) get proper named columns.
--
-- Import order: projects → tasklists → tasks → comments → timelogs → attachments.
-- Uses get_my_role() (migration 026) for RLS — never replicate inline.

-- ─── tasklists ────────────────────────────────────────────────────────────────
create table tasklists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  external_id text unique,   -- source system ID (Zoho tasklist ID); null for Hub-native
  name text not null,
  position numeric,
  is_default boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table tasklists enable row level security;

create policy "tasklists_staff_read"
  on tasklists for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'));

create policy "tasklists_pm_write"
  on tasklists for all to authenticated
  using (get_my_role() in ('admin', 'pm'))
  with check (get_my_role() in ('admin', 'pm'));

create index tasklists_project_id_idx on tasklists(project_id);

-- ─── tasks: migration columns ──────────────────────────────────────────────────
alter table tasks
  add column tasklist_id uuid references tasklists(id) on delete set null,
  add column external_id text unique,   -- source system ID; null for Hub-native tasks
  add column start_date date;

create index tasks_external_id_idx on tasks(external_id) where external_id is not null;
create index tasks_tasklist_id_idx on tasks(tasklist_id);

-- Allow null task_id on time_logs: Zoho project-level time entries have no task reference
alter table time_logs alter column task_id drop not null;

-- ─── projects: first-class data + one source_meta blob ────────────────────────
-- First-class: real project data that belongs in the schema regardless of source
alter table projects
  add column start_date date,
  add column end_date date,
  add column percent_complete integer default 0,
  add column existing_website text,        -- client's current site (Zoho custom field)
  add column development_site text;        -- WebriQ staging/dev URL (Zoho custom field)

-- source_meta: Zoho-specific operational data kept for reference during transition.
-- Contents: {status_name, status_id, is_closed, owner_zpuid, owner_email,
--            project_group, tags, modified_at, completed_at, synced_at}
-- Safe to drop this column after migration is fully verified.
alter table projects
  add column source_meta jsonb default '{}';

-- ─── task_comments: support imported comments with no Hub user account ─────────
-- Zoho commenters may not have Hub accounts — author_id becomes nullable.
-- FK changes from ON DELETE CASCADE → ON DELETE SET NULL to preserve imported history
-- when a Hub user account is later deleted.
alter table task_comments alter column author_id drop not null;
alter table task_comments drop constraint task_comments_author_id_fkey;
alter table task_comments
  add constraint task_comments_author_id_fkey
    foreign key (author_id) references auth.users(id) on delete set null;
alter table task_comments
  add column external_id text unique,   -- source system comment ID
  add column author_name text,          -- display name when author has no Hub account
  add column author_email text;         -- email when author has no Hub account

-- ─── attachments: migration columns ───────────────────────────────────────────
alter table attachments
  add column external_id text unique,   -- source system attachment ID
  add column source_url text;           -- original CDN URL; fallback if storage upload failed

-- ─── time_logs: migration columns ─────────────────────────────────────────────
alter table time_logs
  add column external_id text unique,   -- source system timelog ID
  add column owner_name text,           -- display name when logger has no Hub account
  add column owner_email text;          -- email when logger has no Hub account
