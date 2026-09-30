-- Migration 152: Wiki draft visibility (task 407)
-- Depends on 149/151. Written, not applied by the agent.
--
-- Until now `wiki_pages.status` was a label only: every staff role could read (and, except hr,
-- write) every page, drafts included. This makes `draft` private:
--   * a DRAFT page is visible/editable only to its creator (`created_by`) and admin/super_admin;
--   * `published` / `archived` pages keep the existing staff-wide read + pm/developer/admin write.
-- Pages with `created_by is null` (pre-existing/imported rows) are therefore admin-only while draft.
-- wiki_save_page / wiki_restore_revision are `security invoker`, so they inherit these policies.

create or replace function can_see_wiki_draft(p_created_by uuid)
returns boolean
language sql stable
set search_path = public
as $$
  select p_created_by = auth.uid() or get_my_role() in ('admin', 'super_admin');
$$;

-- ─── wiki_pages ───────────────────────────────────────────────────────────────
drop policy if exists "wiki_pages_staff_read" on wiki_pages;
drop policy if exists "wiki_pages_staff_write" on wiki_pages;

create policy "wiki_pages_select"
  on wiki_pages for select to authenticated
  using (
    get_my_role() in ('admin', 'super_admin', 'pm', 'developer', 'hr')
    and (status <> 'draft' or can_see_wiki_draft(created_by))
  );

create policy "wiki_pages_insert"
  on wiki_pages for insert to authenticated
  with check (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

-- The WITH CHECK also stops a non-creator from flipping someone else's published page back to
-- draft (the resulting row would be invisible to them).
create policy "wiki_pages_update"
  on wiki_pages for update to authenticated
  using (
    get_my_role() in ('admin', 'super_admin', 'pm', 'developer')
    and (status <> 'draft' or can_see_wiki_draft(created_by))
  )
  with check (
    get_my_role() in ('admin', 'super_admin', 'pm', 'developer')
    and (status <> 'draft' or can_see_wiki_draft(created_by))
  );

create policy "wiki_pages_delete"
  on wiki_pages for delete to authenticated
  using (
    get_my_role() in ('admin', 'super_admin', 'pm', 'developer')
    and (status <> 'draft' or can_see_wiki_draft(created_by))
  );

-- ─── wiki_page_versions ───────────────────────────────────────────────────────
-- History follows the page: the subquery runs under the caller's wiki_pages RLS, so revisions of
-- a hidden draft are hidden too.
drop policy if exists "wiki_page_versions_staff_read" on wiki_page_versions;

create policy "wiki_page_versions_staff_read"
  on wiki_page_versions for select to authenticated
  using (
    get_my_role() in ('admin', 'super_admin', 'pm', 'developer', 'hr')
    and exists (select 1 from wiki_pages p where p.id = wiki_page_versions.page_id)
  );

-- ─── wiki_page_draft_holders ──────────────────────────────────────────────────
-- security definer bypasses wiki_pages RLS, so re-apply the draft-visibility rule explicitly.
create or replace function wiki_page_draft_holders(p_page_id uuid)
returns table (user_id uuid, full_name text, email text, updated_at timestamptz, base_revision int)
language sql stable security definer
set search_path = public
as $$
  select d.user_id, p.full_name, u.email::text, d.updated_at, d.base_revision
  from wiki_page_drafts d
  join profiles p on p.id = d.user_id
  left join auth.users u on u.id = d.user_id
  where d.page_id = p_page_id
    and d.user_id <> auth.uid()
    and get_my_role() in ('admin', 'super_admin', 'pm', 'developer', 'hr')
    and exists (
      select 1 from wiki_pages w
      where w.id = p_page_id and (w.status <> 'draft' or can_see_wiki_draft(w.created_by))
    )
  order by d.updated_at desc;
$$;
