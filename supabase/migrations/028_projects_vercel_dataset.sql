alter table projects
  add column if not exists dataset text,
  add column if not exists vercel_project_id text;
