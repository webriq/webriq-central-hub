-- Migration 027: Knowledge Base schema
-- Adds pgvector extension, kb_entries, task_logs, kb_corrections, and match_kb_entries function
-- Prerequisites: T063 — required by T067 (Orchestrator) and T068 (KB Library)

-- Enable pgvector extension (idempotent — safe if already enabled)
create extension if not exists vector;

-- KB entries: stores vector-indexed execution patterns for semantic reuse
create table if not exists kb_entries (
  id uuid primary key default gen_random_uuid(),
  request_pattern text,
  embedding vector(1536),
  classification text check (classification in ('sanity', 'code', 'both')),
  lane int check (lane in (1, 2, 3)),
  tools_used text[],
  execution_steps jsonb,
  outcome text check (outcome in ('success', 'failed', 'overridden')),
  project_id text,
  use_count int default 1,
  flagged bool default false,
  created_at timestamptz default now(),
  last_used_at timestamptz default now()
);

-- Cosine similarity search over kb_entries embeddings
create or replace function match_kb_entries(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table(
  id uuid,
  request_pattern text,
  classification text,
  lane int,
  execution_steps jsonb,
  similarity float
)
language sql stable as $$
  select
    id,
    request_pattern,
    classification,
    lane,
    execution_steps,
    1 - (embedding <=> query_embedding) as similarity
  from kb_entries
  where 1 - (embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;

-- Audit log: every pipeline execution is logged with the triggering Central Hub user
create table if not exists task_logs (
  id uuid primary key default gen_random_uuid(),
  task_id text,
  project_id text,
  description text,
  lane int,
  tools_called text[],
  result text,
  kb_hit bool,
  triggered_by text,       -- Central Hub user email (not the Sanity robot account)
  triggered_by_id text,    -- Central Hub user UUID
  created_at timestamptz default now()
);

-- Human corrections: when a PM/dev overrides Claude's lane, the correction is recorded
-- and kb_entries.flagged is set to true for the affected entry
create table if not exists kb_corrections (
  id uuid primary key default gen_random_uuid(),
  kb_entry_id uuid references kb_entries(id) on delete cascade,
  original_lane int,
  corrected_lane int,
  corrected_by text,
  reason text,
  corrected_at timestamptz default now()
);
