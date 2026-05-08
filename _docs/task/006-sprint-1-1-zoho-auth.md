# Task 006 — Sprint 1.1: Zoho OAuth + Email/Password Auth

> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Sprint:** 1.1 — Auth Layer
> **Status:** TESTING
> **Completed:** 2026-05-07

---

## Summary

Add Zoho OAuth ("Sign in with Zoho") as a second login option alongside the existing email/password form. PMs and Developers use their existing Zoho accounts; email/password stays for admin-created accounts. Introduces a `hub_users` table to store role assignments (`admin | pm | developer | client`) and Zoho identity linkage.

---

## Requirements

- Sign-in page shows both methods: email/password form (unchanged) and a "Sign in with Zoho" button
- `/signup` stays as-is for admin-created email/password accounts
- Zoho OAuth is brokered through Supabase's custom OAuth provider feature (Supabase manages the token exchange)
- On first Zoho login, a `hub_users` row is auto-inserted via trigger with `role = 'pm'` by default; role is upgraded manually via Supabase Dashboard
- Existing hub auth guard (`getClaims()` in hub layout) requires no changes
- No role-based route gating in this sprint — that's Phase 2 RLS tightening

---

## Manual Setup Steps (not code — must be done before testing)

These two steps cannot be scripted and must be completed by the developer:

### 1. Zoho API Console
1. Go to `https://api-console.zoho.com/` → create (or update) a "Server-based Application"
2. Add redirect URI: `https://[your-supabase-project-ref].supabase.co/auth/v1/callback`
3. Set scopes: `AaaServer.profile.Read`
4. Copy `Client ID` and `Client Secret`

### 2. Supabase Dashboard
1. Go to **Authentication → Providers → Add provider → Custom**
2. ~~Manual configuration~~ → use **Auto-discovery** with Issuer URL: `https://accounts.zoho.com`
3. Paste `Client ID` and `Client Secret` from step 1

> ✅ **DONE** — Provider active. Identifier: `custom:zoho`, Type: OIDC, Status: ENABLED.
> Use `provider=custom%3Azoho` (URL-encoded colon) in the authorize redirect URL.

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/007_hub_users.sql` | Create | `hub_users` table, auto-insert trigger on auth.users, RLS |
| `src/app/api/auth/callback/route.ts` | Create | PKCE code exchange → session; redirects to `/hub` |
| `src/app/(auth)/signin/page.tsx` | Modify | Add "Sign in with Zoho" button + divider above email form |
| `env.example` | Modify | Add `ZOHO_OAUTH_REDIRECT_URI` comment (documents Supabase callback URL) |

---

## Code Context

### Current sign-in page (full file — `src/app/(auth)/signin/page.tsx`)

```tsx
"use client";
// ... (client component, calls supabase.auth.signInWithPassword)
// currently has email input + password input + submit button + link to /signup
// Must add: Zoho button above the form, with a divider between the two methods
// Zoho button triggers redirect to Supabase custom OAuth URL (inside a callback, per CLAUDE.md SSR rule)
```

Full file at: `src/app/(auth)/signin/page.tsx:1-105`

### Auth guard — hub layout (`src/app/(hub)/layout.tsx:1-21`)

```tsx
const { data } = await supabase.auth.getClaims();
if (!data?.claims) { redirect("/signin"); }
```

No changes needed — `getClaims()` works for both email/password and OAuth sessions.

### `UserRole` type (`src/types/hub.ts:100`)

```ts
export type UserRole = "admin" | "pm" | "developer" | "client";
```

Already defined. Migration must use same casing: `check (role in ('admin', 'pm', 'developer', 'client'))`.

### `env.example` — existing Zoho vars (`env.example:19-25`)

```
# ─── Zoho (Sprint 2+) ─────────────────────────────────────────────────────────
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REFRESH_TOKEN=
ZOHO_API_BASE_URL=
```

These same `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` are entered into Supabase Dashboard for the OAuth provider — no new env vars needed. Add a comment clarifying dual use.

---

## Implementation Steps

### Step 1 — Migration: `hub_users` table

Create `supabase/migrations/007_hub_users.sql`:

```sql
-- Migration 007: hub_users — internal user profiles with role assignment
-- id FK references auth.users so rows are cleaned up on user deletion

create table if not exists public.hub_users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text,
  role          text not null default 'pm'
    check (role in ('admin', 'pm', 'developer', 'client')),
  zoho_user_id  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger set_updated_at_hub_users
  before update on public.hub_users
  for each row execute function update_updated_at_column();

alter table public.hub_users enable row level security;

-- Users can read their own row; service role can write (role assignment via dashboard)
create policy "users_read_own"
  on public.hub_users for select to authenticated
  using (id = auth.uid());

-- Auto-insert on first login (works for both OAuth and email/password)
create or replace function public.handle_new_hub_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.hub_users (id, email, display_name, zoho_user_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'provider_id'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_hub_user();
```

> **Note:** `security definer` + `set search_path = public` is required for triggers on `auth.users` to write to `public.hub_users` safely. This is the Supabase-recommended pattern.

### Step 2 — Callback route: `src/app/api/auth/callback/route.ts`

```ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/hub";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/signin?error=oauth_failed`);
}
```

### Step 3 — Sign-in page update

Add to `src/app/(auth)/signin/page.tsx`:

1. **New state:** none needed — the Zoho button is a simple redirect
2. **New handler** (inside a callback — no top-level `window` access per CLAUDE.md):
   ```ts
   function handleZohoSignIn() {
     const redirectTo = `${window.location.origin}/api/auth/callback`;
     const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
     // Provider identifier in Supabase is "custom:zoho" — confirmed via dashboard
     window.location.href = `${supabaseUrl}/auth/v1/authorize?provider=custom%3Azoho&redirect_to=${encodeURIComponent(redirectTo)}`;
   }
   ```
3. **UI placement:** Above the `<form>`, add:
   - "Sign in with Zoho" button (full-width, outline variant)
   - Divider row: `<div>── or ──</div>` between the button and the form
   - The existing form is unchanged

4. **Optional: show error** — read `?error=oauth_failed` from `useSearchParams()` and display in the error state

### Step 4 — `env.example` update

Add a clarifying comment to the existing `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` block:

```
# These same credentials are also entered in Supabase Dashboard (Auth → Providers → Custom → zoho)
# to enable "Sign in with Zoho". The Supabase callback URI is:
#   https://[project-ref].supabase.co/auth/v1/callback
```

---

## Notes for Implementation Agent

- **Model rationale (sonnet):** New auth system touching DB (trigger on auth.users), security-sensitive OAuth flow, and cross-cutting changes (DB + API route + UI). Zoho custom provider flow has non-obvious edge cases.
- `window.location.origin` must only be used inside callbacks/event handlers — never at render time (CLAUDE.md SSR crash rule). The `handleZohoSignIn` pattern satisfies this.
- `NEXT_PUBLIC_SUPABASE_URL` is available client-side (it's a `NEXT_PUBLIC_` var) — safe to interpolate in the redirect URL.
- The trigger uses `on conflict (id) do nothing` to be safe if the trigger fires twice (e.g., re-invitation). Email/password signups also fire this trigger, which correctly creates a `hub_users` row for those accounts too.
- `zoho_user_id` stores the Zoho `ZUID` from `raw_user_meta_data->>'provider_id'`; may be null for email/password users (that's expected and fine).
- Role assignment is manual via Supabase Dashboard (Table Editor → hub_users → edit role). A future sprint can add an in-Hub admin page.
- The sign-in page should handle the `?error=oauth_failed` query param and display a user-facing error message ("Zoho sign-in failed, please try again").
- **Do not** add `"use server"` to `src/app/api/auth/callback/route.ts` — it's an API route handler, not a Server Action.
- Supabase's `exchangeCodeForSession` writes the session cookies through the `createClient()` cookie adapter — no additional cookie handling needed.

---

## Acceptance Criteria

- [ ] "Sign in with Zoho" button visible on `/signin`
- [ ] Clicking it redirects to Zoho login (after manual Supabase config is done)
- [ ] After Zoho login, user lands on `/hub` with a valid session
- [ ] `hub_users` row is created automatically on first login (visible in Supabase Table Editor)
- [ ] Email/password login still works unchanged
- [ ] TypeScript check passes: `npx tsc --noEmit`
