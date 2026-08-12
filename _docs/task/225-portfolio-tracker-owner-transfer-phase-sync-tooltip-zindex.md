# 225: Portfolio Tracker Owner Transfer Doesn't Sync Phase 1 Owner (Stale Assignee Everywhere) + Status Summary Tooltip Behind Drawer

**Created:** 2026-08-10
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

Two bugs reported together, both on the Portfolio Tracker module, screenshotted on `Trident Roof Solutions Website`:

**Bug A — stale owner/assignee.** The user set the Project Owner to "Dannea Moneva" via the project detail page's "Set Project Owner" panel (confirmed working: `Owner: Dannea Moneva` renders correctly there). But three other surfaces still show the *previous* owner, "Danessa" (`helpdesk@webriq.us`, Super Admin):
- Portfolio Tracker project listing card (member avatar stack tooltip)
- Status Report table (Assignee column)
- Status Summary drawer (Assignee stat block)

**Bug B — tooltip clipped behind the drawer.** On the Status Summary drawer, hovering the Assignee avatar renders its tooltip visually behind/under the drawer panel instead of on top of it.

### Root cause — Bug A (confirmed by reading code)

This app has **two independent "owner" records** that "mirror each other exactly" in shape but are never kept in sync (`_onboarding-detail.tsx:26-27`'s own comment):

- **`project_members.is_owner`** — the "Project Owner" shown on the project detail page. Set via the Settings → "Set Project Owner" panel, which calls `PATCH /api/projects/[projectId]/members` → `transferProjectOwnership()` (`src/lib/programme/phase-membership.ts:83-99`). This is the action the user actually used.
- **`phase_members.is_owner`** (scoped to `phase_number = 1`) — the "Phase 1 Owner." Set either when someone clicks "Start Onboarding" (`seedAndStartProgramme`, `src/lib/programme/seed.ts:80-87` — the *starter* becomes Phase 1 owner, deliberately *not* the project owner) or via a separate, Wizard-only "Transfer Phase Ownership" action (`handleTransferPhaseOwnership` in `_onboarding-detail.tsx:1229-1245` → `PATCH /api/projects/[projectId]/programme/phases/1/members` → `transferPhaseOwnership()`, `phase-membership.ts:121-141`).

`transferProjectOwnership()` only ever touches `project_members` — it never calls `transferPhaseOwnership()`. The three broken surfaces all read the **assignee exclusively from `phase_members`**, not `project_members`:

- `GET /api/onboarding/projects/status-report` (`src/app/api/onboarding/projects/status-report/route.ts:91,121-136`) — builds `assigneesByPhase` purely from `phase_members` rows. This route is shared verbatim by both the Status Report page **and** the Status Summary drawer (`?projectId=` scope, see that route's own task-223 comment at line 29-31), which is why both show the stale name identically.
- Portfolio Tracker listing (`GET /api/onboarding/projects`, `src/app/api/onboarding/projects/route.ts:104-125`) — the card's avatar stack is a *deduped union* of `project_members` **and** Phase-1 `phase_members` (task 154). Dannea appears (she's now in `project_members`) alongside Danessa (still in `phase_members` from the original "Start Onboarding" click) — both render, which reads as "it's still showing Danessa" even though the new owner is also present.

Since the project in the screenshots is already mid-programme (Day 6/120, Phase 1 active), `phase_members` for phase 1 already has real rows — this is the common case, not an edge case.

### Root cause — Bug B (confirmed by reading code)

`src/components/ui/tooltip.tsx`'s `TooltipContent` portals to `document.body` (`TooltipPrimitive.Portal`) but hardcodes `z-50` on both the `Positioner` and `Popup` (lines 48, 58). `StatusSummaryDrawer` (`_status-summary-drawer.tsx:86,95`) and the app's only other full-screen overlay, `notification-bell.tsx`, both use `z-[99999]`. Those are the only two non-default z-index values used anywhere in `src/app`/`src/components` (verified by grep). Because the drawer's z-index (99999) vastly exceeds the tooltip's (50), any `Tooltip` rendered from content living inside the drawer — here, the Assignee avatar in `_status-summary-phase-cards.tsx` (via the shared `AssigneeCell`, `_status-report-assignee-cell.tsx`) — paints underneath the drawer panel regardless of DOM order, since both are independently-portaled fixed-position elements and CSS stacking order follows `z-index`, not paint order, once both are positioned.

This is a shared primitive (`src/components/ui/tooltip.tsx`) used app-wide, so bumping its z-index fixes every tooltip inside every current/future `z-[99999]` overlay, not just this one call site.

## Requirements

- [ ] Transferring the Project Owner (`PATCH /api/projects/[projectId]/members`) also transfers Phase 1 ownership to the same user, when Phase 1 already has real membership (i.e., don't create the *first* `phase_members` row as a side effect — see Out of Scope).
- [ ] After a project-owner transfer, the Status Report table's Assignee column for Phase 1 shows the new owner, not the old one.
- [ ] After a project-owner transfer, the Status Summary drawer's Assignee stat block for Phase 1 shows the new owner, not the old one.
- [ ] After a project-owner transfer, the Portfolio Tracker listing card's avatar stack no longer includes the demoted former phase-1 owner unless they are still a legitimate collaborator through some other membership (i.e., the sync must actually reassign `is_owner`, not just add the new owner alongside the old one).
- [ ] `TooltipContent`'s z-index is raised above `99999` (the app's current highest overlay z-index) so tooltips are never visually clipped by the Status Summary drawer, the notification bell, or any future `z-[99999]` overlay.
- [ ] Hovering the Assignee avatar in the open Status Summary drawer shows the tooltip fully on top of the drawer panel.

## Out of Scope / Must-Not-Change

- The Wizard's standalone "Transfer Phase Ownership" action (`handleTransferPhaseOwnership`, `PATCH /api/projects/[projectId]/programme/phases/1/members`) stays as-is and remains independently usable (e.g., to hand Phase 1 work to someone other than the project owner without changing who owns the project overall).
- Task 153's "a phase with zero `phase_members` rows is unrestricted" backward-compat invariant must not be broken. If Phase 1 currently has **zero** members (project not yet started, or started by the cron auto-start path with no `startedByUserId`), do **not** create a Phase 1 membership row as a side effect of a project-owner transfer — that would flip a currently-unrestricted phase into a restricted one for every other marketing/pm caller. Only sync when Phase 1 already has ≥1 member.
- `seedAndStartProgramme`'s existing behavior (the "Start Onboarding" clicker becomes Phase 1 owner, not the project owner) is unchanged — this task only affects the *transfer* action, not initial seeding.
- No new database migration — `is_owner` already exists on both tables; this is an application-code sync fix.
- Phases 2-5 have no real `phase_members` usage today (confirmed via `seed.ts`'s own comment) — do not extend the sync to other phase numbers.
- No changes to `TooltipContent`'s positioning, arrow, or animation classes beyond the z-index values — purely a stacking-order fix.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/programme/phase-membership.ts` | Modify | Add a small `phase1HasMembers(projectId)` helper (or equivalent inline count check) for the route to consult before syncing |
| `src/app/api/projects/[projectId]/members/route.ts` | Modify | In the `PATCH` handler, after `transferProjectOwnership()` succeeds, conditionally add the target as a Phase 1 member and call `transferPhaseOwnership(projectId, 1, targetUserId)` |
| `src/components/ui/tooltip.tsx` | Modify | Raise `TooltipContent`'s `z-50` classes (Positioner, Popup, Arrow) to a value above `99999` |

## Code Context

### File: `src/lib/programme/phase-membership.ts` (existing, lines 81-99 — do not change this function's own body; add a sibling helper)

```ts
export async function transferProjectOwnership(projectId: string, targetUserId: string): Promise<{ error: string | null }> {
  const { error: demoteError } = await adminClient
    .from("project_members")
    .update({ is_owner: false })
    .eq("project_id", projectId)
    .eq("is_owner", true);
  if (demoteError) return { error: demoteError.message };

  const { error: promoteError } = await adminClient
    .from("project_members")
    .update({ is_owner: true })
    .eq("project_id", projectId)
    .eq("user_id", targetUserId);
  if (promoteError) return { error: promoteError.message };

  return { error: null };
}
```

Add a new exported helper near `getPhaseMembership` (around line 24-38) that the route can call to decide whether to sync:

```ts
// Task 225 — lets the project-owner-transfer route decide whether Phase 1 sync is safe (task
// 153's "zero members = unrestricted" invariant must not be broken by implicitly creating the
// first phase_members row as a side effect of transferring project ownership).
export async function phaseHasMembers(projectId: string, phaseNumber: number): Promise<boolean> {
  const { count } = await adminClient
    .from("phase_members")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("phase_number", phaseNumber);
  return !!count && count > 0;
}
```

`addPhaseMember` and `transferPhaseOwnership` already exist (lines 43-50, 121-141) and need no changes — the route will call them directly.

### File: `src/app/api/projects/[projectId]/members/route.ts` (PATCH handler, lines 146-217)

Current relevant excerpt:

```ts
const { error } = await transferProjectOwnership(projectId, targetUserId);
if (error) {
  console.error("PATCH /api/projects/[projectId]/members error:", error);
  return NextResponse.json({ error: "Failed to transfer ownership" }, { status: 500 });
}

// Notifications — ...
```

Insert the Phase 1 sync between the ownership-transfer success check and the notifications block:

```ts
const { error } = await transferProjectOwnership(projectId, targetUserId);
if (error) {
  console.error("PATCH /api/projects/[projectId]/members error:", error);
  return NextResponse.json({ error: "Failed to transfer ownership" }, { status: 500 });
}

// Task 225 — project_members.is_owner and phase_members.is_owner (phase 1) are separate
// records; Status Report / Status Summary drawer / Portfolio Tracker listing all read the
// assignee from phase_members, not project_members. Sync them so "Set Project Owner" is a
// single action from the user's perspective. Only when Phase 1 already has real membership —
// see phaseHasMembers's own comment for why an empty phase must stay untouched. Best-effort:
// don't fail the whole ownership transfer if this secondary sync errors.
if (await phaseHasMembers(projectId, 1)) {
  const { error: addErr } = await addPhaseMember(projectId, 1, targetUserId, user.id);
  if (addErr) console.error("PATCH /api/projects/[projectId]/members Phase 1 sync (add) error:", addErr);
  const { error: phaseTransferErr } = await transferPhaseOwnership(projectId, 1, targetUserId);
  if (phaseTransferErr) console.error("PATCH /api/projects/[projectId]/members Phase 1 sync (transfer) error:", phaseTransferErr);
}

// Notifications — ...
```

Add `addPhaseMember`, `transferPhaseOwnership`, `phaseHasMembers` to the existing import block at the top of the file (it already imports `canManageProjectMembers, canSetProjectOwner, addProjectMember, removeProjectMember, getProjectMembership, getProjectCreator, transferProjectOwnership` from `@/lib/programme/phase-membership` — extend that same import).

`addPhaseMember`'s `ignoreDuplicates: true` upsert (line 46-49) makes it safe to call even if the target is already a Phase 1 member.

### File: `src/components/ui/tooltip.tsx` (lines 42-68)

```tsx
return (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Positioner
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      className="isolate z-50"                 {/* ← raise */}
    >
      <TooltipPrimitive.Popup
        data-slot="tooltip-content"
        className={cn(
          "z-50 inline-flex w-fit max-w-xs ...", {/* ← raise the leading "z-50" */}
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 ..." />   {/* ← raise */}
      </TooltipPrimitive.Popup>
    </TooltipPrimitive.Positioner>
  </TooltipPrimitive.Portal>
)
```

Replace all three `z-50` occurrences with a value above the app's current max (`z-[99999]`, used by `_status-summary-drawer.tsx` and `notification-bell.tsx`) — e.g. `z-[100000]`. Grep confirmed no other z-index in `src/app`/`src/components` exceeds `99999`, so this is safe app-wide (tooltips should always render above whatever triggered them).

## Implementation Steps

1. In `src/lib/programme/phase-membership.ts`: add the `phaseHasMembers(projectId, phaseNumber)` helper described above, near `getPhaseMembership`. Export it.
2. In `src/app/api/projects/[projectId]/members/route.ts`: extend the existing `@/lib/programme/phase-membership` import to also bring in `addPhaseMember`, `transferPhaseOwnership`, `phaseHasMembers`. In the `PATCH` handler, right after the existing `transferProjectOwnership` error check (and before the notifications `try` block), add the conditional Phase 1 sync shown above.
3. In `src/components/ui/tooltip.tsx`: change the three `z-50` occurrences (Positioner's `className`, Popup's leading `z-50` in the `cn()` call, Arrow's `className`) to `z-[100000]`.
4. Manually verify in the browser (see Verification below): transfer project ownership on a project whose Phase 1 already has members, confirm Status Report/Status Summary/listing all pick up the new owner; open the Status Summary drawer and confirm the Assignee tooltip renders above the drawer panel.

## Acceptance Criteria

- [ ] On a project with an already-populated Phase 1 (`phase_members` has rows), using "Set Project Owner" on the project detail page updates both `project_members.is_owner` and `phase_members.is_owner` (phase 1) to the new owner.
- [ ] Status Report table's Assignee column for that project's Phase 1 row shows the new owner immediately after the transfer (page refresh/refetch).
- [ ] Status Summary drawer's Assignee stat block for Phase 1 shows the new owner immediately after the transfer.
- [ ] Portfolio Tracker listing card's avatar stack tooltip no longer shows the former owner as *the* phase-1 owner (they still legitimately appear as a demoted collaborator, per the final product decision — see Implementation Notes' Chat Follow-Up #1 — that's expected, not a bug).
- [ ] On a project whose Phase 1 has zero members, transferring project ownership does **not** create a `phase_members` row (verify no new row inserted) — the "unrestricted" invariant stays intact.
- [ ] Hovering the Assignee avatar inside the open Status Summary drawer shows the tooltip fully visible above the drawer panel, not clipped behind it.
- [ ] No regression to any other tooltip in the app (spot-check one outside the drawer, e.g. the Portfolio Tracker listing card's own avatar tooltip, still renders correctly).
- [ ] `npx tsc --noEmit` passes.
- [ ] No database migration added.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual browser check:
# 1. /v2/portfolio-tracker/[projectId] — use "Set Project Owner" on a project already in Phase 1
# 2. /v2/portfolio-tracker/status-report — confirm Assignee column updated for that project
# 3. Open that project's Status Summary drawer — confirm Assignee updated AND tooltip renders above the drawer
# 4. /v2/portfolio-tracker — confirm the listing card avatar stack reflects the new owner
```

## Compatibility Touchpoints

- None — application-code only, no schema/migration/API-surface changes, no packaging or docs impact. The `TooltipContent` z-index change is app-wide but strictly additive (raises stacking, doesn't change layout/behavior) and is validated safe by the grep showing no competing z-index above `99999` exists today.

## Implementation Notes

### What Changed
- Added `phaseHasMembers(projectId, phaseNumber)` to `phase-membership.ts` — a count-only check used to decide whether syncing Phase 1 ownership is safe (must not create the first `phase_members` row as a side effect, which would flip an "unrestricted" phase into a restricted one).
- `PATCH /api/projects/[projectId]/members` (project-owner transfer) now also syncs Phase 1 ownership to the same target user, but only when Phase 1 already has real membership — adds the target as a Phase 1 member (idempotent, `ignoreDuplicates`) then calls the existing `transferPhaseOwnership`. Best-effort: logs but doesn't fail the request if this secondary sync errors.
- Raised `TooltipContent`'s three `z-50` occurrences (Positioner, Popup, Arrow) to `z-[100000]` in the shared `tooltip.tsx` primitive, so tooltips always render above the app's `z-[99999]` overlays (Status Summary drawer, notification bell).

### Chat Follow-Up #1 (same session, post-Testing) — delete-on-transfer, then reverted
User reported that after the above fix, the *former* owner still lingered as a visible avatar/tooltip in the same three surfaces — root cause: `transferProjectOwnership`/`transferPhaseOwnership` only ever demoted the old owner (`is_owner: false`), never removed their membership row, so they remained a plain collaborator forever (most visibly the Phase-1 "Start Onboarding" auto-add from `seed.ts`, which is how a generic/ops account ends up owning Phase 1 in the first place). Clarified with the user via AskUserQuestion — first chosen behavior: remove the former owner's membership row entirely on transfer. Implemented (rewrote both functions to remove-then-promote, returning `{ error, previousOwnerId }`; PATCH route re-notified the removed former owner explicitly since they'd drop out of the post-transfer member query).

**Reverted in the same session** — user changed their mind: `git status`/`git checkout` not used; changes were hand-reverted. Final decision: **do not delete the member row on ownership transfer — keep the original demote-in-place behavior** (`is_owner: false`, row stays). Both `transferProjectOwnership` and `transferPhaseOwnership` are back to their original demote-then-promote bodies (plain `{ error: string | null }` return, no `previousOwnerId`), and `PATCH /api/projects/[projectId]/members`'s notification block is back to its original form (no `previousOwnerId` handling — the demoted former owner is still in `allMembers` and gets notified same as before). Net effect of this task, end to end: the *bug fix* (Phase 1 owner now syncs with Project owner on transfer) stands; the *former owner's avatar continuing to appear as a plain collaborator* is accepted, expected behavior, not something this task addresses.

### Additional Verification Run
- `npx tsc --noEmit` - PASS (same pre-existing, unrelated task-224 WIP errors in `_status-report-client.tsx` only).
- Targeted `eslint` on the 3 affected files (`phase-membership.ts`, `members/route.ts`, `phases/[phaseNumber]/members/route.ts`) - PASS.
- `pnpm dev` manual browser check - SKIPPED (same environment limitation as the initial pass).

### Files Changed
- `src/lib/programme/phase-membership.ts` — added `phaseHasMembers` export near `getPhaseMembership`.
- `src/app/api/projects/[projectId]/members/route.ts` — extended the `phase-membership` import (`addPhaseMember`, `transferPhaseOwnership`, `phaseHasMembers`); added the conditional Phase 1 sync block in `PATCH` right after `transferProjectOwnership` succeeds.
- `src/components/ui/tooltip.tsx` — `z-50` → `z-[100000]` on `Positioner`'s className, `Popup`'s className (leading token + the `kbd` variant), and `Arrow`'s className.

### Deviations From Plan
- None. Implementation followed the task document's steps exactly.

### Verification Run
- `npx tsc --noEmit` - PASS for all 3 changed files. The full run surfaces 3 pre-existing errors in `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-client.tsx` (`phaseFilter`/`setPhaseFilter` undefined) — that file was already modified/uncommitted before this task started (task 224 WIP, untouched by this task) and is unrelated to this change.
- `pnpm lint` (targeted eslint on the 3 changed files) - PASS, no warnings or errors.
- `pnpm dev` manual browser check - SKIPPED (no live Supabase session/browser available in this environment to log in and exercise the "Set Project Owner" flow, the Status Report/Status Summary views, or hover-test the drawer tooltip). The DB-write logic mirrors the existing, already-proven `transferPhaseOwnership`/`addPhaseMember` call pattern used elsewhere in this same route family (task 153/157), and the z-index change is a single-value bump validated safe by grep (no competing z-index above `99999` exists anywhere in the app) — but this should still get a real click-through before being considered fully verified.
