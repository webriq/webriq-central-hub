-- Migration 134: stackshift_orders.contact_risk (task 353 follow-up)
--
-- The webriq.com StackShift Order Form proxy runs the shared contact-validation check
-- (POST /api/public/validate — task 353) before relaying a submission to
-- POST /api/webhooks/stackshift-order. A blocked submission (allowed:false) never reaches
-- the webhook at all; a borderline one is relayed with contactRisk:"medium" in the payload
-- so the /stackshift-orders reviewer can see the contact email/phone was flagged.
--
--   contact_risk  null  — not checked, or came back clean/low
--                 'low' | 'medium' | 'high' — highest riskLevel across the checked
--                 email/phone as reported by the Hub validation endpoint
--
-- **Written, not applied by the agent** (StackShift-migration convention, tasks 130/133).
-- Until it lands, the webhook's insert of `contact_risk` is a no-op column the DB rejects —
-- the webhook wraps the insert and logs, so relays still succeed; the field just isn't stored.

alter table stackshift_orders
  add column contact_risk text check (contact_risk in ('low', 'medium', 'high'));
