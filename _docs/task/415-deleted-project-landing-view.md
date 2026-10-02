# 415: Deleted Project — Designed "Project Deleted" Landing View (replaces the bare 404)

**Created:** 2026-10-02
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

User report (2 screenshots): StackShift Orders > Order Details > Outcome links to a project that has since been soft-deleted (name `Cote and Kelley LLC Website_deleted_2026-09-10`, "deleted" pill). Clicking it lands on `/projects/v2/7CCCD944-PROJ-01/timeline` and shows the framework's bare **"404 | This page could not be found."** — no context, no way forward. Request: a "nice UI" for this deleted-project view, designed with the `frontend-design` and `impeccable:impeccable` skills.

### Root cause

- `getProjectDetailData()` (`projects/_shared/_get-project-detail-data.ts`) filters `.neq("status", "deleted")` and returns null, so `(tabs)/layout.tsx` calls `notFound()`. No `not-found.tsx` exists under `(hub)` or the app root, so Next's default 404 renders. That is right for *unknown* IDs but opaque for a known-deleted project.
- Soft delete (`DELETE /api/v2/projects/[projectId]`, tasks 231/247) sets `status = "deleted"` and renames to `<name>_deleted_<YYYY-MM-DD>`. There is **no** `deleted_at`/`deleted_by` column and **no restore** endpoint; only the rename suffix and `updated_at` carry the date.
- Order Details (task 413) still shows the misleading "Phases/milestones not set up yet — add them…" for a deleted project.

## Requirements

**Deleted-project view** (rendered instead of the 404 when the project exists with `status = 'deleted'`)
- [ ] Distinguish *deleted* from *not found / no access* with a lightweight lookup (project exists, `status = 'deleted'`, caller passes `isProjectVisibleToCurrentUser`). Unknown IDs and projects hidden from this user keep the plain 404 (no existence leak).
- [ ] Applies to every route under `/projects/v2/[projectId]/**` (tabs, onboarding-workspace, task/ticket/milestone detail). Implement once at the `[projectId]` level (task 414 added `[projectId]/layout.tsx`), not per page.
- [ ] Content, designed per `DESIGN.md` (v2.0 light navy/blue/orange; Space Grotesk page title; cards on `#F4F6FB`, borders `#E2E7F2`; `late`/`late-bg` red tokens for the deleted state; lucide icons only, no emoji):
  - Status header: "This project was deleted", showing the display name with the `_deleted_<date>` suffix stripped, plus "Deleted {date}".
  - Identity summary card: original name, display `project_id`, customer (link to `/customers/{customer_id}` when it still exists), classification chip, project type.
  - Plain-language "what this means" (1–2 lines): the record is retained but hidden from lists; tasks/tickets/files are no longer reachable here.
  - Actions: **Back to projects** (the project's classification tab when known, else `/projects/v2`) and **Open customer** (when linked). No "Back to order" (no referrer plumbing).
  - Optional, only if it reads well: muted counts of tasks / tickets / milestones kept for the record (head counts).
- [ ] No restore/undelete control and no copy about restoring (no backend for it); no disabled stub button.
- [ ] Accessible: single `h1`, visible focus rings, AA contrast on red-tinted surfaces, fine at mobile width, respects `prefers-reduced-motion`.
- [ ] Follow the neighbouring project-detail styling (fixed light tokens) — no `dark:` classes.

**Order Details Outcome fix** (small, paired with the screenshots)
- [ ] In `stackshift-orders/[orderId]/_components/order-review.tsx` (task 413): when the linked project's `status === "deleted"`, show a red "deleted" state with the suffix-stripped name and deletion date instead of the phases/milestones message. The link may stay (it now lands on the designed view). `page.tsx` already selects `status`.

## Out of Scope / Must-Not-Change

- No restore/undelete, no new columns or migration (`deleted_at` etc.), no change to `DELETE` semantics or the rename suffix.
- Standard 404 for unknown/hidden projects stays; do **not** add an app-wide `not-found.tsx` here (separate polish).
- `getProjectDetailData()` keeps returning null for deleted projects (other callers rely on it); the deleted check is a separate helper.
- `/projects/legacy/[projectId]` not covered unless the same bare 404 reproduces — note it, don't expand scope.
- Visibility unchanged: only users who could previously view the project see the deleted view.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/projects/deleted-name.ts` | Create | `splitDeletedName(name)` → `{ baseName, deletedOn }` parsing `_deleted_YYYY-MM-DD`; shared by the view and the order page. |
| `src/app/(hub)/projects/_shared/_get-deleted-project-summary.ts` | Create | `cache()`-wrapped `getDeletedProjectSummary(projectId)`: deleted project by display `project_id`, visibility check, customer name, classification, optional counts; null otherwise. |
| `src/app/(hub)/projects/_shared/_deleted-project-view.tsx` | Create | The designed view (server component, no client JS). Shared so legacy can reuse it later. |
| `src/app/(hub)/projects/v2/[projectId]/layout.tsx` | Modify | If the project is deleted, render `<DeletedProjectView>` instead of `{children}` (so `notFound()` never runs). Fold the status check into the existing project fetch (task 414) to avoid an extra query; keep the sidebar classification sync. |
| `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx` | Modify | Deleted state in Outcome. |

## Code Context

### Soft delete (`src/app/api/v2/projects/[projectId]/route.ts:133-136`)

```ts
const deletedName = `${existing.name}_deleted_${new Date().toISOString().slice(0, 10)}`;
.update({ status: "deleted", name: deletedName, updated_at: ... })
```

### Loader that causes the 404 (`projects/_shared/_get-project-detail-data.ts`)

```ts
.from("projects").select("*").eq("project_id", projectId).neq("status", "deleted").maybeSingle();
if (!project) return null;           // -> (tabs)/layout.tsx notFound()
```

### Notes

- `isProjectVisibleToCurrentUser(project.id)` is in `projects-old/_project-access` — reuse it so a developer without membership still gets the plain 404.
- Task 414's layout already fetches `customer_product_id`; extend that select with `id, name, status, customer_id, project_type, updated_at` and branch on `status === "deleted"`.
- Borrow the card/pill vocabulary from `order-review.tsx` / `_order-ui.tsx` (hand-rolled `rounded-full` pills, `#E2E7F2` borders) and the empty-state convention from CLAUDE.md (icon + message + primary action). Target a restrained two-column "identity + guidance" card, not a generic centered icon.
- During implementation, invoke **`frontend-design`** and **`impeccable:impeccable`** (read `PRODUCT.md` and `DESIGN.md` at repo root first) and record the design decisions in Implementation Notes.
- Deleted-date fallback: parsed suffix date, else `updated_at`.

## Implementation Steps

1. Add `splitDeletedName()`.
2. Add `getDeletedProjectSummary()` (visibility-checked, cached).
3. Design and build `_deleted-project-view.tsx` using the design skills; check at ~390 px and 1440 px.
4. Branch in `[projectId]/layout.tsx` (keep task 414's sidebar sync working).
5. Update Order Details Outcome for deleted projects.
6. `npx tsc --noEmit`, `pnpm lint`; browser-check the screenshot URL, an unknown ID, and a developer without access.

## Acceptance Criteria

- [ ] The deleted project's URL (`/projects/v2/7CCCD944-PROJ-01/timeline`) shows the designed view, not the bare 404, on every nested route (`/tasks`, `/files`, `/onboarding-workspace`, a task detail).
- [ ] Name shown without the `_deleted_<date>` suffix; deletion date shown; customer link works; "Back to projects" lands on the right classification tab.
- [ ] Unknown project ID and a project hidden from the viewer still show the standard 404.
- [ ] No restore control or copy anywhere.
- [ ] Order Details Outcome for a deleted project shows the deleted state, not "phases/milestones not set up yet".
- [ ] Holds at 390 px and 1440 px; keyboard focus visible; AA contrast; no `dark:` classes, no emoji.
- [ ] Non-deleted projects unaffected (including task 414's sidebar highlight); `tsc` and lint clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Browser: deleted project URL (tabs + nested), unknown id, restricted developer, live-project regression, Orders > converted order with a deleted project
```

## Compatibility Touchpoints

- CLAUDE.md `projects` bullet (soft delete): add one sentence that `/projects/v2/[projectId]/**` renders a deleted-project landing view (docs stage).
- Follow-up candidates: same view for `/projects/legacy/[projectId]`; a branded app-wide `not-found.tsx`.

## Implementation Notes

### What Changed
- Soft-deleted projects under `/projects/v2/[projectId]/**` now render a designed, read-only "Deleted {date}" landing card instead of the bare 404. Unknown/hidden projects still 404 (visibility checked via `isProjectVisibleToCurrentUser`).
- Order Details Outcome shows a red "deleted" pill, the suffix-stripped project name, and "this project was deleted." instead of the milestones hint.

### Design decisions (frontend-design + impeccable; PRODUCT.md / DESIGN.md)
- Operate-mode, restrained: one quiet red moment (tinted header band + `late` pill), everything else the v2.0 neutrals. No kicker/eyebrow, no icon-in-a-box, no hero metric, no motion (static, so reduced-motion is trivially respected).
- Title is the project's original name (suffix stripped) in Space Grotesk; facts in a 2-col `dl` (ID in tabular mono, customer link, classification chips, type); "Kept on record" counts as one muted tabular line, hidden when all zero; actions: primary "Back to projects" (classification tab when known), secondary "Open customer". No restore anywhere.
- Browser surfaces: themed selection colour, visible `focus-visible` outlines, `role="status"` + labelled `h1`.

### Files Changed
- `src/lib/projects/deleted-name.ts` (new) - `splitDeletedName()`.
- `src/app/(hub)/projects/_shared/_get-deleted-project-summary.ts` (new) - visibility-checked summary + head counts.
- `src/app/(hub)/projects/_shared/_deleted-project-view.tsx` (new) - the view.
- `src/app/(hub)/projects/v2/[projectId]/layout.tsx` - one cached project-row fetch now feeds both the task-414 sidebar sync and the deleted branch.
- `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx` - deleted state in Outcome.

### Deviations From Plan
- Layout fetches the project row itself (extended select) rather than adding a third query; sidebar still highlights the deleted project's classification(s). Regex avoids the `s` flag (TS target < es2018).

### Verification Run
- `npx tsc --noEmit` - PASS (no errors outside stale `.next` validator entries)
- `eslint` on changed files - PASS; design hook reported no deterministic issues
- Browser check (screenshot URL at 390/1440 px, unknown id, restricted developer) - SKIPPED (not run; needs an authenticated session)

## Quality Gate Notes

### Result
PASS

### Standards Review
- One gap found and fixed during the gate: the Order Details deleted pill omitted the deletion date required by the task; it now reads `deleted {date}` (parsed from the name suffix, local-midnight anchored). `tsc` + ESLint re-run clean.
- No blocking issues otherwise: view is a static server component with no client JS, typed props, no `any`, no dead code, helpers have single responsibilities, non-deleted projects incur no extra queries (summary helper returns early on status), visibility check preserves the no-leak 404.
- Accepted: `getProjectShell` casts the selected row to `DeletedProjectRow` (the select is a superset); `splitDeletedName` result computed in two places in `order-review.tsx` (name + date) — trivial, not worth a helper.

### Deviations
- Minor: layout fetches the project row itself instead of extending the detail loaders (documented). Browser acceptance still outstanding.
