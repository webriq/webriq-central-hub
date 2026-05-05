-- WebriQ Central Hub — LLM Config Seed
-- Migration 002: Seed llm_config with Haiku/Sonnet assignments per orchestration layer

insert into llm_config (orchestration_layer, model_id, max_tokens, temperature, notes)
values
  ('classification', 'claude-haiku-4-5-20251001', 1024,  0.10, 'Haiku: fast, cost-efficient classification of every incoming task/ticket'),
  ('assessment',     'claude-sonnet-4-6',         4096,  0.30, 'Sonnet: requirements breakdown with CLEAR/PARTIAL/BLOCKED subtask analysis'),
  ('planning',       'claude-sonnet-4-6',         8192,  0.30, 'Sonnet: multi-step implementation plan with confidence score and risk flags'),
  ('execution',      'claude-sonnet-4-6',         8192,  0.20, 'Sonnet: tool-use execution via Sanity API / GitHub PR creation'),
  ('digest',         'claude-haiku-4-5-20251001', 2048,  0.40, 'Haiku: daily PM and Dev digest pre-compiled by cron — stored, not live'),
  ('reply',          'claude-haiku-4-5-20251001', 1024,  0.50, 'Haiku: customer reply draft on task completion — PM reviews before send'),
  ('wiki_lint',      'claude-haiku-4-5-20251001', 2048,  0.20, 'Haiku: weekly KB audit for contradictions, stale references, orphan pages')
on conflict (orchestration_layer) do update set
  model_id    = excluded.model_id,
  max_tokens  = excluded.max_tokens,
  temperature = excluded.temperature,
  notes       = excluded.notes,
  updated_at  = now();
