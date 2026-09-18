# 378: Deactivate User — Block Login, Remove Project/Phase Memberships, Preserve Attribution

**Created:** 2026-09-18
**Priority:** HIGH
**Type:** feature
**Version Impact:** minor (new migration required)
**Platform:** Web
**Automation:** manual
**Status:** TESTING
**Implemented:** 2026-09-18

---

## Overview

`/dashboard/users` already has an Active/Inactive **status toggle** on every row (`_user-row.tsx:154-171` → `handleStatusToggle` → `PATCH /api/v2/users/[userId]` with `{ status }`). Today that toggle is **cosmetic**: it writes `hub_users.status` and nothing else. Nothing in the codebase ever reads that column.

This task turns it into a real deactivation:

1. **The user can no longer log in** — via any path (email/password, Zoho OAuth, password reset, an invite link).
2. **Their live sessions are terminated immediately**, not at the next token expiry.
3. **They are removed from every `project_members` and `phase_members` row.**
4. **Every attribution row is untouched** — `tasks.assignee_id`/`assignees`, `task_comments.author_id`, `issue_comments.author_id`, `time_logs.employee_id`, `notes.created_by`, `projects.created_by`, etc. all keep pointing at the same `profiles` row, so their name still renders everywhere it renders today.
5. **Clicking "Deactivate" opens a confirmation dialog** stating exactly what will happen, including how many memberships (and ownerships) will be dropped.

Reactivation restores login. It does **not** restore memberships — those rows are gone and there is nothing to restore them from. The dialog says so.

### Key research findings

**a) `hub_users.status` is write-only today.** A repo-wide grep for `"inactive"` (`src/**/*.ts{,x}`) returns only customer-status and customer-product-status call sites — plus `page.tsx:207`, the toggle that writes it. `postLoginGate()` (`(auth)/actions.ts:43`), the `(hub)/layout.tsx` guard, `proxy.ts`, and `require-role.ts` all ignore it. So a user marked "Inactive" today logs in normally. Blocking login is genuinely new behavior, not a bug fix to an existing check.

**b) A DB-column check alone cannot block every login path.** There are at least three entry points: `signInWithPassword` on `(auth)/auth/login/page.tsx:35` (followed by `postLoginGate`), the Zoho OAuth PKCE exchange at `/api/auth/callback` (which does **not** call `postLoginGate` — task 376 explicitly left it untouched), and `registerFromInvite()` (`actions.ts:309`). Gating each one separately is three places to get wrong. **`auth.admin.updateUserById(id, { ban_duration })` blocks all of them at the GoTrue layer**, before any app code runs — verified present in the installed `@supabase/auth-js@2.108.2` types (`AdminUserAttributes.ban_duration?: string | 'none'` at `lib/types.d.ts:455`; `User.banned_until?: string` at :375). That is the primary mechanism; the `hub_users.status` write stays as the Hub-side source of truth the UI reads.

**c) A ban does not kill an open session.** GoTrue checks `banned_until` on sign-in and on refresh, so an already-issued access token stays valid until it expires (default 1h). Precedent for fixing this exists: migration `009_force_logout_function.sql` defines `public.force_logout_all_except(exclude_user_id uuid)`, a `security definer` function that deletes from `auth.refresh_tokens` then `auth.sessions`. This task adds the single-user mirror of it (`force_logout_user`). `auth.admin.signOut(jwt)` is not usable here — it needs the target's JWT, which an admin never has.

**d) Removing memberships can silently un-restrict a project or phase.** Migration `073_project_phase_membership.sql`'s header states the app-layer invariant: *"a project or phase with ZERO membership rows is treated as unrestricted."* It also creates two partial unique indexes — `idx_phase_members_one_owner` (one `is_owner` row per project+phase) and `074`'s `project_members` equivalent. Deleting a deactivated user's rows can therefore (i) leave a phase/project with **no owner**, and (ii) if they were the last member, flip a restricted project to unrestricted. Neither is a reason not to remove them — it is a reason the confirmation dialog must **show the counts** so the admin knows to reassign afterwards.

**e) Attribution is preserved for free.** Nothing about this task deletes the `auth.users` row or the `profiles` row. Every display-name lookup in the codebase resolves through `profiles` (e.g. `api/v2/tasks/[taskId]/comments/route.ts:48`, `api/v2/time-logs/route.ts:111`, `phase-membership` route embeds). A ban sets a timestamp column on `auth.users`; it does not touch `profiles`. So requirement 5 needs **zero code** — it needs a test that proves it, and a "must not change" guardrail so the implementer does not "tidy up" by deleting rows.

### Design decisions made during planning (flagged for review)

- **Ban, not delete.** `auth.admin.deleteUser()` is never called. `hub_users.id` and `profiles.id` both FK to `auth.users(id)` `on delete cascade` (migration 007), and `project_members`/`phase_members`/every attribution FK cascade off `profiles` — deleting the auth user would wipe exactly the data requirement 5 says to keep. Deactivation is strictly soft.
- **Ban duration is `876000h` (~100 years), and reactivation passes `"none"`.** GoTrue has no "ban forever" sentinel; a large finite duration is the documented idiom. Reactivation must pass `ban_duration: "none"` explicitly — omitting the field leaves the ban in place, which would make reactivated users mysteriously unable to log in.
- **The confirmation dialog does an impact pre-flight.** On open it fetches `GET /api/v2/users/[userId]/deactivate` and rewrites its own `body` from "Checking impact…" to the real counts, with the Confirm button `confirmDisabled` until it resolves. This needs **no change to `ConfirmDialog`** — `body` and `confirmDisabled` are already props (`src/components/ui/confirm-dialog.tsx:9-19`). A dialog that just says "Are you sure?" would hide the owner-orphaning risk from finding (d), which is the one consequence of this action an admin cannot see or undo.
- **Only Deactivate is confirmed; Activate stays a one-click toggle.** That is the literal ask ("confirmation dialog is present when clicking deactivate"), and reactivation is non-destructive.
- **Deactivated users disappear from assignee pickers** — `getAssignableMembers()` (`src/lib/members/assignable.ts:67`, the task-351 single source of truth behind New Task, the listing pickers, and `/api/staff/members`) gains a `hub_users.status` filter. **Flag this one if it should go differently.** Rationale: the pool is defined as "who can be assigned *now*"; leaving a banned user in it means new work can be assigned to someone who cannot log in to do it. This is strictly about *future* assignment — existing `tasks.assignee_id`/`assignees` values are never rewritten, so their name keeps rendering on everything already assigned to them, exactly as requirement 5 demands. `list_assignable_users` (MCP, `src/lib/mcp/tools/list-assignable-users.ts`) queries `profiles` directly rather than going through that helper and is **out of scope** — a separate pre-existing divergence, not this task's to reconcile.
- **Self-deactivation is blocked** (403), and **only a super_admin may deactivate a super_admin** — mirroring the existing role-assignment gate at `api/v2/users/[userId]/route.ts:33-35` and the unlock gate at :99-101. Without the self-guard an admin can lock themselves out of the only page that could undo it.
- **The generic GoTrue "User is banned" error is mapped to a friendly message on the login form.** Not doing so means a deactivated employee sees a raw auth-library string.

If any of these should go differently, flag it now — they shape the API contract and the migration below.

## Requirements

### Must Have
- [ ] The Status cell's **Deactivate** click opens a confirmation dialog before anything is written. Cancel performs no writes.
- [ ] The dialog states: login will be blocked, active sessions ended, and the user removed from N project memberships and M phase memberships (with an explicit callout when any of those are `is_owner` rows). It also states that reactivating restores login but **not** memberships.
- [ ] Confirming: bans the auth user, force-logs-out their sessions, deletes all their `project_members` + `phase_members` rows, and sets `hub_users.status = 'inactive'`.
- [ ] A deactivated user cannot sign in via email/password, Zoho OAuth, an invite link, or a password-reset link.
- [ ] A deactivated user with a browser tab already open loses access on their next request (sessions and refresh tokens deleted), not at the next natural token expiry.
- [ ] The login form shows "This account has been deactivated. Please contact your administrator." instead of the raw GoTrue ban error.
- [ ] Their name still renders on: tasks assigned to them, task/ticket comments they authored, time logs, notes, and any `created_by` attribution — verified after deactivation, not assumed.
- [ ] Reactivating (Activate click, no dialog) lifts the ban and sets `status = 'active'`; that user can log in again immediately.
- [ ] Guards: 401 unauthenticated; 403 for non-admin/super_admin; 403 on self-deactivation; 403 when a non-super_admin targets a super_admin.
- [ ] Deactivated users no longer appear in assignee pickers (see flagged decision above).
- [ ] Every new/modified file respects `nextjs-file-length-best-practices.md` — see "File-length plan" below.

### Nice to Have
- [ ] The post-action toast reports what was removed ("Deactivated — removed from 3 projects, 2 phases").
- [ ] Deactivated rows are visually de-emphasised in the table (muted name/email), so the Inactive pill is not the only signal.

## Out of Scope / Must-Not-Change

- **Never call `adminClient.auth.admin.deleteUser()`, and never delete the `profiles` or `hub_users` row.** This is the guardrail for requirement 5 — every attribution FK cascades off `profiles`.
- **Never rewrite an attribution column.** No `update` touching `tasks.assignee_id`, `tasks.assignees`, `task_comments.author_id`, `issue_comments.author_id`, `time_logs.employee_id`, `notes.created_by`, `projects.created_by`, or `issues.assignee_id`/`assignees`.
- Do not reassign, transfer, or auto-repair a phase/project left ownerless by the membership deletion. Report the counts; leave the repair to the admin. (`transferPhaseOwnership`/`transferProjectOwnership` already exist for that, driven by their own UI.)
- Do not change `ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`) — its existing `body` / `confirmDisabled` / `confirmLabel` props cover this use.
- Do not change the role `<select>`, department `<select>`, Send Invite/Resend, or Unlock row actions.
- Do not touch `src/app/_auth_(OLD)/**` or `src/app/_hub_(OLD)/**`.
- Do not change `force_logout_all_except` (migration 009) or `/api/auth/force-logout` — add a sibling, don't repurpose.
- Do not add a `status`/`is_active` column to `profiles`. `hub_users.status` already exists (migration 043, `text not null default 'active'`, no check constraint, indexed by `hub_users_status_idx`) and is what the Users page already reads and writes.
- Do not change `src/lib/mcp/tools/list-assignable-users.ts` (see flagged decision).
- No new npm/pnpm dependency.

## Current State

| File | Current behavior |
|------|------------------|
| `src/app/(hub)/dashboard/users/_user-row.tsx:154-171` | Status pill is a `<button>` calling `onStatusToggle(user.id, user.status)` immediately — no confirmation. |
| `src/app/(hub)/dashboard/users/page.tsx:206-229` | `handleStatusToggle` flips `active`↔`inactive` via `PATCH /api/v2/users/[userId]`, updates local state, toasts. 436 lines total. |
| `src/app/api/v2/users/[userId]/route.ts:90-96` | `if (body.status !== undefined)` → a bare `hub_users.update({ status })`. No validation of the value, no side effects. |
| `src/app/(auth)/actions.ts:43-118` | `postLoginGate` checks OTP lockout → forced password change → device trust. No account-status check. |
| `src/app/(auth)/auth/login/page.tsx:35-41` | Surfaces `authError.message` verbatim. |
| `src/lib/members/assignable.ts:67-104` | `getAssignableMembers()` = all `profiles` in `ASSIGNABLE_ROLES` minus `ASSIGNEE_EXCLUDE`. No status awareness. |
| `src/lib/programme/phase-membership.ts` | `removeProjectMember` / `removePhaseMember` exist but are per-project/per-phase; there is no "remove this user everywhere" helper. |
| `supabase/migrations/009_force_logout_function.sql` | `force_logout_all_except(uuid)` — all-except, no single-user equivalent. |

## Proposed Solution

### Architecture

One new endpoint owns the whole transaction, because the four writes (ban → force-logout → delete memberships → set status) must be ordered and reported together, and none of them belongs in the existing generic `PATCH`:

```
POST /api/v2/users/[userId]/deactivate   → perform (returns removal counts)
GET  /api/v2/users/[userId]/deactivate   → impact preview (counts only, no writes)
POST /api/v2/users/[userId]/reactivate   → lift ban + status = 'active'
```

Business logic lives in `src/lib/users/deactivate.ts` so each route handler stays a thin auth-guard + call + response (the 50–150 line band from the best-practices doc). The UI's async flow lives in a `_use-deactivate-user.ts` hook so `page.tsx` gains state wiring, not logic.

**Order of operations matters.** Ban first: if the later steps fail, the user is already locked out (fail-closed). Force-logout second. Membership deletion third. `hub_users.status` last, so the row only reads "Inactive" once everything above it actually succeeded — a partial failure leaves the row "Active" and the admin retries, rather than showing a deactivation that didn't fully happen.

Reactivation is the mirror minus memberships: unban, then `status = 'active'`.

### File-length plan (per `nextjs-file-length-best-practices.md`)

| File | Budget | Why it earns its own file |
|------|--------|---------------------------|
| `src/lib/users/deactivate.ts` | ~120 | One concern: the deactivate/reactivate transaction + impact query. Utility band 50–150. |
| `.../deactivate/route.ts` | ~70 | GET + POST handlers, auth guards only. Route band 50–150. |
| `.../reactivate/route.ts` | ~45 | POST handler only. |
| `_deactivate-dialog.tsx` | ~60 | Wraps `ConfirmDialog` with the preview-driven body text. Component band 100–250. |
| `_use-deactivate-user.ts` | ~80 | One hook, one flow (open → preview → confirm → apply). Hook band 30–100. |
| `page.tsx` | 436 → ~455 | Already past the 250–300 soft warning. The three files above exist specifically so this grows by ~20 lines of wiring, not ~120 of logic. A broader decomposition of this page is a separate concern and is **not** in scope. |

### File Changes

| Action | File | Description |
|--------|------|-------------|
| CREATE | `supabase/migrations/144_force_logout_user.sql` | `public.force_logout_user(target_user_id uuid)` — single-user mirror of migration 009. |
| CREATE | `src/lib/users/deactivate.ts` | `getDeactivationImpact()`, `deactivateUser()`, `reactivateUser()`. |
| CREATE | `src/app/api/v2/users/[userId]/deactivate/route.ts` | `GET` (preview) + `POST` (perform). |
| CREATE | `src/app/api/v2/users/[userId]/reactivate/route.ts` | `POST`. |
| CREATE | `src/app/(hub)/dashboard/users/_deactivate-dialog.tsx` | Preview-aware wrapper over `ConfirmDialog`. |
| CREATE | `src/app/(hub)/dashboard/users/_use-deactivate-user.ts` | Client hook driving the open→preview→confirm→apply flow. |
| MODIFY | `src/app/(hub)/dashboard/users/page.tsx` | Replace `handleStatusToggle`'s deactivate branch with the hook; render the dialog. Activate branch keeps calling the hook's `reactivate`. |
| MODIFY | `src/app/(hub)/dashboard/users/_user-row.tsx` | No behavior change to the button itself — it still calls `onStatusToggle`; the page now routes `active → dialog`. Optional: muted styling for inactive rows (Nice to Have). |
| MODIFY | `src/app/api/v2/users/[userId]/route.ts` | Reject `body.status` when it is not `"active"`/`"inactive"`, and 409 with a pointer to the new endpoints so the generic PATCH can never half-deactivate someone. |
| MODIFY | `src/app/(auth)/actions.ts` | `postLoginGate`: after the OTP-lockout check, look up `hub_users.status`; if `inactive`, `supabase.auth.signOut()` and return a deactivated-account error. Defense in depth behind the ban. |
| MODIFY | `src/app/(auth)/auth/login/page.tsx` | Map the GoTrue ban error to the friendly message. |
| MODIFY | `src/lib/members/assignable.ts` | Filter out members whose `hub_users.status` is not `'active'`. |

## Code Context

### `src/components/ui/confirm-dialog.tsx` — reused as-is

```tsx
export function ConfirmDialog({
  open, title, body, confirmLabel = "Delete", confirmDisabled = false, onConfirm, onCancel,
}: { open: boolean; title: string; body: string; confirmLabel?: string;
     confirmDisabled?: boolean; onConfirm: () => void; onCancel: () => void; })
```

`body` is a plain `string`, so the preview flow just swaps the string it is handed. `confirmDisabled` covers the loading state. No edit needed.

### `supabase/migrations/009_force_logout_function.sql` — the shape to mirror

```sql
create or replace function public.force_logout_all_except(exclude_user_id uuid)
returns table(action text, count bigint)
language plpgsql security definer set search_path = 'auth', 'public'
as $$ ... delete from auth.refresh_tokens where user_id != exclude_user_id::text ...
       delete from auth.sessions where user_id != exclude_user_id ... $$;
```

Two details to carry over verbatim: refresh tokens are deleted **before** sessions (sessions reference them), and `auth.refresh_tokens.user_id` is `varchar`, so the uuid needs `::text`.

### New migration `144_force_logout_user.sql`

```sql
-- Migration 144: force_logout_user (task 378)
-- Single-user mirror of force_logout_all_except (migration 009). Deletes the target's
-- sessions and refresh tokens so a just-banned user loses access on their next request
-- instead of at natural access-token expiry (GoTrue only rechecks banned_until on
-- sign-in/refresh). Service-role only — called exclusively from the deactivate route.

create or replace function public.force_logout_user(target_user_id uuid)
returns table(action text, count bigint)
language plpgsql
security definer
set search_path = 'auth', 'public'
as $$
declare
  session_count bigint;
  refresh_count bigint;
begin
  with deleted as (
    delete from auth.refresh_tokens where user_id = target_user_id::text returning 1
  ) select count(*) into refresh_count from deleted;

  with deleted as (
    delete from auth.sessions where user_id = target_user_id returning 1
  ) select count(*) into session_count from deleted;

  return query
    select 'sessions_deleted'::text, session_count
    union all
    select 'refresh_tokens_deleted'::text, refresh_count;
end;
$$;

revoke all on function public.force_logout_user(uuid) from public, anon, authenticated;
```

> **Migration policy:** write the file; **do not apply it**. Per the precedent in tasks 127/130/263/377, the agent does not run `supabase db push` — the user applies it. `adminClient.rpc("force_logout_user", …)` will error until then, so `deactivateUser()` must treat an RPC failure as non-fatal (log + include in the response) rather than aborting after the ban has already landed. Note `force_logout_user` will not exist in `src/types/database.ts`'s generated `Functions` map until types are regenerated — cast the `rpc` call the way `(auth)/actions.ts:14` already handles untyped tables, with the same explanatory comment.

### `src/lib/users/deactivate.ts` — sketch

```ts
import { adminClient } from "@/lib/supabase/admin";

// ~100 years. GoTrue has no "forever" sentinel; reactivation must pass "none" explicitly.
const BAN_FOREVER = "876000h";

export interface DeactivationImpact {
  projectMemberships: number;
  phaseMemberships: number;
  ownedProjects: number;   // is_owner rows — these leave the project ownerless
  ownedPhases: number;
}

export async function getDeactivationImpact(userId: string): Promise<DeactivationImpact> { /* 4 head:true counts */ }

export async function deactivateUser(userId: string): Promise<
  { ok: true; impact: DeactivationImpact; sessionsCleared: boolean } | { ok: false; error: string }
> {
  // 1. Ban FIRST — fail-closed if a later step errors.
  const { error: banErr } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: BAN_FOREVER });
  if (banErr) return { ok: false, error: banErr.message };

  // 2. Terminate live sessions. Non-fatal: migration 144 may not be applied yet.
  //    The ban still blocks the next refresh; only the current access token's
  //    remaining TTL is at risk, and step 1 has already landed.
  let sessionsCleared = true;
  const { error: rpcErr } = await adminClient.rpc("force_logout_user", { target_user_id: userId });
  if (rpcErr) { console.error("[deactivateUser] force_logout_user failed:", rpcErr.message); sessionsCleared = false; }

  // 3. Snapshot impact, then drop memberships. Never touches attribution columns.
  const impact = await getDeactivationImpact(userId);
  await adminClient.from("phase_members").delete().eq("user_id", userId);
  await adminClient.from("project_members").delete().eq("user_id", userId);

  // 4. Hub-side status LAST, so the row reads "Inactive" only once the rest succeeded.
  const { error: statusErr } = await adminClient.from("hub_users").update({ status: "inactive" }).eq("id", userId);
  if (statusErr) return { ok: false, error: statusErr.message };

  return { ok: true, impact, sessionsCleared };
}

export async function reactivateUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  // "none" is required — omitting ban_duration leaves the ban in place.
  const { error } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: "none" });
  if (error) return { ok: false, error: error.message };
  const { error: statusErr } = await adminClient.from("hub_users").update({ status: "active" }).eq("id", userId);
  return statusErr ? { ok: false, error: statusErr.message } : { ok: true };
}
```

### Auth guard to copy verbatim (`api/v2/users/[userId]/route.ts:13-25`)

```ts
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const { data: callerProfile } = await adminClient.from("profiles").select("role").eq("id", user.id).single();
const callerRole = callerProfile?.role;
if (callerRole !== "admin" && callerRole !== "super_admin") {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

Plus the two task-specific guards:

```ts
if (userId === user.id) {
  return NextResponse.json({ error: "You can't deactivate your own account." }, { status: 403 });
}
const { data: target } = await adminClient.from("profiles").select("role").eq("id", userId).maybeSingle();
if (target?.role === "super_admin" && callerRole !== "super_admin") {
  return NextResponse.json({ error: "Only a Super Admin can deactivate a Super Admin." }, { status: 403 });
}
```

### `postLoginGate` insertion point (`(auth)/actions.ts:52-56`)

```ts
  // Account-level OTP lockout blocks login entirely, before any other gate — ...
  const { locked, lockedUntil } = await checkOtpLockout(user.id);
  if (locked) { return { redirect: "/auth/verify", locked: true, lockedUntil: lockedUntil! }; }

  // ↓ NEW (task 378) — Gate 0.5: deactivated account.
  // The GoTrue ban is the real enforcement (it blocks Zoho OAuth and invite links too,
  // neither of which reaches this function). This is defense in depth for the window
  // between hub_users.status flipping and the ban landing, and it produces a readable
  // message instead of a bare redirect.
  const { data: hubRow } = await adminClient
    .from("hub_users").select("status").eq("id", user.id).maybeSingle();
  if (hubRow?.status === "inactive") {
    await supabase.auth.signOut();
    return { redirect: "/auth/login", error: "This account has been deactivated. Please contact your administrator." };
  }
```

`postLoginGate` already returns `{ redirect, error }` and `login/page.tsx:47-51` already renders `gateError` into the existing `AuthErrorBanner` — no new plumbing.

### Login-page ban-error mapping (`(auth)/auth/login/page.tsx:37-41`)

```ts
if (authError) {
  // GoTrue returns code "user_banned" / message "User is banned" for a deactivated account.
  const banned = authError.code === "user_banned" || /banned/i.test(authError.message);
  setError(banned
    ? "This account has been deactivated. Please contact your administrator."
    : authError.message);
  setLoading(false);
  return;
}
```

### `getAssignableMembers()` filter (`src/lib/members/assignable.ts:67-104`)

After the existing `profiles` query and before `filterExcludedMembers(...)`, intersect with active hub users:

```ts
// Task 378 — a deactivated user can't log in, so they must not be offered for NEW
// assignment. This never rewrites an existing tasks.assignee_id/assignees value, so
// their name keeps rendering on work already assigned to them.
const { data: statusRows } = await adminClient
  .from("hub_users").select("id").eq("status", "active").in("id", rows.map((r) => r.id));
const activeIds = new Set((statusRows ?? []).map((r) => r.id));
const activeRows = rows.filter((r) => activeIds.has(r.id));
```

> `rows` is bounded by `ASSIGNABLE_ROLES` staff profiles (tens, not thousands), so the `.in()` is safe as-is — the `.range()` pagination rule in `CLAUDE.md` targets bulk lookup-map queries, not this. If the staff list ever approaches 1000, revisit.
> Fail-open note: if the `hub_users` query errors, keep `rows` unfiltered rather than returning an empty picker — a degraded picker that shows one extra person beats a picker that shows nobody.

### Dialog copy

```
Title:  Deactivate {name}?

Body:   They'll be signed out immediately and won't be able to log in again.
        Removing them from 3 projects and 2 phases — 1 of those is an ownership,
        so that phase will be left without an owner.
        Their name stays on all tasks, comments, time logs and activity.
        Reactivating later restores login, but not their memberships.

Confirm label: "Deactivate"
```

Build the counts sentence from the preview response; omit the ownership clause when `ownedProjects + ownedPhases === 0`; while the preview is in flight show `body = "Checking what this will affect…"` with `confirmDisabled`.

## Implementation Steps

### Step 1 — Migration
Create `supabase/migrations/144_force_logout_user.sql` exactly as in Code Context. **Write only; do not apply.** Note it in the handoff as needing `supabase db push` by the user.

### Step 2 — `src/lib/users/deactivate.ts`
Implement `getDeactivationImpact`, `deactivateUser`, `reactivateUser` per the sketch. The four impact counts are `select("id", { count: "exact", head: true })` queries (same shape as `phaseHasMembers` in `phase-membership.ts:43-50`) against `project_members` / `phase_members`, each also filtered `.eq("is_owner", true)` for the owned variants. The `force_logout_user` RPC is untyped until types are regenerated — cast it and comment why, mirroring `(auth)/actions.ts:12-14`.

### Step 3 — Routes
`deactivate/route.ts`: shared guard helper (401 / 403 role / 403 self / 403 super_admin target) used by both `GET` and `POST`; `GET` returns `getDeactivationImpact()`, `POST` returns `deactivateUser()`'s result. `reactivate/route.ts`: same guard minus the self-check (reactivating yourself is impossible — you can't be signed in — but harmless), then `reactivateUser()`.

### Step 4 — Harden the generic PATCH
In `api/v2/users/[userId]/route.ts`, replace the bare status branch:

```ts
if (body.status !== undefined) {
  return NextResponse.json(
    { error: "Use POST /api/v2/users/[userId]/deactivate or /reactivate to change account status." },
    { status: 409 }
  );
}
```

Then confirm nothing else in the repo sends `{ status }` to this route — `grep -rn 'v2/users/' src/` should show only `dashboard/users/page.tsx`, whose status path Step 6 moves off it.

### Step 5 — Client hook + dialog
`_use-deactivate-user.ts` exposes `{ pending, impact, loadingImpact, request(user), cancel(), confirm(), reactivate(userId) }`. `request()` stores the target and fires the preview `GET`; `confirm()` POSTs and calls back with the updated user + counts. `_deactivate-dialog.tsx` renders `<ConfirmDialog open={!!pending} title=… body={buildBody(pending, impact, loadingImpact)} confirmLabel="Deactivate" confirmDisabled={loadingImpact || submitting} … />`.

### Step 6 — Wire `page.tsx`
Rewrite `handleStatusToggle` to branch: `current === "active"` → `deact.request(user)`; otherwise → `deact.reactivate(userId)`. On a successful confirm, set that row's `status` to `"inactive"` and toast with the counts. Render `<DeactivateUserDialog … />` next to the existing `<InviteUserModal>` block. `_user-row.tsx` needs no signature change — but pass the full `user` to `onStatusToggle` if the dialog title needs the display name (a one-line prop-type widening).

### Step 7 — Login-path changes
Add Gate 0.5 to `postLoginGate` and the ban-error mapping to `login/page.tsx`, both as shown in Code Context.

### Step 8 — Assignee-picker filter
Apply the `assignable.ts` change, including the fail-open behavior.

### Step 9 — Verify
`npx tsc --noEmit`, `pnpm lint`, then the browser walkthrough below.

## Testing Checklist

- [ ] Deactivate click opens the dialog; **Cancel writes nothing** (row still Active after a page refresh).
- [ ] Dialog body shows real counts, and names the ownership consequence when the user owns a phase/project.
- [ ] Confirm → row flips to Inactive; toast reports the counts.
- [ ] `project_members` / `phase_members` contain zero rows for that `user_id` afterwards.
- [ ] Deactivated user can't sign in with email/password — friendly message, not "User is banned".
- [ ] Deactivated user can't sign in via Zoho OAuth.
- [ ] A recovery/invite link generated *before* deactivation no longer grants access.
- [ ] A session open in another browser loses access on its next navigation (requires migration 144 applied).
- [ ] **Attribution intact**: a task assigned to them still shows their name; their task comment still shows their name; their time-log entries still show their name; a note/project they created still shows them as creator.
- [ ] They no longer appear in the New Task assignee picker, the listing pickers, or `/api/staff/members`.
- [ ] Reactivate → can log in again immediately; memberships are **not** restored (expected).
- [ ] Admin cannot deactivate themselves (403, clear message).
- [ ] A plain `admin` cannot deactivate a `super_admin` (403).
- [ ] A `pm`/`developer` session hitting `POST /api/v2/users/{id}/deactivate` directly gets 403.
- [ ] `PATCH /api/v2/users/{id}` with `{ status: "inactive" }` now 409s.
- [ ] Every new file is inside its budget from the File-length plan; `page.tsx` grew by roughly the predicted amount.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.

### Edge cases
- Migration 144 not yet applied → deactivation still succeeds (ban + memberships + status), response flags `sessionsCleared: false`. Confirm the UI does not report a hard failure.
- User is the **only** member of a project → deleting their rows makes that project unrestricted again (migration 073's documented invariant). Expected; the dialog's counts are what warn the admin.
- User has no memberships at all → dialog omits the counts sentence entirely rather than saying "0 projects and 0 phases".
- Already-inactive user → `POST /deactivate` should be idempotent (re-ban, re-delete no-ops, status stays `inactive`), not error.

## Verification

```bash
npx tsc --noEmit
pnpm lint

# User applies the migration (agent does not):
npx supabase db push          # brings in 144_force_logout_user.sql

pnpm dev
# Sign in as admin/super_admin → /dashboard/users
#   1. Deactivate a test user; Cancel; confirm nothing changed.
#   2. Deactivate again; Confirm; check the toast + Inactive pill.
#   3. In Supabase: auth.users.banned_until set; zero project_members/phase_members
#      rows for that id; hub_users.status = 'inactive'.
#   4. Sign in as that user in a private window → friendly deactivated message.
#   5. Open a task they're assigned to, a comment they wrote, a time log they filed
#      → name still renders everywhere.
#   6. Open New Task → they are absent from the assignee picker.
#   7. Reactivate → they can sign in; memberships still gone.
```

No automated test runner is configured (per `CLAUDE.md`) — verification is `tsc` + lint + the walkthrough above.

## Dependencies

- **New packages:** none.
- **New env vars:** none.
- **Migration:** `144_force_logout_user.sql` — **required** for the immediate-session-termination requirement. Everything else degrades gracefully without it.
- **Blocked by:** nothing.

## Compatibility Touchpoints

- `hub_users.status` is already `text not null default 'active'` with no check constraint (migration 043) — no schema change needed for the status value itself.
- Existing users all have `status = 'active'`; nobody is retroactively banned by this change (the ban is only ever written by the new endpoint).
- The existing `/api/auth/force-logout` route and `force_logout_all_except` are untouched.
- Zoho import routes (`zoho-import/users`) write `hub_users` rows; they set `status` only on insert and won't resurrect a deactivated user's login, since the ban lives on `auth.users`, not `hub_users`. Worth a quick confirm during implementation that the users import does not blanket-`update` `status` on existing rows.
- `src/types/database.ts` will not know `force_logout_user` until `supabase gen types` is re-run — the cast + comment in Step 2 covers the gap.

## Notes for Implementation Agent

- The single biggest risk in this task is reaching for `deleteUser()`. Don't. Requirement 5 is the whole reason this is a ban and not a delete.
- Order the four writes exactly as specified. Banning last would leave a window where the user is removed from everything but can still log in.
- `ban_duration: "none"` on reactivation is easy to forget and produces a bug that looks like "reactivation silently doesn't work."
- `ConfirmDialog` is already the codebase's confirmation primitive (tasks 230/231/371) — do not hand-roll another one, and do not use `window.confirm()`.
- Styling: this page uses the slate/`brand-orange` palette; `ConfirmDialog` brings its own `#0B1533`/`#C0392B` tokens. Don't reconcile them — matching the existing dialog is the right call, as tasks 371 and 231 already established.

## Implementation Notes

### What Changed

All 9 steps implemented as planned. `hub_users.status` went from a write-only column to the Hub-side source of truth behind a real deactivation:

- **`144_force_logout_user.sql`** (written, **NOT applied**) — single-user mirror of migration 009, carrying over both non-obvious details (refresh tokens deleted before sessions; `::text` cast for the `varchar` `auth.refresh_tokens.user_id`). `execute` revoked from `public`/`anon`/`authenticated`.
- **`src/lib/users/deactivate.ts`** — `getDeactivationImpact()` (4 `head:true` counts, run via `Promise.all` per `async-parallel`), `deactivateUser()` (ban → force-logout → drop memberships → flag inactive, fail-closed in that order), `reactivateUser()`.
- **`src/lib/users/admin-guard.ts`** — extra file not in the plan (see Deviations). Shared 401/403 guard for both new routes, including the self-target and super_admin-target checks.
- **`.../deactivate/route.ts`** (GET preview + POST perform) and **`.../reactivate/route.ts`** (POST).
- **`api/v2/users/[userId]/route.ts`** — the `body.status` branch now 409s with a pointer to the new endpoints, so the generic PATCH can't half-deactivate anyone. Verified by grep that `dashboard/users/page.tsx` was its only caller, and that its status path moved off it.
- **`_use-deactivate-user.ts`** + **`_deactivate-dialog.tsx`** — the open → pre-flight → confirm → apply flow, and a thin wrapper over the unchanged `ConfirmDialog`.
- **`page.tsx`** (436 → 456) — three memoized callbacks + the hook + the dialog render. Logic lives in the two new files, as the file-length plan intended.
- **`_user-row.tsx`** (256 → 262) — `onStatusToggle` now takes the whole `HubUser` (the dialog title needs the display name) and the pill shows a spinner while a reactivation is in flight.
- **`(auth)/actions.ts`** — Gate 0.5 in `postLoginGate`; **`login/page.tsx`** — GoTrue ban-error mapping.
- **`lib/members/assignable.ts`** — deactivated users filtered out of every assignee picker.

### Deviations From Plan

- **Added `src/lib/users/admin-guard.ts` (not in the plan's file list).** The plan said "shared guard helper used by both GET and POST" *inside* `deactivate/route.ts`, but `reactivate/route.ts` needs the same guard minus the self-check. Inlining it would have duplicated ~35 lines of security-critical code across two files. Extracting it keeps both routes at 52 and 32 lines and gives the rule one home. The `blockSelf` flag is the only difference between the two call sites.
- **`_use-deactivate-user.ts` is 119 lines, over the plan's ~80 and the guide's 30–100 hook band.** It holds two flows (deactivate + reactivate). Splitting the ~20-line one-shot `reactivate` into its own hook would be splitting to hit a number, which `nextjs-file-length-best-practices.md`'s "Real Test" explicitly argues against — they're the same concern (account status) and share the `busyId`/error plumbing. Flagging it rather than silently exceeding the budget.
- **`confirm()` reads the target from a ref, not from state.** The first draft abused a `setPending` updater to read current state, which React 19 may double-invoke in StrictMode. Replaced with a `pendingRef` mirror before any verification run.
- **The assignee filter is a denylist, not an allowlist.** Caught during self-review: I first wrote `.eq("status", "active")`, which would have silently dropped every user who has a `profiles` row but no `hub_users` row from all assignee pickers — a live class of user per task 365's dead-trigger finding. Inverted to `.eq("status", "inactive")` + exclude, so only an explicit "inactive" removes anyone.

### Verification Run

- `npx tsc --noEmit` — **PASS**, 0 errors. (First run surfaced 19 errors, all in `.next/types/validator.ts` referencing `issues/` routes renamed to `tickets/` in task 364 — a stale build cache, zero in `src/`. Confirmed by deleting `.next/types` and re-running clean.)
- `pnpm lint` — **PASS**, 0 errors, same 2 pre-existing warnings in the unrelated `_checklist-tab.tsx`.
- File lengths vs. plan: `deactivate.ts` 126 (~120), `admin-guard.ts` 61, `deactivate/route.ts` 52 (~70), `reactivate/route.ts` 32 (~45), `_deactivate-dialog.tsx` 71 (~60), `_use-deactivate-user.ts` 119 (~80, see Deviations), `page.tsx` 456 (~455), `_user-row.tsx` 262.
- **Browser acceptance NOT RUN** — no dev server / authenticated admin session in this session, and the session-termination criterion additionally requires migration 144 to be applied. Every item in the Testing Checklist is outstanding for the `/test` stage.
- `pnpm build` — NOT RUN (not requested at this stage).

### Blocking Note for the Tester

**Migration 144 is written but not applied** (per this repo's standing convention). Until `npx supabase db push` runs:
- Deactivation still works — ban, membership removal and status all land.
- The `force_logout_user` RPC errors, is caught, logged, and returns `sessionsCleared: false`.
- The "already-open session loses access immediately" checklist item **cannot pass**; a banned user's existing access token survives to its natural expiry (≤1h).

## /simplify Pass (2026-09-18)

Ran the standard 4-angle review (reuse, simplification, efficiency, altitude) against the diff. Applied:

- **Consolidated three independent "is this hub user active" implementations into one** (`isHubUserActive()` / `getInactiveHubUserIds()`, added to `src/lib/users/deactivate.ts`, which already owned the concept). `postLoginGate`'s Gate 0.5 and `assignable.ts`'s picker filter both now call these instead of each re-deriving their own query + fail-open policy.
- **Parallelized `getAssignableMembers()`'s two queries** (`profiles` + the inactive-ids lookup) via `Promise.all` — real efficiency finding: this function runs on ordinary page loads (project detail, ticket pages, New Task modal), not just an admin click, so the prior sequential `await` was a repeated, avoidable round-trip. Required dropping the id-scoping on the inactive-ids query (now unscoped, matching the existing precedent of `GET /api/v2/users`'s own unscoped `hub_users` select) since scoping needed `profiles`' result first.
- **Collapsed `route.ts`'s inline 401/403 guard onto the shared `requireUserAdmin()`** instead of leaving two copies to drift. Made `blockSuperAdminTarget` an opt-in flag (default `false`) rather than baking it into the base check — the original consolidation attempt would have silently blocked a plain admin from any edit (department change, etc.) to a super_admin's row, which the pre-existing code never restricted; `route.ts` opts out and keeps its own narrower per-field rules (role-assignment gate, unlock-requires-super_admin) exactly as before.
- **Fixed an overclaiming comment on `postLoginGate`'s Gate 0.5.** The altitude review's core point held up: since `deactivateUser()` bans first and flips `status` last, the "window between status flipping and the ban landing" the original comment described cannot occur — a fresh sign-in for a deactivated account already fails at `signInWithPassword` before reaching this function. The gate isn't dead code (it still covers a session re-invoking `postLoginGate` without a fresh sign-in, e.g. a device-trust re-verification), but the comment now says so accurately instead of claiming to close a race that the code's own write-order already prevents.
- **Removed a redundant `pendingRef` mirror of `pending` state** in `_use-deactivate-user.ts` — verified `confirm`/`cancel` are only ever invoked from a fresh inline closure at the render call site, and neither `DeactivateUserDialog` nor `ConfirmDialog` is memoized, so no consumer needed the callback's referential identity to stay stable across renders.
- **Extracted `getDisplayName()`** (exported from `_user-row.tsx`) instead of the same fallback expression living in three places; as a side effect this also removed a now-provably-redundant early-return branch in `getInitials()` (verified behavior-identical for the empty-name case).
- **Exported and reused `plural()`** from `_deactivate-dialog.tsx` in `page.tsx`'s toast copy instead of a re-implemented inline ternary; flattened the dialog's nested ownership-note ternary to a plain if/else.
- **Surfaced `sessionsCleared`** (previously computed server-side, returned over the wire, and never read) as a toast caveat when `force_logout_user` failed, instead of leaving it dead on the client.
- **Dropped the unused `callerId`/`callerRole` fields** from `admin-guard.ts`'s `GuardResult` down to just `callerRole` — verified `callerId` has no read site anywhere in `src/`; `callerRole` gained a real consumer once `route.ts` was migrated onto the shared guard.

Skipped (with reasoning):
- **Wrapping the membership-delete + status-update steps in `deactivateUser()` into a single Postgres RPC** (altitude finding #4). The reasoning is sound — those three writes are all `public`-schema SQL with no service-boundary excuse, unlike the GoTrue ban call — but fixing it means a new migration + new `security definer` function, and this repo's migrations are written-not-applied by policy, so it can't be verified in this pass. Treated as a legitimate follow-up, not something to fold into a `/simplify` pass.
- **Combining `admin-guard.ts`'s two sequential `profiles` selects (caller, then target) into one `.in()` query** (efficiency finding, explicitly flagged by the same review as not worth it) — the current code short-circuits before ever querying the target on the common rejected-caller path; combining would sometimes fetch the target unnecessarily, for a saving that only matters on an infrequent, human-click-triggered path.

`npx tsc --noEmit` and `pnpm lint` re-run clean after all fixes (0 errors; same 2 pre-existing unrelated warnings). File lengths after the pass: `deactivate.ts` 174, `admin-guard.ts` 74, `_use-deactivate-user.ts` 120, `_deactivate-dialog.tsx` 72, `page.tsx` 458, `_user-row.tsx` 267, `assignable.ts` 117 — all still within the plan's bands.

## /simplify Pass, Round 2 (2026-09-18)

Ran the same 4-agent review again against the round-1-cleaned diff, explicitly asked to verify the prior fixes held up and surface anything new. Two round-1 "skips" were reversed on the strength of new evidence; several small leftovers were caught and fixed.

**Reversed from round 1:**
- **Wrote (did not apply) `supabase/migrations/145_deactivate_user_memberships.sql`** — a `security definer` function atomically deleting both membership tables and flipping `hub_users.status` in one transaction, wired into `deactivateUser()` as the first attempt with a fallback to the original sequential writes if the RPC errors (same non-fatal shape as `force_logout_user`). Round 1 skipped this specifically because "migrations are written-not-applied by policy, so it can't be verified" — round 2's altitude review pointed out this conflated "can't apply/test autonomously" (true, and true of migration 144 too) with "shouldn't write the file" (contradicted by this repo's own standing convention: migrations 127/130/133–136 are all documented as written-not-applied with graceful-degradation call sites, exactly what `deactivateUser()` already did for `force_logout_user` one step above). The reasoning didn't hold up against the codebase's own precedent, so this pass wrote it.
- **Split `admin-guard.ts`'s `requireUserAdmin(id, { blockSelf, blockSuperAdminTarget })` into three composable functions** — `requireAdmin()`, `blockSelfTarget()`, `requireNotSuperAdminTarget()`. Justified by concrete evidence, not speculation: with only 3 call sites, 3 of the 4 possible flag combinations were already in active use (`route.ts`: neither; deactivate: both; reactivate: only the second) — the combinatorial-growth signal the altitude checklist warns about, showing up immediately. All 3 call sites (`route.ts`, `deactivate/route.ts`, `reactivate/route.ts`) updated to chain the pieces they need instead of passing two anonymous booleans.

**New fixes this round:**
- **`_user-row.tsx`'s `UserRow` component still hand-rolled the display-name expression** inline (used for the avatar `alt` + name cell) even though round 1 had extracted `getDisplayName()` into the same file for `getInitials()` and `_deactivate-dialog.tsx` to share — the extraction reached across files but missed its own component 50 lines down. Fixed: `const displayName = getDisplayName(user)`. Caught independently by both the reuse and simplification agents.
- **Duplicated "membership parts" array-building** between `_deactivate-dialog.tsx`'s `buildDeactivateBody` and `page.tsx`'s `handleDeactivated` — the exact two-line `if (impact.projectMemberships > 0) parts.push(plural(...))` pattern repeated in both files in the same diff that introduced `plural()` to kill an equivalent duplication. Extracted `membershipParts(impact)` (exported from `_deactivate-dialog.tsx`), used in both places.
- **`postLoginGate`'s `checkOtpLockout()` and `isHubUserActive()` awaited sequentially** despite being independent single-row reads on unrelated tables — now run via `Promise.all`, preserving "lockout wins first" precedence by branching on both results after they resolve.
- **Split `deactivate.ts`'s `isHubUserActive()`/`getInactiveHubUserIds()` into a new `src/lib/users/status.ts`.** The altitude review's argument: `deactivate.ts` was mixing a side-effecting lifecycle orchestrator (ban/force-logout/membership-delete, consumed only by the two account-status routes) with pure read predicates now consumed by two unrelated feature areas (`postLoginGate`, the assignee picker) — exactly the read/action split this codebase already names as a convention (`src/lib/auth/role-access.ts` vs. `require-role.ts`). Not urgent at 174 lines, but the module boundary had already been crossed by two unrelated callers; moved before a third cements the wrong shape. `actions.ts` and `assignable.ts` updated to import from `./status` instead.
- **Added a signpost comment in `src/proxy.ts`** next to the `getClaims()`/`isAuthenticated` check — the altitude review traced the actual per-request hub-route gate to this file (not `(hub)/layout.tsx`, whose own `getClaims()` call is secondary) and pointed out it had zero mention of the ban/deactivation gap `postLoginGate`'s Gate 0.5 comment describes from the other side. A future "why can a deactivated user still browse the hub" investigation starts at `proxy.ts`, not `actions.ts`; comment-only, no logic change.

**Skipped again, with reasoning:**
- **Consolidating the two remaining inline admin-guard copies** in `src/app/api/admin/hub-users/invite/route.ts` and `src/app/api/v2/users/route.ts` onto the new `requireAdmin()` — real, corroborated duplication (reuse agent), but both files are untouched by task 378's diff entirely; pointing them at the shared guard is a legitimate follow-up, not a `/simplify` fix to files this task never modified.
- **Combining `getDeactivationImpact()`'s 4 `head:true` count queries into 2** (efficiency agent, flagged as low-value) — they already run in parallel via `Promise.all`, so consolidating wins no latency; it would trade zero-row-overhead count queries for row-fetch-plus-JS-aggregation queries, which isn't clearly cheaper for an infrequent admin action. Left as-is.

`npx tsc --noEmit` and `pnpm lint` re-run clean after this round too (0 errors; same 2 pre-existing unrelated warnings). File lengths: `deactivate.ts` 145, `status.ts` 51 (new), `admin-guard.ts` 77, `deactivate/route.ts` 60, `reactivate/route.ts` 34, `route.ts` 107, `_deactivate-dialog.tsx` 80, `page.tsx` 456, `_user-row.tsx` 266, `assignable.ts` 117, `actions.ts` 354, `proxy.ts` 109 — all within band.

## /simplify Pass, Round 3 (2026-09-18)

Ran the 4-agent review a third time, explicitly instructing each agent to weigh diminishing returns given two prior rounds and not manufacture findings to justify the pass. Result: the round-2 architectural calls (RPC-with-fallback shape, the `deactivate.ts`/`status.ts` split, composable admin guards as a concept) all held up under renewed scrutiny — none were re-litigated. Two small, concrete, low-risk items remained and were fixed; efficiency found nothing further.

**Fixed:**
- **`deactivate/route.ts`'s GET and POST duplicated the identical 5-line guard chain** (`requireAdmin()` → `blockSelfTarget()` → `requireNotSuperAdminTarget()`) verbatim in the same file — flagged independently by 3 of the 4 agents (simplification, reuse, altitude). This wasn't a case for re-touching `admin-guard.ts`'s public shape (`route.ts` and `reactivate/route.ts` each use a different, smaller subset of the three checks, so the granular exports still earn their keep there) — it's intra-file duplication local to one route needing the full combination twice. Fixed with a small unexported `guardDeactivateTarget(userId)` helper in that file only, composing the three checks once; GET and POST each call it in two lines instead of six.
- **`DeactivationImpact` was declared twice** — the canonical shape in `src/lib/users/deactivate.ts`, and an identical hand-copied redeclaration in `_use-deactivate-user.ts` (reuse agent). Since `import type` is erased at compile time, the client hook file now does `import type { DeactivationImpact } from "@/lib/users/deactivate"; export type { DeactivationImpact };` — zero runtime/bundling cost (no server code reaches the browser, only the type shape), and the two can no longer silently drift.

**Notable non-findings (agents explicitly confirmed correct, no action needed):**
- `deactivateUser()`'s `getDeactivationImpact()` snapshot runs before either the atomic RPC or its fallback deletes anything, on both paths — no zero-count bug, no redundant re-query (efficiency agent, traced line-by-line).
- The two RPC-with-fallback blocks in `deactivateUser()` (`force_logout_user`, `deactivate_user_memberships`) are structurally different in a load-bearing way — one degrades non-fatally with no manual replication possible, the other has a real, individually-checked fallback whose failure is fatal — so they don't clear the bar for a shared wrapper (simplification + altitude, independently).
- `admin-guard.ts`'s 3-way split is a net improvement for `route.ts` and `reactivate/route.ts`, each of which now reads its exact needed combination instead of two anonymous booleans (altitude). It also surfaced a real but explicitly-judged-marginal inconsistency — `src/app/api/stackshift-orders/_auth.ts` (pre-existing, tasks 347/366) solves the same "narrow guard vs. broader guard" problem via `instanceof`-composition instead of a discriminated union, and `admin-guard.ts` didn't follow that precedent. Altitude's own verdict: this is what produced the `deactivate/route.ts` duplication (fixed above), but changing `admin-guard.ts`'s exported shape to match `_auth.ts`'s style now would mean re-touching `route.ts` and `reactivate/route.ts` again for a stylistic convergence with no behavior change — assessed as not worth it at this point, matching the reviewing agent's own explicit recommendation not to re-split.
- `proxy.ts`'s new comment is the longest in the file but proportionate to what it documents (a genuinely non-obvious, security-relevant gap spanning 3 files), consistent with task 370's existing signpost-comment precedent in the same file (simplification).
- `getAssignableMembers()`'s `Promise.all` parallelization remains correctly implemented; nothing in later rounds re-serialized it (efficiency).

**Skipped again:** the two inline admin-guard copies in `invite/route.ts` and `v2/users/route.ts` remain out of scope (untouched by this diff, unchanged assessment from round 2).

**Overall assessment (altitude agent's explicit verdict, concurred with):** good stopping point. No material altitude problem remains; the two fixes above are the only concrete, non-speculative findings across all three rounds this pass. Further rounds on this diff would be diminishing-returns churn, not a `/simplify` this task needs from here.

`npx tsc --noEmit` and `pnpm lint` re-run clean (0 errors; same 2 pre-existing unrelated warnings). File lengths after this round: `deactivate/route.ts` 67, `_use-deactivate-user.ts` 122 — both still within band.

## /simplify Pass, Round 4 (2026-09-18)

Run again despite round 3's explicit "good stopping point, further rounds would be diminishing-returns churn" verdict. All 4 agents were instructed to hold a high bar given that prior conclusion, and none manufactured a finding to justify the pass. Result: **no code changes.**

- **Reuse:** spot-checked several diff-local constructs (`plural()`, `BAN_FOREVER`, the `requestToken` stale-response ref, the login page's GoTrue-error-code mapping, `status.ts`'s two structurally-different `hub_users` queries) against the rest of the repo — none duplicate an existing helper. "No further reuse issues found — round 3's stopping point holds."
- **Simplification:** re-verified round 3's two fixes landed correctly by reading the current files, not just trusting the description — `guardDeactivateTarget()` in `deactivate/route.ts` composes cleanly with no unused imports; the `DeactivationImpact` `import type` + `export type` pair in `_use-deactivate-user.ts` is the *required* form (not redundant) given the type's local usage in that same file, confirmed via the `export type {X} from "..."` semantics (doesn't bind `X` locally). "No further simplification issues found."
- **Efficiency:** confirmed `guardDeactivateTarget()` added zero new queries or round trips versus the pre-helper code — same three checks, same short-circuiting, just called once instead of copy-pasted. Full fresh pass over all 16 files found nothing new. "No further efficiency issues found."
- **Altitude:** confirmed `guardDeactivateTarget()` stays unexported and route-local by design, consistent with `admin-guard.ts`'s own stated philosophy (generalize only once a real 3rd consumer appears, not speculatively) — not a foreseeable near-term gap. Noted one genuinely-considered non-finding: `useDeactivateUser()` returns a fresh object each render, giving `handleStatusToggle`'s `useCallback([deact])` a new identity every render — assessed as ordinary missing memoization consistent with this codebase's other hooks, not an altitude problem, and explicitly declined to raise it as a manufactured issue. "Round 3's stopping-point verdict holds."

`npx tsc --noEmit` / `pnpm lint` not re-run this round since no files changed. Recommendation communicated to the user: this diff has now been reviewed 4 times across reuse/simplification/efficiency/altitude with a converging, corroborated result — further `/simplify` passes on it are not expected to find anything new.

## /simplify Pass, Round 5 (2026-09-18)

Run at the user's explicit request after being told round 5 would likely reproduce round 4's clean result (confirmed via `AskUserQuestion` — the user chose "run it anyway"). Confirmed the diff was byte-identical to round 4's before launching. Each agent was asked to try a genuinely different search strategy than prior rounds rather than re-tracing the same ground.

- **Reuse:** switched from intra-diff duplication (prior rounds' focus) to cross-codebase search — checked `getDeactivationImpact()`/`deactivateUser()`'s membership queries against `src/lib/programme/phase-membership.ts` (task 153's existing per-project membership helpers; confirmed a genuinely different query shape — "all of one user's projects" vs. that file's "one project's members," not a duplicate), the ban pattern against other `updateUserById` call sites (none), `getDisplayName()`'s fallback chain against ~90 other `full_name ??` sites (each has its own bespoke fallback string, expected diversity not a miss), and `useDeactivateUser` against `src/hooks/use-delete-project.ts` (structurally simpler, not what this hook was copy-pasted from). No findings.
- **Efficiency:** re-confirmed no new round trips from `guardDeactivateTarget()`, and specifically re-examined the GET-preview/POST-confirm double guard-evaluation and double `getDeactivationImpact()` computation — both correct by design (HTTP statelessness; re-snapshotting immediately before delete beats trusting a client-held number), not waste. No findings.
- **Altitude:** independently re-derived (not deferred to) round 3/4's verdicts on the `postLoginGate` `Promise.all`, the login page's GoTrue-error mapping, `admin-guard.ts`'s three-function split, the migration RLS/revoke posture, and `assignable.ts`'s unscoped-query justification. No findings — explicitly noted "two consecutive independent full passes landing on 'nothing left' is itself the strongest signal available that the diff is genuinely done."
- **Simplification:** ⚠️ hit a rate limit mid-run and terminated with `status: failed`, but had already completed its analysis and delivered a full report via hand-back before failing (verified: the report's own confirmation step ran and returned a result). Found one real, fresh issue and one medium-confidence one:
  - **Fixed — `plural()` in `_deactivate-dialog.tsx` was a dead export with a stale, actively-misleading comment.** Its comment ("Exported for page.tsx's toast copy...") described `membershipParts()`'s consumer, not its own — `page.tsx` imports `membershipParts`, never `plural` directly (verified via grep: zero external references). Reads like a leftover from round 2, when `plural` was likely the thing `page.tsx` called before `membershipParts` was introduced as a wrapper around it, and the original export/comment were never cleaned up. Fixed: dropped `export`, replaced the comment with one that accurately describes `plural` as module-private, and moved the "exported for page.tsx" comment to `membershipParts` where it actually belongs.
  - **Skipped — `getDeactivationImpact()`'s 4 `head:true` count queries → 2 queries + client-side count.** The agent itself flagged this as medium-confidence and noted "it's plausible earlier rounds considered and accepted this shape." They did: round 2 explicitly discussed and rejected this exact consolidation ("they already run in parallel via Promise.all, so consolidating wins no latency; it would trade zero-row-overhead count queries for row-fetch-plus-JS-aggregation queries, which isn't clearly cheaper for an infrequent admin action"), and round 3's efficiency review re-confirmed it. Not re-litigating a twice-settled call on a third mention.
  - Also explicitly ruled out (not flagged): migration 144's unused `returns table(action, count)` shape in `deactivateUser()`'s JS caller — correctly identified as deliberate consistency with sibling migration 009's identical shape, not dead complexity to trim.

`npx tsc --noEmit` and `pnpm lint` re-run clean after the one fix (0 errors; same 2 pre-existing unrelated warnings).

**Assessment:** round 5, run against explicit advice that it likely wouldn't find anything, still caught one small real issue (a stale comment + unnecessary export) precisely because the simplification agent was told to and did take a different angle (auditing every export's actual consumer) rather than re-verifying the same four things again. Net takeaway for future rounds on settled diffs: a fresh review angle can still catch something a same-angle re-run would miss, but three of four angles reproduced the "nothing found" result exactly as predicted — this diff is now genuinely at a stopping point.

## Related

- Task 365 — HR > Users invite flow (same page, same auth guard shape, same `hub_users`/`profiles` dual-write).
- Task 153 / migration 073 — project & phase membership, and the "zero members = unrestricted" invariant.
- Task 351 — `getAssignableMembers()` as the single source of truth for assignee pickers.
- Task 231 — `ConfirmDialog` promotion to `src/components/ui/`.
- Migration 009 — `force_logout_all_except`, the pattern migration 144 mirrors.
