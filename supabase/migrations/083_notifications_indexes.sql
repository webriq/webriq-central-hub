-- Migration 083: Missing indexes on notifications
-- The table (migration 025) has never had an index on recipient_id — Postgres doesn't
-- auto-index foreign key columns. Every GET /api/notifications poll (task 163, 30s
-- interval per open tab) runs two queries filtered by recipient_id, both currently doing
-- a full sequential scan across every user's rows, not just the caller's. Gets worse as
-- the table grows (every deliverable completion, plan decision, and daily cron reminder
-- tick writes a row).

-- Covers: .eq("recipient_id", user.id).order("created_at", { ascending: false }).limit(n)
create index idx_notifications_recipient_created on notifications (recipient_id, created_at desc);

-- Covers: .eq("recipient_id", user.id).is("read_at", null) — the unread-count query.
-- Partial index: only unread rows are ever queried this way, so it stays small even as
-- the table grows (most rows get marked read and drop out of it).
create index idx_notifications_recipient_unread on notifications (recipient_id) where read_at is null;
