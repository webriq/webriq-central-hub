-- WebriQ Central Hub — Migration 018: Hub metrics view (Sprint 6, M10)

create or replace view vw_hub_metrics as
select
  -- 1. Total customers onboarded
  (select count(*) from customers where status != 'inactive') as customers_total,

  -- 2. Total tasks classified
  (select count(*) from classification_records) as classifications_total,

  -- 3. LLM-eligible task rate (%)
  (
    select round(
      100.0 * count(*) filter (where llm_eligible = 'YES') / nullif(count(*), 0),
      1
    )
    from classification_records
  ) as llm_eligible_rate_pct,

  -- 4. Average classification confidence score
  (
    select round(avg(confidence_score)::numeric, 2)
    from classification_records
    where confidence_score is not null
  ) as avg_classification_confidence,

  -- 5. Total assessments run
  (select count(*) from requirements_assessments) as assessments_total,

  -- 6. Plan approval rate (%)
  (
    select round(
      100.0 * count(*) filter (where status in ('APPROVED', 'EXECUTING', 'COMPLETE'))
             / nullif(count(*) filter (where status != 'draft'), 0),
      1
    )
    from implementation_plans
  ) as plan_approval_rate_pct,

  -- 7. Plan rejection rate (%)
  (
    select round(
      100.0 * count(*) filter (where status = 'REJECTED')
             / nullif(count(*) filter (where status != 'draft'), 0),
      1
    )
    from implementation_plans
  ) as plan_rejection_rate_pct,

  -- 8. Total executions completed
  (select count(*) from execution_records where status in ('COMPLETED', 'PARTIAL_EXECUTION')) as executions_completed,

  -- 9. Execution success rate (%)
  (
    select round(
      100.0 * count(*) filter (where status = 'COMPLETED')
             / nullif(count(*) filter (where status != 'PENDING'), 0),
      1
    )
    from execution_records
  ) as execution_success_rate_pct,

  -- 10. Total LLM cost USD (all time)
  (select round(sum(cost_usd)::numeric, 4) from llm_invocation_logs where status = 'success') as llm_cost_total_usd,

  -- 11. Total LLM cost USD (this month)
  (
    select round(sum(cost_usd)::numeric, 4)
    from llm_invocation_logs
    where status = 'success'
      and created_at >= date_trunc('month', now())
  ) as llm_cost_month_usd;
