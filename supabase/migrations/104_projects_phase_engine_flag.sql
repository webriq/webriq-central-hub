-- Task 247: persist which phase-tracking engine a project uses, decided once at intake
-- (POST /api/onboarding/projects already computed this as `usesCustomerPhasesEngine`, task 239,
-- but never stored it). true = StackShift I's specialized customer_phases/customer_deliverables
-- 120-day engine; false = the generic milestones/tasklists/tasks model (task 239's seedCustomPhases).
-- Backfill: any project with at least one existing customer_phases row is already on the engine.
ALTER TABLE projects ADD COLUMN uses_customer_phases_engine boolean NOT NULL DEFAULT false;

UPDATE projects
SET uses_customer_phases_engine = true
WHERE id IN (SELECT DISTINCT project_id FROM customer_phases);
