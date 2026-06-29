# Task 086 — Fix profiles.role for Existing Staff Users

> **Type:** bugfix  
> **Priority:** HIGH  
> **Version Impact:** patch  
> **Recommended Model:** haiku  
> **Status:** Completed (2026-06-29)  
> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Problem

Staff users who signed up (or re-signed-up) on the new Supabase project received `role = 'client'` from the `handle_new_user()` trigger default. The `projects_staff_read` RLS policy requires `get_my_role()` to return one of `('admin', 'pm', 'developer', 'hr')`. With `role = 'client'`, the policy evaluates to false and Supabase silently returns `{ data: [], error: null }` — causing the Projects page to show "No projects found" for all staff.

## Root Cause

`supabase/migrations/026_rls_policies_v2.sql:40`:
```sql
coalesce(new.raw_user_meta_data->>'role', 'client')
```
Anyone who signs up without an explicit `role` in `raw_user_meta_data` gets `'client'` as their profile role.

## Fix

Single SQL migration (`040_seed_profiles_from_hub_users.sql`) that upserts correct roles for all users in `hub_users` into `profiles`, using the required role enum mapping.

**Role mapping:**

| hub_users.role | profiles.role |
|---|---|
| admin | admin |
| pm | pm |
| dev | **developer** |
| pending | **hr** |

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/040_seed_profiles_from_hub_users.sql` | Created | Upserts correct roles from hub_users into profiles |

## Code Context

### get_my_role() — security definer, reads profiles
`supabase/migrations/026_rls_policies_v2.sql:9-15`
```sql
create or replace function public.get_my_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;
```

### RLS policy that was blocking staff
`supabase/migrations/026_rls_policies_v2.sql:75-84`
```sql
create policy "projects_staff_read"
  on projects for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer', 'hr'));
```

### handle_new_user() trigger — source of the bad default
`supabase/migrations/026_rls_policies_v2.sql:29-50`
```sql
begin
  insert into public.profiles (id, full_name, avatar_url, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    coalesce(new.raw_user_meta_data->>'role', 'client')  -- ← defaults to client
  )
  on conflict (id) do nothing;
  return new;
end;
```

### Implemented migration
`supabase/migrations/040_seed_profiles_from_hub_users.sql`
```sql
insert into public.profiles (id, role, full_name, created_at, updated_at)
select
  hu.id,
  case hu.role
    when 'dev'     then 'developer'
    when 'pending' then 'hr'
    else hu.role
  end,
  hu.display_name,
  now(),
  now()
from public.hub_users hu
on conflict (id) do update
  set role       = excluded.role,
      updated_at = now();
```

## Notes for Implementation Agent

- The fix is a **data migration only** — no code changes required. The RLS policies, `get_my_role()` function, and page queries are all correct.
- `ON CONFLICT (id) DO UPDATE` makes this idempotent — safe to re-run.
- `hub_users.role = 'dev'` must map to `'developer'` (profiles enum value differs from hub_users value).
- `hub_users.role = 'pending'` maps to `'hr'` — confirmed from data.sql dump (Nikki Gabato).
- After applying in Supabase, affected users see projects immediately on next page load — no code deploy needed since RLS evaluates in real time.
- Apply via Supabase dashboard SQL editor or `supabase db push`.
