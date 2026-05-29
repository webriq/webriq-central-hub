-- WebriQ Central Hub — Migration 016: KB Storage bucket + policies (Sprint 6, M10)

-- Create the kb bucket (private — no public URLs; files served via signed URLs)
insert into storage.buckets (id, name, public)
values ('kb', 'kb', false)
on conflict (id) do nothing;

-- hub_users with role 'pm' or 'developer' can upload to kb/global/
create policy "kb_global_upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kb'
    and (storage.foldername(name))[1] = 'global'
    and exists (
      select 1 from public.hub_users
      where id = auth.uid()
        and role in ('pm', 'developer', 'admin')
    )
  );

-- PM can upload to kb/customers/{customerId}/
create policy "kb_customer_upload_pm"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kb'
    and (storage.foldername(name))[1] = 'customers'
    and exists (
      select 1 from public.hub_users
      where id = auth.uid()
        and role in ('pm', 'admin')
    )
  );

-- Developer can upload to kb/customers/{customerId}/
create policy "kb_customer_upload_dev"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kb'
    and (storage.foldername(name))[1] = 'customers'
    and exists (
      select 1 from public.hub_users
      where id = auth.uid()
        and role in ('developer', 'admin')
    )
  );

-- All hub_users can read all kb files
create policy "kb_read_all"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'kb'
    and exists (
      select 1 from public.hub_users where id = auth.uid()
    )
  );
