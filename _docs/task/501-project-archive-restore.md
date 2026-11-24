# 501: Project Archive / Restore

**Created:** 2026-11-24
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

PMs have no way to archive a project. The plumbing already exists — `projects.status` allows
`archived` (migrations 025, 099) and `PATCH /api/v2/projects/[projectId]` accepts
`{ status: "archived" }` — but no UI calls it. Today only the merge flow (task 468) archives a
project (`src/lib/projects/merge/execute-files.ts:83`), and it also sets `merged_into_project_id`.

The current v2 listing (`_v2-listing`) filters on `onboarding_status` + `on_hold`, has no
Archived filter, and only hides *merged* projects — so a manually archived project would still
appear. This task adds Archive / Restore actions, an Archived filter (archived hidden by default)
on the v2 listing, and excludes archived projects from the PM/marketing dashboards.

Archive is a reversible "out of the working set" state, distinct from Delete (task 231/247:
soft delete + rename, irreversible from the UI).

### Decisions (confirmed with user 2026-11-24)

- **D1 — Restore always sets `status = 'active'`.** No migration; the pre-archive status is not
  recorded. A project that was On Hold comes back Active and the PM re-sets On Hold if needed.
- **D2 — Hide scope = v2 listing (default) + dashboards** (`GET /api/onboarding/projects`).
  The status report already excludes archived (`api/onboarding/projects/status-report/route.ts:71`).
  Digests, metrics, hours totals and project pickers are out of scope.

## Requirements

- [ ] **R1 — Archive action** on the v2 listing card/row kebab (`PortfolioCardMenu`) and the
      project detail header settings menu, for `admin | pm | super_admin` (same roles as Delete).
      Confirm dialog: `Archive "<name>"?` / "It will be hidden from the project list and
      dashboards. You can restore it any time from the Archived filter."
- [ ] **R2 — Restore action** replaces Archive when the project's `status === 'archived'`.
      No confirm dialog; success → `toast.success("Project restored")` + `router.refresh()`.
      Sets `status = 'active'` (D1).
- [ ] **R3 — Merged projects cannot be restored.** If `merged_into_project_id` is set, Restore is
      hidden in the UI and the API rejects it (409 `"Merged projects can't be restored"`).
- [ ] **R4 — API role gate.** `PATCH /api/v2/projects/[projectId]` currently gates `status` by RLS
      only. When the patch moves a project *into* or *out of* `archived`, require
      `admin | pm | super_admin` (via `asTestRole()`, mirroring `DELETE`) → 403 otherwise.
- [ ] **R5 — v2 listing hides archived by default.** With no status filter (`statusValues === null`)
      archived projects are excluded. Add `{ value: "archived", label: "Archived" }` to
      `STATUS_OPTIONS`. Like `on_hold`, `archived` is an exclusive display status: an archived
      project only matches when "Archived" is selected, never via its `onboarding_status`.
      Merged projects stay hidden even under the Archived filter (unchanged task 468 rule).
- [ ] **R6 — Archived pill.** `OnboardingProjectListItem.status` gains `"archived"`; the loader maps
      `p.status === 'archived'` → `"archived"` (checked before `on_hold`). Add an `archived`
      entry to `ONBOARDING_STATUS_STYLE` (neutral tone, no dot, label "Archived").
- [ ] **R7 — Detail header badge.** An archived project shows an "Archived" neutral chip instead of
      the phase badge in the v2 variant (the legacy variant already renders `ProjectStatusBadge`,
      which handles `archived`).
- [ ] **R8 — Dashboards exclude archived.** `GET /api/onboarding/projects` excludes
      `status = 'archived'` alongside `deleted`.
- [ ] Loading state on the Archive/Restore buttons; inline error like the delete menu's.

## Out of Scope / Must-Not-Change

- No migration (D1). No `archived_at` / `pre_archive_status` columns.
- Legacy listing (`_legacy-listing/*`, `/projects/legacy`) and `projects-old/*` — untouched.
  The legacy listing already has an Archived filter/badge.
- Digests, metrics, hours totals, MCP tools, project pickers, search — not audited here (D2).
- Do not block writes to archived projects (tasks/tickets/notes stay editable). Read-only
  behaviour stays specific to merged projects (`_merged-project-view.tsx`).
- `DELETE /api/v2/projects/[projectId]` and `useDeleteProject` — unchanged. Deleting an archived
  project still works.
- Merge flow (`src/lib/projects/merge/*`) — unchanged.
- No changes to `src/app/api/mcp/route.ts` (so `_docs/mcp-tools.md` stays as is).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/hooks/use-archive-project.ts` | Create | `setArchived(projectId, archived)` → PATCH `{ status: archived ? "archived" : "active" }`; `{ saving, error }` — mirrors `use-delete-project.ts` |
| `src/app/api/v2/projects/[projectId]/route.ts` | Modify | R3 + R4: role gate and merged-restore guard when `status` crosses `archived` |
| `src/app/(hub)/projects/_v2-listing/_portfolio-card-menu.tsx` | Modify | R1/R2: Archive/Restore item + confirm dialog; new props `isArchived`, `isMerged`, `canArchive` |
| `src/app/(hub)/projects/_v2-listing/_project-card.tsx`, `_project-row.tsx`, `_project-card-parts.tsx` | Modify | Pass the new props; `showProjectMenu` includes `canArchive` |
| `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` | Modify | `"archived"` in status union + `STATUS_OPTIONS`; pass `canArchive` (= `canDeleteProjects`) |
| `src/app/(hub)/projects/_v2-listing/_load-list-data.ts` | Modify | R5 filter logic; R6 status mapping; select `merged_into_project_id` only if needed for `isMerged` (always null in this listing — pass `false`) |
| `src/app/(hub)/dashboard/_components/dashboard-shared.tsx` | Modify | R6: `archived` style entry |
| `src/app/(hub)/projects/_shared/_project-detail-header.tsx` | Modify | R1/R2 in settings menu; R7 badge |
| `src/app/api/onboarding/projects/route.ts` | Modify | R8 |

## Code Context

### `src/app/api/v2/projects/[projectId]/route.ts`

```ts
const VALID_STATUS = ["active", "on_hold", "completed", "archived"] as const;
const DELETE_ROLES = ["admin", "pm", "super_admin"] as const;
// PATCH: status validated against VALID_STATUS, then .update(patch).eq("project_id", projectId)
// — no role check today beyond RLS (projects_pm_write).
// DELETE already does the role gate:
const { data: profileRow } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
const profile = await asTestRole(profileRow, user.id, { projectId }); // task 476
```

For R3/R4, when `body.status` is a string, read the current row
(`select("status, merged_into_project_id")`). If either the current or the target status is
`archived` → role gate (403). If current is `archived`, target ≠ `archived`, and
`merged_into_project_id` is set → 409. `merged_into_project_id` needs migration 180 — on
`42703` / `PGRST204` retry with `select("status")` and treat it as not merged (same fallback
as `execute-files.ts:85`).

### `src/app/(hub)/projects/_v2-listing/_load-list-data.ts`

```ts
const PROGRAMME_STATUSES = ["draft", "scheduled", "in_progress", "completed"] as const;
query = query.filter("merged_into_project_id", "is", null);   // keep
if (params.statusValues !== null) {
  const wantsOnHold = params.statusValues.includes("on_hold");
  const programmeStatuses = params.statusValues.filter(...);
  if (!wantsOnHold) query = query.neq("status", "on_hold").in("onboarding_status", ...);
  else if (programmeStatuses.length === 0) query = query.eq("status", "on_hold");
  else query = query.or(`status.eq.on_hold,onboarding_status.in.(${programmeStatuses.join(",")})`);
}
// line ~269:
status: (p.status === "on_hold" ? "on_hold" : (p.onboarding_status ?? "draft")),
```

Suggested rewrite (values stay whitelisted before interpolation):

```ts
if (params.statusValues === null) {
  query = query.neq("status", "archived");
} else {
  const wantsOnHold = params.statusValues.includes("on_hold");
  const wantsArchived = params.statusValues.includes("archived");
  const programme = params.statusValues.filter((v) => (PROGRAMME_STATUSES as readonly string[]).includes(v));
  const clauses = [
    ...(wantsOnHold ? ["status.eq.on_hold"] : []),
    ...(wantsArchived ? ["status.eq.archived"] : []),
    ...(programme.length ? [`and(status.not.in.(on_hold,archived),onboarding_status.in.(${programme.join(",")}))`] : []),
  ];
  query = clauses.length ? query.or(clauses.join(",")) : query.in("id", [ZERO_ROWS_ID]);
}
```

Check that the existing search `.or(...)` still ANDs with this one (two `.or()` calls become two
`or=` params — PostgREST ANDs them; verify against the live DB as task 361 did). If not, combine
manually. Also check whether tab counts / any other count query in this file reuses the status
filter and needs the same default exclusion.

### `src/app/(hub)/projects/_v2-listing/_portfolio-card-menu.tsx`

Props today: `projectId, projectDbId, projectName, canDelete, canManageCollaborators, canSetOwner,
hasProduct, currentClassifications, onDeleted, onRename`. Menu items use the shared class string
`"flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-[12px] text-[#3A4565] cursor-pointer transition-colors hover:bg-[#F4F6FB]"`.
Place Archive/Restore just above the divider before Delete. Icons: `Archive` / `ArchiveRestore`
(lucide). Reuse `ConfirmDialog` (`@/components/ui/confirm-dialog`). `onDeleted` already does
`router.refresh()` — reuse it (or rename the prop to `onChanged`) for archive/restore.

### `src/app/(hub)/projects/_shared/_project-detail-header.tsx`

```ts
const canDeleteProject = !!currentUserRole && DELETE_PROJECT_ROLES.includes(currentUserRole);
// badge: v2 → phaseLoading skeleton | Complete | Phase N pill; else <ProjectStatusBadge status={project.status} />
// settingsMenu items: Set Project Owner, Manage Collaborators, Merge to…, divider, DeleteProjectMenuItem
```

Add `canArchiveProject = canDeleteProject`; include it in the `settingsMenu` visibility condition.
Archive/Restore item before the divider; hide Restore when `project.merged_into_project_id` is set
(the merged view already explains that state). After success, `router.refresh()`. For R7, put an
`project.status === "archived"` branch first in the badge chain.

### `src/app/api/onboarding/projects/route.ts:71`

```ts
.neq("status", "deleted")
```
→ `.not("status", "in", "(deleted,archived)")`. This GET only feeds PM/marketing dashboards
(see the task 476 comment at line 72).

### `src/app/(hub)/dashboard/_components/dashboard-shared.tsx:260`

`ONBOARDING_STATUS_STYLE` — add
`archived: { label: "Archived", tone: "neutral", dot: false, darkBg: "bg-white/[0.06]", darkText: "text-slate-400" }`.

## Implementation Steps

1. API: R3/R4 guard in `PATCH /api/v2/projects/[projectId]` (with the 42703 fallback).
2. Create `src/hooks/use-archive-project.ts`.
3. Loader + list: R5 filter, R6 mapping/union, `STATUS_OPTIONS` entry, style entry.
4. Card menu: Archive/Restore + confirm; thread `canArchive` / `isArchived` through card, row and
   `showProjectMenu`.
5. Detail header: menu items + archived badge.
6. Dashboards GET: R8.
7. `npx tsc --noEmit`, then the browser checks below.

## Acceptance Criteria

- [ ] PM archives a project from the v2 listing kebab → confirm → it disappears from the default list.
- [ ] Selecting the "Archived" status filter shows it with an "Archived" pill; it doesn't appear under any other status filter.
- [ ] Restore from the kebab (Archived filter) → project returns to the default list with status `active`.
- [ ] Archive/Restore from the detail header settings menu works and the header shows "Archived" while archived.
- [ ] A developer/marketing user sees no Archive/Restore item; a direct PATCH `{status:"archived"}` from such a user returns 403.
- [ ] PATCH restoring a merged project returns 409; Restore isn't offered on a merged project's detail page.
- [ ] Merged projects still never show in the v2 listing, including under the Archived filter.
- [ ] PM/marketing dashboard project widgets don't count archived projects.
- [ ] Rename/Delete/On Hold behaviour is unchanged; deleting an archived project still works.
- [ ] Test-data rules (task 476) unchanged — test projects stay hidden from non-Test Users.

## Verification

```bash
npx tsc --noEmit
pnpm lint   # if configured
```

Browser (PM account): steps for AC 1–4, 7, 9 on `/projects/<classification>`.
Browser (developer or marketing account): AC 5 UI part.
curl / devtools fetch: AC 5 API (403) and AC 6 (409) — pick a project with
`merged_into_project_id` set.
Dashboard: compare the PM dashboard project count before/after archiving one project (AC 8).

## Compatibility Touchpoints

- No migration; no env vars; no MCP tool changes.
- `merged_into_project_id` (migration 180) may be unapplied in some environments — the API guard
  must degrade on `42703` / `PGRST204`.
- `_docs/context/projects.md` — add a short "Archive vs Delete vs Merge" note at the document stage.

## Implementation Notes

### What Changed
- PATCH `/api/v2/projects/[projectId]`: when `status` moves into or out of `archived`, the caller must be admin | pm | super_admin (via `asTestRole`, same as DELETE) → 403; restoring a merged project → 409.
- New `useArchiveProject()` hook (PATCH `archived` / `active`); resolves to `null` on success or the error message.
- v2 listing: archived projects hidden when no status filter is set; new "Archived" status option; status filter rebuilt as one `.or()` so `on_hold` / `archived` stay exclusive display statuses; loader maps `status = archived` → `"archived"`; Archived pill style.
- Listing kebab (`PortfolioCardMenu`) and detail header settings menu: Archive (confirm dialog) / Restore (no confirm), toast on success, `router.refresh()`.
- Detail header shows an "Archived" chip in place of the phase/status badge; Restore hidden for merged projects.
- `GET /api/onboarding/projects` (dashboards) excludes `archived` alongside `deleted`.

### Files Changed
- `src/app/api/v2/projects/[projectId]/route.ts` - R3/R4 guard (`loadArchiveState`)
- `src/hooks/use-archive-project.ts` - new hook
- `src/app/(hub)/projects/_v2-listing/_load-list-data.ts` - R5 filter, R6 mapping
- `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` - status union + `STATUS_OPTIONS`
- `src/app/(hub)/projects/_v2-listing/_portfolio-card-menu.tsx` - Archive/Restore item + confirm; `MENU_HEIGHT` 280 → 308 for the extra item
- `src/app/(hub)/projects/_v2-listing/_project-card.tsx`, `_project-row.tsx` - pass `isArchived`
- `src/app/(hub)/dashboard/_components/dashboard-shared.tsx` - `archived` pill style
- `src/app/(hub)/projects/_shared/_project-detail-header.tsx` - menu item, confirm dialog, badge
- `src/app/api/onboarding/projects/route.ts` - R8

### Deviations From Plan
- No separate `canArchive` / `isMerged` props on `PortfolioCardMenu`: Archive uses the same roles as Delete, so `canDelete` gates both, and merged projects never reach the v2 listing. `showProjectMenu` and `_project-card-parts.tsx` are unchanged as a result.
- The API reads the merged flag with `select("*")` (the `stackshift-orders/[orderId]/link-project` pattern) instead of a 42703/PGRST204 retry: `merged_into_project_id` isn't in the generated types, and `*` never errors when migration 180 is unapplied.
- `useArchiveProject().setArchived` returns `string | null` instead of `boolean`, so the header can toast the real error without reading stale hook state.

### Verification Run
- `npx tsc --noEmit` - PASS
- `npx eslint` on the 10 changed files - PASS
- Browser / curl acceptance checks (AC 1–10) - SKIPPED (pending the test stage; needs PM + developer/marketing accounts and a merged project)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Fixed during the gate: Restore closed its menu before running, so the `"Restoring…"` button label was never visible and the action had no loading state (CLAUDE.md UI convention). Both call sites now show `toast.loading("Restoring project…")`, which turns into the success/error toast (the card menu dismisses it and keeps its inline error). The unreachable `"Restoring…"` labels were removed. Re-ran `npx tsc --noEmit` and eslint on both files: PASS.
- Verified the search `.or()` plus status `.or()` assumption: postgrest-js `or()` calls `url.searchParams.append`, so two `or=` params are sent and PostgREST ANDs them. A live DB check is still in the test stage.
- `PATCH /api/v2/projects/[projectId]` now does one extra single-row read on every status PATCH (it needs the current status to tell whether archive is involved). This is acceptable.
- No `any`, dead code or debug logging. The `(row as { merged_into_project_id?: … })` casts match the existing pattern for this column, which isn't in the generated types.
- `PortfolioCardMenu` reuses `onDeleted` as the refresh callback for archive/restore. The name is slightly off, but a comment explains it; a rename would touch unrelated call sites.

### Deviations
- Minor: the three listed in Implementation Notes (no `canArchive`/`isMerged` props, `select("*")` instead of a 42703 retry, `setArchived` returns `string | null`). All still satisfy R1–R8.
- Medium (visible to the user): `_project-detail-header.tsx` is shared by the v2 and legacy (`/projects/legacy/[projectId]`) detail pages, so Archive/Restore and the Archived badge also appear on legacy detail pages. The doc listed this file without excluding the legacy variant, and the legacy listing already has an Archived filter, so the behaviour is consistent and the risk is low. Gate it with `variant === "v2"` if it isn't wanted there.

### Required Fixes
- None.
