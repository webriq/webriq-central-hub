-- Migration 090: HTML Mockup → auto-generated MD build spec (task 199)
-- - customer_assets.source_asset_id: self-referencing FK linking a generated Markdown
--   build-spec asset back to the HTML mockup asset it was generated from. on delete cascade
--   so removing the source HTML mockup automatically removes its paired MD row (the API route
--   still has to clean up the corresponding storage object — the DB cascade alone can't do that).
-- - New 'mockup_spec' orchestration_layer, same CHECK-constraint-widen pattern as migration 032.

alter table customer_assets
  add column if not exists source_asset_id uuid references customer_assets(id) on delete cascade;

create index if not exists idx_customer_assets_source_asset_id
  on customer_assets (source_asset_id) where source_asset_id is not null;

-- ─── llm_config ───────────────────────────────────────────────────────────────
alter table llm_config
  drop constraint if exists llm_config_orchestration_layer_check;

alter table llm_config
  add constraint llm_config_orchestration_layer_check
    check (orchestration_layer in (
      'classification','assessment','planning','execution',
      'digest','reply','wiki_lint','ops_chat','mockup_spec'
    ));

-- ─── llm_invocation_logs ──────────────────────────────────────────────────────
alter table llm_invocation_logs
  drop constraint if exists llm_invocation_logs_orchestration_layer_check;

alter table llm_invocation_logs
  add constraint llm_invocation_logs_orchestration_layer_check
    check (orchestration_layer in (
      'classification','assessment','planning','execution',
      'digest','reply','wiki_lint','ops_chat','mockup_spec'
    ));

-- ─── Seed mockup_spec model row ────────────────────────────────────────────────
insert into llm_config (orchestration_layer, model_id, max_tokens, temperature, notes)
values (
  'mockup_spec',
  'claude-sonnet-4-6',
  8192,
  0.30,
  'Sonnet: generates a paired Markdown build spec from an uploaded HTML mockup (Onboarding Wizard HTML Mockup step, task 199) — component breakdown + AI build prompt for developers'
)
on conflict (orchestration_layer) do update set
  model_id    = excluded.model_id,
  max_tokens  = excluded.max_tokens,
  temperature = excluded.temperature,
  notes       = excluded.notes;
