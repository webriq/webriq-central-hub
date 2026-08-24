-- Migration 114: Zoho Desk Tickets/Ticket Comments import columns (task 296)
-- Merges imported Zoho Desk tickets into the existing native `tickets`/`ticket_messages`
-- schema (migration 025) instead of a separate archival table — same precedent as `tasks`,
-- which already shipped with an `external_id` column for exactly this purpose.
--
-- tickets.customer_id widened to nullable: task 117 found only 200/1627 (12.3%) of Desk
-- contacts matched a Hub customer by account name; the same low match rate is expected for
-- tickets, and `customer_id not null` would silently drop most of the historical record.
-- Checked against every RLS policy on tickets/ticket_messages (migration 026/048):
--   tickets_client_read / tickets_client_insert filter on customer_id = get_my_customer_id(),
--   which naturally evaluates to false for NULL — no client can ever see an unmatched
--   imported ticket. tickets_staff_all has unconditional access regardless of customer_id,
--   so admin/PM/developer can still review and manually assign unmatched tickets. Safe to widen.
--
-- external_id / external_contact_id / external_account_id: raw Zoho Desk ticket/contact/
-- account IDs. external_id is the import dedupe key (onConflict target).
-- match_method: 'contact' (via already-imported contacts.customer_id) | 'account_name'
-- (fallback via the ticket's inline contact.account.accountName) | null (unmatched).
-- source_meta: Desk fields with no first-class Hub equivalent (ticketNumber, department,
-- team, channel raw value, source, isSpam, threadCount, commentCount, webUrl, language,
-- productId, responseDueDate, onholdTime, sharedCount, customerResponseTime, statusType,
-- raw contact/assignee objects). Zoho's own ticketNumber never gets written to
-- tickets.ticket_number (a `serial` — writing an arbitrary value would corrupt the sequence).

alter table tickets
  alter column customer_id drop not null,
  add column external_id text unique,
  add column external_contact_id text,
  add column external_account_id text,
  add column match_method text check (match_method in ('contact', 'account_name')),
  add column source_meta jsonb default '{}';

alter table ticket_messages
  add column external_id text unique,
  add column source_meta jsonb default '{}';
