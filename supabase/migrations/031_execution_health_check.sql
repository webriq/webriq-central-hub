alter table execution_records
  add column if not exists health_check_status text,
  add column if not exists health_check_url text;
