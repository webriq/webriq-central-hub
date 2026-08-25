-- Migration 119: unique index on ticket_messages.email_message_id (task 303)
-- Needed for the live inbound-email webhook: dedupe on provider retries (the same
-- Message-ID must not create two rows) and fast In-Reply-To/References thread-match
-- lookups. Partial (where not null) since imported rows (desk-threads/desk-ticket-comments,
-- task 296/302) never populate this column and would otherwise collide on repeated nulls
-- under a plain unique constraint (though Postgres treats distinct NULLs as non-equal in a
-- regular unique index too — the partial form just keeps the index smaller and its intent
-- explicit: this is an email-thread identity key, not a general column constraint).

create unique index ticket_messages_email_message_id_key
  on ticket_messages (email_message_id)
  where email_message_id is not null;
