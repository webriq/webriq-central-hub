# 154: Onboarding List — Member Avatar Chips on Project Cards

**Created:** 2026-07-15
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Completed

---

## Overview

Follow-on to task 153 (currently `Testing`, not yet approved) — that task built the
`project_members`/`phase_members` membership model (who can see/access a project and Phase 1)
but added no visual representation of it anywhere. The user wants the Onboarding list's project
cards (`src/app/v2/(hub)/onboarding/_onboarding-list.tsx`) to show **who's been added**, as a
small stack of overlapping circular initials avatars with a `+N` overflow chip for anyone
beyond what fits — the reference screenshot shows 3 visible avatars ("RJ", "KL", "TM" in
different colors) plus a `+5` overflow chip.

This codebase already has the exact single-avatar building block needed:
`OwnerChip` (`src/app/v2/(hub)/projects/_pm-shared.tsx:212-225`) — a 28px circle, 2-letter
initials derived from `full_name.split(" ")`, deterministic background color from a 5-color
palette keyed by `name.charCodeAt(0) % colors.length`. This task reuses that exact
initials/color derivation logic (for visual consistency with the Projects module's own
assignee chips) but needs a **new**, smaller, overlapping-stack variant with `+N` overflow —
`OwnerChip` itself is a single non-overlapping chip with no stack/overflow behavior. Built
locally in `_onboarding-list.tsx` (page-scoped UI convention) rather than importing
`_pm-shared.tsx` cross-module, since Onboarding and the native Projects module (task 073) are
otherwise unrelated feature areas.

**Data source**: combine `project_members` + Phase 1 `phase_members` (deduped by `user_id`) —
"everyone with access to this project," project-level or Phase-1-specific alike. Not scoped to
phases 2-5 (they have no members yet per task 153's confirmed scope). A project with zero rows
in both tables (task 153's backward-compatibility case — unrestricted, no one specifically
added) shows no avatar stack at all, not an empty/placeholder chip.

## Requirements

- [ ] `GET /api/onboarding/projects` includes a `members: { id: string; full_name: string | null
      }[]` array per project — the deduped union of that project's `project_members` and Phase 1
      `phase_members` user ids, resolved to `profiles.full_name`.
- [ ] Each `ProjectCard` renders an avatar stack when `members.length > 0`: up to 3 overlapping
      circular initials chips (matching `OwnerChip`'s initials/color derivation), each with a
      white ring/border so overlap reads as separate people, plus a `+N` chip (same visual
      treatment, gray/neutral background) when `members.length > 3`.
- [ ] Zero members → no avatar stack rendered (not an empty circle or placeholder).
- [ ] Avatar stack sits in the card's bottom metadata row, alongside the existing classification
      tag (`item.classification`) — classification stays left-aligned, avatars right-aligned in
      the same row.
- [ ] Hovering an individual avatar shows the member's full name (native `title` attribute,
      matching `OwnerChip`'s existing pattern) — good enough for a first pass, no custom tooltip
      component needed.

## Out of Scope / Must-Not-Change

- Do not add avatars to phases 2-5 — they have no membership data (task 153's confirmed scope).
- Do not add click-to-manage-members from the card — that's the existing `AccessPanel` on the
  project detail page (task 153); this task is read-only display on the list.
- Do not change `OwnerChip` itself or any of its existing Projects-module call sites — this task
  adds a new, separate stack component, not a modification to the existing single-chip one.
- Do not touch the detail page's `AccessPanel` (task 153) — it already shows full member lists
  with names/roles; this task is purely about the list-page card summary view.
- Do not add avatars anywhere in `_onboarding-detail.tsx` beyond what task 153 already built —
  scoped strictly to the list page's cards.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/onboarding/projects/route.ts` | Modify | Add `members` array per project to the `GET` response |
| `src/app/v2/(hub)/onboarding/_onboarding-list.tsx` | Modify | Add `members` to `OnboardingProjectListItem`; new `AvatarStack` component; render in `ProjectCard`'s bottom row |

## Code Context

### Reference: `OwnerChip` (`_pm-shared.tsx:212-225`) — initials/color derivation to mirror

```tsx
export function OwnerChip({ name }: { name: string }) {
  const initials = name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["#2563EB", "#7C3AED", "#0D9488", "#DC2626", "#D97706"];
  const bg = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0" style={{ background: bg }} title={name}>
      {initials}
    </div>
  );
}
```

### `GET /api/onboarding/projects` (current, `route.ts` — already modified by task 153 with
`isRoleGatedByMembership` filtering; this task adds member data on top of that, after
`projectIds` is computed)

```ts
const projectIds = projects.map((p) => p.id);
const activePhaseByProject = new Map<string, number>();
if (projectIds.length > 0) {
  const { data: phases } = await supabase
    .from("customer_phases")
    .select("project_id, phase_number")
    .in("project_id", projectIds)
    .eq("status", "active");
  for (const row of phases ?? []) activePhaseByProject.set(row.project_id, row.phase_number);
}
```

Add, in the same `if (projectIds.length > 0)` block or a sibling one: fetch `project_members`
(`project_id, user_id`) and Phase 1 `phase_members` (`project_id, user_id`, `.eq("phase_number",
1)`) both `.in("project_id", projectIds)`, union+dedupe user ids per project into a
`Map<string, Set<string>>`, then one `profiles` lookup (`.in("id", allUniqueUserIds)`) for
`full_name`. Attach the resolved `{ id, full_name }[]` array to each item in the existing
`items.map(...)` below.

### `OnboardingProjectListItem` type + `ProjectCard`'s bottom row (`_onboarding-list.tsx:10-24,
87-89`)

```ts
export type OnboardingProjectListItem = {
  project_id: string;
  project_name: string;
  // ...unchanged fields...
  status: "draft" | "scheduled" | "in_progress";
};
```
Add `members: { id: string; full_name: string | null }[];`.

```tsx
{item.classification && (
  <div className="mt-2.5 pt-2.5 border-t border-slate-50 text-[11px] text-slate-400">{item.classification}</div>
)}
```
Becomes a flex row with the classification on the left and the new `AvatarStack` on the right
(only rendered when `item.members.length > 0`) — both inside the same `border-t` divider row.

## Implementation Steps

1. In `onboarding/projects/route.ts`, after `projectIds` is computed (post task-153's membership
   filter), add the `project_members` + Phase-1 `phase_members` union query, build the per-project
   `Map<string, { id: string; full_name: string | null }[]>`, attach to each item as `members`.
2. Add `members: { id: string; full_name: string | null }[]` to `OnboardingProjectListItem`.
3. Add a local `AvatarStack({ members }: { members: { id: string; full_name: string | null }[] })`
   component in `_onboarding-list.tsx`: renders up to 3 `w-6 h-6` circles (smaller than
   `OwnerChip`'s `w-7 h-7`, to fit compactly in the card's bottom row), each `-ml-2` after the
   first (overlap), `ring-2 ring-white`, same initials/color derivation as `OwnerChip` (fall back
   to "?" for a null `full_name`); if `members.length > 3`, append a 4th chip showing `+{n}`
   (`bg-slate-200 text-slate-600`) instead of a 4th real avatar.
4. Update `ProjectCard`'s bottom row to a `flex items-center justify-between` containing the
   existing classification `<div>` and, when `item.members.length > 0`, `<AvatarStack
   members={item.members} />`.

## Acceptance Criteria

- [ ] A project with 2 members shows 2 overlapping avatar chips with correct initials/colors.
- [ ] A project with 6 members shows 3 avatars + a `+3` overflow chip.
- [ ] A project with 0 members (task 153 backward-compatibility case) shows no avatar stack.
- [ ] Hovering an avatar shows the person's full name via the `title` attribute.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser: open `/v2/onboarding`, confirm cards for projects with project/phase members
(added via task 153's `AccessPanel`) show the avatar stack, cards with no members show none, and
a project with 4+ combined members shows the `+N` overflow chip with the correct count.

## Compatibility Touchpoints

- None — read-only additive change to one API response shape and one client component; no
  schema/migration change (reads task 153's already-created tables).

## Implementation Notes

### What Changed
- `GET /api/onboarding/projects` now fetches `project_members` + Phase 1 `phase_members` for
  all listed project ids in parallel, unions and dedupes user ids per project into a
  `Map<string, Set<string>>`, resolves `full_name` for the combined unique set of user ids with
  one `profiles` lookup, and attaches `members: { id, full_name }[]` to each returned item.
- `OnboardingProjectListItem` gained a `members` field; new `AvatarStack`/`initialsFor`/
  `colorFor` helpers added locally in `_onboarding-list.tsx`, mirroring `OwnerChip`'s exact
  initials (`split(" ").map(w => w[0])`) and color (`charCodeAt(0) % palette.length`)
  derivation for visual consistency with the Projects module's assignee chips, but as a
  smaller (`w-6 h-6` vs `w-7 h-7`) overlapping stack (`-ml-2` + `ring-2 ring-white` per chip)
  with a `+N` overflow chip beyond 3 visible avatars — behavior `OwnerChip` itself doesn't have.
- `ProjectCard`'s bottom metadata row changed from a classification-only `<div>` to a
  `flex items-center justify-between` row with classification on the left and `<AvatarStack>`
  on the right; the row only renders at all when there's a classification tag *or* at least one
  member (previously gated on classification alone), so a project with members but no
  classification still gets a row to show the avatars in.

### Files Changed
- `src/app/api/onboarding/projects/route.ts` - member data fetch + `members` field on each item
- `src/app/v2/(hub)/onboarding/_onboarding-list.tsx` - `AvatarStack` component, type field,
  `ProjectCard` bottom row layout

### Deviations From Plan
- None. Implementation matches the task doc's plan exactly — same data-source union, same
  `OwnerChip`-derived initials/color logic, same 3-visible-plus-overflow cap, same placement.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual/browser verification - SKIPPED (no live dev/browser session run this task; depends on
  task 153's tables/UI for creating test member data, and task 153 itself hasn't been
  browser-verified yet either — recommend testing both together)

## Final Status

Middle task in a 3-task arc (153 → 154 → 155) completed together after user live-testing across
several follow-up rounds (see task 155's Implementation Notes). No changes were needed in this
task's own files during those rounds — the `GET /api/onboarding/projects` member-union query and
`AvatarStack` component worked as originally implemented; all follow-up fixes (the `PGRST201`
FK-ambiguity bug, permission-model changes, UI relocation) landed in task 153's/155's files, not
here. Confirmed this task's query pattern (`.select("id, full_name")` directly on `profiles`,
not an embed through `project_members`/`phase_members`) was never subject to the `PGRST201`
ambiguity the other two tasks hit, since it queries `profiles` as a standalone top-level query
against a resolved id list, not a nested relationship embed.

**Status: Completed** (2026-07-15) — approved by user after live testing across tasks 153/154/155.
