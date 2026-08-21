# 291: PM Full Project Access — Remove PM from Membership-Gated Visibility on `/projects/v2` (Listing, Dashboard Widget, Phase 1 Wizard)

**Created:** 2026-08-21
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Testing

---

## Overview

PMs are treated as a **membership-gated** role (`GATED_ROLES` in `src/lib/programme/membership-rules.ts`, set by task 153) on the `/projects/v2` listing, the PM dashboard's project widgets (`GET /api/onboarding/projects`), and the Phase 1 Wizard panel. In practice this means: if a PM has an assigned task inside a project but is not an explicit `project_members` row for it (which task assignment alone does not create — see task 287's Out of Scope note, which explicitly flagged this as a known corollary left unfixed), that project is either silently excluded from every list/query the PM sees, or shown but rendered as a non-clickable card. The user-visible effect a PM reports is being unable to reach the project's detail page at all ("404 page not found" / project effectively missing) despite clearly having work assigned inside it.

This contradicts current product intent: **PMs have full view/manage access to every project, regardless of ownership or explicit membership** — the same unrestricted standing as `admin`/`super_admin`, not the narrower "member ∪ assigned-task" allow-list that was built for `developer` in task 284. `marketing` is unaffected and stays membership-gated — this task only changes `pm`.

The detail-page route loaders themselves (`_shared/_get-project-detail-data.ts`, `v2/[projectId]/_load-detail-data.ts`, `legacy/[projectId]/(tabs)/layout.tsx`, `projects-old/_project-access.ts`) already treat PM as unrestricted — confirmed by reading `isProjectVisibleToCurrentUser()`, which only restricts `role === "developer"`. The bug is entirely upstream, in the **listing/visibility gate** that decides which projects a PM ever sees or can click into, not in the detail page's own access check.

## Requirements

- [ ] PM is removed from `GATED_ROLES` in `src/lib/programme/membership-rules.ts` — `isRoleGatedByMembership("pm")` returns `false`, matching `admin`/`super_admin` treatment.
- [ ] `/projects/v2` listing (`_v2-listing/_load-list-data.ts`) no longer excludes any project from a PM's query results based on `project_members` rows.
- [ ] Every project card is clickable/openable for PM on `/projects/v2` (`_onboarding-list.tsx`'s `canOpenProject`), regardless of `item.members`.
- [ ] `GET /api/onboarding/projects` (feeds PM dashboard's "120-Day Programme" / project widgets) no longer filters projects out for PM based on `project_members` rows.
- [ ] Stale code comments describing pm as membership-gated (task 153-era) are corrected to reflect the new scope, so future readers don't reintroduce the gate for pm by mistake.
- [ ] `marketing`'s existing membership-gated behavior is completely unchanged (regression check).
- [ ] `developer`'s existing member-∪-assigned-task allow-list (task 284) is completely unchanged (regression check) — this task does not touch `getDeveloperAccessibleProjectIds` or any `role === "developer"` branch.

## Out of Scope / Must-Not-Change

- `legacy/[projectId]` and `/projects/legacy` listing (`_legacy-listing/`) — already unrestricted for pm today (confirmed: no `isRoleGatedByMembership`/membership check anywhere in `_legacy-listing/_load-list-data.ts` or its card components); nothing to fix there.
- Detail-page route loaders (`_shared/_get-project-detail-data.ts`, `v2/[projectId]/_load-detail-data.ts`, `projects-old/_project-access.ts`) — already correct for pm (unrestricted); do not add a membership check here, and do not touch `getDeveloperAccessibleProjectIds()` (developer-only, task 208/284).
- `canManageProjectMembers`, `canSetProjectOwner`, `canManagePhase1Membership` in `membership-rules.ts` — already correctly grant pm collaborator/ownership-management rights independent of `GATED_ROLES`; not part of this bug, leave untouched.
- `_onboarding-detail.tsx`'s Phase 1 Wizard access panel (`hasPhase1Access`, `isPhase1Restricted`, lines ~1026-1031) — reads `isRoleGatedByMembership(role)` directly, so it will automatically stop restricting pm once `membership-rules.ts` is fixed. This is the intended cascade, not a file this task edits directly — do not add a separate pm-specific carve-out there, and do not "fix" it by editing that file (editing the shared constant is sufficient and is the point of centralizing this logic).
- `canDeleteProjects` (pm already included) and `CREATE_ROLES` (pm already included) — unaffected, no change needed.
- Any change to what `marketing` can see/open — must stay membership-gated exactly as today.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/programme/membership-rules.ts` | Modify | Remove `"pm"` from `GATED_ROLES` (line 13); update the stale task-153 comment above it |
| `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` | Modify | Add `pm` to `roleEditable` (line 143) so `canOpenProject` returns `true` for pm unconditionally, mirroring the `role === "developer"` treatment; update the now-stale task-233 comment (lines 156-158) that documents pm as deliberately excluded from `roleEditable` |
| `src/app/(hub)/projects/_v2-listing/_load-list-data.ts` | Modify (comment only) | Update the task-153 comment (lines 70-77) — it currently says "marketing/pm only see projects they're a member of"; no logic change needed here since it consumes `isRoleGatedByMembership()` |
| `src/app/api/onboarding/projects/route.ts` | Modify (comment only) | Update the task-153 comment (lines 77-81) for the same reason; no logic change needed, same shared helper |

## Code Context

### File: `src/lib/programme/membership-rules.ts` (current, lines 6-21)

```ts
export type MembershipRole = "admin" | "hr" | "pm" | "developer" | "client" | "super_admin" | "marketing";

// Roles exempt from both project- and phase-level membership gating entirely.
const ALWAYS_ALLOWED_ROLES: MembershipRole[] = ["admin", "super_admin"];

// Roles the two gates actually apply to — everyone else (developer/hr/client) is untouched by
// this task, per the user's confirmed scope.
const GATED_ROLES: MembershipRole[] = ["marketing", "pm"];

export function isRoleExemptFromMembership(role: string | null): boolean {
  return !!role && (ALWAYS_ALLOWED_ROLES as string[]).includes(role);
}

export function isRoleGatedByMembership(role: string | null): boolean {
  return !!role && (GATED_ROLES as string[]).includes(role);
}
```

Change `GATED_ROLES` to `["marketing"]`. `isRoleGatedByMembership` and `isRoleExemptFromMembership` themselves need no change — this is the single source of truth both listing consumers (`_load-list-data.ts` and `GET /api/onboarding/projects`) import from (the latter via `phase-membership.ts`'s `export * from "./membership-rules"` re-export, confirmed at `src/lib/programme/phase-membership.ts:18`), so fixing it here propagates to both without touching either query file's logic.

### File: `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` (current, lines 143-159)

```ts
const roleEditable = role === "marketing" || role === "admin" || role === "super_admin";
// A gated role (pm/marketing) that's a project/Phase-1 member (item.members, task 154's
// deduped union) can open that specific project even without a role-wide editable grant —
// mirrors the detail route's own DETAIL_ROLES + membership gate (_load-detail-data.ts), which
// this list previously didn't account for at all (editable was role-only).
const canOpenProject = (item: OnboardingProjectListItem) =>
  roleEditable
  // Task 284 — developer: the listing query already restricts rows to projects the developer
  // is a member of or has an assigned task in (_load-list-data.ts), so any card that reaches
  // this list is safe to open; item.members alone (project_members + Phase 1 members only)
  // can't express the "assigned task" half of that rule client-side.
  || role === "developer"
  || (isRoleGatedByMembership(role) && !!currentUserId && item.members.some((m) => m.id === currentUserId));
// Task 233 — a separate capability from roleEditable above (different role set: pm can delete
// but isn't roleEditable; marketing is roleEditable but must not see Delete) and independent of
// project membership — deletion is a role capability, not a membership one.
const canDeleteProjects = role === "admin" || role === "pm" || role === "super_admin";
```

Add `role === "pm"` to `roleEditable`. Once `isRoleGatedByMembership("pm")` is `false` (from the `membership-rules.ts` change), the last `canOpenProject` branch never fires for pm anyway — pm needs the `roleEditable` grant to open cards at all, same as `marketing`/`admin`/`super_admin` today. The task-233 comment's premise ("pm can delete but isn't roleEditable") is no longer true after this change and must be corrected so a future reader doesn't "fix" `canDeleteProjects` to match a stale description.

Verify `_project-card.tsx`'s `editable` prop (fed by `canOpenProject(p)`) has no other consumer besides click-wrapper/hover styling before making this change — confirmed: `editable` only controls the `<div role="button">` vs plain `<div>` branch (lines ~126-138) and border/cursor classes (line 41); `canManageCollaborators`/`canSetOwner` are separate per-project props unaffected by this change.

## Implementation Steps

1. In `src/lib/programme/membership-rules.ts`, remove `"pm"` from `GATED_ROLES` and update the comment above it to note pm was moved out (task 291) and why (full unrestricted access, matching admin/super_admin), leaving `marketing` as the only gated role.
2. In `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx`, add `role === "pm"` to the `roleEditable` definition; update the task-233 comment on `canDeleteProjects` so it no longer claims pm is excluded from `roleEditable`.
3. Update the stale task-153 comments in `_v2-listing/_load-list-data.ts` (lines 70-77) and `src/app/api/onboarding/projects/route.ts` (lines 77-81) to say "marketing only" instead of "marketing/pm", noting the pm exemption was moved to `membership-rules.ts` (task 291). No logic changes in either file.
4. Run `npx tsc --noEmit` and `pnpm lint`.
5. Manually verify in-browser (see Verification) using a PM test account against a project where that PM has an assigned task but no `project_members` row.

## Acceptance Criteria

- [ ] As PM, a project with no `project_members` row for the PM, but with a task assigned to the PM inside it, appears in the `/projects/v2` listing and is clickable, landing on that project's Timeline tab without a 404.
- [ ] As PM, every tab of that project (Tasks, Issues, Milestones, Overview, Files, Access, Members, Status Report, Time Logs) loads normally — no `notFound()`.
- [ ] As PM, the PM dashboard's "120-Day Programme" project widget shows/links to that same project.
- [ ] As `marketing`, a project with a `project_members`/Phase-1-members row that does **not** include the marketing user is still excluded from the listing / still renders non-clickable — unchanged behavior (regression check).
- [ ] As `developer`, listing/click-through behavior is unchanged (still the member-∪-assigned-task allow-list from task 284) — regression check.
- [ ] `npx tsc --noEmit` passes clean.
- [ ] `pnpm lint` passes clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

No test runner configured — verification is type-check + lint + browser-based acceptance testing (`pnpm dev`) using a PM account and a project seeded with a PM-assigned task but no `project_members` row for that PM, plus the two regression checks above for `marketing` and `developer`.

## Compatibility Touchpoints

- No schema/migration changes.
- No route changes.
- No API contract changes (`GET /api/onboarding/projects`'s response shape is unchanged — only which rows survive the filter changes for the `pm` caller).

## Implementation Notes

### What Changed
- `pm` removed from `GATED_ROLES` in `membership-rules.ts` — `isRoleGatedByMembership("pm")` now returns `false`, so `pm` is fully unrestricted (matches `admin`/`super_admin`) everywhere that helper is consulted: the `/projects/v2` listing query, `GET /api/onboarding/projects` (PM dashboard widgets), and the Phase 1 Wizard access panel in `_onboarding-detail.tsx` (untouched file, correctly cascades via the shared helper as planned).
- `pm` added to `roleEditable` in `_onboarding-list.tsx`, so every project card is clickable for PM on `/projects/v2` regardless of `item.members` — mirrors the existing `role === "developer"` treatment.
- Two stale task-153-era comments (in `_load-list-data.ts` and `route.ts`) and one stale task-233 comment (in `_onboarding-list.tsx`, on `canDeleteProjects`) updated to stop describing `pm` as membership-gated / excluded from `roleEditable`.

### Files Changed
- `src/lib/programme/membership-rules.ts` — removed `"pm"` from `GATED_ROLES`; updated comment.
- `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` — added `role === "pm"` to `roleEditable`; corrected the now-stale task-233 comment on `canDeleteProjects`.
- `src/app/(hub)/projects/_v2-listing/_load-list-data.ts` — comment-only update (no logic change; consumes the shared helper).
- `src/app/api/onboarding/projects/route.ts` — comment-only update (no logic change; consumes the shared helper).

### Deviations From Plan
- None. All four planned file changes applied exactly as scoped; `_onboarding-detail.tsx` (Phase 1 Wizard) deliberately left untouched per the Out of Scope note — its `isRoleGatedByMembership(role)` read now resolves to unrestricted for `pm` automatically.

### Verification Run
- `npx tsc --noEmit` — PASS (no output/errors).
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`, not touched by this task).
- Browser-based acceptance testing (PM account against a non-member-but-assigned-task project) — SKIPPED (no seeded test account/project available in this session; recommend manual verification per the Acceptance Criteria before shipping).

## Quality Gate Notes

### Result
PASS

### Standards Review
- Diff is minimal and scoped to exactly the four planned files (confirmed via `git diff --stat` against the file list in Implementation Notes; the other uncommitted files in the working tree — `_shared/_issue-list-view.tsx`, `_shared/_list-view.tsx`, `_shared/_project-detail.tsx` — are pre-existing task 290 changes, untouched by this task).
- No unused code, no `any`, no new nesting — the change is a boolean-expression widening (`GATED_ROLES` array literal, `roleEditable` disjunction) plus comment corrections; no new logic branches introduced.
- Found one additional stale comment the implementation step missed: `_onboarding-list.tsx` line 144 ("A gated role (pm/marketing) that's a project/Phase-1 member...") still described `pm` as gated after the fix. Corrected in this pass to "A gated role (marketing, as of task 291 — pm moved into roleEditable above)..." for accuracy, consistent with the task's own requirement to correct task-153-era comments.
- Re-ran `npx tsc --noEmit` after the comment fix — clean, no output.
- Verified via `git diff` that `marketing`'s branches (`GATED_ROLES` still `["marketing"]`, `roleEditable`'s marketing clause, `canDeleteProjects` logic) and `developer`'s allow-list (`getDeveloperAccessibleProjectIds`, the `role === "developer"` branch in `canOpenProject`) are byte-for-byte unchanged — regression risk for those two roles is effectively zero for this diff.
- Verified `_onboarding-detail.tsx`, `canManageProjectMembers`/`canSetProjectOwner`/`canManagePhase1Membership`, and the legacy listing (`_legacy-listing/`) were not touched, matching Out of Scope.

### Deviations
- Minor: one stale comment (`_onboarding-list.tsx` line 144) that Implementation Notes didn't call out was corrected during this quality-gate pass. Does not change behavior or scope — documentation-only, consistent with the task's own comment-accuracy requirement.

### Required Fixes
- None.
