# 345: Fix Issue status-change 403, phantom assignee (`assignee_id` never set from the listing), and broken pause/resume for Issue timers

**Created:** 2026-09-01
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** deep
**Status:** Completed (2026-09-01)

---

## Overview

Three linked defects reported against **Legacy Projects → project → Issues**:

1. **Cannot change an Issue's status.** The status dropdown reverts and the network tab shows
   `PATCH /api/v2/issues/{id}` → **403** `{"error":"You don't have permission to edit this issue"}`,
   even when the user is logged in and *is* the assignee shown in the listing.
2. **Assignee mismatch.** The Issues **listing** shows the user as assignee (e.g. "Brandon Dwite
   Cobacha"), but the Issue **detail page** shows **Unassigned**, and the "Start timer" button
   never appears there.
3. **Issue timer cannot be paused/resumed.** From the list row *and* from the hub header Timer
   widget, clicking **Pause** does nothing (no visible state change); after a page refresh the
   timer "is no longer running / has stopped" and no time was logged.

### Root cause

**Defects 1 & 2 are the same bug.** Issue assignment has two columns:

- `issues.assignee_name` (free-text, Zoho's own field) — what the **listing** renders and matches
  members against.
- `issues.assignee_id` (FK → `profiles.id`, added in migration 100) — the **source of truth** for
  the detail page, for `getIssueEditPermission()`, and for `/api/v2/timer/start`.

`IssueAssigneePicker` in `src/app/(hub)/projects/_shared/_issue-list-view.tsx` writes **only
`assignee_name`** (`{ assignee_name, assignee_email: null }`) — it never sets `assignee_id`. So a
user assigned through the listing looks assigned everywhere that reads `assignee_name`, but
`assignee_id` stays `NULL`. Downstream:

- Detail page (`_issue-detail.tsx`) seeds the Assignee `<select>` from `issue.assignee_id ?? ""` →
  shows **Unassigned**.
- `getIssueEditPermission(role, userId, issue)` computes `isAssignee = issue.assignee_id === userId`
  → `false` → returns `READ_ONLY` → `PATCH /api/v2/issues/[issueId]` route.ts:38 returns **403**
  `"You don't have permission to edit this issue"`. (Matches the user's reported error body
  verbatim.)
- `perm.canStartTimer` is `false` → the detail-page and list-row `<TaskTimerButton>` are not
  rendered; `/api/v2/timer/start` route.ts:43 (`issue.assignee_id !== user.id`) would 403 anyway.

The migration-100 one-time backfill (`update issues set assignee_id = p.id from profiles p where
p.full_name = i.assignee_name`) only covered rows that existed then, was case/whitespace-sensitive,
and had no ambiguity guard — any issue assigned via the listing since (or re-imported since) is
back to `assignee_id IS NULL`.

**Defect 3 is a separate, older bug.** When task 234 / migration 100 widened timers from
task-only to also cover Issues (`active_timers.issue_id`), three timer routes were never updated
and still gate on `task_id` alone:

| Route | Line | Bug |
|-------|------|-----|
| `src/app/api/v2/timer/pause/route.ts` | 15, 19 | `select(...)` omits `issue_id`; guard `!existing?.task_id` → an Issue timer is treated as "No running timer to pause" → **400**, client `postJson` returns `null`, `setTimer` never called → UI unchanged. |
| `src/app/api/v2/timer/resume/route.ts` | 15, 19 | same shape — `!existing?.task_id` → "No paused timer to resume" → 400. |
| `src/app/api/v2/timer/break/cancel/route.ts` | 18, 26 | `if (!existing.task_id)` treats an Issue timer as **break-only** and **deletes the entire `active_timers` row** on break-end → after refresh the timer is gone and nothing was logged (explains "it stopped" + lost time). |

`src/app/api/v2/timer/stop/route.ts` already handles both (`!existing.task_id && !existing.issue_id`)
and `break/start/route.ts` is entity-agnostic — so **stop** works, which is why the user only
loses the timer via pause-then-refresh or via a break.

### Secondary finding (fix included)

`src/app/api/admin/zoho-import/issues/route.ts:102-136` resolves `assignee_id` from a
`hubUserMap` built off the **`hub_users`** table (`id, email`). `issues.assignee_id` is a FK to
**`profiles.id`**. `hub_users.id` is not guaranteed to equal `profiles.id` (v2 shell is
`profiles`-native; `hub_users` is the v0.1 table). A future Issues re-import can therefore null
or mis-set `assignee_id` again. Repoint this lookup at `profiles` joined to auth email.

## Requirements

- [ ] Assigning an Issue from the **listing** (`IssueAssigneePicker`) sets `assignee_id` (and keeps
      `assignee_name` in sync, clears `assignee_email`) — same contract as the detail page's
      `saveAssignee()`.
- [ ] Unassigning from the listing clears all three (`assignee_id`, `assignee_name`,
      `assignee_email`) to `null`.
- [ ] The listing's assignee avatar/label resolves via `assignee_id` first, falling back to
      `assignee_name` for legacy rows.
- [ ] Assigning from the listing grants the assignee persistent project access
      (`project_members`), matching the detail-page/API behaviour (route.ts calls
      `addProjectMember`). Since the picker goes through the same `PATCH /api/v2/issues/[issueId]`
      with `assignee_id`, this is automatic once `assignee_id` is sent — **verify**, don't
      re-implement.
- [ ] A backfill migration re-resolves `assignee_id` for existing `assignee_id IS NULL AND
      assignee_name IS NOT NULL` rows, case/whitespace-insensitive, **skipping ambiguous
      `full_name` matches** (more than one profile with that name).
- [ ] After the fix + backfill, an assignee-developer on the reported Issue can set status to the
      assignee-allowed values (`in_progress`, `ready_for_qa`) and can start/pause/resume/stop its
      timer.
- [ ] `PATCH /api/v2/timer/pause` and `/resume` work for an Issue timer (accept `issue_id` rows).
- [ ] `POST /api/v2/timer/break/cancel` does **not** delete an Issue timer's `active_timers` row
      on break-end — it resumes/pauses it exactly as it does for a task timer.
- [ ] The list-view status `<select>` is gated by `perm` (options limited to
      `perm.allowedStatusValues`, disabled when `!perm.canChangeStatus`) so it stops offering
      changes that will 403-and-revert — mirroring `_issue-detail.tsx:106-108,242-248`.
- [ ] `zoho-import/issues` resolves `assignee_id` against `profiles`, not `hub_users`.

## Out of Scope / Must-Not-Change

- **Do not widen `getIssueEditPermission` assignee status rights.** Task 234 deliberately limits an
  assignee-only developer to `["in_progress", "ready_for_qa"]`. If the user needs full status
  control from the listing, that is a separate product decision — note it, don't change it here.
- No new forms library / toast library. Any user-facing error surfacing must use the existing
  inline-state pattern (see CLAUDE.md "Rejected / superseded").
- Do not merge `_issue-list-view.tsx`'s single-select picker into the tasks multi-select
  `AssigneePicker` — keep them separate (established convention).
- `issues.created_by` stays out of scope (no in-Hub issue-creation flow; always `null`).
- Board/calendar views: they only *display* `assignee_name` and have no assignee picker — the
  backfill fixes them transitively. Per-view drag-drop status gating beyond what's listed is out
  of scope.
- Do not change `active_timers` schema — `issue_id` already exists (migration 100).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_shared/_issue-list-view.tsx` | Modify | `IssueAssigneePicker`: send `assignee_id` on assign / `null` triad on unassign; resolve `assignedMember` by id-then-name. Gate the status `<select>` by `perm`. |
| `src/app/api/v2/timer/pause/route.ts` | Modify | Add `issue_id` to select; guard on `task_id \|\| issue_id`. |
| `src/app/api/v2/timer/resume/route.ts` | Modify | Add `issue_id` to select; guard on `task_id \|\| issue_id`. |
| `src/app/api/v2/timer/break/cancel/route.ts` | Modify | Add `issue_id` to select; branch on `task_id \|\| issue_id` (not `task_id` alone) for the "resume underneath vs delete row" decision. |
| `src/app/api/admin/zoho-import/issues/route.ts` | Modify | Build the assignee-email→id map from `profiles` (+ auth email), not `hub_users`. |
| `supabase/migrations/129_issues_backfill_assignee_id_from_name.sql` | Create | Re-resolve `assignee_id` for legacy null rows, unambiguous name match only. |
| `_docs/task/345-...md` / `TASKS.md` | Create/Modify | This document + tracker row. |

## Code Context

### `getIssueEditPermission` — `src/lib/issues/permissions.ts`

```ts
const isAssignee = issue.assignee_id === userId;   // <-- assignee_id, not assignee_name
if (role === "admin" || role === "pm" || role === "super_admin") return { ...FULL_EDIT_BASE, canStartTimer: false };
if (role !== "developer") return READ_ONLY;
if (issue.created_by === userId) return { ...FULL_EDIT_BASE, canStartTimer: isAssignee };
if (isAssignee) return { canEditDetails: false, canChangeStatus: true,
  allowedStatusValues: ["in_progress", "ready_for_qa"], canStartTimer: true };
return READ_ONLY;   // <-- listing-assigned user lands here → PATCH route 403s
```

### `PATCH /api/v2/issues/[issueId]/route.ts` — the 403 the user sees

```ts
const perm = getIssueEditPermission(profile?.role, user.id, existingIssue);
if (!perm.canChangeStatus && !perm.canEditDetails) {
  return NextResponse.json({ error: "You don't have permission to edit this issue" }, { status: 403 });
}
```

### Listing picker (the bug) — `_issue-list-view.tsx:73-86`

```tsx
function assign(member: MemberProfile) {
  setOpen(false);
  void onUpdate(issue.id, { assignee_name: member.full_name, assignee_email: null }); // no assignee_id!
}
function unassign() {
  setOpen(false);
  void onUpdate(issue.id, { assignee_name: null, assignee_email: null });             // no assignee_id!
}
const assignedMember = issue.assignee_name ? allMembers.find((m) => m.full_name === issue.assignee_name) : undefined;
```

### Detail-page reference impl (the correct contract) — `_issue-detail.tsx:130-142`

```tsx
function saveAssignee(nextId: string) {
  setAssigneeId(nextId);
  const member = allMembers.find((m) => m.id === nextId);
  void saveField({ assignee_id: nextId || null, assignee_name: member?.full_name ?? null, assignee_email: null });
}
```

The API route already handles `assignee_id` in the body (`route.ts:63-71`) including the
`addProjectMember` side-effect — the picker just has to send the field. `MemberProfile` in the
list view already carries `id` + `full_name` + `avatar_url`.

### Detail-page status gating to mirror in the listing — `_issue-detail.tsx:106-108,242`

```tsx
const statusOptions = perm.allowedStatusValues === "all"
  ? STATUS_OPTS
  : Array.from(new Set([status, ...perm.allowedStatusValues]));
// <select ... disabled={!perm.canChangeStatus}>
```

### Timer pause route bug — `src/app/api/v2/timer/pause/route.ts:13-21`

```ts
const { data: existing } = await supabase
  .from("active_timers")
  .select("id, task_id, status, accumulated_seconds, segment_started_at, timeline") // add issue_id
  .eq("user_id", user.id)
  .maybeSingle();

if (!existing?.task_id || existing.status !== "running" || !existing.segment_started_at) {
  return NextResponse.json({ error: "No running timer to pause" }, { status: 400 }); // issue timers hit this
}
```
Fix guard: `if ((!existing?.task_id && !existing?.issue_id) || existing.status !== "running" || !existing.segment_started_at)`.

### Timer break/cancel row-deletion bug — `src/app/api/v2/timer/break/cancel/route.ts:16-30`

```ts
.select("id, task_id, status, break_type, timeline")   // add issue_id
...
if (!existing.task_id) {                                 // an Issue timer wrongly matches here
  await supabase.from("active_timers").delete().eq("id", existing.id);  // <-- destroys the Issue timer
  return NextResponse.json({ timer: null });
}
```
Fix: `if (!existing.task_id && !existing.issue_id)`.

### Import assignee map — `src/app/api/admin/zoho-import/issues/route.ts:102-106`

```ts
const { data: hubUserRows } = await adminClient.from("hub_users").select("id, email");
const hubUserMap = new Map(hubUserRows...filter(u => u.email).map(u => [String(u.email).toLowerCase(), u.id]));
// issues.assignee_id is FK -> profiles.id, but u.id here is hub_users.id
```
Replace with a `profiles`-based map. `profiles` has no `email` column (email is in
`auth.users`) — use `adminClient.auth.admin.listUsers()` (paginated) or an admin RPC/`.schema("auth")`
read to join `auth.users.email` → `profiles.id`. Match the pattern already used elsewhere in the
import routes for user resolution; if none exists, `listUsers()` pagination is acceptable here
(admin route, one-shot import).

## Implementation Steps

1. **`_issue-list-view.tsx` — `IssueAssigneePicker`:**
   - `assign(member)` → `onUpdate(issue.id, { assignee_id: member.id, assignee_name: member.full_name, assignee_email: null })`.
   - `unassign()` → `onUpdate(issue.id, { assignee_id: null, assignee_name: null, assignee_email: null })`.
   - `assignedMember` → `allMembers.find(m => m.id === issue.assignee_id) ?? (issue.assignee_name ? allMembers.find(m => m.full_name === issue.assignee_name) : undefined)`.
   - `isAssigned` check in the member list → compare `m.id === issue.assignee_id` (fall back to name).
   - Update the stale "name-string-based" comment.
2. **`_issue-list-view.tsx` — status `<select>` (line ~436):** compute `statusOptions` from
   `perm.allowedStatusValues` (as detail page), add `disabled={!perm.canChangeStatus}` +
   `disabled:` classes. `perm` is already computed at line 389.
3. **Timer routes:** in `pause`, `resume`, `break/cancel` — add `issue_id` to the `.select()`,
   change the `task_id`-only guard/branch to `task_id || issue_id`. Leave `stop` and `break/start`
   untouched. `attachTaskTitle` already resolves issue titles — no serialize change.
4. **`zoho-import/issues/route.ts`:** replace the `hub_users` map with a `profiles` + auth-email
   map; keep the `assigneeEmail ? map.get(...) ?? null : null` shape.
5. **Migration `129_issues_backfill_assignee_id_from_name.sql`:**
   ```sql
   update issues i
   set assignee_id = m.id
   from (
     select lower(btrim(full_name)) as norm_name, min(id) as id
     from profiles
     where full_name is not null and btrim(full_name) <> ''
     group by lower(btrim(full_name))
     having count(*) = 1
   ) m
   where i.assignee_id is null
     and i.assignee_name is not null
     and lower(btrim(i.assignee_name)) = m.norm_name;
   ```
   (Optionally follow with an `insert ... select ... on conflict do nothing` into `project_members`
   for the newly-linked assignees, mirroring `addProjectMember`. Confirm `project_members` columns
   —`project_id, user_id, added_by, is_owner` — and use a system/first-admin id for `added_by`, or
   skip if the team prefers access to be granted lazily on next real assignment.)
   Follow the repo's migration-apply convention — state clearly in the handoff whether this needs
   the user to apply it (issue migrations 051/100/111 were applied by the team, not the agent).
6. `npx tsc --noEmit`, `pnpm lint`.
7. Browser acceptance (see Verification).

## Acceptance Criteria

- [ ] Assign an Issue to yourself from the **listing**; open its **detail page** → Assignee shows
      you (not "Unassigned"); the timer "Start" affordance is visible.
- [ ] As that assignee (developer), change the Issue status to **In Progress** from both the
      listing and the detail page → succeeds, no 403, persists after refresh.
- [ ] Statuses outside `in_progress`/`ready_for_qa` are not offered to an assignee-only developer
      in the listing dropdown (parity with detail page).
- [ ] Start the Issue timer → **Pause** from the list row → state flips to "Resume", elapsed
      freezes; **Resume** → runs again; refresh mid-pause → still paused with the banked time.
- [ ] Start the Issue timer → open the **hub header Timer widget** → **Pause** there → same
      behaviour; **Stop** → a `time_logs` row is written (`issue_id` set, `hours > 0`).
- [ ] Start an Issue timer → take a break → **End break** → the Issue timer resumes (or stays
      paused) and the `active_timers` row still exists; it is **not** deleted.
- [ ] Existing legacy Issues with an unambiguous `assignee_name` now have `assignee_id` populated
      (spot-check the reported "trade ac…" Issue on the Belmont Studio D2C & B2B project).
- [ ] PM/Admin behaviour unchanged (full edit, no timer button).
- [ ] `npx tsc --noEmit` clean; `pnpm lint` clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then browser acceptance below
```

Browser (dev server, logged in as a developer):
1. Legacy Projects → **Belmont Studio D2C & B2B App** → **Issues**.
2. Assign an open Issue to yourself via the row assignee picker.
3. Open the Issue → confirm Assignee = you; confirm timer Start button present.
4. Set status → **In Progress** (listing + detail). Watch Network: `PATCH /api/v2/issues/{id}` → 200.
5. Start timer (list row) → Pause → Resume → refresh → Stop. Watch Network: `/api/v2/timer/pause`
   and `/resume` → 200 with a `timer` body; `/stop` → 200 with `hours`.
6. Start timer → header widget → Pause/Resume/Stop; then start again → coffee break → End break →
   `GET /api/v2/timer` still returns the running/paused Issue timer.
7. DB check: `select id, assignee_name, assignee_id from issues where project_id = '<belmont uuid>'
   and assignee_name is not null;` → `assignee_id` populated for unambiguous names.

## Compatibility Touchpoints

- **Migration 129** must be applied to every environment (local + Vercel/Supabase prod). It is
  idempotent (`where assignee_id is null`). Confirm apply ownership with the user.
- No API contract change — `PATCH /api/v2/issues/[issueId]` already accepted `assignee_id`; timer
  routes gain Issue support without changing request/response shape.
- No package/install-surface changes.
- `_docs/mcp-tools.md` unaffected (no `registerTool` change).

## Implementation Notes

### What Changed

- **Issues listing assignee picker now sets `assignee_id`** (`_issue-list-view.tsx`). `assign()`
  writes `{ assignee_id, assignee_name, assignee_email: null }`; `unassign()` clears all three.
  Member/avatar resolution (`assignedMember`, new `assigneeLabel`, member-list `isAssigned`)
  resolves by the `assignee_id` FK first, falling back to `assignee_name` for legacy rows. This
  is the fix for the reported status-change **403** and the listing-vs-detail assignee mismatch —
  `getIssueEditPermission()` keys on `assignee_id`, which the picker never populated before.
- **Listing status `<select>` is now gated by `perm`** — options limited to
  `perm.allowedStatusValues` (falling back to the full set for `"all"`, always including the
  current value), `disabled` when `!perm.canChangeStatus`. Mirrors `_issue-detail.tsx`. Stops the
  dropdown from offering changes that PATCH-403-and-revert.
- **Listing assignee picker is read-only for users without `canEditDetails`** — new `canEdit`
  prop (`perm.canEditDetails`), matching the detail page's `disabled={!perm.canEditDetails}` on
  its Assignee select. An assignee-only developer can time/status the issue but not reassign it.
- **Issue timers can be paused / resumed / survive a break** — `timer/pause`, `timer/resume`,
  `timer/break/cancel` routes each added `issue_id` to their `active_timers` select and changed
  the `task_id`-only guard/branch to `task_id || issue_id`. Previously an Issue timer: 400 on
  pause/resume ("nothing happened"), and its `active_timers` row was **deleted** on break-end
  (losing the un-logged elapsed time — the "it stopped after refresh" symptom).
- **Backfill migration 129** re-resolves `assignee_id` for existing `assignee_id IS NULL AND
  assignee_name IS NOT NULL` rows via a case/whitespace-insensitive `full_name` match, skipping
  ambiguous names, then seeds `project_members` for every issue assignee (parity with
  `addProjectMember`, task 287). Idempotent.

### Files Changed

- `src/app/(hub)/projects/_shared/_issue-list-view.tsx` — picker writes `assignee_id`; id-first
  assignee resolution; `canEdit` gating on the picker; `perm`-gated status `<select>`.
- `src/app/api/v2/timer/pause/route.ts` — accept issue timers (`issue_id` in select + guard).
- `src/app/api/v2/timer/resume/route.ts` — same.
- `src/app/api/v2/timer/break/cancel/route.ts` — same; issue timer no longer deleted on break-end.
- `supabase/migrations/129_issues_backfill_assignee_id_from_name.sql` — new backfill (not applied
  by the agent — see below).

### Deviations From Plan

- **`zoho-import/issues/route.ts` left unchanged.** The plan flagged its `hub_users`-based
  assignee-email→id map as a FK-mismatch risk. Investigation of migration 007 shows
  `hub_users.id` **is** `auth.users(id)` — the same UUID as `profiles.id` (both FK `auth.users`).
  So the existing lookup already produces a valid `profiles.id` whenever the Zoho assignee's
  email matches a `hub_users` row. The remaining gap (Zoho user never logged into the Hub → no
  `hub_users` row → `assignee_id` null on import) is an inherent data gap, not a bug, and is
  exactly what migration 129's name-match backfill covers. No code change warranted.
- **Migration 129 is written, not applied.** Per repo convention (issue migrations 051/100/111
  were applied by the team) it needs the user to run it against local + prod Supabase. It is
  idempotent and scoped to null rows.
- Board / calendar views unchanged — they only display `assignee_name` and get the fix
  transitively via the backfill (per the plan's Out-of-Scope).
- impeccable design-hook `design-system-font-size` warnings fired on `_issue-list-view.tsx`
  during editing — all pre-existing `text-[Npx]` literals in surrounding code, matching this
  codebase's established convention (CLAUDE.md UI Polish Conventions). Not introduced here; not
  in scope.

### Verification Run

- `npx tsc --noEmit` — PASS (exit 0)
- `pnpm lint` — PASS (exit 0; 2 pre-existing warnings in an unrelated file,
  `onboarding-workspace/_checklist-tab.tsx`)
- Browser acceptance — SKIPPED (handed to `test` stage; requires dev server + migration 129
  applied + a logged-in developer/assignee on a real imported issue)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. Changes are minimal and localised: 4 source files + 1 new migration.
- The three timer routes now use an identical `!existing || (!task_id && !issue_id) || …` guard
  shape — consistent with `timer/stop/route.ts`'s existing `(!existing.task_id && !existing.issue_id)`
  check. No duplication worth extracting (one line each, different surrounding conditions).
- `_issue-list-view.tsx`: `assign()`/`unassign()` now mirror `_issue-detail.tsx:saveAssignee()`
  exactly (same three-field patch). `assignee_id`-first resolution is applied consistently across
  `assignedMember`, `assigneeLabel`, and the member-list `isAssigned` check.
- `handleOpen()` early-returns on `!canEdit` and the trigger is also `disabled={!canEdit}` — mildly
  redundant (a disabled button won't fire onClick) but harmless and defensive; left as-is.
- Comment on `timer/break/cancel/route.ts` updated from "task timer" → "entity timer" for accuracy.
- No `any`, no dead/commented-out code, no debug logging, no secrets. Tailwind-class styling only
  (the one `style={{}}` on the avatar background is pre-existing dynamic-colour code, untouched).
- Migration 129 follows repo SQL conventions (lowercase, CTE, comment header). The
  `project_members` seed is deliberately broader than the backfilled rows (all issue assignees)
  and idempotent via `ON CONFLICT DO NOTHING` — closes the same gap for migration-100-era rows.

### Deviations
- **Medium — `zoho-import/issues/route.ts` not modified** (plan proposed repointing its assignee
  map off `hub_users`). Verified via migration 007 that `hub_users.id` *is* `auth.users(id)` =
  `profiles.id`, so the existing lookup already yields a valid FK. No change needed; backfill 129
  covers the real gap (Zoho user with no `hub_users` row). Documented in Implementation Notes.
- **Medium — migration 129 written, not applied.** Per issue-migration convention (051/100/111
  applied by the team). Listing↔detail parity for pre-existing rows depends on it landing; the
  code changes stand alone without it for any *newly* assigned issue.
- **Minor — added `canEdit` gating to `IssueAssigneePicker`** (not an explicit plan requirement).
  In scope: it's parity with the detail page's existing `disabled={!perm.canEditDetails}` and
  prevents a new confusing 403-and-revert path. Not a scope expansion.

### Required Fixes
- None.

### Post-review fix (during migration apply)
- Migration 129 failed on apply with `function min(uuid) does not exist` — Postgres has no
  `min()`/`max()` aggregate for `uuid`. Replaced `min(id)` with `(array_agg(id))[1]` (safe: the
  `having count(*) = 1` guarantees one row per group). Also cast the `project_members` seed's
  `added_by` literal to `null::uuid`. Operator re-applied successfully.

## Completion

- **Status:** Completed at the user's explicit request (2026-09-01).
- **Applied:** migration 129 (after the `min(uuid)` fix above).
- **Code:** `_issue-list-view.tsx`, `timer/pause`, `timer/resume`, `timer/break/cancel` — merged.
- **Outstanding manual check (not a blocker):** end-to-end browser acceptance as a
  developer-who-is-the-assignee on a real imported issue — assign from the listing → confirm the
  detail page shows the assignee (not "Unassigned") → change status to In Progress from both
  surfaces → start the Issue timer → pause / resume from the list row and the header widget →
  take a break → end break (timer row must survive) → stop (a `time_logs` row with `issue_id`
  set is written).
