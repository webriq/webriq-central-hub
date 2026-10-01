-- Migration 154: wiki-imports storage bucket for browser-direct Wiki PDF import uploads
-- PRIVATE, transient bucket. The PDF import used to POST the file as multipart to
-- /api/wiki/pages/import-pdf, but Vercel 413s any Route Handler body over ~4.5 MB before the
-- handler runs. New flow: POST .../import-pdf/sign mints a signed upload URL for
-- `<auth.uid()>/<uuid>.pdf`, the browser PUTs the bytes straight here, then POST .../import-pdf
-- ({ path }) downloads the object, runs the import, and deletes it in a finally block — so
-- nothing lingers after an import. A browser that uploads but never calls import can orphan an
-- object (bounded by the per-user folder + size limit; a periodic sweep is a follow-up).
-- Uses get_my_role() helper (migration 026) — never replicate the role lookup inline.
-- Written, NOT applied by the agent (storage-migration convention).
--
-- NOTE: a bucket's file_size_limit cannot exceed the PROJECT-WIDE upload limit (Dashboard →
-- Storage → Settings → "Upload file size limit"). That setting must be raised to >= 200 MB
-- (Pro plan or above) or uploads above the project limit are rejected regardless of this value.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wiki-imports',
  'wiki-imports',
  false,
  209715200, -- 200MB, PDFs only
  array['application/pdf']
)
on conflict (id) do nothing;

-- Each user can only touch objects under their own `<uid>/` folder. Same writer roles as
-- wiki_pages_staff_write (migration 149) — importing creates a page, so non-writers get nothing.
drop policy if exists "wiki_imports_own_insert" on storage.objects;
create policy "wiki_imports_own_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wiki-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
    and get_my_role() in ('admin', 'super_admin', 'pm', 'developer')
  );

drop policy if exists "wiki_imports_own_select" on storage.objects;
create policy "wiki_imports_own_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'wiki-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "wiki_imports_own_delete" on storage.objects;
create policy "wiki_imports_own_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'wiki-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
