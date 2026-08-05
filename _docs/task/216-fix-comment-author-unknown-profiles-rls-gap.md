# 216: Fix Task Comments Showing "Unknown" Author — Profiles RLS Gap

**Created:** 2026-08-05
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

On the task detail page's Comments tab, a comment authored by another staff member (e.g. a PM commenting, viewed by a developer) renders the author as "Unknown" instead of their real name. Comments authored by the viewer themself render correctly.

Root cause: `GET /api/v2/tasks/[taskId]/comments` (`src/app/api/v2/tasks/[taskId]/comments/route.ts`) resolves `author_name` with a second query — `supabase.from("profiles").select("id, full_name").in("id", authorIds)` — using the session-bound `createClient()`. The `profiles_read_own` RLS policy (migration `048_super_admin_rls.sql`) only allows a caller to `SELECT` their **own** `profiles` row (or all rows if `admin`/`super_admin`):

```sql
create policy "profiles_read_own"
  on profiles for select to authenticated
  using (auth.uid() = id or get_my_role() in ('admin', 'super_admin'));
```

So when a `developer`-role user loads the comments list, the batched profile lookup silently returns zero rows for any `author_id` that isn't their own — not an error, just an empty result. `resolveAuthorName()` then falls through to `row.author_name || row.author_email`, both of which are `null` for Hub-native comments (they're only populated for legacy Zoho-imported rows per migration 035), landing on the final `"Unknown"` fallback.

This is the exact same bug class already diagnosed and fixed twice before in this codebase — `_docs/task/203-pm-access-member-names-readonly-indicators.md` (Portfolio Tracker collaborator/owner avatars) and `_docs/task/210-fix-unnamed-avatars-assignee-uuid-tooltip-parity.md` (Projects listing + Project detail assignee names). Both used the same fix: swap the specific read-only profile-name lookup from the session client to `adminClient`, narrowly scoped to that one query, with an inline comment documenting the RLS gap. This task reuses that exact, established pattern rather than reopening the RLS policy question.

## Requirements

- [ ] Comments authored by any staff member display their real `full_name`, regardless of who is viewing the task.
- [ ] The "Unknown" fallback still applies only to its genuine cases: legacy Zoho-imported comments with no Hub account and no `author_name`/`author_email` populated.

## Out of Scope / Must-Not-Change

- No changes to `profiles_read_own` RLS policy or any other RLS policy/migration — narrowest possible `adminClient` substitution, matching the task 203/210 precedent, not a blanket RLS loosening.
- Do not touch the POST handler's own-profile lookup (`comments/route.ts:105`, `.eq("id", user.id)`) — that query targets the caller's own row, which `profiles_read_own` already permits; it is not part of this bug.
- `src/app/api/v2/tasks/[taskId]/time-logs/route.ts` has the identical `resolveOwnerName()` pattern (its own comment even says it mirrors `resolveAuthorName()`) and is very likely affected by the same RLS gap for time-log entries logged by other users. Not in scope here — the user only reported the comments tab. Worth a follow-up task if confirmed.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/v2/tasks/[taskId]/comments/route.ts` | Modify | Import `adminClient`; swap the batched `profiles` lookup in `GET` (line 45) from `supabase` to `adminClient` |

## Code Context

### File: `src/app/api/v2/tasks/[taskId]/comments/route.ts`

Current (line 1-2, 44-49):

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
...
  const authorIds = [...new Set((comments ?? []).map((c) => c.author_id).filter((id): id is string => !!id))];
  const profileNames = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", authorIds);
    for (const p of profiles ?? []) {
      if (p.full_name) profileNames.set(p.id, p.full_name);
    }
  }
```

Reference implementation for the exact comment phrasing convention (task 210):

```ts
// profiles' own RLS (profiles_read_own) only lets a caller read their own row —
// adminClient bypasses that for this read-only display lookup.
```

## Implementation Steps

1. In `src/app/api/v2/tasks/[taskId]/comments/route.ts`, add `import { adminClient } from "@/lib/supabase/admin";` alongside the existing `createClient` import.
2. Change line 45's `supabase.from("profiles")` to `adminClient.from("profiles")`. Leave everything else in the `GET` handler (the `task_comments` query, attachments query, `resolveAuthorName()`) untouched — they already work correctly under RLS.
3. Add a one-line inline comment above the changed query, matching the task 210 phrasing convention, explaining the RLS gap this bypasses.
4. Leave the `POST` handler (line 105, own-profile lookup) unchanged.

## Acceptance Criteria

- [ ] Logged in as a `developer`-role user on a task where a `pm`-role user has posted a comment, the comment shows the PM's real name, not "Unknown".
- [ ] Logged in as a `pm`-role user, comments posted by a `developer` show the developer's real name.
- [ ] The developer's own comments still show their own name (unaffected, regression check).
- [ ] `npx tsc --noEmit` passes.
- [ ] No RLS policy files under `supabase/migrations/` are modified.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser: as a non-admin developer, open a task that has a comment from a PM (or vice versa) and confirm the real name renders instead of "Unknown".

## Compatibility Touchpoints

None — isolated API route change, no schema/migration, no packaging/docs impact.

## Implementation Notes

### What Changed
- Swapped the `GET` handler's batched `profiles` lookup (resolving comment author `full_name`) from the session-bound `createClient()` to `adminClient`, bypassing the `profiles_read_own` RLS restriction for this read-only display query. Added an inline comment documenting the RLS gap, matching the task 210 phrasing convention.

### Files Changed
- `src/app/api/v2/tasks/[taskId]/comments/route.ts` - added `adminClient` import; changed line resolving author names' `profiles` query from `supabase` to `adminClient`.

### Deviations From Plan
- None. Implementation matches the task document exactly.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual/browser check - SKIPPED (no live Supabase session/browser available in this environment to log in as a non-admin developer user; the change is a mechanical, precedent-matched substitution already proven correct by tasks 203/210's identical fix for the same RLS gap on the same table)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Change is a 3-line net diff (import, inline comment, client swap) isolated to the exact query identified in the task doc. Typed correctly (`adminClient` has the same typed Supabase client interface as `createClient()`'s return, no `any` introduced). No dead code, no unused imports, no debug logging.
- Inline comment matches the established task-210 phrasing convention for documenting this RLS-gap/`adminClient` pattern, aiding future readers who hit the same bug class elsewhere.
- `POST` handler's own-profile lookup left untouched, as required — it targets `auth.uid() = id`, which `profiles_read_own` already permits.

### Deviations
- None. Implementation matches the task document's Proposed File Changes, Implementation Steps, and Out-of-Scope boundaries exactly — single file touched, no RLS/migration files modified, `time-logs/route.ts` left untouched per the documented follow-up note.

### Required Fixes
- None.
