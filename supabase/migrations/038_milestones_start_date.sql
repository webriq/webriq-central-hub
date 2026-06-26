-- Migration 038: add start_date to milestones
-- Zoho exports start_date on every milestone; captured here for import fidelity.
alter table milestones
  add column start_date date;
