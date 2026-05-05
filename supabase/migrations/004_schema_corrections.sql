-- WebriQ Central Hub — Schema Corrections
-- Migration 004: Align schema with technical spec v0.1 (gaps found during COO/CTO doc review)

-- ─── customers: add missing fields from tech spec §8 ─────────────────────────
alter table customers
  add column if not exists automation_toggle  boolean not null default false,
  add column if not exists llm_excluded       boolean not null default false,
  add column if not exists communication_tone text not null default 'formal'
    check (communication_tone in ('formal', 'casual', 'technical')),
  add column if not exists onboarding_status  jsonb not null default '{"completion_pct": 0, "missing_fields": [], "last_updated": null}';

-- ─── customer_products: add dedicated_developers and automation_toggle ────────
alter table customer_products
  add column if not exists dedicated_developers text[] not null default '{}';

-- ─── classification_records: llm_eligible → TEXT (YES | NO | HUMAN_ONLY) ─────
-- Drop the old boolean column and add the correct TEXT one
alter table classification_records
  drop column if exists llm_eligible;

alter table classification_records
  add column if not exists llm_eligible text not null default 'NO'
    check (llm_eligible in ('YES', 'NO', 'HUMAN_ONLY'));

-- Fix priority casing: CRITICAL | HIGH | NORMAL | LOW (uppercase, NORMAL not MEDIUM)
alter table classification_records
  drop constraint if exists classification_records_priority_check;

alter table classification_records
  add constraint classification_records_priority_check
    check (priority in ('CRITICAL', 'HIGH', 'NORMAL', 'LOW'));

-- ─── requirements_assessments: add confidence_to_proceed ─────────────────────
alter table requirements_assessments
  add column if not exists confidence_to_proceed integer check (confidence_to_proceed between 0 and 100);

-- clarification_draft → JSONB (structured missing items + generated text)
alter table requirements_assessments
  drop column if exists clarification_draft;

alter table requirements_assessments
  add column if not exists clarification_draft jsonb;

-- ─── implementation_plans: align status values with tech spec ─────────────────
alter table implementation_plans
  drop constraint if exists implementation_plans_status_check;

alter table implementation_plans
  alter column status set default 'PENDING_APPROVAL';

alter table implementation_plans
  add constraint implementation_plans_status_check
    check (status in ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTING', 'COMPLETE', 'FAILED'));

-- ─── execution_records: add missing fields from tech spec §8 ─────────────────
alter table execution_records
  add column if not exists outcome         text check (outcome in ('SUCCESS', 'PARTIAL', 'FAILED')),
  add column if not exists outputs         jsonb not null default '{}',
  add column if not exists what_was_done   text,
  add column if not exists what_was_skipped text;

-- ─── playbooks: add embedding and lifecycle fields from tech spec §6.5 ────────
alter table playbooks
  drop constraint if exists playbooks_source_check;

alter table playbooks
  add column if not exists embedding_summary          text,
  add column if not exists original_task_description  text,
  add column if not exists classification_applied     jsonb,
  add column if not exists execution_outcome          text,
  add column if not exists last_validated             date;

-- Align status values: ACTIVE | STALE | ARCHIVED
alter table playbooks
  drop column if exists is_active;

alter table playbooks
  add column if not exists status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'STALE', 'ARCHIVED'));

-- ─── llm_config: add provider column for multi-provider support ───────────────
alter table llm_config
  add column if not exists provider text not null default 'anthropic'
    check (provider in ('anthropic', 'openai'));

-- Update seed to include provider
update llm_config set provider = 'anthropic' where provider is null or provider = '';

-- ─── llm_invocation_logs: soft per-customer daily token budget ────────────────
-- (referenced in tech spec §9: "Soft cap per-customer daily token budget with PM alert")
-- The cap config is stored in customers table; actual tracking is via llm_invocation_logs
alter table customers
  add column if not exists daily_token_budget integer default null;

-- ─── New: user_roles table (COO Specs §Access Control) ───────────────────────
-- Role-based permissions: admin | pm | developer | client
create table if not exists user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  role       text not null check (role in ('admin', 'pm', 'developer', 'client')),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_user_roles_user_id_role on user_roles (user_id, role);

alter table user_roles enable row level security;

create policy "authenticated_read_user_roles"
  on user_roles for select to authenticated using (true);

create policy "authenticated_write_user_roles"
  on user_roles for all to authenticated using (true) with check (true);
