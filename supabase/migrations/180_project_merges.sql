-- Migration 180: Project "Merge to…" journal + merge-assistant LLM layer (task 468)
-- WRITTEN, NOT APPLIED — the merge code degrades (plan works, execute reports "not available") until applied.

-- ─── projects.merged_into_project_id ─────────────────────────────────────────
alter table projects
  add column if not exists merged_into_project_id uuid references projects(id) on delete set null;

-- ─── project_merges journal (audit + resume + future undo) ────────────────────
create table if not exists project_merges (
  id                uuid primary key default gen_random_uuid(),
  source_project_id uuid not null references projects(id) on delete cascade,
  target_project_id uuid not null references projects(id) on delete cascade,
  status            text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  decisions         jsonb not null default '{}'::jsonb,
  step_progress     jsonb not null default '{}'::jsonb,
  summary           jsonb,
  error             text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  finished_at       timestamptz
);

create index if not exists project_merges_source_idx on project_merges (source_project_id, created_at desc);

alter table project_merges enable row level security;

create policy "project_merges_manage"
  on project_merges for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

-- ─── LLM layer: project_merge (Haiku phrasing of heads-ups / summary) ─────────
alter table llm_config drop constraint if exists llm_config_orchestration_layer_check;
alter table llm_config
  add constraint llm_config_orchestration_layer_check
    check (orchestration_layer in (
      'classification','assessment','planning','execution',
      'digest','reply','wiki_lint','ops_chat','mockup_spec',
      'wiki_pdf_classify','wiki_pdf_transcribe','project_merge'
    ));

alter table llm_invocation_logs drop constraint if exists llm_invocation_logs_orchestration_layer_check;
alter table llm_invocation_logs
  add constraint llm_invocation_logs_orchestration_layer_check
    check (orchestration_layer in (
      'classification','assessment','planning','execution',
      'digest','reply','wiki_lint','ops_chat','mockup_spec',
      'wiki_pdf_classify','wiki_pdf_transcribe','project_merge'
    ));

insert into llm_config (orchestration_layer, model_id, max_tokens, temperature, notes)
values (
  'project_merge',
  'claude-haiku-4-5-20251001',
  400,
  0.30,
  'Haiku: phrases project-merge heads-ups and the final summary from structured findings (task 468). Never decides findings or writes.'
)
on conflict (orchestration_layer) do update set
  model_id    = excluded.model_id,
  max_tokens  = excluded.max_tokens,
  temperature = excluded.temperature,
  notes       = excluded.notes,
  updated_at  = now();
