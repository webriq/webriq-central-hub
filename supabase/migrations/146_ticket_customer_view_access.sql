-- Task 379: customer-facing "ticket created" email + password-protected public ticket view.
-- Adds password-gate state directly to `tickets` — no new lockout table, mirrors the per-row
-- state style already used elsewhere (e.g. stackshift_orders.contact_risk) rather than a shared
-- otp_codes-style table, since this lockout is scoped to one ticket, not one user.

alter table public.tickets
  add column if not exists customer_view_password_hash text,
  add column if not exists customer_view_password_set_at timestamptz,
  add column if not exists customer_view_failed_attempts integer not null default 0,
  add column if not exists customer_view_locked_until timestamptz,
  add column if not exists customer_notified_at timestamptz;

comment on column public.tickets.customer_view_password_hash is 'sha256 hex digest of the customer-view password sent in the ticket-created email (task 379). Null for tickets created before this feature or imported from Zoho.';
comment on column public.tickets.customer_view_password_set_at is 'When the customer-view password was generated.';
comment on column public.tickets.customer_view_failed_attempts is 'Consecutive failed password attempts on the public ticket view (task 379). Reset to 0 on success.';
comment on column public.tickets.customer_view_locked_until is 'Public ticket view is locked from further password attempts until this timestamp, set after repeated failures.';
comment on column public.tickets.customer_notified_at is 'When the "Your ticket has been created" customer email was successfully sent (task 379). Null if not yet sent or the send failed.';
