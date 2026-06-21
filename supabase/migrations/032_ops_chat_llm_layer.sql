-- Migration 030: Add ops_chat orchestration layer
-- Widens CHECK constraints on llm_config and llm_invocation_logs, then seeds the config row.
-- ⚠️ Verify constraint names match your live DB before applying:
--    \d+ llm_config          → look for *_orchestration_layer_check
--    \d+ llm_invocation_logs → look for *_orchestration_layer_check

-- ─── llm_config ───────────────────────────────────────────────────────────────
alter table llm_config
  drop constraint if exists llm_config_orchestration_layer_check;

alter table llm_config
  add constraint llm_config_orchestration_layer_check
    check (orchestration_layer in (
      'classification','assessment','planning','execution',
      'digest','reply','wiki_lint','ops_chat'
    ));

-- ─── llm_invocation_logs ──────────────────────────────────────────────────────
alter table llm_invocation_logs
  drop constraint if exists llm_invocation_logs_orchestration_layer_check;

alter table llm_invocation_logs
  add constraint llm_invocation_logs_orchestration_layer_check
    check (orchestration_layer in (
      'classification','assessment','planning','execution',
      'digest','reply','wiki_lint','ops_chat'
    ));

-- ─── Seed ops_chat model row ──────────────────────────────────────────────────
insert into llm_config (orchestration_layer, model_id, max_tokens, temperature, notes)
values (
  'ops_chat',
  'claude-sonnet-4-6',
  8192,
  0.30,
  'Sonnet: streaming Ops Chat agent — task/ticket reads + Sanity MCP automation; DRAFT-only writes'
)
on conflict (orchestration_layer) do update set
  model_id    = excluded.model_id,
  max_tokens  = excluded.max_tokens,
  temperature = excluded.temperature,
  notes       = excluded.notes,
  updated_at  = now();
