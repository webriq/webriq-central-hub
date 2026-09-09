# 351: Assignee Picker Overhaul — Full Staff Pool + Exclude List, Avatars, Multi-Select Listing Picker, Compact Cell Display (+ Issues Multi-Assignee)

**Created:** 2026-09-09
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Completed (2026-09-09 — marked complete at the user's explicit request; migration 132 apply + full browser acceptance are outstanding manual checks)

---

## Overview

The assignee experience across Projects is inconsistent and under-featured:

- **New Task** modal only offers `role === "developer"` profiles; **New Issue** offers dev/pm/admin/super_admin. Neither can assign an admin-who-is-also-a-doer, HR, or marketing, and both permanently include Philippe Bodart (who should never appear).
- The listing assignee pickers (`AssigneePicker` in `_list-view.tsx`, `IssueAssigneePicker` in `_issue-list-view.tsx`) have **no search**, no removable-chip affordance, and the issue one is single-select only.
- The listing **cell display** shows up to 3 bare avatars + `+N` (no name), which doesn't match the desired "first assignee (avatar + name), then `+N`, hover for the rest" pattern already shipped on the Status Report `AssigneeCell`.
- **Unassigned** rows show a faint `<Users>` glyph, not a labelled "Unassigned" + placeholder avatar.
- **Issues** support only one assignee (`issues.assignee_id`), while tasks already support many (`tasks.assignees uuid[]`).

This task unifies all of it:

1. One shared "assignable members" source = **all staff roles** (`admin, super_admin, pm, developer, hr, marketing`) minus a **configurable exclude list** (matched by `full_name` **or** auth email, case-insensitive), seeded with Philippe Bodart's name + two emails.
2. Avatars (with 2-letter initials fallback) in the New Task / New Issue assignee dropdowns.
3. A shared **multi-select assignee popover** for the listings: searchable, checkable rows with avatars, selected people shown as removable (`×`) chips — matching Image #2.
4. A shared **compact cell display**: first assignee's avatar + name, then a `+N` pill; hovering shows the remaining names in a tooltip — matching Images #3 / #4. Unassigned → "Unassigned" + `/assets/user-thumbnail.png`.
5. **Issues gain multi-assignee** (`issues.assignees uuid[]`), with the permission model, timer eligibility, assignee filter, create/update APIs, and RLS brought to parity with tasks.

### Decisions locked with the user

| Question | Answer |
|----------|--------|
| Who is a "hub user" for the pool? | **All staff roles** — `admin, super_admin, pm, developer, hr, marketing`. Excludes `client`, `other`, `pending`, `null`. |
| How does the exclude array match? | **Name or email** — each entry compared case-insensitively against `profiles.full_name` OR the user's `auth.users.email`. An `@` entry triggers an `auth.admin.listUsers()` email lookup; name-only entries skip it. |
| How far does Issues multi-select go? | **Full multi-assignee** — new `issues.assignees uuid[]` column + rework of detail page, list picker, filter, create API, permission model, RLS, and timer eligibility. |

## Requirements

- [ ] **Assignable pool helper** — new `src/lib/members/assignable.ts` exporting `ASSIGNABLE_ROLES`, `ASSIGNEE_EXCLUDE` (config array), a pure `filterExcludedMembers()`, and an async `getAssignableMembers()` (adminClient; conditional email lookup).
- [ ] `ASSIGNEE_EXCLUDE` seeded with `"Philippe Bodart"`, `"philippe.bodart@webriq.services"`, `"philippe.bodart@webtools2go.com"`; adding a future exclusion = append one string.
- [ ] `_get-project-detail-data.ts` and `/api/v2/projects/[projectId]/members` both source the pool from `getAssignableMembers()` (replacing their inline `.in("role", [...])` queries).
- [ ] Issue-detail loader (`issues/[issueId]/page.tsx`) sources its `allMembers` from the same helper.
- [ ] **New Task / New Issue modals** — assignee dropdown shows each member's avatar (image if `avatar_url`, else 2-letter initials from `full_name`, else `?`), in both the option rows and the collapsed trigger.
- [ ] New Issue modal writes `assignees: [id]` (not `assignee_name`) on create.
- [ ] **Listing assignee picker** (tasks + issues) — replaced by shared `AssigneeMultiSelect`: search box, checkable avatar rows, selected people as removable `×` chips, empty state, keyboard-dismiss, portal-positioned (escapes table `overflow`).
- [ ] **Listing cell display** (tasks + issues) — first assignee avatar + name, then `+N` pill; hovering the cell shows remaining assignee names in a tooltip (one tooltip, stacked names).
- [ ] **Unassigned** — renders "Unassigned" text + `/assets/user-thumbnail.png` placeholder avatar (list rows for tasks & issues; issue board card).
- [ ] Read-only variant (developer who can't reassign) shows the same cell display but is non-interactive; tooltip still works.
- [ ] **Issues multi-assignee** — migration 132 adds `issues.assignees uuid[]` + backfill from `assignee_id` + widened `issues_developer_update` RLS; `getIssueEditPermission` takes `assignees: string[]`; create/update APIs accept `assignees`; timer-start + issue time-logs eligibility check array membership; `issueMatchesAssigneeFilter` reads the array; issue detail editor becomes multi-select.
- [ ] App keeps `issues.assignee_id` / `assignee_name` in sync (`assignee_id = assignees[0] ?? null`) for legacy/Zoho display paths.
- [ ] `src/types/database.ts` — add `assignees: string[] | null` to `issues` Row/Insert/Update.
- [ ] `npx tsc --noEmit` and `pnpm lint` clean.

## Out of Scope / Must-Not-Change

- **Task board** (`_board-view.tsx`) and both **calendar views** — they don't display assignees today; leave them alone. (Issue board card *does* show `assignee_name` text — update that one for consistency only.)
- **`projects/_v2-listing/_avatar-stack.tsx`** and the Projects listing "Owner" column — that's project owners/collaborators, a different concept. Do not touch.
- **Status Report `AssigneeCell`** (`v2/status-report/_status-report-assignee-cell.tsx`) — it already does the right thing (phase members, not task assignees); mirror its pattern, don't reuse or modify it.
- Legacy trees: `src/app/_hub_(OLD)/**`, `src/app/(hub)/projects-old/**`, `src/app/(hub)/projects/_legacy-listing/**` — dead, do not update.
- **RLS helper functions** `get_my_role()` / `get_my_customer_id()` — call them in the new policy, never reimplement.
- **Zoho export of issues** (`api/admin/zoho-export/issues`) — Zoho has one assignee; keep exporting `assignee_name`/`assignee_id` (the primary) only. Do not try to push the array.
- Do not change how `tasks.assignees` is stored or its RLS (migration 092) — tasks are already correct; only their *UI* changes.
- Do not introduce `react-hook-form`, `sonner` is already the toast lib (keep it), no shadcn `Badge`/`Command` — hand-roll to match neighbouring UI (see CLAUDE.md "UI Polish Conventions").

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/members/assignable.ts` | Create | `ASSIGNABLE_ROLES`, `ASSIGNEE_EXCLUDE`, `filterExcludedMembers()`, `getAssignableMembers()`. |
| `src/app/(hub)/projects/_shared/_assignee-multi-select.tsx` | Create | Shared searchable multi-select popover **+** compact cell display (trigger). Used by both list views and issue detail. |
| `supabase/migrations/132_issues_assignees_array.sql` | Create (written, **not applied** by agent) | `issues.assignees uuid[]` + backfill + widened `issues_developer_update` policy + GIN index. |
| `src/types/database.ts` | Modify | Add `assignees: string[] \| null` to `issues` Row/Insert/Update. |
| `src/lib/issues/permissions.ts` | Modify | `getIssueEditPermission` accepts `{ created_by, assignees: string[] \| null }`; `isAssignee = assignees?.includes(userId)`. |
| `src/app/(hub)/projects/_shared/_get-project-detail-data.ts` | Modify | Source `allMembers` from `getAssignableMembers()`; keep `profilesById` built from the same list. |
| `src/app/api/v2/projects/[projectId]/members/route.ts` | Modify | Return `getAssignableMembers()`. |
| `src/app/(hub)/projects/_shared/_searchable-select.tsx` | Modify | Option type gains optional `avatar?: { url: string \| null; name: string \| null }`; render avatar in `OptionRow` + trigger. |
| `src/app/(hub)/projects/_shared/_create-task-modal.tsx` | Modify | Pass `avatar` per option; widen `developers` → full pool. |
| `src/app/(hub)/projects/_shared/_create-issue-modal.tsx` | Modify | Pass `avatar` per option; send `assignees: [id]` instead of `assignee_name`. |
| `src/app/(hub)/projects/_shared/_list-view.tsx` | Modify | Replace `AssigneePicker` / `ResolvedAssigneeChip` with `<AssigneeMultiSelect>`. |
| `src/app/(hub)/projects/_shared/_issue-list-view.tsx` | Modify | Replace `IssueAssigneePicker` with `<AssigneeMultiSelect>`; issue rows now use `assignees`. |
| `src/app/(hub)/projects/_shared/_issue-board-view.tsx` | Modify | Swap the `assignee_name` text span for the compact avatar display. |
| `src/app/(hub)/projects/_shared/_assignee-filter.ts` | Modify | `issueMatchesAssigneeFilter` reads `issue.assignees` (with `assignee_id`/`assignee_name` fallback shim). |
| `src/app/(hub)/projects/_shared/_project-detail.tsx` | Modify | `updateIssue` optimistic-merge handles `assignees`; pass `profilesById` to `IssueListView` if needed for name fallback. |
| `src/app/api/v2/projects/[projectId]/issues/route.ts` | Modify | POST accepts `assignees: string[]`; writes array + synced `assignee_id`/`assignee_name`; `addProjectMember` per assignee. |
| `src/app/api/v2/issues/[issueId]/route.ts` | Modify | PATCH accepts `assignees`; `ASSIGNEE_ALLOWED_FIELDS` unchanged; keep `assignee_id`/`assignee_name` synced; `addProjectMember` loop. |
| `src/app/api/v2/timer/start/route.ts` | Modify | Issue branch: `issue.assignees?.includes(user.id)` (select `assignees`). |
| `src/app/api/v2/issues/[issueId]/time-logs/route.ts` | Modify | GET + POST eligibility: `assignees?.includes(user.id)`. |
| `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/page.tsx` | Modify | `allMembers` from helper; pass `assignees` to permission + detail; add `assigneeProfiles` fetch (mirror task detail). |
| `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/_issue-detail.tsx` | Modify | Assignee `<select>` → `<AssigneeMultiSelect editable={perm.canEditDetails}>`; `saveAssignee` → `saveAssignees(ids)`. |
| `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/page.tsx` + `_issue-detail.tsx` | Modify | Same treatment as v2 (shared component/detail file where already shared; mirror otherwise). |
| `src/app/api/admin/zoho-import/issues/route.ts` | Modify | Also set `assignees: assignee_id ? [assignee_id] : []` on upsert. |
| `_docs/mcp-tools.md` | No change | No new `server.registerTool` — n/a. |

## Code Context

### `src/lib/stackshift-orders/recipients.ts` — existing `auth.users` email-lookup pattern to mirror

```ts
for (let page = 1; page <= 20; page++) {
  const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
  if (error || !data) break;
  for (const u of data.users) {
    if (u.email && pmIds.has(u.id)) out.add(u.email.toLowerCase());
  }
  if (data.users.length < 1000) break;
}
```

### `_get-project-detail-data.ts:80` — current inline pool query (to replace)

```ts
adminClient.from("profiles")
  .select("id, full_name, avatar_url, role")
  .in("role", ["developer", "pm", "admin", "super_admin"])
  .order("full_name", { ascending: true }),
```

### `api/v2/projects/[projectId]/members/route.ts:17` — current inline pool query (to replace)

```ts
const { data, error } = await supabase
  .from("profiles")
  .select("id, full_name, avatar_url, role")
  .in("role", ["developer", "pm", "admin"])
  .order("full_name", { ascending: true });
```

### `_create-task-modal.tsx:122` + `:394` — dev-only filter + single-select assignee field

```tsx
const developers = allMembers.filter((m) => m.role === "developer");   // → use full pool
...
<SearchableSelect
  value={assigneeId}
  onChange={setAssigneeId}
  options={developers.map((m) => ({ value: m.id, label: m.full_name ?? "Unknown" }))}  // + avatar
  placeholder="Unassigned"
  searchPlaceholder="Search developers…"   // → "Search members…"
/>
```
Submit already sends `assignees: assigneeId ? [assigneeId] : undefined` — no change there.

### `_create-issue-modal.tsx:112` + `:247` — sends `assignee_name`, single-select

```tsx
const assignee = allMembers.find((m) => m.id === assigneeId);
// body: assignee_name: assignee?.full_name || undefined   → assignees: assigneeId ? [assigneeId] : undefined
```

### `_list-view.tsx` — `AssigneePicker` (already multi-select, no search/chips) + `ResolvedAssigneeChip` + `nameInitials`

`GRID = "grid-cols-[32px_1fr_148px_120px_108px_80px_64px_48px]"` — the assignee column is the `120px` track. The compact display must fit; the `+N` pill and name truncate as needed. Picker uses fixed positioning (`getBoundingClientRect`) to escape the table's `overflow-hidden` — keep that; the shared component should portal or fixed-position too.

### `_issue-list-view.tsx` — `IssueAssigneePicker` (single-select, writes `assignee_id`+`assignee_name`+`assignee_email:null`)

```tsx
function assign(member) {
  void onUpdate(issue.id, { assignee_id: member.id, assignee_name: member.full_name, assignee_email: null });
}
```
Becomes: `onUpdate(issue.id, { assignees: nextIds })` — the API derives the synced scalar columns.

### `src/lib/issues/permissions.ts:39` — signature change

```ts
issue: { created_by: string | null; assignee_id: string | null }   //  →  { created_by: string | null; assignees: string[] | null }
const isAssignee = issue.assignee_id === userId;                    //  →  issue.assignees?.includes(userId) ?? false
```
All call sites: `api/v2/issues/[issueId]/route.ts:37`, `_issue-list-view.tsx:263` + `:411`, `_issue-detail.tsx` (v2 + legacy). Each must now pass `assignees`.

### `supabase/migrations/092_...sql` — the tasks RLS shape to mirror for issues

```sql
create policy "tasks_developer_update"
  on tasks for update to authenticated
  using (get_my_role() = 'developer' and (created_by = auth.uid() or auth.uid() = any(assignees)))
  with check (get_my_role() = 'developer');
```

### `api/v2/timer/start/route.ts:37` + `api/v2/issues/[issueId]/time-logs/route.ts:73,101`

```ts
.select("id, assignee_id, project_id")          // → "id, assignees, project_id"
if (issue.assignee_id !== user.id) { ...403 }    // → if (!issue.assignees?.includes(user.id)) { ...403 }
```

### Placeholder asset

`public/assets/user-thumbnail.png` exists (2 KB, light-grey user silhouette). Reference as `/assets/user-thumbnail.png` via a plain `<img>` (matches the avatar components' existing `<img>` usage; no `next/image`).

### `_status-report-assignee-cell.tsx` — the visual pattern to mirror (colors, overlap, hover spring, `+N` pill)

```tsx
const AVATAR_COLORS = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"];
// initialsFor(name) = name.split(" ").filter(Boolean).map(w => w[0]).join("").slice(0,2).toUpperCase() || "?"
// colorFor(name)    = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
// +N pill: w-6 h-6 -ml-2 rounded-full ... text-[#5F6A88] bg-[#EDF0F7]  → "+N"
```
The new component differs: it shows **one** avatar + **name text** + a `+N` pill (not a 4-avatar stack), and the tooltip lists the *other* assignees.

## Implementation Steps

### A. Assignable-members helper

1. Create `src/lib/members/assignable.ts`:
   - `export const ASSIGNABLE_ROLES = ["admin", "super_admin", "pm", "developer", "hr", "marketing"] as const;`
   - `export const ASSIGNEE_EXCLUDE: string[] = ["Philippe Bodart", "philippe.bodart@webriq.services", "philippe.bodart@webtools2go.com"];` — with a doc comment: "append a name or email to hide someone from every assignee picker".
   - `export type AssignableMember = { id: string; full_name: string | null; avatar_url: string | null; role: string };`
   - `export function filterExcludedMembers(members: AssignableMember[], emailById: Map<string, string>): AssignableMember[]` — pure; excludes when lowercased `full_name` ∈ excludeSet OR `emailById.get(id)` ∈ excludeSet.
   - `export async function getAssignableMembers(): Promise<AssignableMember[]>`:
     - `adminClient.from("profiles").select("id, full_name, avatar_url, role").in("role", ASSIGNABLE_ROLES).order("full_name")`
     - If any `ASSIGNEE_EXCLUDE` entry includes `"@"`: page `adminClient.auth.admin.listUsers({ page, perPage: 1000 })` (cap 20 pages, same as `recipients.ts`) into `emailById`. Otherwise `emailById = new Map()`.
     - `return filterExcludedMembers(rows, emailById);`
   - Wrap the listUsers loop in try/catch → on failure, log and fall back to name-only filtering (don't fail the page load).
2. Note: `getAssignableMembers()` is server-only (adminClient) — only import from server components / route handlers / loaders.

### B. Issues multi-assignee data model

3. Write `supabase/migrations/132_issues_assignees_array.sql` (mirror migration 100/129 header style):
   ```sql
   alter table issues add column assignees uuid[];
   update issues set assignees = array[assignee_id]
     where assignee_id is not null and assignees is null;

   drop policy if exists "issues_developer_update" on issues;
   create policy "issues_developer_update"
     on issues for update to authenticated
     using (get_my_role() = 'developer' and (created_by = auth.uid() or auth.uid() = any(assignees)))
     with check (get_my_role() = 'developer');

   create index issues_assignees_gin on issues using gin (assignees);
   ```
   Do **not** drop `assignee_id`/`assignee_name`/`assignee_email`. **Migration written, not applied** by the agent (tasks 347/348 convention) — the user applies it. Add a one-line note to CLAUDE.md's issues bullet after it lands (documentation stage).
4. `src/types/database.ts` — add `assignees: string[] | null` to `issues` Row (optional in Insert/Update).
5. Everywhere issues are read for assignee logic, use a shim until the column exists:
   `const ids = issue.assignees ?? (issue.assignee_id ? [issue.assignee_id] : []);`
6. `src/lib/issues/permissions.ts` — change the `issue` param to `{ created_by: string | null; assignees: string[] | null }`, `isAssignee = issue.assignees?.includes(userId) ?? false`. Update every call site to pass `assignees` (with the shim where the row might be pre-migration).

### C. Shared `AssigneeMultiSelect` component

7. Create `src/app/(hub)/projects/_shared/_assignee-multi-select.tsx`:
   - Props: `{ value: string[]; members: AssignableMemberLite[]; onChange: (ids: string[]) => void; editable: boolean; nameById?: Record<string, { full_name: string | null; avatar_url: string | null }> }`.
   - **Trigger / cell display**:
     - `value.length === 0` → `<img src="/assets/user-thumbnail.png" class="w-6 h-6 rounded-full" />` + `"Unassigned"` (muted).
     - else → first assignee's `Avatar` (image or initials) + truncated `full_name`, then, if `value.length > 1`, a `+{value.length - 1}` pill.
     - Wrap the whole trigger in a `<Tooltip>` whose `<TooltipContent>` lists **all** assignee names (one per line) when `value.length > 1` (matches Image #4). Single assignee → tooltip is just that name (or omit).
     - `editable` → `<button>` that opens the popover; `!editable` → `<div>` (still tooltip-wrapped), `cursor-default`.
   - **Popover** (portal + fixed position via `getBoundingClientRect`, like the current `AssigneePicker`; or reuse `_use-popover-position.ts` like `_searchable-select.tsx`):
     - Header: "Project Users" (matches Image #2) — muted uppercase.
     - Search `<input>` (autoFocus) filtering `members` by `full_name`.
     - Scrollable checkable rows: avatar + name + check when selected; click toggles membership in `value`, calls `onChange(next)`.
     - Empty state: "No members found" / "No matches".
     - Footer: selected members as chips `[avatar Name ×]`, `×` removes from `value`.
     - Dismiss on outside-click / Escape.
   - Export a small `Avatar` sub-component: `avatar_url` → `<img>`, else 2-letter initials on `colorFor(name)`, else `?`. Reuse `AVATAR_COLORS`.
   - `isDark` prop **not** needed — these listings are light-only (no `usePMSettings` in scope here); match the existing hard-coded hex palette in `_list-view.tsx`.

### D. List views + board

8. `_list-view.tsx`:
   - Delete `AssigneePicker` and `ResolvedAssigneeChip`. Keep `nameInitials` only if still used elsewhere (it isn't after this — remove).
   - In `Row`, render `<AssigneeMultiSelect value={task.assignees ?? []} members={allMembers} nameById={profilesById} editable={perm.canEditDetails} onChange={(ids) => void onUpdate(task.id, { assignees: ids })} />`.
   - Column track `120px` may need a small bump (e.g. `140px`) to fit "Name +N" — verify visually; adjust `GRID` on both the header and `Row`.
9. `_issue-list-view.tsx`:
   - Delete `IssueAssigneePicker`. Render `<AssigneeMultiSelect value={ids} members={allMembers} editable={perm.canEditDetails} onChange={(ids) => void onUpdate(issue.id, { assignees: ids })} />` where `ids = issue.assignees ?? (issue.assignee_id ? [issue.assignee_id] : [])`.
   - `getIssueEditPermission(currentUserRole, currentUserId, { created_by: issue.created_by, assignees: ids })`.
   - `IssueListView` has no `profilesById` prop — pass `nameById` only if `_project-detail.tsx` starts providing it; otherwise `allMembers` covers name resolution (document the "left the pool → shows `?`" fallback, same as tasks today).
10. `_issue-board-view.tsx:165` — replace the `assignee_name` text `<span>` with a minimal inline avatar + first name (or the shared `Avatar` + `+N`), reading `issue.assignees` via the shim.

### E. Create modals

11. `_searchable-select.tsx` — extend the option type: `{ value: string; label: string; avatar?: { url: string | null; name: string | null } }`. In `OptionRow` and the trigger's `selectedLabel` area, render a 20px avatar circle before the label when `avatar` is present. Milestone/Tasklist callers pass no `avatar` → unchanged.
12. `_create-task-modal.tsx` — `const assignable = allMembers;` (drop the `role === "developer"` filter); options `.map(m => ({ value: m.id, label: m.full_name ?? "Unknown", avatar: { url: m.avatar_url, name: m.full_name } }))`; `searchPlaceholder="Search members…"`.
13. `_create-issue-modal.tsx` — same option shape; in `submit()` replace `assignee_name: assignee?.full_name || undefined` with `assignees: assigneeId ? [assigneeId] : undefined`.

### F. Issue detail (v2 + legacy) + issue APIs

14. `issues/[issueId]/page.tsx` (v2 + legacy):
    - `allMembers` ← `getAssignableMembers()`.
    - Add an `assigneeProfiles` fetch by id (mirror `tasks/[taskId]/page.tsx:62`) so removed-from-pool assignees still render.
    - Pass `assignees` (shim) into `getIssueEditPermission` and `_issue-detail.tsx`.
15. `_issue-detail.tsx` (v2 + legacy):
    - Replace the Assignee `<select>` with `<AssigneeMultiSelect value={assignees} members={allMembers} editable={perm.canEditDetails} onChange={saveAssignees} />`.
    - `saveAssignees(ids)` → `setAssignees(ids)` optimistic + `PATCH /api/v2/issues/[id]` `{ assignees: ids }`.
    - Read-only chip list when `!perm.canEditDetails` is handled by the component's `editable={false}`.
16. `api/v2/projects/[projectId]/issues/route.ts` POST — accept `body.assignees` (array of uuid strings); insert `assignees`, plus synced `assignee_id: assignees[0] ?? null`, `assignee_name: <first member's name> ?? null`, `assignee_email: null`. `addProjectMember(project.id, id, user.id)` for each (mirror `tasks/route.ts:94`). Keep accepting legacy `assignee_name` for back-compat but prefer `assignees`.
17. `api/v2/issues/[issueId]/route.ts` PATCH — when `"assignees" in body` and `perm.canEditDetails`: `patch.assignees = body.assignees ?? []`; `patch.assignee_id = patch.assignees[0] ?? null`; resolve + set `patch.assignee_name`; `patch.assignee_email = null`; `addProjectMember` for each new id. Leave the existing `"assignee_id" in body` branch for callers not yet migrated.
18. `api/v2/timer/start/route.ts` + `api/v2/issues/[issueId]/time-logs/route.ts` — select `assignees`, gate on `assignees?.includes(user.id)` (shim for pre-migration rows).

### G. Filter + project-detail glue

19. `_assignee-filter.ts` — `issueMatchesAssigneeFilter`: compute `ids = issue.assignees ?? (issue.assignee_id ? [issue.assignee_id] : (issue.assignee_name ? [resolve...] : []))`; `ids.length === 0` → unassigned; else `ids.some(id => selectedSet.has(id))`. Keep the legacy-name resolution path for un-backfilled rows.
20. `_project-detail.tsx` — `updateIssue` optimistic merge already spreads `patch` onto the row; confirm `assignees` flows through. If `IssueListView` needs `profilesById`, thread it (it's already in scope from the loader).

### H. Zoho import

21. `api/admin/zoho-import/issues/route.ts` — on the upsert row, add `assignees: assigneeId ? [assigneeId] : []` alongside the existing `assignee_id`.

## Acceptance Criteria

- [ ] **New Task** modal assignee dropdown lists every staff-role member except Philippe Bodart, each with avatar-or-initials; picking one and creating stores it in `tasks.assignees`.
- [ ] **New Issue** modal: same pool + avatars; creating with an assignee stores `issues.assignees = [id]` (and synced `assignee_id`).
- [ ] Philippe Bodart appears in **no** assignee picker anywhere in Projects (create modals, list pickers, issue detail); adding `"someone@webriq.services"` to `ASSIGNEE_EXCLUDE` removes that person too after reload.
- [ ] HR and marketing users are selectable as assignees.
- [ ] Tasks list — clicking the assignee cell opens a searchable popover; typing filters; clicking rows toggles; selected people show as `×`-removable chips; changes persist and survive reload.
- [ ] Issues list — same popover; multiple assignees persist to `issues.assignees`; the row's permission gate (`canEditDetails`) still governs who can reassign.
- [ ] Cell display: a 2-assignee task shows `[avatar] First Name  +1`; hovering shows both names stacked in a tooltip (Image #3 / #4).
- [ ] Unassigned task/issue rows show the `/assets/user-thumbnail.png` avatar + "Unassigned".
- [ ] A developer assigned (not creator) to an issue: can start its timer and log manual time; a developer neither-creator-nor-assignee: cannot, and the picker is read-only for them.
- [ ] Assignee **filter** on the Issues toolbar matches multi-assignee issues correctly (issue shows when *any* of its assignees is selected; "Unassigned" matches empty).
- [ ] Issue detail page (v2 + legacy) shows/edits multiple assignees.
- [ ] `npx tsc --noEmit` clean; `pnpm lint` clean (allowing the 2 known pre-existing warnings).
- [ ] With migration 132 **not yet applied**, the app still builds and every issue read falls back to `[assignee_id]` (no crash, single assignee shown).

## Verification

```bash
npx tsc --noEmit
pnpm lint

# Manual pure-function check (no runner configured) — filterExcludedMembers:
#   node -e "..." ad-hoc, or inline assertions during dev.

# Browser acceptance (pnpm dev):
#  /projects/v2/<projId>/tasks         — list picker: search, multi-select, chips, cell +N, tooltip, Unassigned
#  /projects/v2/<projId>/issues        — same + multi-assignee persistence
#  New Task / New Issue modals         — avatars in dropdown, Philippe absent, HR/marketing present
#  /projects/v2/<projId>/issues/<id>   — detail multi-assignee editor
#  developer login                     — read-only picker + timer eligibility on a multi-assignee issue
#  Issues toolbar Assignee filter      — multi-assignee matching
```

Apply migration 132 in the Supabase SQL editor before the multi-assignee acceptance run; note in the test doc whether it was applied.

## Implementation Notes

### What Changed

- **Assignable-members helper** — new `src/lib/members/assignable.ts`: `ASSIGNABLE_ROLES` (`admin, super_admin, pm, developer, hr, marketing`), `ASSIGNEE_EXCLUDE` (seeded with `"Philippe Bodart"` + his two emails), pure `filterExcludedMembers()`, async `getAssignableMembers()`. The `auth.admin.listUsers()` email lookup only runs because `ASSIGNEE_EXCLUDE` contains `@` entries; a lookup failure degrades to name-only filtering (logged, non-fatal).
- **Pool wired in** at `_get-project-detail-data.ts` (feeds `allMembers` for the Tasks/Issues listings + New Task/New Issue modals on every project tab) and `GET /api/v2/projects/[projectId]/members` (thread-to-project modal). `_get-project-detail-data.ts`'s own `profiles` query (now `profilesById` / `currentUserRole` only) was widened to also include `hr`/`marketing` so those names still resolve for display.
- **Issues → multi-assignee**: migration `132_issues_assignees_array.sql` (**written, not applied**) adds `issues.assignees uuid[]`, backfills from `assignee_id`, replaces `issues_developer_update` RLS with the `auth.uid() = any(assignees)` shape (mirrors `tasks_developer_update`), + GIN index. `src/types/database.ts` hand-edited. New `issueAssigneeIds(issue)` shim in `src/lib/issues/permissions.ts` bridges array ↔ legacy scalar everywhere; `getIssueEditPermission` now takes `assignees`. New `src/lib/issues/assignee-sync.ts` (`buildIssueAssigneeSync`) keeps `assignee_id`/`assignee_name`/`assignee_email` synced from the array on create/update.
- **Shared `_assignee-multi-select.tsx`** (`AssigneeMultiSelect`): compact cell display (first assignee avatar + name, `+N` pill, hover tooltip of all names; "Unassigned" + `/assets/user-thumbnail.png` when empty) + searchable, multi-select popover with `×`-removable chips. Portal-positioned via the existing `usePopoverPosition`. Used by the Tasks list, Issues list, and both Issue Detail pages (v2 + legacy). `editable={false}` → non-interactive display, tooltip still works.
- **`SearchableSelect`** gained an optional per-option `avatar` (`{ url, name }`) rendered in the option rows + trigger; the New Task and New Issue modals pass it. New Task's assignee field dropped its `role === "developer"` filter → full pool; New Issue now sends `assignees: [id]` instead of `assignee_name`.
- **APIs**: `POST /api/v2/projects/[projectId]/issues` + `PATCH /api/v2/issues/[issueId]` accept `assignees`, derive the scalar columns, and `addProjectMember` per assignee (task 287 parity). `POST /api/v2/timer/start`, `GET`/`POST /api/v2/issues/[issueId]/time-logs`, and the 3 issue-attachment routes now read `assignees` (via the shim) for eligibility/permission. `zoho-import/issues` seeds `assignees` from the resolved `assignee_id`.
- **Filter**: `issueMatchesAssigneeFilter` (`_assignee-filter.ts`) reads the array (legacy `assignee_name` fallback kept). `_issue-board-view.tsx` card appends `+N` to the assignee pill. Issue-detail loaders (v2 + legacy) now fetch `assigneeProfiles` by id (so a removed-from-pool assignee still renders) and switched the quick-access "my issues" query from `.eq("assignee_id", …)` to `.contains("assignees", […])`.

### Files Changed

- `src/lib/members/assignable.ts` - **new**: assignable-members pool + exclude list.
- `src/lib/issues/assignee-sync.ts` - **new**: `buildIssueAssigneeSync()` scalar-column sync.
- `supabase/migrations/132_issues_assignees_array.sql` - **new, not applied**: `issues.assignees` + RLS + index.
- `src/app/(hub)/projects/_shared/_assignee-multi-select.tsx` - **new**: shared picker + cell display.
- `src/types/database.ts` - `issues.assignees: string[] | null` in Row/Insert/Update.
- `src/lib/issues/permissions.ts` - `issueAssigneeIds()` shim; `getIssueEditPermission` takes `assignees`.
- `src/app/(hub)/projects/_shared/_get-project-detail-data.ts` - pool from `getAssignableMembers()`; widened `profilesById` roles.
- `src/app/api/v2/projects/[projectId]/members/route.ts` - returns `getAssignableMembers()`.
- `src/app/(hub)/projects/_shared/_searchable-select.tsx` - optional per-option `avatar`.
- `src/app/(hub)/projects/_shared/_create-task-modal.tsx` - full pool + avatars.
- `src/app/(hub)/projects/_shared/_create-issue-modal.tsx` - avatars; sends `assignees: [id]`.
- `src/app/(hub)/projects/_shared/_list-view.tsx` - `AssigneeMultiSelect` (removed `AssigneePicker`/`ResolvedAssigneeChip`); assignee grid column `120px`→`156px`.
- `src/app/(hub)/projects/_shared/_issue-list-view.tsx` - `AssigneeMultiSelect` (removed `IssueAssigneePicker`); new `profilesById` prop.
- `src/app/(hub)/projects/_shared/_issue-board-view.tsx` - `+N` on the assignee pill.
- `src/app/(hub)/projects/_shared/_assignee-filter.ts` - array-aware issue matching.
- `src/app/(hub)/projects/_shared/_project-detail.tsx` - pass `profilesById` to `IssueListView`.
- `src/app/api/v2/projects/[projectId]/issues/route.ts` - POST accepts `assignees` + member sync.
- `src/app/api/v2/issues/[issueId]/route.ts` - PATCH accepts `assignees` + member sync.
- `src/app/api/v2/timer/start/route.ts` - issue eligibility via `issueAssigneeIds`.
- `src/app/api/v2/issues/[issueId]/time-logs/route.ts` - GET/POST eligibility via `issueAssigneeIds`.
- `src/app/api/v2/projects/[projectId]/issues/[issueId]/attachments/{route,sign/route,[attachmentId]/route}.ts` - select `assignees` for the perm check.
- `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/{page.tsx,_issue-detail.tsx}` - pool from helper; `assigneeProfiles`; multi-assignee editor.
- `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/{page.tsx,_issue-detail.tsx}` - same as v2.
- `src/app/api/admin/zoho-import/issues/route.ts` - seed `assignees` from `assignee_id`.

### Deviations From Plan

- **Task Detail page (`_task-detail.tsx`) left untouched** — the plan floated making its assignee list editable via the shared component "for parity". It currently shows read-only chips and reassignment happens from the list view; making it editable is genuine added scope with its own permission surface, so it stays as-is (read-only chips). The member-pool widening does not affect it (it fetches specific assignee profiles by id, not a pool).
- **Attachment routes** (3) additionally had `assignees` added to their issue `select()` — not in the plan's file list, but they feed `getIssueEditPermission` and should get consistent input. No behavioural change today (assignee-only developers never have `canEditDetails` regardless).
- **`impeccable` design hook** flags `text-[10-12px]` literals as "off the DESIGN.md type ramp" in every file touched. These are pre-existing throughout this feature area and the new `_assignee-multi-select.tsx` deliberately matches its siblings' scale (`_searchable-select.tsx`, `_list-view.tsx`) per CLAUDE.md's "UI Polish Conventions" (match neighbouring hand-rolled UI, don't introduce a second system). Left as-is; not suppressed.

### Verification Run

- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (0 errors; 2 pre-existing unrelated warnings in `onboarding-workspace/_checklist-tab.tsx`)
- `pnpm build` - SKIPPED (not required by the task doc; tsc + lint cover compile)
- Browser acceptance - NOT RUN (handoff to `test` stage; migration 132 must be applied first for the multi-assignee paths)

### Post-review refinement (user request, 2026-09-09)

> "Hide the 'Unassigned' on the selection … make the assignee selection on New Task and New Issue multiple, same as the assign feature on the task/issue listing."

- **New Task + New Issue modals now use `AssigneeMultiSelect` for Assignee** (not the single-select `SearchableSelect`) — same searchable, checkable, `×`-chip popover as the listings. New `variant="field"` prop on `AssigneeMultiSelect` renders the trigger as a full-width form-input box + chevron (empty state shows a muted "Select assignees…" prompt, not the placeholder-avatar + "Unassigned" the listing cell uses). Both modals' assignee state is now `string[]`; submit sends `assignees: ids.length ? ids : undefined`.
- **`SearchableSelect` reverted** to its pre-351 state — the per-option `avatar` / `OptionAvatar` / `SelectOptionAvatar` additions were removed (only the assignee field used them, and it no longer uses `SearchableSelect`). Milestone / Tasklist keep their unchanged "Unassigned"-style clear row.
- Files touched in this pass: `_assignee-multi-select.tsx` (+`variant`), `_searchable-select.tsx` (revert), `_create-task-modal.tsx`, `_create-issue-modal.tsx`. `npx tsc --noEmit` + `pnpm lint` re-run PASS.

### Post-review fix 2 (user request, 2026-09-09) — popover flips above the trigger on FIRST open

> "The select assignee field places the selection below on first click even when it already overlaps the edge of the screen … it should be placed on top already if it exceeds the screen, not just on the second click. Apply this to the task/issue listing as well."

Root cause: the popover `<div ref={panelRef}>` was gated `{open && pos && createPortal(...)}`, so on the first open the panel was not in the DOM when `usePopoverPosition` first measured it — `offsetHeight` read as `0`, the flip-above check was skipped, and it only self-corrected on the second open (when `pos` retained its previous value and the panel mounted immediately). Same bug `_datetime-field-picker.tsx` already hit and fixed in task 338.

Fix — mirror the datetime-picker pattern in both popovers: render the portal as soon as `open` (drop the `&& pos` gate), position from `pos?.*`, and keep it `visibility: hidden` for the one frame until `pos` resolves. Now `usePopoverPosition` measures the real panel on the first open and flips it above when it would overflow the viewport bottom. `_assignee-multi-select.tsx` covers both the New Task / New Issue `variant="field"` fields **and** the Tasks/Issues listing cells (one component); `_searchable-select.tsx` gets the same fix for the New Task modal's Milestone / Tasklist fields.

Files: `_assignee-multi-select.tsx`, `_searchable-select.tsx`. `npx tsc --noEmit` + `pnpm lint` PASS.

### Post-review fix 3 (user request, 2026-09-09) — search input not auto-focused on open

Side effect of fix 2: the portal now mounts `visibility:hidden` for one frame, and a `visibility:hidden` element cannot take focus, so the search `<input autoFocus>` silently no-op'd and never got focus once the panel became visible. Replaced `autoFocus` with a `searchRef` + a `useEffect([open, pos])` that focuses the input once, the first time `pos` resolves (panel visible) per open cycle (guard ref reset on close; scroll/resize `pos` updates don't re-steal focus). Applied to both `_assignee-multi-select.tsx` and `_searchable-select.tsx`. `npx tsc --noEmit` + `pnpm lint` PASS.

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Avatar sizing fixed during the gate** — `_assignee-multi-select.tsx`'s `Avatar` and `_searchable-select.tsx`'s `OptionAvatar` originally set `width`/`height`/`fontSize` via inline `style` from a numeric `size` prop. Reworked to fixed Tailwind size classes (`AVATAR_SIZE` map / `w-5 h-5 text-[9px]`), matching `_status-report-assignee-cell.tsx` / `_avatar-stack.tsx` and CLAUDE.md's "always Tailwind classes, never `style={{}}`" (only `background`, one of six name-keyed palette hexes, stays inline — the established avatar pattern). `npx tsc --noEmit` + `pnpm lint` re-run clean.
- **No blocking issues** otherwise: no `any`, no dead/commented-out code (lint clean, ~449 lines removed vs ~272 added — net simplification from deleting `AssigneePicker`/`ResolvedAssigneeChip`/`IssueAssigneePicker`), errors handled intentionally (`getAssignableMembers` try/catch → name-only fallback; API routes return typed status codes), no secrets, `console.error` only on failure paths (codebase convention).
- **`text-[10–12px]` literals** in the touched files: pre-existing throughout this feature area; the new component deliberately matches its siblings' scale per CLAUDE.md "UI Polish Conventions". Left as-is, not suppressed.

### Deviations
- **Minor — Task Detail assignee editor not added.** The plan floated making `_task-detail.tsx`'s assignee list editable "for parity"; it was never a requirement and reassignment already works from the list view. Left as read-only chips. Member-pool widening does not affect it (fetches assignee profiles by id, not a pool).
- **Minor — 3 issue-attachment routes gained `assignees` in their issue `select()`.** Not in the plan's file list, but they feed `getIssueEditPermission`; keeps the permission input consistent. No behavioural change today (assignee-only developers never get `canEditDetails`).
- **Minor — avatar helper duplication.** `AVATAR_COLORS` + `initialsFor` now exist in two `_shared/` files (plus the pre-existing copies in `_status-report-assignee-cell.tsx` / `_avatar-stack.tsx`). Matches the documented per-component duplication convention in this feature area; ~8 lines, not extracted.
- **Medium — `getAssignableMembers()` adds ~2 requests** (1 `profiles` + 1 `auth.admin.listUsers()` page, the latter only because `ASSIGNEE_EXCLUDE` has `@` entries) per project-tab / issue-detail load. Documented in Compatibility Touchpoints with a mitigation (drop the email entries, rely on the name match). Acceptable for a ~few-dozen-user tenant.

## Compatibility Touchpoints

- **Migration 132** — written this task, **applied manually by the user** (Notes/issues-migration convention). Pre-apply, the `issues.assignees ?? [assignee_id]` shim keeps everything working single-assignee.
- **`src/types/database.ts`** — hand-edited (no TypeGen in this repo).
- **RLS** — `issues_developer_update` is replaced (drop-if-exists + recreate); `issues_pm_write` (migration 051) untouched and still OR's in for admin/pm/super_admin.
- **`getAssignableMembers()` adds an `auth.admin.listUsers()` call** to `_get-project-detail-data.ts` and the members route **only when** `ASSIGNEE_EXCLUDE` contains an `@` — which it does (Philippe's two emails). One page (~1 request) for a ~few-dozen-user tenant. If this proves slow, drop the two email entries and rely on the `"Philippe Bodart"` name match (his profile name is stable). Documented in the helper.
- **CLAUDE.md** — add a sentence to the `issues` table bullet about `assignees uuid[]` once migration 132 lands (documentation stage, not this task).
- No packaging / install-surface / adapter impact.
