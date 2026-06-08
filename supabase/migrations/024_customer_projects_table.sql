-- 024_customer_projects_table.sql
-- Create customer_projects table as a customer-level concept (not per-product).
-- Projects carry zoho_project_id, sanity_project_id, github_repo, dedicated_developers
-- which were previously (incorrectly) columns on customer_products.

create table if not exists customer_projects (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          text not null references customers (customer_id) on delete cascade,
  project_name         text not null,
  project_type         text not null check (project_type in ('Content Site', 'Ecommerce (B2C)', 'Ecommerce (B2B)', 'Custom App')),
  zoho_project_id      text,
  sanity_project_id    text,
  github_repo          text,
  dedicated_developers text[] not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_customer_projects_customer_id on customer_projects (customer_id);

-- RLS: mirror customer_products policies
alter table customer_projects enable row level security;

create policy "Authenticated users can read customer_projects"
  on customer_projects for select
  to authenticated
  using (true);

create policy "Service role has full access to customer_projects"
  on customer_projects for all
  to service_role
  using (true)
  with check (true);

-- Drop migrated columns from customer_products (clean drop, no data to preserve)
alter table customer_products
  drop column if exists zoho_project_id,
  drop column if exists sanity_project_id,
  drop column if exists github_repo,
  drop column if exists dedicated_developers;
