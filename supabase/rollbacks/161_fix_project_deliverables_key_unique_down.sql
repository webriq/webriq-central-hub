-- Down-migration for supabase/migrations/161_fix_project_deliverables_key_unique.sql (task 428 prep).
-- Lives in supabase/rollbacks/ (NOT migrations/) — see the note at the top of 147_desk_inbox_tickets_rename_down.sql.
-- Only valid while no two deliverables of one project share a key (i.e. BEFORE the 428 backfill): recreating the old index
-- would fail afterwards, because the same key legitimately repeats across phases.
drop index if exists project_deliverables_phase_key_uq;
create unique index project_deliverables_project_key_uq on project_deliverables (project_id, deliverable_key) where deliverable_key is not null;
