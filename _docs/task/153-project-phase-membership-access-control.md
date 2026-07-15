# 153: Project & Phase 1 Membership — Ownership, Access Gating & Project Visibility

**Created:** 2026-07-15
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

Today, access to the 120-day Programme module (`src/app/v2/(hub)/onboarding/`, current paths —
task 150's rename to `/v2/programme` is still `Planned`/unimplemented, so this task builds
against `onboarding/` as it exists now) is entirely **role-based**, with no per-project or
per-phase membership concept anywhere:

- **Creating a project** (`POST /api/onboarding/projects`, `onboarding/new/page.tsx`): any
  `admin`/`super_admin`/`marketing` user (`CREATE_ROLES`). `projects.created_by` and
  `projects.owner_name` columns already exist but are **not populated** by this route today —
  `created_by` is only ever set by the unrelated native PM Core module
  (`/api/v2/projects/route.ts`, task 073), and `owner_name` is a free-text display string
  imported from historical Zoho data (`zoho-import/projects/route.ts`), not a real user
  reference. Neither currently models "who owns this project."
- **Viewing the project list** (`GET /api/onboarding/projects`, `_onboarding-list.tsx`): any
  `admin`/`super_admin`/`marketing`/`pm`/`developer`/`hr` user (`STAFF_ROLES`) sees **every**
  project — no filtering by who's actually working on it.
- **Opening a project's Timeline/Wizard** (`onboarding/[projectId]/page.tsx`): any
  `marketing`/`admin`/`super_admin`/`pm`/`developer` (`DETAIL_ROLES`, task 146). Task 146 (still
  `Testing`, not yet `Completed`) added a role-based step split *inside* the Wizard — PM gets
  read-only on steps 1-5/7 and full edit on Step 6 — but this applies to **every** `pm`-role
  user on **every** project uniformly. There is no concept of "this PM is or isn't assigned to
  this specific client's onboarding."
- **Starting Phase 1** (`POST /api/projects/[projectId]/programme/start`): any
  `admin`/`super_admin`/`marketing` user. Nothing records who clicked it.

The user wants a real two-tier membership model layered on top of this:

1. **Project-level membership** — gates whether a `marketing`/`pm` user can see a project on
   the list at all. `admin`/`super_admin` always see everything (unchanged).
2. **Phase-level membership** — gates whether a `marketing`/`pm` user can *open* a given phase's
   management UI at all (today, only Phase 1 has one — the Wizard). Phase 1 specifically has a
   single **owner** (set automatically when that user clicks "Start Onboarding") plus any number
   of additional members. Ownership can be transferred or added-to later. Once a `pm` is added
   as a Phase 1 member, task 146's existing step-1-5/7-read-only + step-6-editable split applies
   to them unchanged — this task only adds the entry gate in front of it, not a new per-step
   permission model.

This task also **widens who can create a project and start onboarding to include `pm`**
(today it's `admin`/`super_admin`/`marketing` only) — the user's requirement 1 explicitly lists
`pm` alongside the existing three roles.

### Reading of requirement 4 ("users not added to a phase cannot enter")

The user's 6 points don't say phase-entry gating is PM-only — re-reading requirement 2
alongside requirement 4, the intent is that **`marketing` is also phase-gated**, not just `pm`:
requirement 2 frames "which marketing agents currently have access to this client's Phase 1" as
something actively managed (owner + added agents), which only makes sense if marketing agents
*without* that membership are also blocked. This is a real behavior change from today (where
any `marketing`-role user already has unrestricted access to any project's Wizard) — flagging
prominently since it's the one piece of this reading not explicitly spelled out in the user's
numbered list. `admin`/`super_admin` bypass both gates, consistent with requirement 5's explicit
carve-out and this codebase's existing convention of admin/super_admin as always-full-access
roles.

### Backward compatibility for existing in-progress projects

Every project that already has `programme_started_at` set (i.e., already mid-onboarding) will
have **zero** rows in the new membership tables the moment this ships — a hard "empty
membership = locked out" interpretation would immediately block every `marketing`/`pm` user
from every currently in-progress client's onboarding. To avoid that: **a project or phase with
zero membership rows is treated as unrestricted** (visible/enterable exactly as today).
Restriction only takes effect once the *first* member row exists for that project or phase —
which happens automatically going forward (creator becomes a project member on creation;
whoever clicks "Start Onboarding" becomes the Phase 1 owner). No backfill migration needed or
performed; this is a clarify-during-review point, not a silent assumption to leave undiscussed.

## Requirements

### (1) Project creation & ownership

- [ ] `admin`, `super_admin`, `marketing`, **and `pm`** can create a new project (adds `pm` to
      `CREATE_ROLES` in three places — see Proposed File Changes).
- [ ] `projects.created_by` is set to the creating user's id on insert (column already exists,
      currently unpopulated by this route).
- [ ] The creator is automatically added as a `project_members` row for their own project (so
      they see it on their own list immediately).

### (2) Phase 1 ownership

- [ ] Clicking "Start Onboarding" makes the clicking user the Phase 1 **owner**
      (`phase_members` row, `phase_number = 1`, `is_owner = true`).
- [ ] The Phase 1 owner is also auto-added as a `project_members` row if not already one (so
      starting onboarding never leaves the starter unable to find their own project on the
      list afterward).
- [ ] The current Phase 1 owner, or `super_admin`, can **transfer ownership** to another
      existing Phase 1 member (demotes the current owner to a regular member, promotes the
      target — same demote-then-promote transaction shape as
      `src/lib/customers/primary-contact.ts`'s `upsertPrimaryContact`, task 151) or **add
      another** member without transferring ownership.
- [ ] At most one owner per `(project_id, phase_number)` — enforced with a partial unique index,
      mirroring `contacts.is_primary`'s existing pattern (migration 072, task 151).

### (3) Adding a PM to Phase 1

- [ ] `super_admin`, any current Phase 1 member with `role = 'marketing'` (the "assigned
      marketing agent(s)"), or the Phase 1 owner (redundant with the above when the owner is a
      marketing user, but covers the edge case where an `admin`/`super_admin` started
      onboarding themselves) can add a `pm`-role user as a Phase 1 member.
- [ ] Once added, that PM gets exactly the access task 146 already built: read-only steps
      1-5/7, fully editable Step 6 (file/folder management), no change to that existing logic.

### (4) Phase entry gating

- [ ] A `marketing` or `pm` user who is **not** a Phase 1 member and tries to open the Wizard
      sees a restricted-access message instead of the Wizard — e.g. "You are restricted from
      accessing this phase. If this is an error, please contact your administrator." — not a
      silent redirect.
- [ ] `admin`/`super_admin` are never subject to this gate.
- [ ] Per the Backward Compatibility note above: a phase with zero `phase_members` rows is
      unrestricted (today's behavior), not locked out.

### (5) Project list visibility

- [ ] `marketing` and `pm` users only see projects where they have a `project_members` row.
      `admin`/`super_admin` see every project, unchanged. `developer`/`hr`'s existing list/detail
      access (task 145/146) is **not** touched by this requirement — confirmed with the user
      this scopes to marketing/PM only.
- [ ] Per the Backward Compatibility note: a project with zero `project_members` rows is
      visible to all `STAFF_ROLES`, unchanged from today.

### (6) Adding project members

- [ ] `admin`, `super_admin`, `marketing`, and `pm` can add other users as `project_members` on
      a project. (Removal uses the same role set — not explicitly specified by the user, applied
      symmetrically as the most defensible default; flag during review if removal should be
      narrower.)

## Out of Scope / Must-Not-Change

- **Phases 2-5 enforcement.** Per user direction, `phase_members.phase_number` is a plain
  integer (not constrained to `1`) so the schema already supports all 5 phases, but **no
  enforcement or UI is added for phases 2-5 in this task** — they have no dedicated management
  UI today (only the read-only Gantt timeline, tasks 125/148), so there's nothing to gate access
  to yet. A future task can extend enforcement once those phases get their own management
  surfaces.
- **`developer` and `hr` access** — unchanged. `developer` keeps its task-146 Timeline-only,
  all-projects visibility (never opens the Wizard, so phase-membership gating never applies to
  it). `hr` keeps its task-145 read-only list access, no detail/Wizard access.
- **`client` role** — entirely unrelated; clients never see this internal `/v2/onboarding`
  surface (they use the separate `(public)` onboarding form).
- **Task 146's step-level read/write split** (steps 1-5/7 read-only, Step 6 editable, for `pm`)
  — untouched. This task only adds an entry gate in front of it; once a PM is a Phase 1 member,
  their in-Wizard experience is exactly what task 146 already built.
- **`projects.owner_name`** (free-text Zoho-imported display string) — a different, legacy
  concept from the real membership/ownership this task introduces. Not touched, not conflated.
- **Removing a member from a phase/project they don't belong to, or self-service "leave a
  project"** — not requested; only add/remove-by-an-authorized-user and transfer-ownership are
  in scope.
- **No backfill migration** for existing in-progress projects/phases — see Backward
  Compatibility note; empty membership is treated as unrestricted by design, not backfilled.
- **Any RLS/API change to the `admin|super_admin|marketing` write allow-lists** on
  `customer_phases`/`customer_deliverables`/`onboarding_internal_deliverables` write routes
  (task 146's explicit out-of-scope list) — still untouched; this task adds a membership check
  *in addition to* those existing role checks, not a replacement.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/073_project_phase_membership.sql` | Create | New `project_members` and `phase_members` tables + RLS |
| `src/types/database.ts` | Modify | Add `project_members`/`phase_members` table types |
| `src/app/api/onboarding/projects/route.ts` | Modify | Add `pm` to `CREATE_ROLES`; set `created_by` on insert; auto-add creator as `project_members`; filter `GET` list by membership for `marketing`/`pm` |
| `src/app/v2/(hub)/onboarding/new/page.tsx` | Modify | Add `pm` to `CREATE_ROLES` (server-side redirect gate) |
| `src/app/api/projects/[projectId]/programme/start/route.ts` | Modify | Add `pm` to `WRITE_ROLES`; insert Phase 1 owner `phase_members` row + auto-add `project_members` row on start |
| `src/app/api/projects/[projectId]/members/route.ts` | Create | `POST`/`DELETE` — add/remove `project_members`; role check per requirement 6 |
| `src/app/api/projects/[projectId]/programme/phases/[phaseNumber]/members/route.ts` | Create | `POST`/`DELETE`/`PATCH` — add/remove phase members, transfer ownership; role check per requirements 2/3 |
| `src/app/v2/(hub)/onboarding/[projectId]/page.tsx` | Modify | Fetch caller's phase membership; pass down for the entry gate |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` | Modify | Render restricted-access message instead of the Wizard when gated; add member/ownership management UI (likely near the "Start Onboarding"/"Onboarding Wizard" buttons, ~lines 905/989) |

## Code Context

### Current `CREATE_ROLES`/`WRITE_ROLES` (three separate copies, all need `pm` added)

`src/app/api/onboarding/projects/route.ts:17`, `src/app/v2/(hub)/onboarding/new/page.tsx:8`:
```ts
const CREATE_ROLES = ["admin", "super_admin", "marketing"];
```
`src/app/api/projects/[projectId]/programme/start/route.ts:5`:
```ts
const WRITE_ROLES = ["admin", "super_admin", "marketing"];
```
All three become `["admin", "super_admin", "marketing", "pm"]`.

### Current project insert (`onboarding/projects/route.ts:205-216`) — no `created_by`

```ts
const { data: project, error: projectError } = await supabase
  .from("projects")
  .insert({
    customer_id: customerId,
    name: body.project_name.trim(),
    project_type: deriveProjectType(body.classification),
    customer_product_id: product.id,
    onboarding_visible_at: null,
    scheduled_onboarding_start_at: body.mode === "save_scheduled" ? body.scheduled_start_at : null,
  })
  .select("id, customer_id")
  .single();
```
Add `created_by: user.id`, then after success, insert a `project_members` row
`{ project_id: project.id, user_id: user.id, added_by: user.id }`.

### Current list query (`onboarding/projects/route.ts:38-51`) — no membership filter

```ts
const { data: projects, error } = await supabase
  .from("projects")
  .select(`id, name, customer_id, programme_started_at, ...`)
  .gte("created_at", "2026-07-06T00:00:00Z")
  .order("created_at", { ascending: false });
```
For `marketing`/`pm` callers, this needs to become: fetch the caller's `project_members` ids
first, then either `.in("id", memberProjectIds)` **or** fall back to the unfiltered query when
the caller has zero membership rows anywhere (a brand-new marketing/pm user with no
memberships yet would otherwise see nothing at all — but per the Backward Compatibility note,
the *per-project* empty-membership check is what governs visibility, not a global "has this
user ever been added to anything" check, so the actual condition is: include a project if
either (a) caller has a `project_members` row for it, or (b) that project has *zero*
`project_members` rows at all). Implementer should build this as a single query augmented with
a `project_members` lookup map, following the established `PAGE = 1000` pagination pattern from
CLAUDE.md if the members table could exceed 1000 rows (unlikely at current scale, but keep the
pattern in mind for the lookup-map-building query).

### `POST /api/projects/[projectId]/programme/start` (current, full file already read) —
insert Phase 1 ownership after the existing `seedAndStartProgramme` call (~line 37-40):

```ts
const result = await seedAndStartProgramme({ id: project.id, customer_id: project.customer_id }, companyName);
if (result.error) {
  return NextResponse.json({ error: result.error }, { status: 500 });
}
// NEW: record Phase 1 ownership + ensure project membership
await adminClient.from("phase_members").insert({ project_id: projectId, phase_number: 1, user_id: user.id, is_owner: true, added_by: user.id });
await adminClient.from("project_members").upsert(
  { project_id: projectId, user_id: user.id, added_by: user.id },
  { onConflict: "project_id,user_id", ignoreDuplicates: true }
);
```

### Ownership transfer — mirror `upsertPrimaryContact`'s demote-then-promote shape
(`src/lib/customers/primary-contact.ts`, task 151): demote the current
`is_owner = true` row for `(project_id, phase_number)` to `false`, then set the target row to
`true` — in one function, reused by both the API route and (if useful) future call sites, same
reasoning task 151 used for extracting a shared helper.

### Wizard entry gate — `_onboarding-detail.tsx` "Onboarding Wizard" button (~line 989)

```tsx
onClick={() => { setWizardStartStepKey(undefined); setWizardOpen(true); }}
```
Needs a membership check before flipping `wizardOpen` — either gate the button itself (disabled
+ tooltip) or gate what renders when `wizardOpen` is true (render the restricted-access message
in place of `<OnboardingWizard />`). The latter is likely cleaner given "Start Onboarding" (line
905) also needs to remain clickable for users who aren't members yet (starting onboarding is how
you *become* the owner — it can't itself require pre-existing membership).

## Implementation Steps

1. Write migration `073_project_phase_membership.sql`: `project_members` and `phase_members`
   tables (schema per Overview), indexes, partial unique index on `phase_members` for
   single-owner-per-phase, and RLS — SELECT broadly readable by any `STAFF_ROLES`-equivalent
   authenticated staff role (matching the existing `customer_asset_folders`-style "permissive
   read, app-layer decides" convention already used for adjacent tables); INSERT/UPDATE/DELETE
   routed through API routes using `adminClient` with explicit role checks in code (the
   multi-condition logic in requirements 2/3/6 — "owner OR assigned marketing agent OR
   super_admin" — isn't cleanly expressible as a single RLS `using()` clause the way this
   codebase's simpler role-list policies are).
2. Add the new table types to `src/types/database.ts`.
3. Update the three `CREATE_ROLES`/`WRITE_ROLES` copies to include `pm`.
4. Update `onboarding/projects/route.ts`: set `created_by` + auto-insert `project_members` on
   POST; add membership-based filtering to GET per the Code Context note above.
5. Update `programme/start/route.ts`: insert the Phase 1 owner `phase_members` row + ensure
   `project_members` row on start.
6. Create `src/lib/programme/phase-membership.ts` (or similar) with a shared
   `transferPhaseOwnership()` helper mirroring `upsertPrimaryContact`'s shape, plus
   `addPhaseMember()`/`removePhaseMember()`, `addProjectMember()`/`removeProjectMember()` —
   reused by the two new API routes.
7. Create `POST/DELETE /api/projects/[projectId]/members/route.ts` (project-level, requirement
   6's role set).
8. Create `POST/DELETE/PATCH /api/projects/[projectId]/programme/phases/[phaseNumber]/members/route.ts`
   (phase-level add/remove + `PATCH` for ownership transfer, requirements 2/3's role set).
9. Update `onboarding/[projectId]/page.tsx` to fetch the caller's Phase 1 membership row
   (owner/member/none) alongside existing data, pass down as a prop.
10. Update `_onboarding-detail.tsx`: render the restricted-access message in place of the Wizard
    when the caller is `marketing`/`pm` and not a Phase 1 member; add a member-management UI
    (owner display, "Transfer ownership," "Add marketing agent," "Add PM" — likely a small panel
    near the existing "Onboarding Wizard" button) gated to the roles in requirements 2/3.
11. Update `_onboarding-list.tsx`/list fetch: no client-side change expected if the API's `GET`
    response is already pre-filtered server-side (per step 4) — verify this is sufficient before
    adding any client-side re-filtering.

## Acceptance Criteria

- [ ] `pm` can create a new project via `/v2/onboarding/new` and see the "+ New Project" action
      on the list.
- [ ] A newly created project's `created_by` is set; the creator sees it on their own list.
- [ ] Clicking "Start Onboarding" makes the clicker the Phase 1 owner; they can transfer
      ownership to another existing Phase 1 member or add a new one.
- [ ] The Phase 1 owner, an assigned marketing agent, or `super_admin` can add a `pm` to Phase
      1; that PM then gets task 146's existing read-only-steps-1-5/7 + editable-step-6 access.
- [ ] A `marketing`/`pm` user who is not a Phase 1 member sees the restricted-access message
      instead of the Wizard when a project *does* have existing phase members (i.e., is
      actually gated) — not for projects with zero members (unrestricted per Backward
      Compatibility).
- [ ] A `marketing`/`pm` user without project membership does not see that project on their
      list, when the project *does* have existing project members. `admin`/`super_admin` always
      see every project.
- [ ] `admin`/`super_admin`/`marketing`/`pm` can add project members; the added user then sees
      that project on their list.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser: as `marketing`, create a project, confirm it appears on your own list. As a
second `marketing` user not added to it, confirm it does *not* appear on their list. As that
second user, if given direct access to the project URL, confirm the phase-entry restricted
message appears once the project has at least one Phase 1 member who isn't them. Start
onboarding as the first user, confirm they become Phase 1 owner; add a `pm` user, confirm that
PM can now open the Wizard with the expected read-only/editable step split. Transfer ownership
to a third marketing user, confirm the original owner is demoted to a regular member (not
removed) and the transfer target now shows as owner. Confirm `admin`/`super_admin` see and can
enter every project throughout, with no membership rows of their own required.

## Compatibility Touchpoints

- **New migration required** — `073_project_phase_membership.sql`; user applies it (per this
  session's established pattern — Claude never runs `supabase db push` or equivalent).
- **No data backfill** — existing in-progress projects/phases have zero membership rows and are
  treated as unrestricted per the Backward Compatibility note; this is a deliberate design
  choice to avoid a hard lockout on ship, not an oversight.
- Does not touch task 150 (still `Planned`, unimplemented `/v2/programme` rename) — if/when 150
  ships, its route-path change is orthogonal to this task's membership model, but any hardcoded
  `/v2/onboarding` paths this task adds should ideally go through `V2_ROUTES.ONBOARDING` (not
  hardcoded strings) so task 150's later rename doesn't need to hunt for them separately.
- Does not touch `CLAUDE.md` — no new durable convention beyond what's already documented
  (`get_my_role()` RLS pattern, `adminClient`-for-specific-write-paths exception already
  established by task 151) is being introduced that isn't already covered.

## Implementation Notes

### What Changed
- New `project_members`/`phase_members` tables (migration `073_project_phase_membership.sql`)
  with permissive staff-read RLS and a partial unique index enforcing at most one
  `is_owner = true` row per `(project_id, phase_number)`, mirroring `contacts.is_primary`'s
  existing pattern (migration 072, task 151). No RLS write policies — writes go through
  `adminClient` from server-side API routes that perform their own role checks.
- New `src/lib/programme/membership-rules.ts` (pure permission logic — `isRoleGatedByMembership`,
  `canManageProjectMembers`, `canManagePhase1Membership` — safe to import from Client
  Components) and `src/lib/programme/phase-membership.ts` (adminClient-backed DB mutations:
  `addProjectMember`, `removeProjectMember`, `addPhaseMember`, `removePhaseMember`,
  `transferPhaseOwnership`, `getPhaseMembership`; re-exports everything from
  `membership-rules.ts` for server-side callers that need both).
- `seedAndStartProgramme` (`src/lib/programme/seed.ts`) gained an optional `startedByUserId`
  parameter — when provided, inserts the Phase 1 owner `phase_members` row and ensures a
  `project_members` row for that user. All three real callers updated: the manual
  `/programme/start` route and the New Project intake's `mode: "start"` path now pass the
  acting user's id; the scheduled auto-start cron (session-less) omits it, so cron-started
  projects simply have no Phase 1 owner (unrestricted per the backward-compatibility rule, not
  an error).
- `CREATE_ROLES`/`WRITE_ROLES` widened to include `pm` in all three places: `onboarding/
  projects/route.ts`, `onboarding/new/page.tsx`, `programme/start/route.ts`.
- `onboarding/projects/route.ts`: `POST` now sets `created_by` and auto-adds the creator as a
  `project_members` row. `GET` now filters the list for `marketing`/`pm` callers — a project is
  included if the caller is a member OR the project has zero `project_members` rows at all
  (backward compatibility). `admin`/`super_admin`/`developer`/`hr` are unaffected.
- `onboarding/[projectId]/page.tsx` now fetches Phase 1 membership server-side and passes
  `currentUserId`/`phase1Members` down, so the restricted-access decision is made before any
  Wizard content could flash.
- `_onboarding-detail.tsx`: computes `isPhase1Restricted` (gated role + phase has members +
  caller isn't one); when true, opening the Wizard renders a restricted-access message
  ("You are restricted from accessing this phase...") with a back button, instead of
  `<OnboardingWizard>` — task 146's step-level read/write split inside the Wizard is completely
  untouched, this only adds the entry gate in front of it. New "Access" toggle button (visible
  to anyone who can manage project or Phase 1 membership) reveals an `AccessPanel` with two
  sections: project members (requirement 6 roles) and Phase 1 members (requirement 2/3 roles,
  owner crown icon, transfer-ownership and add-PM/add-marketing-agent pickers sourced from the
  existing `/api/staff-directory` endpoint).
- Two new API routes: `POST/DELETE /api/projects/[projectId]/members` (project-level) and
  `GET/POST/PATCH/DELETE /api/projects/[projectId]/programme/phases/[phaseNumber]/members`
  (phase-level, `PATCH` = transfer ownership). The phase route blocks `DELETE`-ing the current
  owner (409, "transfer ownership first") to avoid ever leaving a phase ownerless via a stray
  removal.

### Files Changed
- `supabase/migrations/073_project_phase_membership.sql` - new tables + RLS
- `src/types/database.ts` - added `project_members`/`phase_members` types
- `src/lib/programme/membership-rules.ts` - new, pure permission logic (client-safe)
- `src/lib/programme/phase-membership.ts` - new, adminClient-backed mutations + re-exports rules
- `src/lib/programme/seed.ts` - optional `startedByUserId` param, Phase 1 owner seeding
- `src/app/api/onboarding/projects/route.ts` - `pm` in `CREATE_ROLES`; `created_by` +
  auto-membership on create; membership-filtered `GET`
- `src/app/v2/(hub)/onboarding/new/page.tsx` - `pm` in `CREATE_ROLES`
- `src/app/api/projects/[projectId]/programme/start/route.ts` - `pm` in `WRITE_ROLES`; passes
  `user.id` to `seedAndStartProgramme`
- `src/app/api/projects/[projectId]/members/route.ts` - new, project member CRUD
- `src/app/api/projects/[projectId]/programme/phases/[phaseNumber]/members/route.ts` - new,
  phase member CRUD + ownership transfer
- `src/app/v2/(hub)/onboarding/[projectId]/page.tsx` - fetches Phase 1 membership server-side
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` - restricted-access gate,
  `AccessPanel`/`PersonChip`/`AddPersonSelect` components, membership state/handlers
- Not changed (verified sufficient as-is): `_onboarding-list.tsx` (filtering is server-side,
  nothing to change client-side), `onboarding/new/_content.tsx` (no role-based logic to
  update), `_onboarding-wizard.tsx` (task 146's step-level logic is untouched by design)

### Deviations From Plan
- **Split the planned single `phase-membership.ts` lib into two files** (`membership-rules.ts`
  + `phase-membership.ts`). Not anticipated in the task doc, but required — `phase-membership.ts`
  imports `adminClient`, and CLAUDE.md forbids importing `@/lib/supabase/admin` into Client
  Components; `_onboarding-detail.tsx` needs the pure permission checks. `phase-membership.ts`
  re-exports everything from `membership-rules.ts` so server-side callers see one unified API.
- **`seedAndStartProgramme` is shared by three callers, not just `/programme/start`** — the task
  doc's Code Context only sketched the insert against that one route. Discovered during
  implementation that the New Project intake's `mode: "start"` path and a session-less
  scheduled auto-start cron also call it. Handled by making the owner-assignment an optional
  parameter on the shared function itself (cleaner than duplicating the insert at each call
  site) — cron-triggered starts simply get no Phase 1 owner, which the backward-compatibility
  rule already treats as unrestricted, not an error.
- **Project-member management UI is only reachable from the main (post-start) Timeline view**,
  not the pre-start "Start Onboarding" screen — a scope trim for time. Project-level membership
  can still be managed once the main view is reached, and the creator is already auto-added on
  project creation regardless, so this doesn't block the core flow.
- No other deviations — the admin+super_admin override on `canManagePhase1Membership` was
  already flagged as an explicit assumption in the task doc itself (not something decided
  during implementation).

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual/browser verification - SKIPPED (no live dev/browser session run this task; this is a
  security-sensitive access-control feature — strongly recommend live-testing the restricted-
  access gate, list filtering, and ownership transfer flows before considering this done)

## Final Status

Foundation task for a 3-task arc completed together: task 154 (avatar chips on project cards)
reads this task's `project_members`/`phase_members` tables directly; task 155 (ownership
transfer, wider collaborator pool, search-to-add picker) extended the permission model and UI
this task established. User live-tested the full arc across several rounds (documented in task
155's Implementation Notes as Follow-Ups 1-4) and reported one real bug that traced back to
code this task introduced: a `PGRST201` PostgREST error (`project_members`/`phase_members` each
have two FKs into `profiles` — `user_id` and `added_by` — so a bare `profiles(...)` embed was
ambiguous) in `page.tsx`'s server-side Phase 1/project member fetches. Fixed under task 155's
Follow-Up 3 by qualifying every affected embed with its explicit FK constraint name
(`profiles!phase_members_user_id_fkey`, `profiles!project_members_user_id_fkey`) — noted here
since the bug lived in this task's original code, even though the fix landed under 155.

Relocation note: task 156 (informal label, no separate doc — folded into task 155's Follow-Up 1)
moved Phase 1's member-management UI out of `_onboarding-detail.tsx`'s `AccessPanel` and into
`_onboarding-wizard.tsx` itself (`PhaseAccessPanel`). This task's original `AccessPanel`/
`AddPersonSelect` components (Files Changed list above) were superseded by that move and no
longer exist under those names — `_onboarding-detail.tsx` now only manages project-level
membership directly; Phase 1 management lives in the Wizard, though the restriction gate and
underlying `phase1Members` state this task built remain in `_onboarding-detail.tsx` unchanged.

**Status: Completed** (2026-07-15) — approved by user after live testing across tasks 153/154/155.
