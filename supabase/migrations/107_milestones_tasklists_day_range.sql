-- Task 252: day-range columns for the generic phase-plan engine (milestones = phases,
-- tasklists = deliverables), mirroring customer_phases.day_start_override/day_end_override
-- and customer_deliverables' own columns — brings Access/Access Plus/Discrete Development/
-- StackShift II-without-the-default-engine-opt-in onto the same day-based Gantt/Swimlane model
-- StackShift I already uses, instead of the dateless flat card grid they had before. Nullable:
-- every existing row (seeded before this task) has none, and the New Project wizard's free-form
-- phase builder — the only writer of these columns going forward — always fills them in, but
-- nothing in the seeding path assumes non-null.
alter table milestones add column day_start integer;
alter table milestones add column day_end integer;
alter table milestones add constraint milestones_day_range_check
  check (day_start is null or day_end is null or day_end >= day_start);

alter table tasklists add column day_start integer;
alter table tasklists add column day_end integer;
alter table tasklists add constraint tasklists_day_range_check
  check (day_start is null or day_end is null or day_end >= day_start);
