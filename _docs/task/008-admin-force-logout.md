# Task 008 — Admin Force-Logout (All Users Except One)

> **Version Impact:** patch
> **Recommended Tier:** balanced
> **Sprint:** 1.1 — Auth Layer
> **Status:** COMPLETED
> **Completed:** 2026-05-15

---

## Summary

Add an admin-only force-logout capability that deletes all Supabase Auth sessions and refresh tokens for every user **except** a specified one. This allows an admin to clear all active sessions at once (e.g., after a security incident or during maintenance) while keeping themselves signed in.

The feature consists of:
1. A Postgres function (`public.force_logout_all_except`) that deletes from `auth.sessions` and `auth.refresh_tokens` for non-exempt users
2. A Next.js API route (`POST /api/auth/force-logout`) that authenticates the caller, verifies admin role, and invokes the function
3. A type-cast fix: `auth.refresh_tokens.user_id` is `varchar` while the function accepts `uuid`, requiring an explicit `::text` cast

---

## Requirements

- [x] Admin can trigger force-logout via API, specifying one user to exempt
- [x] All other users' sessions and refresh tokens are deleted from Supabase Auth
- [x] Deleted users fail JWT validation (`getClaims()`) on their next request and must re-authenticate
- [x] Only users with `hub_users.role = 'admin'` can invoke the endpoint
- [x] Caller must be authenticated (valid JWT via `getClaims()`)
- [x] Endpoint returns counts of deleted sessions and refresh tokens

---

## Root Cause / Background

No prior force-logout mechanism existed. Administrators had no way to mass-invalidate user sessions other than manually deleting rows from Supabase Auth tables.

The `auth.refresh_tokens` table in Supabase Gotrue stores `user_id` as `character varying`, while `auth.sessions` stores it as `uuid`. The original migration used bare `!=` comparison which works for `sessions` but fails for `refresh_tokens` with `operator does not exist: character varying <> uuid`.

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/009_force_logout_function.sql` | Create | `force_logout_all_except(uuid)` — deletes sessions and refresh tokens for all users except the exempt one |
| `src/app/api/auth/force-logout/route.ts` | Create | `POST` endpoint — authenticates caller, verifies admin role, parses `excludeUserId`, calls RPC |
| `src/lib/supabase/admin.ts` | Existing | Service-role Supabase client used by the RPC call (already existed) |

---

## Code Context

### Postgres Function (deployed to Supabase)

```sql
create or replace function public.force_logout_all_except(
  exclude_user_id uuid
)
returns table(action text, count bigint)
language plpgsql
security definer
set search_path = 'auth', 'public'
as $$
declare
  session_count bigint;
  refresh_count bigint;
begin
  -- refresh_tokens.user_id is varchar → explicit ::text cast required
  with deleted as (
    delete from auth.refresh_tokens
    where user_id != exclude_user_id::text
    returning 1
  )
  select count(*) into refresh_count from deleted;

  with deleted as (
    delete from auth.sessions
    where user_id != exclude_user_id
    returning 1
  )
  select count(*) into session_count from deleted;

  return query
    select 'sessions_deleted'::text, session_count
    union all
    select 'refresh_tokens_deleted'::text, refresh_count;
end;
$$;
```

### API Route

```typescript
// POST /api/auth/force-logout
// Body: { excludeUserId: string }
// Returns: { success: true, excludeUserId, details: [...rows] }

// 1. Authenticate via getClaims()
// 2. Verify hub_users.role === "admin"
// 3. adminClient.rpc("force_logout_all_except", { exclude_user_id })
```

### Admin Client

```typescript
// src/lib/supabase/admin.ts
export const adminClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,  // service_role key
  { auth: { autoRefreshToken: false, persistSession: false } }
);
```

---

## Implementation Steps

1. Create Postgres migration `009_force_logout_function.sql` with the `force_logout_all_except` function
2. Create API route `src/app/api/auth/force-logout/route.ts` with JWT auth + admin role check + RPC invocation
3. Deploy migration to Supabase (via Management API or `supabase db push`)
4. Fix type mismatch: cast `exclude_user_id` to `::text` for `auth.refresh_tokens` comparison
5. Execute via admin API or direct RPC call to validate

---

## Acceptance Criteria

- [x] `POST /api/auth/force-logout` with `{ excludeUserId: "<uuid>" }` returns 200 with session/refresh-token deletion counts
- [x] Unauthenticated callers receive 401
- [x] Non-admin authenticated callers receive 403
- [x] Missing or invalid `excludeUserId` returns 400
- [x] Exempt user retains their session and can continue making requests
- [x] All other users are logged out on their next request (JWT invalid)
- [x] Postgres function handles the `uuid` ↔ `varchar` type mismatch correctly

---

## Verification

**Verified on:** 2026-05-15

```bash
# Call the function directly via Supabase Management API / Database SQL:
SELECT * FROM public.force_logout_all_except('4b367932-bb6b-4945-88ac-c374e936a209'::uuid);

# Result:
# sessions_deleted      | 5
# refresh_tokens_deleted | 10
```

The exempt user `4b367932-bb6b-4945-88ac-c374e936a209` remains signed in. All other users' sessions and refresh tokens were deleted.

---

## Compatibility

- **Supabase Auth**: Works with Gotrue v2+ schema (`auth.sessions`, `auth.refresh_tokens`)
- **Type cast fix**: Required because Supabase `auth.refresh_tokens.user_id` is `varchar`, not `uuid`
- **Security**: Function uses `SECURITY DEFINER` with restricted `search_path = 'auth', 'public'`
- **No middleware changes**: Existing JWT validation via `getClaims()` invalidates deleted sessions automatically
