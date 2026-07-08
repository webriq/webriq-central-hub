-- Migration 057: customer_assets — multi-field credentials, real file uploads, role permissions
-- - value becomes nullable: credentials now store their data in `fields` (jsonb), files in
--   file_path/file_name/file_size/file_mime_type; only `link` still uses `value`.
-- - allowed_roles (text[] | null): NULL/empty = visible to everyone (matches all existing rows,
--   no behavior change). Enforcement is application-level (API route), not RLS — this table's
--   existing RLS policy stays table-level ("authenticated can manage"); see task 118 for why.
-- - New private "customer-assets" storage bucket + RLS, mirroring migration 050's project-assets
--   bucket. Uses get_my_role() (migration 026) — never replicate the role lookup inline.

alter table customer_assets alter column value drop not null;
alter table customer_assets add column if not exists fields jsonb;
alter table customer_assets add column if not exists allowed_roles text[];
alter table customer_assets add column if not exists file_path text;
alter table customer_assets add column if not exists file_name text;
alter table customer_assets add column if not exists file_size integer;
alter table customer_assets add column if not exists file_mime_type text;

insert into storage.buckets (id, name, public, file_size_limit)
values ('customer-assets', 'customer-assets', false, 26214400) -- 25MB, matches api/upload/route.ts's MAX_FILE_SIZE
on conflict (id) do nothing;

drop policy if exists "customer_assets_staff_read" on storage.objects;
create policy "customer_assets_staff_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'customer-assets'
    and get_my_role() in ('admin', 'super_admin', 'pm', 'developer')
  );

drop policy if exists "customer_assets_staff_write" on storage.objects;
create policy "customer_assets_staff_write"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'customer-assets'
    and get_my_role() in ('admin', 'super_admin', 'pm')
  )
  with check (
    bucket_id = 'customer-assets'
    and get_my_role() in ('admin', 'super_admin', 'pm')
  );
