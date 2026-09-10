-- Migration 135: stackshift_orders.customer_notification_sent_at (task 354)
--
-- POST /api/webhooks/stackshift-order now also sends a confirmation email to the form
-- submitter (contact.email, + billing_email when it differs) after a successful insert —
-- separate from and independent of the existing staff notification (notification_sent_at).
--
--   customer_notification_sent_at  null  — not sent: the send failed, was skipped for
--                                          contact_risk='high', or the row predates this
--                                          migration
--                                 timestamptz — when the confirmation email went out
--
-- **Written, not applied by the agent** (StackShift-migration convention, tasks 130/133/134).
-- Until it lands, the webhook's stamping update is a wrapped no-op that logs; the
-- confirmation email still sends.

alter table stackshift_orders
  add column customer_notification_sent_at timestamptz;
