-- Configurable StackShift I programme length (task 239). Defaults to the existing 120-day
-- programme for every project (including all existing rows) — only new StackShift I intake
-- can override it going forward via the New Project wizard.
ALTER TABLE projects ADD COLUMN programme_duration_days integer NOT NULL DEFAULT 120;
ALTER TABLE projects ADD CONSTRAINT projects_programme_duration_days_check CHECK (programme_duration_days > 0);
