-- Task 496 — how a converted order got its project. NULL = created by Convert (every pre-496 row);
-- 'linked_existing' = the reviewer linked a project that already existed (Orders › Link existing project).
-- Written-not-applied: the link route retries without this column on 42703.
alter table public.stackshift_orders
  add column if not exists link_method text
  check (link_method in ('created', 'linked_existing'));
