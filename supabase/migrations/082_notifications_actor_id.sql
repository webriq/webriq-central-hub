-- Migration 082: Add actor_id to notifications
-- Lets the notification drawer show who performed the action (avatar + name), not just
-- prose describing it. Nullable — programme reminders (cron) and onboarding-submit events
-- have no staff actor (date-triggered / customer-triggered), so this column is optional
-- by design, not backfilled for those rows.

alter table notifications add column actor_id uuid references profiles (id) on delete set null;

create index idx_notifications_actor_id on notifications (actor_id);
