-- WebriQ Central Hub — Phase 1 Schema
-- Migration 001: Initial tables
-- Order: customers first (referenced by all others)

create extension if not exists "pgcrypto";

-- ─── customers ────────────────────────────────────────────────────────────────
create table if not exists customers (
  id              uuid primary key default gen_random_uuid(),
  customer_id     text unique not null,
  company_name    text not null,
  contact_name    text,
  contact_email   text,
  zoho_account_id text,
  status          text not null default 'active' check (status in ('active', 'inactive', 'onboarding')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_customers_customer_id on customers (customer_id);
create index if not exists idx_customers_status on customers (status);

-- ─── customer_products ────────────────────────────────────────────────────────
create table if not exists customer_products (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         text not null references customers (customer_id) on delete cascade,
  product_name        text not null check (product_name in ('StackShift', 'PublishForge', 'CiteForge', 'PipelineForge')),
  product_instance_id text,
  sanity_project_id   text,
  zoho_project_id     text,
  github_repo         text,
  status              text not null default 'active' check (status in ('active', 'inactive')),
  onboarding_complete boolean not null default false,
  onboarding_data     jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_customer_products_customer_id on customer_products (customer_id);
create index if not exists idx_customer_products_product_name on customer_products (product_name);

-- ─── classification_records ───────────────────────────────────────────────────
create table if not exists classification_records (
  id               uuid primary key default gen_random_uuid(),
  customer_id      text not null references customers (customer_id) on delete cascade,
  zoho_ticket_id   text,
  zoho_task_id     text,
  source           text not null check (source in ('zoho_desk', 'zoho_projects')),
  title            text not null,
  description      text,
  task_type        text,
  priority         text check (priority in ('low', 'medium', 'high', 'critical')),
  llm_eligible     boolean not null default false,
  confidence_score numeric(5, 2),
  model_used       text,
  input_tokens     integer,
  output_tokens    integer,
  raw_response     jsonb,
  status           text not null default 'pending' check (status in ('pending', 'reviewed', 'rejected')),
  reviewed_by      text,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists idx_classification_records_customer_id on classification_records (customer_id);
create index if not exists idx_classification_records_status on classification_records (status);
create index if not exists idx_classification_records_created_at on classification_records (created_at desc);

-- ─── requirements_assessments ─────────────────────────────────────────────────
create table if not exists requirements_assessments (
  id                    uuid primary key default gen_random_uuid(),
  classification_id     uuid not null references classification_records (id) on delete cascade,
  customer_id           text not null references customers (customer_id) on delete cascade,
  subtasks              jsonb not null default '[]',
  overall_status        text not null check (overall_status in ('CLEAR', 'PARTIAL', 'BLOCKED')),
  clarification_draft   text,
  model_used            text,
  input_tokens          integer,
  output_tokens         integer,
  assessment_version    integer not null default 1,
  created_at            timestamptz not null default now()
);

create index if not exists idx_requirements_assessments_classification_id on requirements_assessments (classification_id);
create index if not exists idx_requirements_assessments_customer_id on requirements_assessments (customer_id);

-- ─── implementation_plans ─────────────────────────────────────────────────────
create table if not exists implementation_plans (
  id               uuid primary key default gen_random_uuid(),
  assessment_id    uuid not null references requirements_assessments (id) on delete cascade,
  customer_id      text not null references customers (customer_id) on delete cascade,
  steps            jsonb not null default '[]',
  affected_files   jsonb not null default '[]',
  apis_involved    jsonb not null default '[]',
  playbooks_used   jsonb not null default '[]',
  confidence_score numeric(5, 2),
  risk_flags       jsonb not null default '[]',
  status           text not null default 'draft'
    check (status in ('draft', 'approved', 'rejected', 'executing', 'complete', 'failed')),
  rejection_reason text
    check (rejection_reason in ('PLAN_INCOMPLETE', 'WRONG_APPROACH', 'SCOPE_EXCEEDED', 'KNOWLEDGE_GAP', 'MISCLASSIFICATION')),
  rejected_by      text,
  approved_by      text,
  model_used       text,
  input_tokens     integer,
  output_tokens    integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_implementation_plans_assessment_id on implementation_plans (assessment_id);
create index if not exists idx_implementation_plans_customer_id on implementation_plans (customer_id);
create index if not exists idx_implementation_plans_status on implementation_plans (status);

-- ─── execution_records ────────────────────────────────────────────────────────
create table if not exists execution_records (
  id                  uuid primary key default gen_random_uuid(),
  plan_id             uuid not null references implementation_plans (id) on delete cascade,
  customer_id         text not null references customers (customer_id) on delete cascade,
  status              text not null default 'pending'
    check (status in ('pending', 'running', 'complete', 'failed', 'partial', 'reverted')),
  pre_action_states   jsonb not null default '{}',
  post_action_states  jsonb not null default '{}',
  github_pr_url       text,
  preview_url         text,
  error_message       text,
  failure_count       integer not null default 0,
  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists idx_execution_records_plan_id on execution_records (plan_id);
create index if not exists idx_execution_records_customer_id on execution_records (customer_id);
create index if not exists idx_execution_records_status on execution_records (status);

-- ─── playbooks ────────────────────────────────────────────────────────────────
create table if not exists playbooks (
  id          uuid primary key default gen_random_uuid(),
  customer_id text references customers (customer_id) on delete cascade,
  task_type   text not null,
  title       text not null,
  content     text not null,
  version     integer not null default 1,
  is_active   boolean not null default true,
  source      text not null default 'manual' check (source in ('manual', 'generated', 'learned')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_playbooks_task_type on playbooks (task_type);
create index if not exists idx_playbooks_customer_id on playbooks (customer_id);
create index if not exists idx_playbooks_is_active on playbooks (is_active);

-- ─── llm_invocation_logs ──────────────────────────────────────────────────────
create table if not exists llm_invocation_logs (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         text,
  orchestration_layer text not null
    check (orchestration_layer in ('classification', 'assessment', 'planning', 'execution', 'digest', 'reply', 'wiki_lint')),
  model_used          text not null,
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  cost_usd            numeric(10, 6),
  duration_ms         integer,
  status              text not null default 'success' check (status in ('success', 'error', 'timeout')),
  error_message       text,
  reference_id        uuid,
  reference_type      text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_llm_invocation_logs_customer_id on llm_invocation_logs (customer_id);
create index if not exists idx_llm_invocation_logs_orchestration_layer on llm_invocation_logs (orchestration_layer);
create index if not exists idx_llm_invocation_logs_created_at on llm_invocation_logs (created_at desc);

-- ─── digest_logs ──────────────────────────────────────────────────────────────
create table if not exists digest_logs (
  id            uuid primary key default gen_random_uuid(),
  digest_type   text not null check (digest_type in ('pm', 'dev')),
  target_user   text,
  content       jsonb not null,
  model_used    text,
  input_tokens  integer,
  output_tokens integer,
  feedback      text check (feedback in ('useful', 'partial', 'not_useful')),
  feedback_at   timestamptz,
  digest_date   date not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_digest_logs_digest_type on digest_logs (digest_type);
create index if not exists idx_digest_logs_digest_date on digest_logs (digest_date desc);

-- ─── llm_config ───────────────────────────────────────────────────────────────
create table if not exists llm_config (
  id                  uuid primary key default gen_random_uuid(),
  orchestration_layer text unique not null
    check (orchestration_layer in ('classification', 'assessment', 'planning', 'execution', 'digest', 'reply', 'wiki_lint')),
  model_id            text not null,
  max_tokens          integer not null default 4096,
  temperature         numeric(3, 2) not null default 0.3,
  system_prompt_key   text,
  is_active           boolean not null default true,
  notes               text,
  updated_at          timestamptz not null default now()
);

-- ─── updated_at trigger ───────────────────────────────────────────────────────
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_customers
  before update on customers
  for each row execute function update_updated_at_column();

create trigger set_updated_at_customer_products
  before update on customer_products
  for each row execute function update_updated_at_column();

create trigger set_updated_at_implementation_plans
  before update on implementation_plans
  for each row execute function update_updated_at_column();

create trigger set_updated_at_playbooks
  before update on playbooks
  for each row execute function update_updated_at_column();

create trigger set_updated_at_llm_config
  before update on llm_config
  for each row execute function update_updated_at_column();
