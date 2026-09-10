-- Migration 136: stackshift_orders.submitter_ip / submitter_user_agent (task 356)
--
-- The webriq.com StackShift Order Form proxy relays each submission to
-- POST /api/webhooks/stackshift-order server-to-server, so the Hub's own request headers
-- carry the proxy / Vercel IP and a server user-agent — not the person who filled out the
-- form. Task 356 has the proxy forward the real values in the JSON payload
-- (`submitterIp` / `submitterUserAgent`, both optional); the webhook stores them here.
--
--   submitter_ip          text  — the submitter's client IP as reported by the proxy
--                                 (single address; text, not inet, so a malformed value
--                                 can never fail the insert and lose a submission)
--   submitter_user_agent  text  — the submitter's browser user-agent string
--
-- Both null when the proxy didn't send them. `raw_payload` carries them regardless.
--
-- **Written, not applied by the agent** (StackShift-migration convention, tasks 130/133/134/135).
-- Until it lands, the webhook's best-effort follow-up `update` is a wrapped no-op that logs;
-- the submission is still recorded.

alter table stackshift_orders
  add column submitter_ip text,
  add column submitter_user_agent text;
