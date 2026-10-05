-- Rollback for the task-429 freeze (_docs/task/429-wp6/162_freeze_customer_phases_deliverables.sql). Lossless.
drop trigger if exists customer_phases_frozen on public.customer_phases;
drop trigger if exists customer_deliverables_frozen on public.customer_deliverables;
drop function if exists public.reject_legacy_programme_write();
