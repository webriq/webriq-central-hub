# 155: Project Ownership Transfer, Wider Collaborator Pool & Search-to-Add Picker

**Created:** 2026-07-15
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

Refinement of task 153 (still `Testing`, not yet approved) after live feedback on the
membership model it introduced. Three changes, all confirmed with the user:

**(a) Project-level ownership.** Task 153 gave `project_members` no owner concept at all — just
a flat membership list, with `projects.created_by` set once at creation and never editable.
The user wants a real, transferable project owner, **mirroring exactly what Phase 1 already
has** (`phase_members.is_owner`, task 153's demote-then-promote transfer pattern). This also
covers the practical need: projects created before task 153 shipped have zero `project_members`
rows and no formal owner — Super Admin needs to be able to set one retroactively, not just at
creation time.

**(b) Wider collaborator pool.** Task 153 scoped project membership toward marketing/pm (the
roles list-visibility gating actually applies to). The user wants Super Admin able to add
**any** staff member — marketing, PM, admin, developer, or HR — as a project collaborator, not
just marketing/pm. Confirmed: matches `/api/staff-directory`'s own existing scope (all
non-client roles), no new endpoint needed.

**(c) Search-to-add picker + membership-gated add permission.** Two changes bundled together
because they were described together:
- Replace the plain `<select>` add-pickers in `AccessPanel` (task 153) with a proper
  search-to-add UI, mirroring `_onboarding-wizard.tsx`'s existing `renderPersonPicker` pattern
  (search input + filtered dropdown + immediate-add-on-click) — already used for the Storage/KB
  file/folder Permissions panel and the bulk Share panel (tasks 138/141/144).
- **Tighten who can add project members**: today (task 153) any `admin`/`super_admin`/
  `marketing`/`pm` can add project members regardless of their own membership. The user wants
  `super_admin` to keep unconditional access, but `admin`/`marketing`/`pm` should only be able
  to add other project members **if they are themselves already a project member** (added by
  Super Admin, or by being the creator). This is a real tightening of task 153's
  `canManageProjectMembers` — flagging clearly since it changes behavior task 153 only just
  introduced, before it's even been tested.

Confirmed with the user (see design questions below): Phase 1's own membership rules
(`canManagePhase1Membership` — super_admin/admin always allowed, marketing/pm require existing
phase membership) are **not** touched by this task — only project-level add permission tightens.

## Requirements

### (a) Project ownership

- [ ] `project_members` gains `is_owner boolean not null default false`, with a partial unique
      index enforcing at most one owner per `project_id` — identical shape to
      `phase_members.is_owner` (task 153) and `contacts.is_primary` (task 151) before it.
- [ ] The project creator becomes the owner at creation time (`is_owner: true` on their
      `project_members` row), not just a plain member.
- [ ] Super Admin can set/transfer the project owner at any time, for any project — including
      pre-existing projects with zero members today. Same demote-then-promote transaction shape
      as `transferPhaseOwnership` (task 153).
- [ ] The `AccessPanel`'s project members section shows the owner with the same crown-icon
      treatment already used for Phase 1's owner.

### (b) Wider collaborator pool

- [ ] The project-members search-to-add picker draws from the full `/api/staff-directory`
      result (all non-client roles: marketing, pm, admin, developer, hr) — not filtered to
      marketing/pm the way task 153's `AccessPanel` implicitly assumed.

### (c) Search-to-add picker + tightened add permission

- [ ] `AccessPanel`'s project-members "+ Add member" control becomes a search input + dropdown
      (mirroring `renderPersonPicker`'s shape: type to filter by name, click a result to add
      immediately, already-added people shown as removable chips) instead of a plain `<select>`.
- [ ] `canManageProjectMembers(role, isProjectMember)` — `super_admin` always `true`;
      `admin`/`marketing`/`pm` require `isProjectMember` to also be `true`. Enforced both
      server-side (`/api/projects/[projectId]/members` route) and client-side (`AccessPanel`
      visibility).
- [ ] The detail page fetches the caller's own project membership status server-side (alongside
      the existing Phase 1 membership fetch from task 153), so this check doesn't have a
      client-side chicken-and-egg timing gap.

## Out of Scope / Must-Not-Change

- **Phase 1 membership rules are untouched** — `canManagePhase1Membership` keeps its task-153
  shape (`super_admin`/`admin` always allowed; `marketing`/`pm` require existing Phase 1
  membership). This task only tightens the *project*-level check. Confirmed with the user this
  task is scoped to project-level collaborator management.
- Do not add a search-to-add picker for Phase 1's "Add marketing agent"/"Add PM" controls —
  those stay the existing role-pre-filtered `<select>` pickers from task 153 (small, bounded
  pools by design — a marketing-only or pm-only list rarely needs search). Only the
  project-members picker, which now spans all 5 roles, gets the search UI.
- Do not change list-visibility gating (`isRoleGatedByMembership`, task 153's `GET
  /api/onboarding/projects` filtering) — still marketing/pm only, admin/super_admin always see
  everything. This task doesn't touch requirement 5's scope.
- Do not change task 154 (avatar chips) — it already reads the union of `project_members` +
  Phase 1 `phase_members`; a project owner is still a `project_members` row, so task 154's query
  picks up owners automatically with no changes needed there.
- Do not add project-level ownership transfer restrictions based on target role (any current
  project member can be made owner, regardless of their role) — matches how Phase 1 ownership
  transfer already works (transfer target just needs to already be a member).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/074_project_members_owner.sql` | Create | Add `is_owner` + partial unique index to `project_members` |
| `src/types/database.ts` | Modify | Add `is_owner` to `project_members` Row/Insert/Update |
| `src/lib/programme/membership-rules.ts` | Modify | `canManageProjectMembers` gains an `isProjectMember` parameter |
| `src/lib/programme/phase-membership.ts` | Modify | `addProjectMember` gains optional `isOwner` param; new `transferProjectOwnership`; new `getProjectMembership` |
| `src/app/api/onboarding/projects/route.ts` | Modify | Creator's `project_members` insert becomes `is_owner: true` |
| `src/lib/programme/seed.ts` | Modify | Phase-1-starter's auto project-membership insert stays non-owner (owner is set at project creation, not at programme start — see Code Context) |
| `src/app/api/projects/[projectId]/members/route.ts` | Modify | `POST`/`DELETE` require caller's own membership for non-super_admin; new `PATCH` for ownership transfer |
| `src/app/v2/(hub)/onboarding/[projectId]/page.tsx` | Modify | Fetch project members + caller's membership server-side |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` | Modify | New `PersonPicker` (search-to-add) replacing project-members' `AddPersonSelect`; wire ownership transfer; `is_owner` display |

## Code Context

### Reference: `renderPersonPicker` (`_onboarding-wizard.tsx:2760-2833`) — pattern to mirror

```tsx
const renderPersonPicker = (
  selectedUserIds: string[],
  onAdd: (personId: string) => void,
  onRemove: (personId: string) => void,
  search: string, setSearch: (v: string) => void,
  dropdownOpen: boolean, setDropdownOpen: (v: boolean) => void
) => {
  const selectedPeople = selectedUserIds.map((id) => staffDirectory.find((p) => p.id === id)).filter(Boolean);
  const filteredPeople = staffDirectory
    .filter((p) => !selectedUserIds.includes(p.id))
    .filter((p) => (p.full_name ?? "").toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      {/* selected people as removable pills */}
      {/* text input, onFocus opens dropdown, onBlur closes after a 150ms delay (lets the click register first) */}
      {/* dropdown: filtered list, onMouseDown preventDefault (survives the input's onBlur), onClick adds + clears search */}
    </div>
  );
};
```

Adapt this shape into a standalone `PersonPicker` component (props-based, not a curried closure
— `_onboarding-detail.tsx`'s `AccessPanel` is already its own component, not embedded inline the
way the wizard's render functions are) taking `people: {id, full_name, role}[]`,
`selectedIds: string[]`, `onAdd`, `onRemove`. Each add/remove call triggers an immediate API
call in this task's usage (same as task 153's existing handlers) — no staged "confirm" step,
matching how `renderPersonPicker` itself behaves (`onAdd` fires immediately on click).

### Target: `project_members` migration (mirrors `phase_members.is_owner`, migration 073)

```sql
alter table project_members add column if not exists is_owner boolean not null default false;
create unique index if not exists idx_project_members_one_owner
  on project_members (project_id) where is_owner = true;
```

### Target: `canManageProjectMembers` (`membership-rules.ts`, current — task 153)

```ts
export function canManageProjectMembers(role: string | null): boolean {
  return !!role && ["admin", "super_admin", "marketing", "pm"].includes(role);
}
```
Becomes:
```ts
export function canManageProjectMembers(role: string | null, isProjectMember: boolean): boolean {
  if (role === "super_admin") return true;
  if (!isProjectMember) return false;
  return role === "admin" || role === "marketing" || role === "pm";
}
```

### Target: `transferProjectOwnership` (mirrors `transferPhaseOwnership`, `phase-membership.ts`,
task 153) — same demote-then-promote shape, scoped by `project_id` only (no `phase_number`):

```ts
export async function transferProjectOwnership(projectId: string, targetUserId: string): Promise<{ error: string | null }> {
  const { error: demoteError } = await adminClient.from("project_members").update({ is_owner: false }).eq("project_id", projectId).eq("is_owner", true);
  if (demoteError) return { error: demoteError.message };
  const { error: promoteError } = await adminClient.from("project_members").update({ is_owner: true }).eq("project_id", projectId).eq("user_id", targetUserId);
  if (promoteError) return { error: promoteError.message };
  return { error: null };
}
```

### Where creator ownership is set (`onboarding/projects/route.ts`, task 153's current code)

```ts
const { error: memberError } = await addProjectMember(project.id, user.id, user.id);
```
Becomes (new 4th param, default `false`):
```ts
const { error: memberError } = await addProjectMember(project.id, user.id, user.id, true);
```
`seedAndStartProgramme`'s own `project_members` upsert (for the Phase-1 starter, when they
weren't already a member) stays non-owner — a project only gets an owner via creation or an
explicit Super Admin transfer, not implicitly via starting Phase 1. If the Phase-1 starter is
also the project creator (the common case), they're already the owner from creation; this
upsert is a no-op for them either way (`ignoreDuplicates: true`).

## Implementation Steps

1. Write migration `074_project_members_owner.sql`.
2. Add `is_owner: boolean` to `project_members`'s `database.ts` types.
3. Update `canManageProjectMembers` signature in `membership-rules.ts`.
4. Add `getProjectMembership` (mirrors `getPhaseMembership`) and `transferProjectOwnership`
   (mirrors `transferPhaseOwnership`) to `phase-membership.ts`; give `addProjectMember` an
   optional `isOwner = false` parameter.
5. Update `onboarding/projects/route.ts`'s creator insert to pass `isOwner: true`.
6. Update `/api/projects/[projectId]/members/route.ts`: `POST`/`DELETE` now fetch the caller's
   own membership via `getProjectMembership` and pass it into `canManageProjectMembers`; add a
   `PATCH` handler for ownership transfer (mirrors the phase route's `PATCH`, target must
   already be a member).
7. Update `onboarding/[projectId]/page.tsx`: fetch `project_members` (with `profiles(full_name,
   role)`) server-side, compute the caller's own membership, pass both down alongside the
   existing `phase1Members`/`currentUserId` props.
8. Build `PersonPicker` in `_onboarding-detail.tsx` (props-based, per Code Context), replacing
   `AddPersonSelect` for the project-members section only (Phase 1's two role-filtered
   `AddPersonSelect`s stay as-is, per Out of Scope). Draws from the full `staffDirectory` (all
   roles) rather than the marketing/pm-filtered subset used for Phase 1's pickers.
9. Wire ownership display/transfer for project members in `AccessPanel` — same `onMakeOwner`
   crown-icon pattern already built for Phase 1 members (task 153), calling the new `PATCH`
   endpoint.
10. Remove the client-side `canManageProjMembers`/`canManagePhase1` gate on the initial
    `project_members`/`staffDirectory` fetch effect (task 153 gated the fetch behind the
    permission check, which is now circular — the permission check itself needs the fetched
    membership first). Fetch project members unconditionally for any authenticated viewer of
    the detail page (already broadly RLS-readable); keep `staffDirectory`'s fetch gated behind
    "does this user have any chance of managing something" as a minor optimization, not a
    security boundary (the API routes are the real enforcement).

## Acceptance Criteria

- [ ] A newly created project's creator shows as the project owner (crown icon) in `AccessPanel`.
- [ ] Super Admin can transfer project ownership to any current project member, including on a
      project with `programme_started_at` already set from before this task shipped.
- [ ] Super Admin can add a `developer` or `hr` user as a project collaborator; they were not
      addable before this task.
- [ ] An `admin`/`marketing`/`pm` user who is **not** a project member gets a 403 attempting to
      add another project member (via the API); once added as a member themselves, they can.
- [ ] The project-members "+ Add" control is a search input, not a `<select>` — typing filters
      the staff directory by name, clicking a result adds them immediately.
- [ ] Phase 1's "Add marketing agent"/"Add PM" controls are unchanged (still role-filtered
      `<select>`s, not search inputs).
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser: as Super Admin, open a project created before this session (zero
`project_members` rows), add yourself as a collaborator via the new search picker, then set
yourself as owner. Add a `developer`-role user as a collaborator and confirm they appear. Log in
as an `admin` user who isn't a member of some other project and confirm the API rejects an
add-member attempt (403) until they're added; confirm it succeeds once they are. Confirm task
154's avatar chips on the list page still show the owner alongside other members with no
changes needed there.

## Compatibility Touchpoints

- **New migration required** — `074_project_members_owner.sql`; user applies it, same as
  migration 073.
- Builds directly on task 153's tables/RLS (no new tables, no RLS policy changes — `is_owner` is
  just a new column on an existing permissively-read table).
- Task 154 (avatar chips) needs no changes — already reads all `project_members` rows
  regardless of `is_owner`.

## Implementation Notes

### What Changed
- Migration `074_project_members_owner.sql`: `is_owner boolean not null default false` on
  `project_members` + partial unique index (`where is_owner = true`) enforcing one owner per
  project — identical shape to `phase_members.is_owner` (task 153) and `contacts.is_primary`
  (task 151) before it.
- `canManageProjectMembers(role, isProjectMember)` tightened: `super_admin` always `true`;
  `admin`/`marketing`/`pm` now require `isProjectMember` too. `canManagePhase1Membership` is
  untouched, per the task doc's confirmed scope boundary.
- New `getProjectMembership`/`transferProjectOwnership` in `phase-membership.ts`, mirroring
  `getPhaseMembership`/`transferPhaseOwnership` exactly. `addProjectMember` gained an optional
  `isOwner = false` parameter.
- Project creator's `project_members` insert (`onboarding/projects/route.ts`) now passes
  `isOwner: true`. The Phase-1-starter's auto-membership upsert in `seed.ts` stays deliberately
  non-owner (a project only gets an owner via creation or an explicit transfer).
- `/api/projects/[projectId]/members/route.ts`: `POST`/`DELETE` now fetch the caller's own
  membership via `getProjectMembership` and pass it into the tightened
  `canManageProjectMembers`. New `PATCH` for ownership transfer — deliberately **super_admin-only**
  (not the same check as POST/DELETE), since the task doc specifically named Super Admin for
  this action, distinct from the broader add/remove-collaborator permission the other three
  roles get once they're members. `DELETE` blocks removing the current owner (409) same as the
  phase-members route's existing guard.
- `page.tsx` now fetches `project_members` server-side (mirroring the existing Phase 1 fetch)
  and passes it down as a new `projectMembers` prop — avoids the client-side chicken-and-egg
  problem where the tightened permission check needs to know membership before it can even
  decide whether to fetch anything.
- `_onboarding-detail.tsx`: unified `Phase1Member` → `MemberRow` type (now shared by both
  project and phase members, since both have `is_owner`). Project-members' `+ Add` control is
  now a search input + dropdown mirroring `_onboarding-wizard.tsx`'s `renderPersonPicker`
  pattern (type to filter by name across all non-client staff roles, click to add immediately,
  `onMouseDown` `preventDefault` so the click survives the input's `onBlur`) — Phase 1's two
  role-filtered `<select>`s are untouched. Project members' owner crown/"make owner" control
  only renders for `currentRole === "super_admin"`; add/remove stay gated by the tightened
  `canManageProjMembers`. Client-side `useEffect` no longer fetches `project_members` (now a
  server prop) — only `staffDirectory` is still fetched client-side.

### Files Changed
- `supabase/migrations/074_project_members_owner.sql` - new column + index
- `src/types/database.ts` - `is_owner` added to `project_members` types
- `src/lib/programme/membership-rules.ts` - tightened `canManageProjectMembers` signature
- `src/lib/programme/phase-membership.ts` - `getProjectMembership`, `transferProjectOwnership`,
  `addProjectMember` gained `isOwner` param
- `src/app/api/onboarding/projects/route.ts` - creator insert passes `isOwner: true`
- `src/lib/programme/seed.ts` - comment clarifying the Phase-1-starter's non-owner insert is
  deliberate (no behavior change — the column already defaulted to `false`)
- `src/app/api/projects/[projectId]/members/route.ts` - tightened `POST`/`DELETE`; new
  super_admin-only `PATCH` for ownership transfer
- `src/app/v2/(hub)/onboarding/[projectId]/page.tsx` - fetches `project_members` server-side
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` - `MemberRow` type unify,
  search-to-add picker for project members, ownership transfer wiring, tightened permission
  computation

### Deviations From Plan
- **Ownership transfer is super_admin-only**, not gated by the same `canManageProjectMembers`
  check used for add/remove. The task doc's Code Context sketched `transferProjectOwnership`
  as a plain mirror of `transferPhaseOwnership` without explicitly specifying its route-level
  permission check, and I initially wired it to the same `canManageProjectMembers` check as
  POST/DELETE (matching the phase-members route's pattern, where PATCH does share the same
  check as POST/DELETE). On review this was wrong for the *project* case: the task doc's
  Requirements section explicitly names only "Super Admin" for setting/transferring the project
  owner, unlike Phase 1's requirement 2 which explicitly includes the phase owner and assigned
  marketing agents too. Caught and fixed before finishing — transfer is now super_admin-only
  both server-side (403 for anyone else) and in the UI (the "make owner" control only renders
  for `currentRole === "super_admin"`).
- No other deviations.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual/browser verification - SKIPPED (no live dev/browser session run this task; this is a
  security-sensitive access-control feature building on task 153, which also hasn't been
  browser-verified yet — recommend testing all three together: apply migrations 073 and 074,
  then exercise project creation, ownership transfer, the new search-to-add picker, and the
  tightened admin/marketing/pm add-permission)

### Follow-Up (task 156, post-handoff, user-reviewed the live UI)

User reviewed the shipped `AccessPanel` UI (screenshot) and requested four changes, all applied
directly (not a new task doc — direct continuation of this still-`Testing`, unapproved work):

1. **Avatars beside the search box, not stacked above it.** `AccessPanel`'s project-members
   section now renders the `PersonChip` list and the search input in one `flex flex-wrap`
   row instead of two stacked blocks.
2. **Explicit close button.** `AccessPanel` gained an `onClose` prop + `X` button in its header,
   matching this codebase's established file/folder Permissions-panel close-button convention
   (tasks 141/144) — previously the only way to close it was re-clicking the toggle button.
3. **Phase 1 access management relocated into the Wizard itself.** Removed the Phase 1 section
   from `AccessPanel`/`_onboarding-detail.tsx` entirely — `AccessPanel` is now project-members
   only. Built a new `PhaseAccessPanel` component inside `_onboarding-wizard.tsx` (isDark-aware,
   mirroring that file's existing `renderPermissionsPanel` container shape), toggled via a new
   "Access" button next to the "Onboarding Wizard" title in the wizard's persistent header card
   — visible across all steps, not tied to any one step. `_onboarding-detail.tsx` still owns
   `phase1Members` state, the add/remove/transfer handlers, and (critically) the Wizard-entry
   restriction gate (`isPhase1Restricted`, task 153's requirement 4) — only the *management UI*
   moved; the data and mutation logic were passed down as new props
   (`canManagePhase1`/`phase1Members`/`phase1Busy`/`phase1Error`/`onAddPhase1Member`/
   `onRemovePhase1Member`/`onTransferPhaseOwnership`) rather than duplicated. `WizardMemberRow`
   is a local duplicate of `_onboarding-detail.tsx`'s `MemberRow` type (not imported) to avoid a
   circular import between the two files (`OnboardingDetail` imports `OnboardingWizard`), per
   this codebase's established page-scoped-UI convention of inlining small shared shapes rather
   than fighting import direction.
4. **Adding a phase member now also adds them as a project member.** `POST .../phases/
   [phaseNumber]/members` now calls `addProjectMember` (non-owner) right after `addPhaseMember`
   succeeds — anyone with Phase 1 access can now find the project on the Onboarding list too,
   same reasoning as the pre-existing Phase-1-starter auto-membership ensure in `seed.ts`.

Also removed two now-genuinely-unused things surfaced by this refactor (`currentUserId` was
threaded into `OnboardingWizardProps` speculatively but never actually needed — all phase-member
actions are gated by `m.is_owner`/`m.role` per-row, not by comparing to "who am I"; caught via
lint's `no-unused-vars` and removed from the interface/destructure/call site rather than left
as dead scaffolding).

- Files Changed: `_onboarding-detail.tsx` (AccessPanel simplified to project-members-only, close
  button, merged avatar/search row, phase1 handlers now passed to the Wizard instead of
  rendered locally), `_onboarding-wizard.tsx` (new `PhaseAccessPanel` + `WizardMemberRow` type,
  new props, "Access" toggle in the header card), `/api/projects/[projectId]/programme/
  phases/[phaseNumber]/members/route.ts` (auto-add-as-project-member on `POST`)
- Verification: `npx tsc --noEmit` - PASS; `pnpm lint` - PASS (fixed two `no-unused-vars`
  warnings surfaced mid-change — `PhaseAccessPanel`'s own unused `role` prop, and
  `OnboardingWizardProps`' unused `currentUserId`); manual browser re-verification still
  deferred to user

### Follow-Up 2 (task 157, post-handoff, user tested live)

User reported avatars still weren't visible and gave five more directives, all applied:

1. **Real bug: stale membership state.** Root cause of "I can't see the avatars" — adding a
   phase member inside the Wizard's `PhaseAccessPanel` (task 156) auto-inserts a
   `project_members` row server-side, but the Timeline page's `onBack` handler only called
   `fetchProgramme()`, never `refetchProjectMembers()`/`refetchPhase1Members()`. Fixed by adding
   both refetches to `onBack`.
2. **Real owner avatar, replacing the static "Owner: Bert" label.** That text was never
   connected to the membership system at all — `activePhase.owner` is a hardcoded per-phase
   config string (`customer-phases.ts`, "display label only, not a Hub user FK"). Now shows the
   real owner (`projectMembers.find(m => m.is_owner)`) as an `AvatarCircle`, falling back to
   `projects.created_by`'s profile name for legacy projects with no `is_owner` row yet
   ("default to the creator... if any"). Required threading `created_by`/`created_by_name`
   through `page.tsx` → `OnboardingDetail`'s `project` prop (new server-side lookup: only
   queries the creator's profile if they aren't already resolvable from `projectMembers`).
3. **"Collaborators: {avatars}" row**, next to Owner with `gap-x-5` spacing — new
   `CollaboratorAvatars` component (overlapping `AvatarCircle`s + `+N` overflow, same visual
   language as task 154's list-page avatar stack), fed by `projectMembers.filter(m =>
   !m.is_owner)`. Automatically includes phase-added members since task 156 already unions them
   into `project_members`.
4. **Gear icon replacing the "Access" text button**, `aria-label`/`title="Project Settings"`,
   opening a dropdown with two items — "Set Project Owner" and "Add Collaborators" — each
   opening its own panel. Split the merged `AccessPanel` into `OwnerPanel` (pick a new owner
   from existing collaborators via `<select>`, since a demote-then-promote transfer only makes
   sense among people who already have access) and `CollaboratorsPanel` (the existing
   search-to-add UI, unchanged). Both panels keep the explicit close button from Follow-Up 1.
5. **Permission model changed again** — user gave an explicit, flat role list this round with
   no "must already be a member" qualifier: "Set Project Owner" is now `super_admin`/`admin`/
   creator only (new `canSetProjectOwner`); "Add Collaborators" is `super_admin`/`admin`/`pm`/
   creator (updated `canManageProjectMembers` signature — `isProjectMember: boolean` →
   `isCreator: boolean`). **Flagging explicitly**: this drops `marketing` from "Add
   Collaborators" entirely, which had creator/collaborator rights in every earlier round of this
   feature (original requirement 6, and Follow-Up 1's `canManageProjectMembers`) — taken as the
   user's most recent, most explicit statement and implemented literally, but worth confirming
   this wasn't an oversight. `getProjectCreator()` added to resolve `created_by` server-side for
   the two API-route permission checks (which previously used `getProjectMembership`).
6. **Wizard step-indicator "cut" bug** (unrelated screenshot, same message) — the active step's
   `ring-4` glow was being clipped by the `overflow-x-auto` step row's own edge, since the row
   had no horizontal padding to give the ring room. Fixed with `px-1 -mx-1` (adds breathing room
   without shifting the row's visible left-alignment).
7. **Style consistency pass** — aligned the new gear button's classes exactly to the sibling
   "Jump to phase" button's established secondary-button convention in this same file
   (`rounded-lg`/`border-[#E2E8F0]`/`text-[#475569]`/`hover:border-[#CBD5E1]`, `p-2.5` instead
   of an arbitrary `p-[9px]`) rather than reusing the primary-CTA-button styling it initially
   borrowed from "Onboarding Wizard".

- Files Changed: `page.tsx` (created_by/created_by_name fetch), `_onboarding-detail.tsx`
  (AvatarCircle/CollaboratorAvatars/OwnerPanel/CollaboratorsPanel, gear+dropdown, onBack
  refetch fix), `_onboarding-wizard.tsx` (step-indicator ring-clip fix only — Phase 1's own
  Access button/panel from task 156 untouched this round), `membership-rules.ts`
  (`canSetProjectOwner` added, `canManageProjectMembers` signature changed), `phase-membership
  .ts` (`getProjectCreator` added), `/api/projects/[projectId]/members/route.ts` (permission
  checks switched to creator-based)
- Verification: `npx tsc --noEmit` - PASS; `pnpm lint` - PASS (fixed an unescaped-apostrophe
  error and an unused-import warning surfaced mid-change); manual browser re-verification still
  deferred to user

### Follow-Up 3 (task 157, live error report — real bug, first actual live-run data)

User's first live test surfaced a genuine runtime error: `PGRST201 — Could not embed because
more than one relationship was found for 'project_members' and 'profiles'`. Root cause: both
`project_members` and `phase_members` have **two** foreign keys into `profiles` — `user_id` and
`added_by` — so PostgREST can't infer which one a bare `profiles(full_name, role)` embed should
follow. This affected every query joining either table to `profiles`: both server-side fetches
in `page.tsx` (Phase 1 members, project members) and both `GET` handlers in `/api/projects/
[projectId]/members/route.ts` and `/api/projects/[projectId]/programme/phases/[phaseNumber]/
members/route.ts`.

Fixed by qualifying the embed with the explicit FK constraint name PostgREST's own error
message named (`profiles!project_members_user_id_fkey(...)` /
`profiles!phase_members_user_id_fkey(...)`) — Postgres's default `{table}_{column}_fkey` naming,
confirmed against the error's own `details` array rather than guessed. Every affected query now
explicitly follows `user_id` (the member's own profile), never `added_by` (who added them,
which was never surfaced in the UI and doesn't need to be). Searched the full codebase for any
other bare `profiles(...)` embed on these two tables to confirm none were missed.

- Files Changed: `page.tsx`, `/api/projects/[projectId]/members/route.ts`, `/api/projects/
  [projectId]/programme/phases/[phaseNumber]/members/route.ts` — all 4 affected `.select()`
  calls qualified with the explicit FK name
- Verification: `npx tsc --noEmit` - PASS; `pnpm lint` - PASS; this was a real error from the
  user's own live-run (not caught by tsc/lint, since it's a runtime Postgres/PostgREST error,
  not a type error) — recommend the user re-test the exact flow that produced the screenshot
  (adding a project collaborator) to confirm the fix resolves it

### Follow-Up 4 (task 157, layout polish on CollaboratorsPanel)

Two small layout fixes to `CollaboratorsPanel` (project-level "Add Collaborators" panel only —
`OwnerPanel` untouched, not mentioned by the user this round):

1. Search field moved above the collaborator chips (was inline in the same `flex-wrap` row as
   the chips, per Follow-Up 1's "avatars beside search" — that request applied to the old
   merged panel; this round's explicit instruction for the now-split `CollaboratorsPanel` is
   search-on-top, chips-below).
2. Panel container gained `mb-6` (was `mt-4` only) so it doesn't visually touch the progress-bar
   row that immediately follows it in `_onboarding-detail.tsx`'s render (that row has no margin
   of its own — the panel's own bottom margin is the only separation available).

- Files Changed: `_onboarding-detail.tsx` (`CollaboratorsPanel` only)
- Verification: `npx tsc --noEmit` - PASS; `pnpm lint` - PASS

## Final Status

Final task in a 3-task arc (153 → 154 → 155) — this doc absorbed 4 rounds of post-handoff live
feedback (Follow-Ups 1-4 above), two of which were substantial enough that they were informally
tracked as "task 156" (Phase 1 access UI relocated from the Timeline page into the Wizard,
Follow-Up 1) and "task 157" (real owner avatar/gear-icon settings menu/permission-model
refinement/wizard step-indicator fix, Follow-Up 2) in code comments — no separate task doc files
were ever created for those; everything landed here since it was all direct iteration on this
still-`Testing` work before approval, matching this session's established pattern (e.g. task
152's in-doc follow-up rounds).

Net permission model at completion (superseding everything stated in the original Requirements
section above):
- **List visibility** (`isRoleGatedByMembership`, task 153, unchanged): `marketing`/`pm` only
  see projects they're a member of; `admin`/`super_admin` see everything.
- **Add Collaborators**: `super_admin`/`admin`/`pm`, or the project creator (`canManageProjectMembers`,
  Follow-Up 2 — dropped `marketing` and the "must already be a member" precondition from this
  doc's original design).
- **Set Project Owner**: `super_admin`/`admin`, or the project creator (`canSetProjectOwner`,
  narrower than Add Collaborators — no `pm`).
- **Phase 1 membership** (`canManagePhase1Membership`, task 153, unchanged all session):
  `super_admin`/`admin` always; `marketing`/`pm` require existing Phase 1 membership.

One real bug surfaced and fixed during live testing (Follow-Up 3): `PGRST201` — PostgREST
couldn't disambiguate `profiles` embeds on `project_members`/`phase_members` (both tables have
two FKs into `profiles`: `user_id` and `added_by`). Fixed by qualifying every affected query
with the explicit FK name. This bug's root cause was schema from task 153, not this task, but
the fix landed here since that's where the live-testing session was.

**Status: Completed** (2026-07-15) — approved by user after 4 rounds of live testing/iteration.
