alter table classification_records
  add column if not exists sub_tasks jsonb;
