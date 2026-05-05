-- WebriQ Central Hub — Row Level Security
-- Migration 003: Enable RLS on all tables with permissive authenticated policies
-- Phase 2 will add per-customer policies once the user/customer mapping is defined.

-- Enable RLS
alter table customers              enable row level security;
alter table customer_products      enable row level security;
alter table classification_records enable row level security;
alter table requirements_assessments enable row level security;
alter table implementation_plans   enable row level security;
alter table execution_records      enable row level security;
alter table playbooks              enable row level security;
alter table llm_invocation_logs    enable row level security;
alter table digest_logs            enable row level security;
alter table llm_config             enable row level security;

-- ─── Permissive policies for authenticated users (Phase 1 — tighten in Phase 2) ──

create policy "authenticated_read_customers"
  on customers for select to authenticated using (true);

create policy "authenticated_write_customers"
  on customers for all to authenticated using (true) with check (true);

create policy "authenticated_read_customer_products"
  on customer_products for select to authenticated using (true);

create policy "authenticated_write_customer_products"
  on customer_products for all to authenticated using (true) with check (true);

create policy "authenticated_read_classification_records"
  on classification_records for select to authenticated using (true);

create policy "authenticated_write_classification_records"
  on classification_records for all to authenticated using (true) with check (true);

create policy "authenticated_read_requirements_assessments"
  on requirements_assessments for select to authenticated using (true);

create policy "authenticated_write_requirements_assessments"
  on requirements_assessments for all to authenticated using (true) with check (true);

create policy "authenticated_read_implementation_plans"
  on implementation_plans for select to authenticated using (true);

create policy "authenticated_write_implementation_plans"
  on implementation_plans for all to authenticated using (true) with check (true);

create policy "authenticated_read_execution_records"
  on execution_records for select to authenticated using (true);

create policy "authenticated_write_execution_records"
  on execution_records for all to authenticated using (true) with check (true);

create policy "authenticated_read_playbooks"
  on playbooks for select to authenticated using (true);

create policy "authenticated_write_playbooks"
  on playbooks for all to authenticated using (true) with check (true);

create policy "authenticated_read_llm_invocation_logs"
  on llm_invocation_logs for select to authenticated using (true);

create policy "authenticated_write_llm_invocation_logs"
  on llm_invocation_logs for all to authenticated using (true) with check (true);

create policy "authenticated_read_digest_logs"
  on digest_logs for select to authenticated using (true);

create policy "authenticated_write_digest_logs"
  on digest_logs for all to authenticated using (true) with check (true);

create policy "authenticated_read_llm_config"
  on llm_config for select to authenticated using (true);

-- llm_config is write-protected from regular users — only service role (admin client) can write
