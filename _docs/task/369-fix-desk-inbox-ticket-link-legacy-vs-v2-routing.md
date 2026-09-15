# 369: Fix Desk Ticket Links Hardcoded to `/projects/v2/` — Route Legacy Projects to `/projects/legacy/`

**Created:** 2026-09-15
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Desk > Inbox's "Linked Ticket" column and Desk > Tickets' "Project" column both hardcode ticket/project links to `/projects/v2/...`, regardless of whether the owning project is actually a v2 project or a **Legacy** (Zoho-imported) one. For a legacy project, `/projects/v2/{project_id}` resolves to a project lookup that finds no matching v2 row, so the linked ticket page 404s / doesn't resolve — as reported for a ticket under "Keeler Brass Company" (a legacy project): the Inbox link pointed at `/projects/v2/E3E8DA18-PROJ-01/tickets/E3E8DA1801-I0011`, which doesn't exist; the same ticket is correctly findable by searching `/projects/legacy`.

The codebase already has a discriminator for this: a `projects` row carrying a non-null `external_project_id` is Zoho-imported and lives under `/projects/legacy`; one with `external_project_id: null` lives under `/projects/v2` (see `_legacy-listing/_load-list-data.ts`'s query and CLAUDE.md's `projects` table bullet). A helper pair already implements this exact routing decision — `buildProjectHref()` / `buildItemHref()` in `src/app/(hub)/dashboard/_dev/_types.ts` (built for task 360's Dev Dashboard) — but it's currently local to the dashboard's `_dev` folder and unused by Desk. `_dev/_timer-card.tsx`'s own doc comment already flags a sibling instance of this same bug class in `timer-header-widget.tsx` as a known, deliberately-deferred follow-up (see Out of Scope).

This task: move the two-function helper to a shared `src/lib` location, and use it to fix the two hardcoded Desk links.

## Requirements

- [ ] Desk > Inbox's "Linked Ticket" link routes to `/projects/legacy/{project_id}/tickets/{ticket_display_id}` when the owning project is legacy (`external_project_id IS NOT NULL`), and to `/projects/v2/{project_id}/tickets/{ticket_display_id}` otherwise (unchanged behavior for v2 projects).
- [ ] Desk > Tickets' "Project" column link (the `_filed-issues-table.tsx` owning-project link) applies the same legacy/v2 discriminator.
- [ ] The legacy/v2 decision is made server-side (in each page's data loader), not client-side — matches the existing `_load-dev-dashboard.ts` pattern of resolving a ready-to-use href once and passing it down.
- [ ] `buildProjectHref` / `buildItemHref` logic is de-duplicated into one shared module rather than re-implemented a third time; the existing Dev Dashboard caller (`_load-dev-dashboard.ts`) keeps working unchanged.

## Out of Scope / Must-Not-Change

- `timer-header-widget.tsx`'s own hardcoded `V2_ROUTES.PROJECTS_V2` link for the active-timer trigger — already identified as a pre-existing bug in `_timer-card.tsx`'s comment, and explicitly deferred there because fixing it requires adding `external_project_id` to `ActiveTimerRow` / `attachTaskTitle()` (`src/lib/timer/serialize.ts`), shared server-side timer plumbing outside this task's Desk-only scope. Do not touch it here.
- The Desk > Tickets "Issue" title cell (`_filed-issues-table.tsx` lines ~86-93) has no link at all today (only the "Project" column does) — that's pre-existing and not part of the reported bug; do not add one.
- No DB schema/migration changes — `projects.external_project_id` already exists (migration 066).
- No changes to how legacy vs. v2 projects are classified/listed (`_legacy-listing` / `_v2-listing` query logic stays as-is) — only the two Desk link sites consume the existing discriminator.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/projects/deep-links.ts` | Create | Shared `buildProjectHref()` / `buildItemHref()`, moved out of the dashboard-only `_dev/_types.ts` so Desk can use them too. |
| `src/app/(hub)/dashboard/_dev/_types.ts` | Modify | Remove the two local function bodies; re-export both from the new shared module so the existing `_load-dev-dashboard.ts` import (`from "./_types"`) keeps working unchanged. |
| `src/app/(hub)/desk/inbox/page.tsx` | Modify | Select `external_project_id` alongside `project_id` on the `issues.projects` join; compute the legacy-aware href server-side; replace `linkedIssue: { issueDisplayId, projectId }` with `linkedIssue: { issueDisplayId, href }`. |
| `src/app/(hub)/desk/inbox/_inbox-index.tsx` | Modify | Update the `TicketListItem["linkedIssue"]` type: `projectId: string` → `href: string`. |
| `src/app/(hub)/desk/inbox/_inbox-table.tsx` | Modify | Use `t.linkedIssue.href` directly as the `Link href` instead of the hardcoded `` `/projects/v2/${t.linkedIssue.projectId}/tickets/${t.linkedIssue.issueDisplayId}` `` template. |
| `src/app/(hub)/desk/tickets/page.tsx` | Modify | Select `external_project_id` alongside `project_id, name` on the `issues.projects` join; compute `projectHref` server-side via `buildProjectHref()`; replace `projectId: string` with `projectHref: string \| null` on `FiledIssueListItem`. |
| `src/app/(hub)/desk/tickets/_filed-issues-index.tsx` | Modify | Update the `FiledIssueListItem` type: `projectId: string` → `projectHref: string \| null`. |
| `src/app/(hub)/desk/tickets/_filed-issues-table.tsx` | Modify | Use `issue.projectHref` directly as the `Link href` instead of the hardcoded `` `/projects/v2/${issue.projectId}` `` template. |

## Code Context

### File: `src/app/(hub)/dashboard/_dev/_types.ts` (current implementation to move)

```ts
/**
 * A project carrying `external_project_id` is Zoho-imported and lives under the Legacy tab —
 * the same discriminator `_legacy-listing/_load-list-data.ts` filters on. Both URL segments are
 * *display* ids, not UUIDs (the documented CLAUDE.md exception for these two routes).
 * Returns null when either id is missing, so the caller renders an unlinked row rather than a
 * href that 404s.
 */
export function buildProjectHref(project: {
  projectDisplayId: string | null;
  isLegacy: boolean;
}): string | null {
  if (!project.projectDisplayId) return null;
  const tab = project.isLegacy ? "legacy" : "v2";
  return `/projects/${tab}/${project.projectDisplayId}`;
}

export function buildItemHref(
  projectHref: string | null,
  kind: DevWorkKind,
  displayId: string | null
): string | null {
  if (!projectHref || !displayId) return null;
  return `${projectHref}/${kind === "task" ? "tasks" : "tickets"}/${displayId}`;
}
```

Moving this, `buildItemHref`'s `kind` param should be typed inline as `"task" | "ticket"` rather than importing the page-scoped `DevWorkKind` type into the new shared module — same two literal values, decoupled from the dashboard file.

### File: `src/app/(hub)/dashboard/_dev/_load-dev-dashboard.ts` (existing caller — must keep working)

```ts
const hrefByProjectId = new Map(
  projectRows.map((p) => [
    p.id,
    buildProjectHref({ projectDisplayId: p.project_id, isLegacy: !!p.external_project_id }),
  ])
);
// ...
href: buildItemHref(projectHref, kind, row.display_id),
```

Import is `import { buildItemHref, buildProjectHref, ... } from "./_types";` — keep this import path working via re-export rather than editing this file.

### File: `src/app/(hub)/desk/inbox/page.tsx` (current buggy construction)

```ts
type LinkedIssueRow = {
  source_ticket_id: string | null;
  display_id: string | null;
  created_at: string;
  projects: { project_id: string } | null;
};
// ...
const linkedIssueByTicketId = new Map<string, { issueDisplayId: string; projectId: string }>();
if (ticketIds.length > 0) {
  const { data: linkedRows } = await supabase
    .from("issues")
    .select("source_ticket_id, display_id, created_at, projects(project_id)")
    .in("source_ticket_id", ticketIds)
    .order("created_at", { ascending: false });
  for (const iss of (linkedRows ?? []) as unknown as LinkedIssueRow[]) {
    if (!iss.source_ticket_id || linkedIssueByTicketId.has(iss.source_ticket_id)) continue;
    const projectId = iss.projects?.project_id;
    if (iss.display_id && projectId) {
      linkedIssueByTicketId.set(iss.source_ticket_id, { issueDisplayId: iss.display_id, projectId });
    }
  }
}
```

Needs: add `external_project_id` to the `projects(...)` select, then build the href with `buildProjectHref` + `buildItemHref` instead of storing the bare `projectId`.

### File: `src/app/(hub)/desk/inbox/_inbox-table.tsx` (current buggy link)

```tsx
{t.linkedIssue ? (
  <Link
    href={`/projects/v2/${t.linkedIssue.projectId}/tickets/${t.linkedIssue.issueDisplayId}`}
    className="block py-3 pr-5 text-[11px] font-mono text-[#007BFF] hover:text-[#0063D6] hover:underline truncate"
  >
    {t.linkedIssue.issueDisplayId}
  </Link>
) : (
  <span className="block py-3 pr-5 text-[12px] text-[#5F6A88]">—</span>
)}
```

### File: `src/app/(hub)/desk/tickets/page.tsx` (current buggy construction)

```ts
type FiledIssueRow = {
  // ...
  projects: { project_id: string; name: string } | null;
  // ...
};
// ...
.select(
  "id, title, display_id, status, severity, assignees, assignee_id, created_at, projects(project_id, name), tickets(ticket_id, subject, status, first_response_at, sla_due_at)",
  { count: "exact" }
)
// ...
projectId: i.projects?.project_id ?? "",
projectName: i.projects?.name ?? "—",
```

Needs: add `external_project_id` to the `projects(...)` select and type, compute `projectHref` per row.

### File: `src/app/(hub)/desk/tickets/_filed-issues-table.tsx` (current buggy link)

```tsx
{issue.projectId ? (
  <Link
    href={`/projects/v2/${issue.projectId}`}
    className="text-[12px] text-[#3A4565] hover:text-[#007BFF] truncate transition-colors"
    title={issue.projectName}
  >
    {issue.projectName}
  </Link>
) : (
  <span className="text-[12px] text-[#5F6A88]">{issue.projectName}</span>
)}
```

## Implementation Steps

1. Create `src/lib/projects/deep-links.ts` with `buildProjectHref()` and `buildItemHref()` (kind typed as `"task" | "ticket"` inline), copied verbatim in behavior from the current `_dev/_types.ts` implementation, including the discriminator doc comment.
2. In `src/app/(hub)/dashboard/_dev/_types.ts`, delete the two function bodies and add `export { buildProjectHref, buildItemHref } from "@/lib/projects/deep-links";` (or equivalent re-export) so `_load-dev-dashboard.ts` needs no changes. Confirm `DevWorkKind` (still locally defined) is structurally compatible with the shared module's inline `"task" | "ticket"` kind param at the one call site (`buildItemHref(projectHref, kind, row.display_id)`).
3. In `src/app/(hub)/desk/inbox/page.tsx`: add `external_project_id` to the `LinkedIssueRow.projects` type and the `.select(...)` string; in the `linkedIssueByTicketId` loop, compute `const projectHref = buildProjectHref({ projectDisplayId: projectId, isLegacy: !!iss.projects?.external_project_id });` then `const href = buildItemHref(projectHref, "ticket", iss.display_id);` and only set the map entry when `href` is non-null; store `{ issueDisplayId, href }`.
4. In `src/app/(hub)/desk/inbox/_inbox-index.tsx`: change `linkedIssue: { issueDisplayId: string; projectId: string } | null;` to `linkedIssue: { issueDisplayId: string; href: string } | null;`.
5. In `src/app/(hub)/desk/inbox/_inbox-table.tsx`: change the `Link href` to `t.linkedIssue.href`.
6. In `src/app/(hub)/desk/tickets/page.tsx`: add `external_project_id` to `FiledIssueRow.projects` and the `.select(...)` string; when mapping to `FiledIssueListItem`, replace `projectId: i.projects?.project_id ?? ""` with `projectHref: buildProjectHref({ projectDisplayId: i.projects?.project_id ?? null, isLegacy: !!i.projects?.external_project_id })`.
7. In `src/app/(hub)/desk/tickets/_filed-issues-index.tsx`: change `projectId: string;` to `projectHref: string | null;` on `FiledIssueListItem`.
8. In `src/app/(hub)/desk/tickets/_filed-issues-table.tsx`: change the conditional from `issue.projectId ? <Link href={`/projects/v2/${issue.projectId}`}>` to `issue.projectHref ? <Link href={issue.projectHref}>`.
9. Run `npx tsc --noEmit` and `pnpm lint`; fix any type fallout at the two moved-helper call sites.

## Acceptance Criteria

- [ ] A ticket filed from a **legacy** project's thread shows a Desk > Inbox "Linked Ticket" link that resolves to `/projects/legacy/{project_id}/tickets/{ticket_display_id}` and loads the ticket detail page (verified against the reported case: Keeler Brass Company / `E3E8DA18-PROJ-01` / `E3E8DA1801-I0011`).
- [ ] A ticket filed from a **v2** project's thread still shows a Desk > Inbox link resolving to `/projects/v2/{project_id}/tickets/{ticket_display_id}` (no regression).
- [ ] Desk > Tickets' "Project" column link routes legacy projects to `/projects/legacy/{project_id}` and v2 projects to `/projects/v2/{project_id}`.
- [ ] Dev Dashboard's existing project/task/ticket deep links (task 360) are unaffected — same hrefs produced before and after the extraction.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser acceptance (no automated test runner in this repo):
1. Sign in as a PM/admin, open `/desk/inbox`, find a ticket linked to a legacy project (e.g. the Keeler Brass Company case above), click the "Linked Ticket" cell, confirm it lands on `/projects/legacy/...` and the ticket detail renders (not a 404 / not-found state).
2. Repeat for a ticket linked to a v2 project — confirm it still lands on `/projects/v2/...`.
3. Open `/desk/tickets`, click a "Project" cell for a row backed by a legacy project, confirm it lands on `/projects/legacy/{project_id}` (project overview), and repeat for a v2-backed row.
4. Spot-check the Dev Dashboard (`/dashboard`, developer role) active timer / My Work rows still deep-link correctly post-extraction.

## Compatibility Touchpoints

- No route, schema, env, or dependency changes. Purely an internal link-construction fix plus a helper relocation (`_dev/_types.ts` → `src/lib/projects/deep-links.ts`) with a re-export to avoid touching the one existing caller.

## Implementation Notes

### What Changed
- Extracted `buildProjectHref()` / `buildItemHref()` into a new shared `src/lib/projects/deep-links.ts` module; `_dev/_types.ts` now re-exports both (its one existing caller, `_load-dev-dashboard.ts`, needed no change).
- Desk > Inbox's "Linked Ticket" link and Desk > Tickets' "Project" link now resolve legacy vs. v2 project routing server-side via the shared helper, instead of hardcoding `/projects/v2/...`.

### Files Changed
- `src/lib/projects/deep-links.ts` - new shared module (verbatim behavior moved from `_dev/_types.ts`), `buildItemHref`'s `kind` param typed inline as `"task" | "ticket"` per plan
- `src/app/(hub)/dashboard/_dev/_types.ts` - removed the two function bodies, added a re-export from the new shared module
- `src/app/(hub)/desk/inbox/page.tsx` - added `external_project_id` to the `issues.projects` select/type; builds `href` server-side via `buildProjectHref` + `buildItemHref`; `linkedIssueByTicketId` now stores `{ issueDisplayId, href }`
- `src/app/(hub)/desk/inbox/_inbox-index.tsx` - `TicketListItem["linkedIssue"]`: `projectId: string` → `href: string`
- `src/app/(hub)/desk/inbox/_inbox-table.tsx` - Link now uses `t.linkedIssue.href` directly
- `src/app/(hub)/desk/tickets/page.tsx` - added `external_project_id` to the `issues.projects` select/type; `FiledIssueListItem.projectId` replaced with `projectHref` computed via `buildProjectHref`
- `src/app/(hub)/desk/tickets/_filed-issues-index.tsx` - `FiledIssueListItem`: `projectId: string` → `projectHref: string | null`
- `src/app/(hub)/desk/tickets/_filed-issues-table.tsx` - Link now uses `issue.projectHref` directly

### Deviations From Plan
- None — implemented exactly per the plan's steps and code context.

### Verification Run
- `npx tsc --noEmit` - PASS (no output/errors)
- `pnpm lint` - PASS (2 pre-existing unrelated warnings in `_checklist-tab.tsx`, not touched by this task)
- Browser/manual acceptance (legacy vs. v2 link click-through, Dev Dashboard spot-check) - SKIPPED (no browser session available this run; flagged for the `test`/verification stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- All 8 changed files read in full; each matches its planned diff exactly (`Implementation Steps` 1–8 traced 1:1 against the code).
- `src/lib/projects/deep-links.ts`: no dead code, both functions typed (no `any`), doc comment on the discriminator preserved verbatim from the original.
- `_dev/_types.ts`: clean re-export, no leftover unused imports; `DevWorkKind` confirmed still referenced elsewhere in the file (`DevWorkItem.kind`), not orphaned by the extraction.
- Confirmed via grep that `_load-dev-dashboard.ts` is the only consumer of `buildProjectHref`/`buildItemHref` outside the new module, and its `from "./_types"` import path is untouched — the re-export claim in the plan holds.
- Both Desk pages compute the legacy/v2 href server-side (RSC), matching the existing `_load-dev-dashboard.ts` precedent the plan cited; no client-side route construction remains.
- No secrets, debug logging, or new `any` introduced.

### Deviations
- Minor: `desk/inbox/page.tsx`'s guard reads `if (iss.display_id && href)` — the `iss.display_id` check is redundant since `buildItemHref` already returns `null` when `displayId` is falsy, so `href` truthy implies `display_id` was present. Harmless (correct behavior either way), not worth a follow-up edit; noting for awareness only.
- No other deviations — implementation matches the task doc's file list, code context, and step-by-step instructions exactly. No scope expansion; `timer-header-widget.tsx` and the Desk Tickets "Issue" title cell were correctly left untouched per Out of Scope.

### Required Fixes
- None.
