# 289: Render `profiles.avatar_url` Everywhere a User Avatar Is Shown, Fall Back to Initials When `NULL`

**Created:** 2026-08-21
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Testing

---

## Overview

`profiles.avatar_url` (migration `025_v2_schema.sql`) is almost never rendered today. A repo-wide audit for this task found exactly **one** call site that actually branches on it — `notification-bell.tsx` (renders `<img src={avatar_url}>` when set, initials pill otherwise). Every other place in the app that shows a user as a colored circle of initials either:

- never selects `avatar_url` from `profiles` in the first place, or
- selects/threads it through the type chain but the render function ignores it and always draws the initials circle.

This task closes that gap: everywhere a real Hub user (a `profiles` row) is shown as an avatar, render their photo when `avatar_url` is non-`NULL`, and keep the exact current initials-circle behavior as the fallback when it's `NULL`. This is a pure display change — no schema change, no new component abstraction (this codebase already duplicates small avatar-render snippets per page per `CLAUDE.md`'s "page-scoped UI" convention; this task follows that same pattern rather than introducing a new shared `<UserAvatar>` component).

This task is independent of task 288 ("Import Zoho User Profile Photos into `profiles.avatar_url`") — 288 is what will *populate* the column; this task is what makes the UI *use* it once populated. Order doesn't matter: today `avatar_url` is `NULL` for everyone, so shipping this task alone is a no-op visually until 288 (or manual profile edits, or a future self-serve upload) populates real URLs — at which point every site below picks the photo up with no further change.

**Reference pattern to replicate exactly** (already shipped, don't change): `src/app/(hub)/_components/notification-bell.tsx:58-69`
```tsx
if (actorName) {
  if (notification.actor?.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element -- external Supabase-auth-provider avatar URL, not a static/optimizable asset
    return <img src={notification.actor.avatar_url} alt={actorName} className="w-9 h-9 rounded-full object-cover shrink-0" />;
  }
  return (
    <span className={`flex items-center justify-center w-9 h-9 rounded-full shrink-0 text-white text-[12px] font-semibold ${colorForName(actorName)}`}>
      {initialsForName(actorName)}
    </span>
  );
}
```
Every fix below is the same shape: `avatarUrl ? <img className="<same size classes as the existing circle> rounded-full object-cover" src={avatarUrl} alt={name} /> : <existing initials element, unchanged>`. Always keep the existing `rounded-full` sizing/border classes on the `<img>` so it matches the initials circle it replaces pixel-for-pixel. Use the `// eslint-disable-next-line @next/next/no-img-element` comment above every new `<img>`, matching the existing convention (these are external Supabase Storage URLs, not static assets `next/image` can optimize).

## Requirements

- [ ] Every avatar render site listed under **Proposed File Changes** shows the user's photo (`<img>`, `object-cover`, same footprint as the current initials circle) when `avatar_url` is a non-empty string, and falls back to the exact current initials markup/colors when it is `null`/`undefined`.
- [ ] Every avatar render site's upstream data query is extended to select `avatar_url` alongside `full_name` where it isn't already selected (several sites listed below currently don't fetch it at all).
- [ ] Every type/interface carrying a user-avatar-eligible member (`MemberProfile`, `MemberRow`/`RawMemberRow`, `HubUser`, `PhaseAssigneeMember`, the `AssigneeChip`/`AvatarStack`/`AvatarCircle`/`Avatar` component prop shapes) gains an `avatar_url`/`avatarUrl` field.
- [ ] No visual regression for users with `avatar_url = null` — output must be byte-identical to current initials rendering (same colors, same sizing, same tooltip/title text).

## Out of Scope / Must-Not-Change

- **`profiles.avatar_url` population** — that's task 288 (Zoho photo import) and any future self-serve upload flow. This task only ever *reads* the column.
- **`OwnerChip`** (`src/app/(hub)/projects-old/_pm-shared.tsx:307-320`) — used for comment authors and time-log entry owners (`<OwnerChip name={c.author_name} />`, `<OwnerChip name={entry.display_name} />` across 12 call sites in `_task-comments.tsx`/`_issue-comments.tsx`/`_task-time-logs.tsx`/`_issue-time-logs.tsx`, legacy+v2+projects-old). Its only prop is a free-text `name: string` — there is no resolved `profiles.id` in scope at any of those call sites (comments/time-log entries are Zoho-imported with `author_name`/`display_name` text fields, not a guaranteed live `profiles` FK). Wiring avatars here would require first joining comments/time-logs to `profiles` by author id, which is a separate, larger data-layer investigation — flagging as a follow-up, not doing it in this task.
- **`_checklist-tab.tsx`'s `initialsFor(config.owner)`** (`onboarding-workspace`) — `owner` is a static role-label string (e.g. "PM", "Client"), not a `profiles.id` reference. No avatar to fetch.
- **`pm-dashboard.tsx`'s `initialsFor(p.company_name)`** — customer/company initials, not a user avatar. `customers`/`projects` have no `avatar_url` column.
- **`projects-old/[projectId]/_list-view.tsx`, `_issue-list-view.tsx`, `_project-detail.tsx`** (the page-level files, not `_pm-shared.tsx` which is a still-live shared utility module imported by the current `/projects/legacy` and `/projects/v2` routes) — these look superseded by `src/app/(hub)/projects/_shared/` per the "Revamped projects tab" commit and `CLAUDE.md`'s route table, which lists only `projects/legacy` and `projects/v2`, not `projects-old/[projectId]`. Confirm with the user before touching these; if `/projects-old/[id]` is still reachable, extend this task, otherwise leave as dead weight for a future cleanup.
- **`HubHeader`** (`src/components/hub/hub-header.tsx`) — only imported by `src/app/_hub_(OLD)/layout.tsx`, which is dead code (the `(OLD)` folder is excluded from routing per the project's own naming convention, and the live shell is `V2HubShell`/`V2HubSidebar`). Not rendered anywhere reachable — skip.
- No change to the Supabase Storage bucket, RLS policies, or `profiles` schema.

## Proposed File Changes

### Cluster A — Current-user avatar (Hub sidebar)
| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/layout.tsx` | Modify | Add `avatar_url` to the `profiles` select (currently `"role, full_name"`); pass `avatarUrl` prop to `V2HubShell` |
| `src/app/(hub)/_components/v2-hub-shell.tsx` | Modify | Accept `avatarUrl: string \| null` prop, forward to `V2HubSidebar` |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Accept `avatarUrl` prop; render `<img>` instead of the `getInitials(displayName)` div (line ~339) when set |

### Cluster B — Admin Users list
| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/v2/users/route.ts` | Modify | Add `avatar_url` to the `profiles` select at line 30 (currently `"id, role, full_name, otp_locked_until"`) |
| `src/app/(hub)/dashboard/users/page.tsx` | Modify | Add `avatar_url` to the `HubUser` interface; render photo in the row avatar circle (~line 132) instead of always showing `getInitials(user)` |

### Cluster C — Task/Issue assignee avatars (legacy + v2 shared views)
| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects-old/_pm-shared.tsx` | Modify | `AssigneeChip` (line 382) — accept optional `avatarUrl?: string` prop; render `<img>` instead of the `motion.div` initials when set |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/page.tsx` | Modify | Add `avatar_url` to the `assigneeProfiles` select (line 50, currently `"id, full_name"`) |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/page.tsx` | Modify | Same select fix (v2 mirror) |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | `assigneeProfiles` prop type gains `avatar_url`; build an `avatarUrlById` lookup alongside the existing `assigneeNamesById` map (line 84); pass `avatarUrl={...}` into `<AssigneeChip>` (line 339) |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Same (v2 mirror, same line numbers) |
| `src/app/(hub)/projects/_shared/_list-view.tsx` | Modify | `MemberProfile` already has `avatar_url` (line 37) — wire the two assignee-circle render sites (lines ~61, ~168) to show `<img>` when set |
| `src/app/(hub)/projects/_shared/_issue-list-view.tsx` | Modify | Same — `MemberProfile` already has `avatar_url` (line 30); wire the two render sites (lines ~86, ~127) |

### Cluster D — Project member avatars (listing cards, Members tab, onboarding workspace)
| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_v2-listing/_load-list-data.ts` | Modify | Add `avatar_url` to the `profiles` select at line 189 (currently `"id, full_name"`); carry it into the `members` array built at line 218 |
| `src/app/(hub)/projects/_v2-listing/_avatar-stack.tsx` | Modify | `MemberProfile`/member param type gains `avatar_url`; `AvatarStack`/`AvatarTip` render (lines ~44-67) shows `<img>` when set |
| `src/app/(hub)/projects/_legacy-listing/_load-list-data.ts` | Modify | Investigate this file's member-profile query (no `"id, full_name"` literal found — confirm actual select shape) and add `avatar_url` alongside whatever it currently selects |
| `src/app/(hub)/projects/_legacy-listing/_project-card-shared.tsx` | Modify | Same `AvatarStack`/`AvatarTip` pattern as `_v2-listing/_avatar-stack.tsx` (lines ~41-82) |
| `src/app/(hub)/projects/v2/[projectId]/_onboarding-detail.tsx` | Modify | `AvatarCircle` component (line 884) — accept optional `avatarUrl`; find and extend the query feeding its `m` member objects (lines ~910, ~927) to include `avatar_url` |
| `src/components/projects/member-types.ts` | Modify | Add `avatar_url: string \| null` to `MemberRow` and to `RawMemberRow.profiles`; set it in `mapMembers()` |
| `src/app/api/v2/projects/[projectId]/members/route.ts` | Verify only | Already selects `avatar_url` (line 19) — no change needed, just confirm it flows through `mapMembers` once `member-types.ts` is updated |
| `src/app/api/projects/[projectId]/members/route.ts` | Modify | Add `avatar_url` to the `profiles!project_members_user_id_fkey(...)` select at line 47 (currently `full_name, role`) |
| `src/app/(hub)/projects/_shared/_members-tab.tsx` | Modify | `initialsFor`/`colorFor(m.full_name)` render (~line 145-147) — show `<img>` when `m.avatar_url` is set |

### Cluster E — Status Report assignee avatars
| File | Action | Purpose |
|------|--------|---------|
| `src/lib/programme/status-report.ts` | Modify | `PhaseAssigneeMember` type (line 61) gains `avatarUrl: string \| null`; locate and extend whatever query builds the values passed in as `inputs.assigneesByPhase` (consumed at line 190) to select `avatar_url` |
| `src/app/(hub)/projects/v2/status-report/_status-report-assignee-cell.tsx` | Modify | Render (~lines 46-56) shows `<img>` when `m.avatarUrl` is set instead of always drawing `initialsFor(m.fullName)` |

### Cluster F — Dev Time Logs table (lower confidence — investigate first)
| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/dashboard/_components/dashboard-shared.tsx` | Modify | `Avatar` component (line 161) — accept optional `avatarUrl` prop; render `<img>` when set |
| `src/app/(hub)/dashboard/timelogs/_time-logs-table.tsx` | Investigate, then modify if feasible | `<Avatar initials={initialsOf(group.name)} .../>` at line 485 is grouped by `entry.employee_id` (an `hr.employees` id, per `_time-logs-shared.ts:167`), not directly a `profiles.id`. Before wiring this one, confirm whether `hr.employees` has a resolvable FK to `profiles.id` in the existing query. If yes, join it and pass `avatarUrl`. If no clean link exists, leave this site initials-only (current behavior, not a regression) and note it as a follow-up in Implementation Notes — do not invent a new join. |

## Code Context

### `src/app/(hub)/layout.tsx` (current profile select — Cluster A)
```ts
const { data: profile } = await supabase
  .from("profiles")
  .select("role, full_name")
  .eq("id", userId)
  .single();

if (profile) {
  userRole = profile.role;
  userDisplayName = profile.full_name;
}
// ...
<V2HubShell userRole={userRole} displayName={userDisplayName}>
```
Add `avatar_url` to the select, capture `userAvatarUrl`, add it to `V2HubShellProps`/`V2HubSidebarProps`, and use it at the existing initials-div site in `v2-hub-sidebar.tsx`:
```tsx
<div
  className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold text-white"
  style={{ background: "linear-gradient(135deg, #2563EB, #1D4ED8)" }}
>
  {initials}
</div>
```

### `src/app/(hub)/projects-old/_pm-shared.tsx:382-397` (`AssigneeChip` — Cluster C)
```tsx
export function AssigneeChip({ id, idx, name }: { id: string; idx: number; name?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <motion.div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white border-2 border-white shrink-0 cursor-default"
            style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
            whileHover={{ y: -4, zIndex: 10 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
          >
            {nameInitials(name, id)}
          </motion.div>
        }
      />
      <TooltipContent side="top">{name ?? "Unnamed"}</TooltipContent>
    </Tooltip>
  );
}
```
Add `avatarUrl?: string` to the prop type; when set, render an `<img className="w-6 h-6 rounded-full object-cover border-2 border-white shrink-0" src={avatarUrl} alt={name ?? "Unnamed"} />` inside the same `motion.div` wrapper (keep the `motion.div`'s hover/tooltip behavior — only swap the inner content, same as `notification-bell.tsx` swaps its inner `<span>`/`<img>`).

### `src/app/(hub)/projects/_shared/_list-view.tsx:37,61,168` (`MemberProfile` already has `avatar_url` — Cluster C)
```ts
type MemberProfile = { id: string; full_name: string | null; avatar_url: string | null };
// ...
<div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white border-2 border-white shrink-0 cursor-default" ...>
  {initials}
</div>
```
Type is already correct end-to-end (via `_get-project-detail-data.ts`'s `profilesById`/`allMembers`, both already select `avatar_url`). This is purely a render-branch fix, no data-layer change needed for this file.

### `src/components/projects/member-types.ts` (full file — Cluster D)
```ts
export type MemberRow = { id: string; user_id: string; is_owner: boolean; full_name: string | null; role: string | null };
export type RawMemberRow = { id: string; user_id: string; is_owner: boolean; profiles: { full_name: string | null; role: string } | null };

export function mapMembers(raw: RawMemberRow[]): MemberRow[] {
  return raw.map((m) => ({
    id: m.id,
    user_id: m.user_id,
    is_owner: m.is_owner,
    full_name: m.profiles?.full_name ?? null,
    role: m.profiles?.role ?? null,
  }));
}
```
Add `avatar_url: string | null` to both types and to the mapper's return. This is consumed by `_members-tab.tsx` (avatar render, in scope) and by `manage-collaborators-modal.tsx`/`set-project-owner-modal.tsx` (checked during research — neither currently renders an avatar circle for members, so the type change is a no-op there, just keeps the shared type consistent).

## Implementation Steps

1. **Cluster A first** (current-user sidebar avatar) — smallest, self-contained, good smoke test for the `<img>`/fallback pattern: `layout.tsx` → `v2-hub-shell.tsx` → `v2-hub-sidebar.tsx`.
2. **Cluster C** (task/issue assignees) — highest-traffic surface. Do `_pm-shared.tsx`'s `AssigneeChip` and the two `_shared/` list views first (`_list-view.tsx`, `_issue-list-view.tsx` — data already flows, render-only fix), then the 3 `_task-detail.tsx` files + their 3 `page.tsx` select fixes.
3. **Cluster B** (admin users list) — independent, small.
4. **Cluster D** (project member avatars — listing cards, Members tab, onboarding workspace). Start with `member-types.ts` + the already-avatar_url-selecting v2 members route, then `_members-tab.tsx`; investigate `_legacy-listing/_load-list-data.ts`'s actual current select shape before editing it (the grep used to scope this task didn't find the expected literal — read the file directly first).
5. **Cluster E** (status report) — trace `inputs.assigneesByPhase`'s caller (not yet located in this task's research) to find the actual DB query building `PhaseAssigneeMember[]`, extend its select, then wire the render.
6. **Cluster F** (time logs) — investigate the `hr.employees` ↔ `profiles` relationship first; only implement if a clean FK/join exists, otherwise document as a follow-up and leave as-is.
7. After each cluster, spot-check in the browser with a test user that has `avatar_url` manually set (e.g. `UPDATE profiles SET avatar_url = '<any public image URL>' WHERE id = '<your id>'` against a local/dev Supabase) to confirm the photo renders, then clear it back to `NULL` and confirm the initials fallback is pixel-identical to before this task.

## Acceptance Criteria

- [ ] With `avatar_url` set on a profile, that user's photo renders (not initials) at every site listed in Clusters A–E (F is best-effort, see above).
- [ ] With `avatar_url = null`, every site renders exactly the same initials markup/colors/sizing as before this task (no regression).
- [ ] `npx tsc --noEmit` passes — all touched type definitions (`MemberProfile`, `MemberRow`/`RawMemberRow`, `HubUser`, `PhaseAssigneeMember`, component props) compile cleanly.
- [ ] No new `next/image` usage introduced without the existing `no-img-element` eslint-disable comment pattern already used in `notification-bell.tsx` — stay consistent with that file's approach (`<img>` + disable comment), don't mix in `next/image` for some sites and plain `<img>` for others.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser verification (per project convention — no test runner configured):
- Set `avatar_url` on your own profile row directly in Supabase, then check: Hub sidebar avatar (Cluster A), Admin → Users list row (Cluster B), assign yourself to a task/issue and check the assignee chip on the list view and the detail page (Cluster C), add yourself as a project member and check the listing card avatar stack + Members tab (Cluster D), check the Status Report tab's assignee avatars (Cluster E).
- Clear `avatar_url` back to `NULL` and re-check every site above shows the original initials circle with no visual diff.

## Compatibility Touchpoints

- No packaging/docs/adapter changes.
- No migration required — `avatar_url` column already exists (migration 025).
- Depends on nothing from task 288; can ship before, after, or independently of it. Once 288 lands and starts populating real photo URLs, every site fixed here picks them up automatically with no further change.

## Open Questions For Implementer

- Confirm whether `/projects-old/[projectId]` is still a reachable route before deciding whether to also patch its `_list-view.tsx`/`_issue-list-view.tsx`/`_project-detail.tsx` duplicates (see Out of Scope).
- Locate the actual caller/query that builds `inputs.assigneesByPhase` for Cluster E — not found during this task's research pass, needed before that cluster can be implemented.
- Confirm `hr.employees`'s relationship (if any) to `profiles.id` before attempting Cluster F.

## Implementation Notes

### What Changed
- Every cluster (A–F) was implemented, including Cluster F, which turned out feasible: `time_logs.employee_id` FKs `auth.users(id)` directly (confirmed via the route's own header comment and via `hr.employees.profile_id → profiles.id` in migration 026's RLS policies), not `hr.employees.id` as the task doc speculated — no HR-schema join was actually needed.
- Cluster A: `layout.tsx` now selects `avatar_url` and threads it through `V2HubShell` → `V2HubSidebar`, which renders the user's photo in the sidebar user card when set.
- Cluster B: `/api/v2/users` selects `avatar_url`; `dashboard/users/page.tsx`'s `HubUser` type and row render updated.
- Cluster C: `AssigneeChip` (`_pm-shared.tsx`) and `ResolvedAssigneeChip` (`_shared/_list-view.tsx`) both accept an optional `avatarUrl`/render an `<img>` inside the same `motion.div` wrapper (hover/tooltip behavior untouched). Both `tasks/[taskId]/page.tsx` files (legacy + v2) now select `avatar_url` alongside `full_name`; both `_task-detail.tsx` files build an `assigneeAvatarUrlById` map alongside the existing `assigneeNamesById` map. `_shared/_issue-list-view.tsx`'s assignee display is name-string-based (`issue.assignee_name`, no resolved `assignee_id` in this component) — resolved the avatar by matching `issue.assignee_name` against the already-available `allMembers` list (no new query needed).
- Cluster D — the biggest cluster: `_v2-listing/_load-list-data.ts` and `_legacy-listing/_load-list-data.ts` (the latter's existing select used `id,full_name` with no space, which is why the initial task-doc grep missed it — found and fixed during implementation) both now select and carry `avatar_url` into their `members` arrays; `OnboardingProjectListItem`/`ProjectListItem` types updated to match. `_v2-listing/_avatar-stack.tsx` and `_legacy-listing/_project-card-shared.tsx`'s `AvatarStack`/`AvatarTip` both render photos (the legacy version's `fallbackName`-only owner bubble stays initials-only — it has no id/avatar_url source, matches the task doc's OwnerChip-style out-of-scope reasoning). `_onboarding-detail.tsx`'s `AvatarCircle` gained an `avatarUrl` prop; its `MemberRow` local type (distinct from `@/components/projects/member-types.ts`'s type of the same name) gained `avatar_url`, sourced from `_load-detail-data.ts`'s `phase1Members`/`projectMembers` queries (both `profiles!*_user_id_fkey` embeds extended to include `avatar_url`) and from the two client-side `refetch*Members` functions inside `_onboarding-detail.tsx` (which needed their own type/mapping updates, plus the two API routes they call — `/api/projects/[projectId]/members` and `/api/projects/[projectId]/programme/phases/[phaseNumber]/members` — updated to select `avatar_url` in their embedded `profiles` selects). `@/components/projects/member-types.ts`'s `MemberRow`/`RawMemberRow`/`mapMembers()` gained `avatar_url` (consumed by `_members-tab.tsx`, which now renders photos; `manage-collaborators-modal.tsx`/`set-project-owner-modal.tsx` also consume this type but don't render avatar circles, confirmed unaffected).
- Cluster E: `PhaseAssigneeMember` type gained `avatarUrl`; its sole constructor — `/api/onboarding/projects/status-report/route.ts` — now selects `avatar_url` in its `profiles` query and includes it when building each `PhaseAssigneeMember`. `_status-report-assignee-cell.tsx` renders the photo.
- Cluster F: `dashboard-shared.tsx`'s `Avatar` component gained an optional `avatarUrl` prop (single call site, confirmed via grep — no other consumers to break). `/api/v2/time-logs`'s GET now selects `avatar_url` alongside `full_name` and returns it per entry (both the paginated list and the POST-create response); `TimeLogEntry` type and `groupByEmployee()` in `_time-logs-shared.ts` carry it through to the per-developer group; `_time-logs-table.tsx` passes it to `Avatar`. `_time-log-entry-modal.tsx`'s optimistic-update object literal (constructs a full `TimeLogEntry`) also updated to include `avatar_url`, sourced from the save response or the entry being edited.
- Every `<img>` added uses the exact `notification-bell.tsx` reference pattern: conditional render (`avatarUrl ? <img ...> : <existing initials markup>`), `object-cover`, same size/shape classes as the initials element it replaces, and the `// eslint-disable-next-line @next/next/no-img-element` comment.

### Files Changed
- `src/app/(hub)/layout.tsx` — select `avatar_url`, pass to shell
- `src/app/(hub)/_components/v2-hub-shell.tsx` — thread `avatarUrl` prop
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` — render photo/initials
- `src/app/api/v2/users/route.ts` — select + merge `avatar_url`
- `src/app/(hub)/dashboard/users/page.tsx` — `HubUser` type + row render
- `src/app/(hub)/projects-old/_pm-shared.tsx` — `AssigneeChip` avatar support
- `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/page.tsx` — select `avatar_url`
- `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/page.tsx` — select `avatar_url`
- `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-detail.tsx` — avatar map + prop wiring
- `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-detail.tsx` — avatar map + prop wiring
- `src/app/(hub)/projects/_shared/_list-view.tsx` — `ResolvedAssigneeChip` + `AssigneePicker` dropdown avatar render
- `src/app/(hub)/projects/_shared/_issue-list-view.tsx` — assignee circle + dropdown avatar render (name-matched)
- `src/app/(hub)/projects/_v2-listing/_load-list-data.ts` — select + carry `avatar_url`
- `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` — `OnboardingProjectListItem.members` type
- `src/app/(hub)/projects/_v2-listing/_avatar-stack.tsx` — avatar render
- `src/app/(hub)/projects/_legacy-listing/_load-list-data.ts` — select + carry `avatar_url` (found actual `id,full_name` select missed by initial research)
- `src/app/(hub)/projects/_legacy-listing/_projects-index.tsx` — `ProjectListItem.members` type
- `src/app/(hub)/projects/_legacy-listing/_project-card-shared.tsx` — avatar render
- `src/app/(hub)/projects/v2/[projectId]/_load-detail-data.ts` — extend `phase1Members`/`projectMembers` profile embeds
- `src/app/(hub)/projects/v2/[projectId]/_onboarding-detail.tsx` — local `MemberRow` type, `AvatarCircle`, `CollaboratorAvatars` call sites, both `refetch*Members` functions
- `src/components/projects/member-types.ts` — `MemberRow`/`RawMemberRow`/`mapMembers()`
- `src/app/api/projects/[projectId]/members/route.ts` — select `avatar_url`
- `src/app/api/projects/[projectId]/programme/phases/[phaseNumber]/members/route.ts` — select `avatar_url`
- `src/app/(hub)/projects/_shared/_members-tab.tsx` — avatar render
- `src/lib/programme/status-report.ts` — `PhaseAssigneeMember` type
- `src/app/api/onboarding/projects/status-report/route.ts` — select + attach `avatar_url`
- `src/app/(hub)/projects/v2/status-report/_status-report-assignee-cell.tsx` — avatar render
- `src/app/(hub)/dashboard/_components/dashboard-shared.tsx` — `Avatar` component avatar support
- `src/app/api/v2/time-logs/route.ts` — select + return `avatar_url` (GET list + POST create)
- `src/app/(hub)/dashboard/timelogs/_time-logs-shared.ts` — `TimeLogEntry` type, `groupByEmployee()`
- `src/app/(hub)/dashboard/timelogs/_time-logs-table.tsx` — pass `avatarUrl` to `Avatar`
- `src/app/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` — optimistic-update object literal

### Deviations From Plan
- **Cluster F implemented, not skipped.** The task doc flagged this as "lower confidence — investigate first," speculating `time_logs.employee_id` might reference `hr.employees.id` with an unclear link to `profiles`. Investigation found `employee_id` FKs `auth.users(id)` directly (documented in the route file's own header comment) — the same id space as `profiles.id`. No HR-schema join was needed; implemented normally.
- **`_legacy-listing/_load-list-data.ts` required fixing** — the task doc's grep for this file's select shape came up empty because the actual code used `"id,full_name"` (no space after the comma); found and fixed during implementation, per the doc's own instruction to read the file directly before editing.
- **`_onboarding-detail.tsx`'s local `MemberRow` type** turned out to be a separate type from `@/components/projects/member-types.ts`'s `MemberRow` of the same name (not re-exported/shared) — both were updated independently, along with two additional client-side `refetch*Members` functions inside `_onboarding-detail.tsx` that construct `MemberRow` objects from raw API responses; these weren't explicitly named in the task doc's file list but were required for `tsc --noEmit` to pass once the type gained a required field.
- **`_time-log-entry-modal.tsx`** wasn't in the task doc's file list but required an update — it builds an optimistic `TimeLogEntry` object literal after a save, which needed `avatar_url` once the type changed.
- No other deviations — all six clusters (A–F) landed, including the two the task doc marked as open questions at write time (Cluster F feasibility, and the actual `assigneesByPhase` caller for Cluster E, which was traced to `/api/onboarding/projects/status-report/route.ts`).
- **Not done, by design (per task doc's Out of Scope):** `OwnerChip` (comment/time-log author chips), `_checklist-tab.tsx`'s role-label initials, customer/company initials (`pm-dashboard.tsx`), `HubHeader` (dead code), and the `projects-old/[projectId]` page-level duplicates (`_list-view.tsx`/`_issue-list-view.tsx`/`_project-detail.tsx` — distinct from `_pm-shared.tsx`, which IS still live and was updated). Confirming whether `/projects-old/[projectId]` is still reachable remains an open question for the user/reviewer.

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (2 pre-existing warnings in `_checklist-tab.tsx`, confirmed via `git diff` to be unrelated to this task's changes — 0 errors)
- Manual/browser verification (setting a real `avatar_url` on a profile and checking each render site, per the task doc's Verification section) — SKIPPED, needs a live Supabase instance with an authenticated session; not drivable from this session. Left for the `test` stage.

### Round 2 — Bug Found in Manual Verification

The user manually verified with a real `avatar_url` set on a live profile ("Eleazar Junsan") and found the photo still not rendering on the `/projects/legacy` grid/list card's single-owner avatar. Root cause: `_legacy-listing/_project-card-shared.tsx`'s `AvatarStack` has a second, previously-unhandled branch — a `fallbackName`-only bubble shown when a legacy/Zoho-imported project has **zero `project_members` rows** (common — Zoho projects predate native Hub membership). That branch renders purely from `projects.owner_name`, a free-text Zoho-imported column (migration 036) with no FK to `profiles` — so even though the doc's Cluster D work fixed the `members.length >= 1` branches, this zero-members fallback had no id to look up `avatar_url` with at all, and was missed during initial research because it wasn't a `members.map(...)` render site.

**Fix:** `_legacy-listing/_load-list-data.ts` now does a best-effort name match — collects distinct `owner_name` values from the current page of projects, queries `profiles` where `full_name` is in that set, and attaches `owner_avatar_url` to each `ProjectListItem` (same name-matching approach already used for `_issue-list-view.tsx`'s assignee avatar in the original implementation, not a new pattern). `ProjectListItem` type gained `owner_avatar_url: string | null`. `AvatarStack` gained a `fallbackAvatarUrl` prop, rendering a photo in the zero-members branch when the name match succeeds. Both call sites (`_project-grid-view.tsx`, `_project-list-view.tsx`) updated to pass it through.

This is a name-string match (fragile in principle — two different people with the same full name would collide), same caveat as the pre-existing `_issue-list-view.tsx` approach it mirrors. It's the only option available without a schema change, since `owner_name` has no id. `projects.created_by` is a real FK but was deliberately not used instead — it identifies who created the Hub row (often the person running the Zoho import), not necessarily the actual Zoho-side project owner `owner_name` names, so it could show the wrong person's photo.

**Files changed (Round 2):**
- `src/app/(hub)/projects/_legacy-listing/_load-list-data.ts` — owner-name → avatar_url lookup
- `src/app/(hub)/projects/_legacy-listing/_projects-index.tsx` — `owner_avatar_url` field on `ProjectListItem`
- `src/app/(hub)/projects/_legacy-listing/_project-card-shared.tsx` — `AvatarStack`'s `fallbackAvatarUrl` prop + render
- `src/app/(hub)/projects/_legacy-listing/_project-grid-view.tsx` — pass `fallbackAvatarUrl`
- `src/app/(hub)/projects/_legacy-listing/_project-list-view.tsx` — pass `fallbackAvatarUrl`

**Re-verification:** `npx tsc --noEmit` — PASS. `pnpm lint` — PASS (same 2 pre-existing unrelated warnings, 0 errors). Browser re-check of the "Fresh Biz Solutions, LLC" card specifically — still needs to be done by the user against the live app; not drivable from this session.

Note: `projects-old/_project-card-shared.tsx`'s near-identical `AvatarStack` has the same zero-members `fallbackName` gap and was **not** fixed — it remains out of scope per the original Out-of-Scope section (the `projects-old/[projectId]` route tree is believed unreachable from live navigation; confirm before deciding whether to port this fix there too).
