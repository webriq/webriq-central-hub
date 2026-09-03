-- Migration 130: StackShift Order Form submissions (task 347)
-- Receives submissions from the public StackShift Order Form on webriq.com, relayed
-- server-to-server by a webriq.com proxy route to POST /api/webhooks/stackshift-order.
-- The webhook only RECORDS + notifies — it never creates customers/projects. A human in
-- the /stackshift-orders review queue (admin/super_admin/pm) converts a submission into a
-- new-or-linked customer + a DRAFT project (POST /api/stackshift-orders/[orderId]/convert),
-- or dismisses it.
--
--   status              'pending_review' (default) | 'converted' | 'dismissed'
--   services            text[] — raw checkbox values from the form
--   mapped_classifications  text[] — services mapped to `customer_phases` CLASSIFICATIONS
--   *_path / *_filename  the proposal (required) + optional FlowForge spec, stored in the
--                        `project-assets` bucket under stackshift-orders/incoming/<uuid>/
--   raw_payload         jsonb — the full relayed submission, for forward-compat / audit
--   dedupe_key          optional idempotency key from the proxy (unique when present)
--   customer_id / project_id  set only once a reviewer converts the submission
--   is_new_customer     whether convert created a new customer vs linked an existing one

create table stackshift_orders (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'converted', 'dismissed')),
  submitted_at timestamptz,

  -- Section 1 — Customer information
  contact_name text,
  company_name text not null,
  website text,
  business_email text,
  billing_name text,
  billing_email text,
  mobile_phone text,
  company_address text,

  -- Section 2 — StackShift selection
  services text[] not null default '{}',
  mapped_classifications text[] not null default '{}',

  -- Section 3 + Section 2 file — uploaded documents (project-assets bucket paths)
  proposal_path text,
  proposal_filename text,
  flowforge_spec_path text,
  flowforge_spec_filename text,

  -- Section 4 — Approval
  approved_by text,
  approval_date date,
  terms_accepted boolean not null default false,

  raw_payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  notification_sent_at timestamptz,

  -- Review outcome
  customer_id text references customers(customer_id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  is_new_customer boolean,
  review_notes text,
  dismiss_reason text,
  converted_by uuid references auth.users(id) on delete set null,
  converted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table stackshift_orders enable row level security;

-- Read gate mirrors `accounts` (migration 125) — internal staff roles. All writes go through
-- the service-role adminClient (webhook + convert/patch routes run their own explicit role
-- checks with the user session client first), so no INSERT/UPDATE policy is defined here.
create policy "stackshift_orders_staff_read"
  on stackshift_orders for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'marketing'));

create unique index stackshift_orders_dedupe_key_idx
  on stackshift_orders(dedupe_key) where dedupe_key is not null;
create index stackshift_orders_status_idx on stackshift_orders(status);
create index stackshift_orders_created_at_idx on stackshift_orders(created_at desc);
create index stackshift_orders_customer_id_idx
  on stackshift_orders(customer_id) where customer_id is not null;
