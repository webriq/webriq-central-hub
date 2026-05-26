-- Migration 011: Add raw_response column to requirements_assessments
-- Stores the raw LLM output before structured parsing — useful for debugging
-- and prompt improvement loops (Sprint 3, M3).

alter table requirements_assessments
  add column if not exists raw_response jsonb;
