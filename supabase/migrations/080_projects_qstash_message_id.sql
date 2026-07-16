-- Migration 080: projects.qstash_message_id — track the pending QStash scheduled-start message
--
-- Onboarding's scheduled start now fires via a one-shot QStash message (delivered at the exact
-- scheduled_onboarding_start_at instant) instead of relying solely on the 5-minute cron poll
-- (migration 079) to notice it's due. This column stores the QStash messageId so a manual
-- override (Start Onboarding / Start ... Anyway / Jump to phase, all before the scheduled time
-- fires) can cancel the now-redundant pending message — best-effort; the callback route is
-- idempotent (checks programme_started_at first) either way, so a stray late delivery is a
-- harmless no-op, not a duplicate start. The cron poll stays as-is as a fallback safety net in
-- case QStash delivery ever fails.

alter table projects add column if not exists qstash_message_id text;
