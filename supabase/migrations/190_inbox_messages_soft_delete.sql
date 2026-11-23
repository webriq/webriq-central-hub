-- Migration 190: Desk Inbox — soft delete a single message (task 497)
--
-- Admins/PMs can delete one message in a Desk Inbox thread; it is hidden from the thread detail page, the public
-- ticket view and the reply quote. Soft (not hard) for the same reasons as migration 185 (task 489):
--   - `attachments` is polymorphic (entity_type='ticket_message', entity_id = inbox_messages.id) — a hard delete
--     would orphan attachment rows and their Storage objects;
--   - the Zoho Desk importer / poll and the email poll dedupe on external_id / email_message_id and would recreate
--     a hard-deleted message. These columns are never in an upsert payload, so they survive re-import.
--
-- No RLS change: hiding is done in application queries.
-- Written, not applied — application code degrades on 42703 until this runs.
--
-- Rollback:
--   alter table inbox_messages drop column if exists deleted_by, drop column if exists deleted_at;

alter table inbox_messages
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null references auth.users(id) on delete set null;

comment on column inbox_messages.deleted_at is 'Task 497 — soft delete. Non-null = hidden from the thread detail page, public ticket view and reply quote. Cleared by restore.';
comment on column inbox_messages.deleted_by is 'Task 497 — profile/auth user who soft-deleted the message.';
