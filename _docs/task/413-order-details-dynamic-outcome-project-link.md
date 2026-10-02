# 413: Orders > Order Details — Dynamic Outcome + Link to Project Details

**Created:** 2026-10-02
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

On `/stackshift-orders/[orderId]` for a **converted** order, the **Outcome** section always renders
`Draft project: <name> (start the 120-day programme from the project when ready)`
(`order-review.tsx:182-187`). That hint is hard-coded: it is wrong for non-StackShift-I projects (which use
generic milestones, not the 120-day engine), wrong once phases/milestones have been set up or the programme
started, and the project name is plain text with no link.

Make the project line **dynamic** (reflects the project's real setup state) and make the project name a **link to the Project Details page**.

## Requirements

- [ ] Project name in Outcome links to `/projects/v2/{projects.project_id}` (display ID — see CLAUDE.md "two scoped exceptions"). Fall back to `projects.id` (UUID) only if `project_id` is null; the v2 detail route must already tolerate that, otherwise fall back to unlinked text.
- [ ] Replace the static "(start the 120-day programme…)" hint with a state-derived message:
  - **Engine project (`uses_customer_phases_engine = true`, StackShift I), no `customer_phases` rows** → "Draft project — 120-day programme not started yet. Start it from the project when ready."
  - **Engine project with `customer_phases` rows** → programme started; show current phase/status summary (e.g. "120-day programme in progress — Phase N: {name}") or at minimum "120-day programme started".
  - **Non-engine project, zero `milestones`** → "Draft project — phases/milestones not set up yet. Add them from the project's Milestones tab."
  - **Non-engine project with milestones** → "{n} phase(s)/milestone(s) set up" (count from `milestones`).
  - Project `status` shown as a small pill when not draft (e.g. active/completed), using the existing hand-rolled pill style.
- [ ] "Draft project:" label becomes "Project:" and only says "Draft" while `projects.status` is draft.
- [ ] Project missing/deleted (`order.project_id` set but row gone) → render "Linked project no longer exists" instead of crashing or silently omitting.
- [ ] Customer link on the Outcome line keeps working unchanged.

## Out of Scope / Must-Not-Change

- Convert flow (`create-from-order.ts`, `_convert-panel.tsx`, `_phase-setup-dialog.tsx`) — no behaviour change.
- No migration, no new API route; data is fetched server-side in `page.tsx` via the existing RLS server client (admin/super_admin only page).
- Do not alter the Dismissed / pending sections of the page.
- Do not add `dark:` classes; this page uses the fixed light hex palette already present.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/stackshift-orders/[orderId]/page.tsx` | Modify | Extend project lookup: select `name, project_id, status, uses_customer_phases_engine`; count `milestones` (head count) and fetch current `customer_phases` summary for engine projects; pass a `_project` object. |
| `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx` | Modify | Replace `_linkedProjectName` with `_project: LinkedProject \| null`; render link + dynamic message. |
| `src/app/(hub)/stackshift-orders/[orderId]/_components/_order-ui.tsx` | Modify (optional) | Only if a small status pill helper is worth sharing. |

## Code Context

### File: `.../[orderId]/page.tsx` (current)

```tsx
if (order.project_id) {
  const { data: pr } = await supabase.from("projects").select("name").eq("id", order.project_id).maybeSingle();
  linkedProjectName = pr?.name ?? null;
}
```

### File: `.../_components/order-review.tsx:182` (current, to replace)

```tsx
{order._linkedProjectName && (
  <p className="col-span-2 text-[13px] text-[#3A4565]">
    Draft project: <span className="font-medium text-[#0B1533]">{order._linkedProjectName}</span>{" "}
    (start the 120-day programme from the project when ready)
  </p>
)}
```

### Notes

- Routes: `V2_ROUTES.PROJECTS_V2` = `/projects/v2`; detail = `${V2_ROUTES.PROJECTS_V2}/${project_id}` (precedent: `pm-dashboard.tsx:164`).
- Tables: `customer_phases` (`project_id` = project UUID, `phase_number`, `status`, `sort_order`), `milestones` (`project_id` UUID). Use `{ count: "exact", head: true }`; both are far below the 1000-row cap.
- Suggested shape: `type LinkedProject = { name; publicId: string | null; id: string; status: string; usesEngine: boolean; milestoneCount: number; phaseCount: number; currentPhaseLabel: string | null }`. Keep the message derivation in a small pure helper in `order-review.tsx` (page-scoped UI rule).
- Link style: reuse the customer link classes (`text-[#007BFF] hover:underline`).

## Implementation Steps

1. In `page.tsx`, extend the project lookup and compute counts; build `_project`.
2. Update `OrderDetail` type and `order-review.tsx` to render the linked name + derived message per the matrix above.
3. Handle the missing-project case.
4. `npx tsc --noEmit`, `pnpm lint`.
5. Browser check against converted orders of each shape.

## Acceptance Criteria

- [ ] Converted StackShift I order, programme not started → link + "120-day programme not started" message.
- [ ] Converted non-StackShift-I order with "skip" phase setup → "phases/milestones not set up yet" message (NOT the 120-day text).
- [ ] Converted order whose project later got milestones / programme started → message reflects the real state after refresh.
- [ ] Clicking the project name opens `/projects/v2/{project_id}` Project Details.
- [ ] Orphaned `project_id` renders the fallback line, no error.
- [ ] Pending/dismissed orders unchanged; `tsc` and lint clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Browser: /stackshift-orders/{converted order id} for each project shape above
```

## Compatibility Touchpoints

- None for packaging/adapters. CLAUDE.md StackShift-orders paragraph may get one clause noting the Outcome section is state-driven (docs stage).

## Implementation Notes

### What Changed
- Outcome now shows a linked project name (`/projects/v2/{project_id}`, UUID fallback) plus a message derived from real state (engine programme not started / in progress with current phase; non-engine milestone count or "not set up yet"); orphaned project shows "Linked project no longer exists."

### Files Changed
- `src/app/(hub)/stackshift-orders/[orderId]/page.tsx` - fetch project status/engine flag, milestone count, customer_phases; build `_linkedProject`.
- `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx` - `LinkedProject` type, `describeProject()`, link + status pill render.

### Deviations From Plan
- `projects.status` has no "draft" value (`active|on_hold|completed|archived|deleted`), so the label is always "Project:" and "draft"-ness is conveyed by the message; the status pill shows only when status is not `active`.

### Verification Run
- `npx tsc --noEmit` - PASS for changed files (only stale `.next/types/validator.ts` errors for removed routes)
- Browser check - SKIPPED (not run)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. ESLint on `stackshift-orders/[orderId]` is clean; no `any`, dead code, or inline styles; `describeProject()` is a small pure helper; missing-project case handled.
- Nit (not fixed): the `milestones` count query also runs for engine projects where it is unused. Cheap head-count, left as is.

### Deviations
- Minor: no "draft" project status exists, so label is always "Project:" and the pill shows only for non-`active` status (already documented in Implementation Notes).
