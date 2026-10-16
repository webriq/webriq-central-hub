-- Migration 177: Programme delay notes (task 455).
-- 1. Project-level "why is this programme delayed" note on `projects`.
-- 2. Who/when audit columns for the existing per-phase note (phase_programme_state.delay_note).
-- No RLS change: PMs write these through the note routes, which check role + project membership
-- and then write ONLY these columns with the service role. phase_programme_state_write stays
-- admin/super_admin/marketing so wizard_data/override_note are not opened to PMs.
-- Not applied by the agent — run separately. Code degrades (42703) until it lands.

alter table projects
  add column if not exists delay_note text,
  add column if not exists delay_note_updated_at timestamptz,
  add column if not exists delay_note_updated_by uuid references auth.users (id) on delete set null;

alter table phase_programme_state
  add column if not exists delay_note_updated_at timestamptz,
  add column if not exists delay_note_updated_by uuid references auth.users (id) on delete set null;

alter table projects
  drop constraint if exists projects_delay_note_length,
  add constraint projects_delay_note_length check (delay_note is null or char_length(delay_note) <= 1000);
