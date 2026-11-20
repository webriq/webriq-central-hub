-- Migration 185: Desk Inbox soft delete (task 489)
--
-- Admins/PMs can delete a Desk Inbox thread; it is hidden from every Hub listing and shown
-- only in the Inbox's "Deleted" filter view, where it can be restored. Soft (not hard) because:
--   - `attachments` is polymorphic (entity_type='ticket_message') — a hard delete would orphan
--     attachment rows and their Storage objects;
--   - the Zoho Desk importer / poll upsert on external_id / desk_ticket_id and would recreate a
--     hard-deleted thread. These columns are never in an upsert payload, so they survive re-import.
-- A new inbound customer message clears both columns (email-poll / desk-ticket-poll).
--
-- No RLS change: hiding is done in application queries so the Deleted view can still read rows.
-- Written, not applied — application code degrades on 42703 until this runs.
--
-- Rollback:
--   drop index if exists inbox_not_deleted_created_idx;
--   alter table inbox drop column if exists deleted_by, drop column if exists deleted_at;

alter table inbox
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null references auth.users(id) on delete set null;

create index if not exists inbox_not_deleted_created_idx
  on inbox (created_at desc)
  where deleted_at is null;

comment on column inbox.deleted_at is 'Task 489 — soft delete. Non-null = hidden from Hub listings (Desk Inbox "Deleted" view only). Cleared by restore or a new inbound customer message.';
comment on column inbox.deleted_by is 'Task 489 — profile/auth user who soft-deleted the thread.';
