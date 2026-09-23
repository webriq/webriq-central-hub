-- Migration 150: AI-assisted PDF import — page-complexity classify + vision transcribe (task 398)
-- Two new orchestration_layer values, same CHECK-constraint-widen pattern as migrations 032/090:
-- - wiki_pdf_classify  (Haiku, vision + structured output): per-page "simple" vs "complex" gate
-- - wiki_pdf_transcribe (Sonnet, vision): reading-order HTML transcription for "complex" pages only

-- ─── llm_config ───────────────────────────────────────────────────────────────
alter table llm_config
  drop constraint if exists llm_config_orchestration_layer_check;

alter table llm_config
  add constraint llm_config_orchestration_layer_check
    check (orchestration_layer in (
      'classification','assessment','planning','execution',
      'digest','reply','wiki_lint','ops_chat','mockup_spec',
      'wiki_pdf_classify','wiki_pdf_transcribe'
    ));

-- ─── llm_invocation_logs ──────────────────────────────────────────────────────
alter table llm_invocation_logs
  drop constraint if exists llm_invocation_logs_orchestration_layer_check;

alter table llm_invocation_logs
  add constraint llm_invocation_logs_orchestration_layer_check
    check (orchestration_layer in (
      'classification','assessment','planning','execution',
      'digest','reply','wiki_lint','ops_chat','mockup_spec',
      'wiki_pdf_classify','wiki_pdf_transcribe'
    ));

-- ─── Seed wiki_pdf_classify / wiki_pdf_transcribe model rows ──────────────────
insert into llm_config (orchestration_layer, model_id, max_tokens, temperature, notes)
values (
  'wiki_pdf_classify',
  'claude-haiku-4-5-20251001',
  256,
  0.00,
  'Haiku: per-page vision classification (simple vs complex layout) for Wiki PDF import (task 398) — gates whether a page needs the more expensive transcribe pass'
)
on conflict (orchestration_layer) do update set
  model_id    = excluded.model_id,
  max_tokens  = excluded.max_tokens,
  temperature = excluded.temperature,
  notes       = excluded.notes,
  updated_at  = now();

insert into llm_config (orchestration_layer, model_id, max_tokens, temperature, notes)
values (
  'wiki_pdf_transcribe',
  'claude-sonnet-4-6',
  8192,
  0.20,
  'Sonnet: vision transcription of a complex-layout PDF page into reading-order semantic HTML for Wiki PDF import (task 398)'
)
on conflict (orchestration_layer) do update set
  model_id    = excluded.model_id,
  max_tokens  = excluded.max_tokens,
  temperature = excluded.temperature,
  notes       = excluded.notes,
  updated_at  = now();
