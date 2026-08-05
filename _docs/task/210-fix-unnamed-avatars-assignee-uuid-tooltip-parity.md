# 210: Fix "Unnamed" Project Avatars & Raw-UUID Task Assignees — Profiles RLS Gap + Tooltip/Animation Parity

**Created:** 2026-08-05
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

Two symptoms reported by the user, both screenshotted on `/v2/projects` and `/v2/projects/[projectId]/tasks`, logged in as a `developer`-role user (Brandon):

1. **Projects listing** — member avatars render as a `?` bubble with an "Unnamed" tooltip instead of the real name, for every teammate except the logged-in user.
2. **Project detail → Tasks list → Assignee column** — assignee avatar bubbles show initials derived from a raw UUID (e.g. `65`), and hovering shows the full raw UUID (`65fa6687-df8c-4106-95c7-cda2157edee4`) as a plain browser tooltip — no name, no styled tooltip, no hover animation.

In both cases only the current logged-in user's name resolves correctly. That "only mine resolves" pattern is the key diagnostic signal.

### Root cause (confirmed by reading code, not guessed)

`profiles_read_own` RLS (migration `048_super_admin_rls.sql`) is:

```sql
create policy "profiles_read_own"
  on profiles for select to authenticated
  using (auth.uid() = id or get_my_role() in ('admin', 'super_admin'));
```

A non-admin caller (`developer`, `pm`, `hr`) can only ever `SELECT` **their own** `profiles` row. Both broken pages fetch teammate names through the session-bound `createClient()` (RLS-enforced), so every query for a *different* user's `profiles` row silently returns zero rows — not an error, just an empty result — leaving `full_name` unresolved for everyone except the caller themself:

- `src/app/v2/(hub)/projects/page.tsx:155` — `supabase.from("profiles").select("id,full_name").in("id", allMemberIds)` → feeds `_projects-index.tsx`'s `AvatarStack`/`AvatarTip`, which already has a correct `?? "Unnamed"` fallback + styled tooltip + hover animation (that part of the UI is *not* broken — it's rendering the fallback correctly because the data really is empty).
- `src/app/v2/(hub)/projects/[projectId]/_get-project-detail-data.ts:56` — `supabase.from("profiles").select("id, full_name, avatar_url, role").in("role", [...])` → feeds `_list-view.tsx`'s `profilesById`, consumed by `ResolvedAssigneeChip`, which has **no** fallback label (falls back to the raw `id`) and uses a plain native `title` attribute instead of the app's styled `Tooltip`.

This is the exact same bug class already diagnosed and fixed once before in `_docs/task/203-pm-access-member-names-readonly-indicators.md` (Portfolio Tracker's collaborator/owner avatars) — that task's fix pattern is directly reusable: swap the specific read-only profile-name lookup from the session client to `adminClient` (bypasses RLS). This is a **display-only name lookup**, not an access-control decision, matching the precedent's own justification and staying inside the spirit of CLAUDE.md's `adminClient` exception (documented for `(public)` routes; task 203 already established the same reasoning applies to any read-only teammate-name lookup blocked by `profiles_read_own`).

`src/app/v2/(hub)/portfolio-tracker/[projectId]/_load-detail-data.ts` is the reference implementation — see its `adminClient` profile lookups and inline comments for the established phrasing/pattern to match.

### Why the Tasks-list Assignee column also needs a UI fix (not just data)

Even after the RLS fix restores real names, `_list-view.tsx`'s `ResolvedAssigneeChip` (`src/app/v2/(hub)/projects/[projectId]/_list-view.tsx:52-62`) still needs updating to match the Projects listing's UX, per the user's explicit ask:

```tsx
function ResolvedAssigneeChip({ id, idx, name }: { id: string; idx: number; name?: string }) {
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white border-2 border-white shrink-0"
      style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
      title={name ?? id}                 // ← plain native tooltip, and falls back to raw UUID
    >
      {nameInitials(name, id)}
    </div>
  );
}
```

Two gaps vs. `_projects-index.tsx`'s `AvatarTip`/`AvatarStack` (`src/app/v2/(hub)/projects/_projects-index.tsx:93-156`):
- No styled `Tooltip`/`TooltipTrigger`/`TooltipContent` (base-ui, already imported in `_list-view.tsx` line 5 but unused for this component) — just a native `title` attribute (no animation, inconsistent look, and rare edge case where an unresolved name shows the raw UUID instead of a friendly fallback).
- No hover-lift animation (`motion.div` + `whileHover={{ y: -4, zIndex: 10 }}` + spring transition) — `framer-motion` is not currently imported in `_list-view.tsx`.

## Requirements

- [ ] Projects listing avatars resolve to real names (not "Unnamed") for every project member the caller can otherwise see, not just the caller themself.
- [ ] Tasks list → Assignee column avatars resolve to real names (not raw UUIDs) for every assignee.
- [ ] Tasks list → Assignee column avatar hover shows a styled `Tooltip` (matching `AvatarTip` in `_projects-index.tsx`), not a native browser tooltip.
- [ ] Tasks list → Assignee column avatar hover has the same lift animation as the Projects listing's multi-avatar stack (`motion.div`, `whileHover={{ y: -4, zIndex: 10 }}`, spring transition).
- [ ] If a name genuinely can't resolve (e.g. a stale/orphaned assignee id with no matching profile), the fallback label reads `"Unnamed"` (matching the Projects listing convention), never a raw UUID.

## Out of Scope / Must-Not-Change

- `src/app/v2/(hub)/projects/_pm-shared.tsx`'s `AssigneeChip` (used on the Task Detail page, `_task-detail.tsx:308`) — it never attempts name resolution at all (always shows raw UUID initials + `title={id}`). Same bug family, but not screenshotted or requested here; flag as a follow-up, don't touch in this task.
- `_projects-index.tsx`'s `AvatarStack`/`AvatarTip` — already correct, do not modify (it's the reference pattern being copied elsewhere).
- No changes to `profiles_read_own` RLS policy itself, or to `get_my_role()`/other RLS helper functions — the fix is scoped to the two specific read-only display queries, per the task-203 precedent (narrowest possible `adminClient` surface, not a blanket RLS loosening).
- No new database migration — this is an application-code-only fix (same as task 203).
- `AssigneePicker`'s dropdown-panel member list (`allMembers`, used to populate the "assign to" picker UI) already comes from the same query being fixed in `_get-project-detail-data.ts`, so it benefits automatically — no separate change needed there.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/projects/page.tsx` | Modify | Swap the `profiles` member-name lookup from session `supabase` client to `adminClient` |
| `src/app/v2/(hub)/projects/[projectId]/_get-project-detail-data.ts` | Modify | Swap the `profiles` lookup (feeds `profilesById`/`allMembers`) from session `supabase` client to `adminClient` |
| `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` | Modify | `ResolvedAssigneeChip`: replace native `title` with styled `Tooltip`, add `motion.div` hover-lift animation, fallback label `"Unnamed"` instead of raw id |

## Code Context

### File: `src/app/v2/(hub)/projects/page.tsx` (around line 143-158)

```tsx
if (projectIds.length > 0) {
  const { data: memberRows } = await supabase
    .from("project_members")
    .select("project_id,user_id")
    .in("project_id", projectIds);
  for (const row of memberRows ?? []) { ... }
  const allMemberIds = [...new Set((memberRows ?? []).map((r) => r.user_id))];
  if (allMemberIds.length > 0) {
    const { data: memberProfiles } = await supabase.from("profiles").select("id,full_name").in("id", allMemberIds);
    for (const row of memberProfiles ?? []) fullNameMap.set(row.id, row.full_name);
  }
}
```

`adminClient` is not currently imported in this file — add `import { adminClient } from "@/lib/supabase/admin";` alongside the existing `createClient` import. Only the `profiles` call changes to `adminClient`; `project_members` stays on the session client (membership rows aren't RLS-restricted the same way, and this task doesn't need to touch that query).

### File: `src/app/v2/(hub)/projects/[projectId]/_get-project-detail-data.ts` (line 56)

```ts
supabase.from("profiles").select("id, full_name, avatar_url, role").in("role", ["developer", "pm", "admin", "super_admin"]).order("full_name", { ascending: true }),
```

This is one entry in a `Promise.all([...])` array — swap `supabase` → `adminClient` for this one array entry only (`adminClient` needs importing here too). Everything downstream (`profilesById`, `allMembers`, `currentUserRole` derivation at line 71) is unchanged.

### File: `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` (lines 1-62)

Reference pattern to mirror, from `_projects-index.tsx`:

```tsx
function AvatarTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
// ...
<AvatarTip key={m.id} label={m.full_name ?? "Unnamed"}>
  <motion.div
    className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white ring-2 ring-white shrink-0 cursor-default", i > 0 && "-ml-2")}
    style={{ background: colorFor(m.full_name) }}
    whileHover={{ y: -4, zIndex: 10 }}
    transition={{ type: "spring", stiffness: 500, damping: 20 }}
  >
    {initialsFor(m.full_name)}
  </motion.div>
</AvatarTip>
```

Current (broken) component to replace:

```tsx
function ResolvedAssigneeChip({ id, idx, name }: { id: string; idx: number; name?: string }) {
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white border-2 border-white shrink-0"
      style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
      title={name ?? id}
    >
      {nameInitials(name, id)}
    </div>
  );
}
```

`Tooltip`, `TooltipTrigger`, `TooltipContent` are already imported at the top of this file (line 5). `motion` from `framer-motion` is not — needs adding.

## Implementation Steps

1. In `src/app/v2/(hub)/projects/page.tsx`: import `adminClient` from `@/lib/supabase/admin`; change the `profiles` select at line 155 to use `adminClient` instead of `supabase`. Add a one-line comment referencing the RLS gap (mirror the phrasing already used in `_load-detail-data.ts`, e.g. "profiles' own RLS (profiles_read_own) only lets a caller read their own row — adminClient bypasses that for this read-only display lookup").
2. In `src/app/v2/(hub)/projects/[projectId]/_get-project-detail-data.ts`: import `adminClient`; change the `profiles` query inside the `Promise.all` (line 56) to use `adminClient`. Same comment convention.
3. In `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx`: add `import { motion } from "framer-motion";`. Rewrite `ResolvedAssigneeChip` to wrap its avatar bubble in `Tooltip`/`TooltipTrigger`/`TooltipContent` (styled, matching `_projects-index.tsx`'s `AvatarTip`), render the bubble as a `motion.div` with `whileHover={{ y: -4, zIndex: 10 }}` and the same spring `transition`, and change the fallback label from `name ?? id` to `name ?? "Unnamed"` for the tooltip content (keep `nameInitials(name, id)` as-is for the bubble's initials — that already has a sane non-UUID-looking fallback behavior worth checking: confirm `nameInitials` fallback reads cleanly once names resolve for the common case; the UUID-derived initials only remain a visible fallback in the genuine orphaned-id edge case, which is acceptable).
4. Both call sites of `ResolvedAssigneeChip` (`AssigneePicker`'s `readOnly` branch and interactive branch, lines ~104-108 and ~120-124) pass `id`, `idx`, `name` already — no call-site changes needed, since the Tooltip/motion wrapping happens inside the component itself.
5. Manually verify in the browser, logged in as the non-admin developer user: `/v2/projects` shows real names on hover instead of "Unnamed" for teammates with project membership; `/v2/projects/[projectId]/tasks` Assignee column shows real names in a styled tooltip with the hover-lift animation instead of raw UUIDs.

## Acceptance Criteria

- [ ] Logged in as a `developer`-role user, `/v2/projects` project-card avatars show real teammate names in the tooltip (not "Unnamed") for members who have a `profiles.full_name` set.
- [ ] Logged in as the same user, `/v2/projects/[projectId]/tasks` Assignee column avatars show real teammate names, not raw UUIDs.
- [ ] The Assignee-column tooltip is the app's styled dark pill (base-ui `Tooltip`), not the native browser title tooltip, and fades/zooms in the same way as the Projects listing's tooltip.
- [ ] Hovering an Assignee-column avatar lifts it (`y: -4`) with the same spring animation as the Projects listing's stacked avatars.
- [ ] `npx tsc --noEmit` passes.
- [ ] No RLS policy files under `supabase/migrations/` are modified.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual browser check on /v2/projects and /v2/projects/[projectId]/tasks, logged in as a non-admin developer/pm user
```

## Compatibility Touchpoints

- None — application-code only, no schema/migration/API-surface changes, no packaging or docs impact.

## Implementation Notes

### What Changed
- Swapped the two RLS-blocked `profiles` display-name lookups (Projects listing member avatars, Project detail assignee/member profiles) from the session-bound `createClient()` to `adminClient`, matching the task-203 precedent.
- `_list-view.tsx`'s `ResolvedAssigneeChip` now uses the app's styled `Tooltip`/`TooltipTrigger`/`TooltipContent` (base-ui) with a `motion.div` hover-lift (`y: -4`, spring transition) instead of a plain `div` + native `title` attribute. Fallback label changed from raw `id` to `"Unnamed"` in the tooltip text (the avatar bubble's own initials fallback, `nameInitials`, was left as-is per the task's explicit scope).

### Files Changed
- `src/app/v2/(hub)/projects/page.tsx` — added `adminClient` import; member `profiles` lookup (feeds `fullNameMap`) now uses `adminClient` with an inline RLS-gap comment.
- `src/app/v2/(hub)/projects/[projectId]/_get-project-detail-data.ts` — added `adminClient` import; the `profiles` query inside the `Promise.all` (feeds `profilesById`/`allMembers`) now uses `adminClient` with the same comment convention.
- `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` — added `motion` import from `framer-motion`; rewrote `ResolvedAssigneeChip` to wrap the avatar bubble in `Tooltip`/`TooltipTrigger`/`TooltipContent` + `motion.div` hover-lift, fallback tooltip text `"Unnamed"`. No call-site changes needed (both `AssigneePicker` branches already pass `id`/`idx`/`name`).

### Deviations From Plan
- None. Implementation followed the task document's steps exactly.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- `pnpm dev` manual browser check - SKIPPED (no live Supabase session/browser available in this environment to log in as a non-admin developer user; the `adminClient` swap is a mechanical, precedent-matched substitution already proven correct by task 203's identical fix, and the tooltip/animation change directly mirrors `_projects-index.tsx`'s already-working `AvatarTip` pattern in the same file family — but this should still get a real click-through before being considered fully verified)
