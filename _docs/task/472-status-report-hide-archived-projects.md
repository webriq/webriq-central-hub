# 472: Status Report — hide archived projects from the portfolio-wide list

**Created:** 2026-11-16
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Completed

---

## Overview

`/projects/v2/status-report` lists archived projects alongside active ones. The route
`GET /api/onboarding/projects/status-report` only excludes `status = 'deleted'` (task 231), so an
archived project with a `programme_started_at` still appears, health and overdue included.

**Evidence (live DB + local page, 2026-11-16):** the report shows 30 projects. One is archived:
`82ACEB0F-PROJ-02` "Greydog Security Website" (`projects.status = 'archived'`, Publish 77/30d,
"Needs attention"). It appears next to the real account, `82ACEB0F-PROJ-03` "Greydog Security -
StackShift I Upgrade", so Grey Dog is counted twice. This came up when auditing the report against the
"Tracker vs. Hub" spreadsheet.

Re-check query:

```sql
select project_id, name, status from projects
where programme_started_at is not null and status <> 'deleted' and status = 'archived';
-- expect 1 row today (82ACEB0F-PROJ-02)
```

Task 468 (merge wizard) archives every merged source project, so this list will keep growing unless it's
fixed.

## Requirements

- [ ] The portfolio-wide list (no `projectId` param) excludes `projects.status = 'archived'` as well as `'deleted'`.
- [ ] Single-project lookups (`?projectId=…`) still return an archived project, so its own detail-page Status Summary drawer, Status Report tab and programme notes bar keep working (D2).
- [ ] `'deleted'` stays excluded in both modes, as it is today.

## Out of Scope / Must-Not-Change

- `on_hold` and `completed` projects stay visible (D1).
- No change to health, overdue or days-left derivation (`src/lib/programme/status-report.ts`).
- No change to the "Include completed" toggle; it filters on phase completion (`isFullyCompleted`), not `projects.status`.
- No change to the v2/legacy project listings (task 468 decided their archived behaviour separately).
- No migration.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/onboarding/projects/status-report/route.ts` | Modify | Exclude `archived` when no `projectId` is given |

## Code Context

### File: `src/app/api/onboarding/projects/status-report/route.ts` (~line 46)

```ts
let projectsQuery = supabase
  .from("projects")
  .select(`…`)
  .not("programme_started_at", "is", null)
  // Soft-deleted projects (task 231) are excluded from the status report.
  .neq("status", "deleted")
  .order("programme_started_at", { ascending: true });
if (projectId) projectsQuery = projectsQuery.eq("id", projectId);
```

Callers that pass `?projectId=` and must keep seeing archived projects:
- `src/app/(hub)/projects/v2/[projectId]/_status-summary-drawer.tsx:53`
- `src/app/(hub)/projects/v2/[projectId]/_programme-notes-bar.tsx:47`
- `src/app/(hub)/projects/_shared/_status-report-tab.tsx:32`

The only caller without `projectId` is `src/app/(hub)/projects/v2/status-report/_status-report-client.tsx`.

## Implementation Steps

1. In the route, change the `if (projectId)` line to:
   ```ts
   // Archived projects (incl. task 468 merge sources) are hidden from the portfolio list only; their own detail page still loads them.
   projectsQuery = projectId ? projectsQuery.eq("id", projectId) : projectsQuery.neq("status", "archived");
   ```
2. `npx tsc --noEmit`.

## Acceptance Criteria

- [ ] **Pre-merge, browser:** `localhost:3000/projects/v2/status-report` shows "29 projects" (was 30), and "Greydog Security Website" is gone. "Greydog Security - StackShift I Upgrade" is still listed.
- [ ] **Pre-merge, no-regression, browser:** open the archived project `82ACEB0F-PROJ-02` detail page, then the Status Summary drawer / Status Report tab. Its phases still render (Publish, overdue), not empty.
- [ ] **Pre-merge, no-regression, browser:** the other 29 rows show the same current phase, used/allotted and health as before (e.g. M&I Interiors still "Migrate & Rebrand 110/15d"; Royal Thumper still "Publish, On track").
- [ ] **Pre-merge:** `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
```
Then do the browser checks above as an admin on the local app.

## Coordination

- **429 (In Progress, programme-engine cutover)** lists this route in WP3. The WP3 read change already appears to be in the route (`loadProgrammeSummaries`). If 429 still has pending edits to `status-report/route.ts`, land this after them; it's a one-line conflict at most.
- **468 (Testing, merge wizard)** archives merge sources; this task makes them disappear from the report. No shared file.

## Open Decisions

- **D1: RESOLVED (2026-11-16).** Hide `archived` only; `on_hold` and `completed` stay visible.
- **D2: RESOLVED (2026-11-16).** Keep returning archived projects for `?projectId=` lookups, so an archived project's own detail page still shows its status.

## Operator Steps

None: merging the change is enough.

## Compatibility Touchpoints

- None: no packaging, MCP tool or docs surface changes. `_docs/mcp-tools.md` is unaffected (this isn't an MCP tool).

## Baseline

- Browser `/projects/v2/status-report` (2026-11-16, before change): "30 projects", including archived "Greydog Security Website" (Publish 77/30d, Needs attention).

## Implementation Notes

### What Changed
- The portfolio-wide Status Report query now excludes `projects.status = 'archived'`. Single-project (`?projectId=`) lookups are unchanged and still return archived projects.

### Files Changed
- `src/app/api/onboarding/projects/status-report/route.ts`: the `projectId` branch is now a ternary that adds `.neq("status", "archived")` when no `projectId` is given.

### Deviations From Plan
- None. Note for the acceptance check: the v2 detail route uses the display ID (`/projects/v2/82ACEB0F-PROJ-02/status_report`); the UUID URL 404s by design.
- `git fetch` was skipped because CLAUDE.md forbids git commands; worked from the local task doc.

### Verification Run
- `npx tsc --noEmit`: PASS (exit 0)
- Browser `/projects/v2/status-report`: PASS (baseline "30 projects" → now "29 projects"; "Greydog Security Website" gone; "Greydog Security - StackShift I Upgrade" still listed)
- No-regression, browser: the other 29 rows are identical to the baseline (e.g. M&I Interiors "Migrate & Rebrand 110/15d (95d overdue)"; Royal Thumper "Publish, In progress, On track"): PASS
- No-regression, browser `/projects/v2/82ACEB0F-PROJ-02/status_report`: PASS (renders the merged/archived banner plus "Publish, Overdue, 77/30d (47d overdue)")

### Attempts That Failed
- Opened the archived project's detail page by UUID (`/projects/v2/1bb3f34a-…/status_report`) and got a 404. The detail loader matches on `project_id` (display ID), so this was a wrong URL, not a regression; retried with the display ID and it passed.

### Operator Steps
- None: merge is enough (single route file, no migration, no shared module importers).

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. One-line change in the only file listed in Proposed File Changes; no dead code, no `any`, no debug logging.
- The two `.neq("status", …)` filters on the same column combine with AND in PostgREST (`status=neq.deleted&status=neq.archived`), which the browser check confirms: 30 → 29 rows.
- `projects.status` is a non-null enum (`src/types/database.ts:1097`), so `neq` doesn't silently drop NULL-status rows.
- The comment states the why (portfolio-only, detail page still loads) in one line, matching the route's existing task-reference comment style.
- Every acceptance criterion has a check that could fail. The "29 projects" check failed against the baseline (30), so it proves the change.

### Deviations
- Minor: the acceptance-check URL is the display-ID route, not the UUID route. That's a doc clarification, not a code difference; it's recorded in Implementation Notes.
- Minor: changed files were identified from Implementation Notes instead of `git diff`, because CLAUDE.md forbids git commands.

### Required Fixes
- None
