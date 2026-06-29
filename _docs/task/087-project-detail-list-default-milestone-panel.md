# Task 087 — Project Detail Overhaul: Primary Tabs, Tasklist Grouping, Milestone Panel & Skeleton

> **Priority:** HIGH
> **Type:** feature
> **Version impact:** minor
> **Recommended Model:** haiku
> **Investigation:** /understand ran before this spec. Findings embedded below.
> **Status:** COMPLETED
> **Completed:** 2026-06-29
> **Implementation Notes:** Full project detail overhaul delivered iteratively in-session. All changes TypeScript-clean with zero errors.

---

## Summary

End-to-end overhaul of the Project Detail page (`/v2/projects/[projectId]`) and related project listing behavior, implemented across multiple iteration rounds:

1. **Default view:** Board → List
2. **Milestone panel:** Dedicated table-style panel replacing the compact pill bar, moved to its own Milestones tab
3. **Primary navigation tabs:** Tasks / Issues / Milestones — pill-button style (gray container, white active pill)
4. **View switcher:** List / Board / Calendar moved to a dropdown button in the Tasks toolbar
5. **List view grouping:** Tasks now grouped by tasklist instead of milestone
6. **Projects sort:** Projects listing sorted by `start_date DESC` (nulls last)
7. **Tasklist sort:** Tasklists ordered by `created_at ASC`
8. **Loading skeleton:** New `loading.tsx` matching the updated detail layout

---

## What Was Built

### Primary tabs (Tasks / Issues / Milestones)
- Pill-button style matching the existing design system — gray `bg-slate-100` container, white active pill with shadow
- **Tasks tab:** Shows the task list/board/calendar with a view switcher dropdown
- **Issues tab:** Stub ("coming soon")
- **Milestones tab:** Shows `MilestonePanel` full-page

### View switcher dropdown (List / Board / Calendar)
- Compact dropdown button (`border border-slate-200`, icon + label + chevron) in the Tasks toolbar
- Overlays dismissed by a fixed backdrop div
- Order: List → Board → Calendar

### Milestone panel (`_milestone-panel.tsx`)
- Replaces the old compact `_milestone-bar.tsx` pill row
- Table layout: Name | Status badge | Due date | Tasks (done/total) | Edit | Delete
- Inline add row (Enter to save, Escape to cancel)
- Inline per-row edit mode (name, due date, status select)
- Task counts via O(n) Map — one pass over all tasks, not filter-per-milestone
- `style={{}}` only on status badge colors (hex values from `M_STATUS_STYLE`, documented Tailwind exception)

### List view tasklist grouping (`_list-view.tsx`)
- Groups tasks by `tasklist_id` using an O(n+m) bucket algorithm (one pass builds buckets keyed by tasklist ID, then iterates tasklists in order)
- Tasklists sorted by `created_at ASC` (server-side)
- Empty tasklists show "No tasks in this list." placeholder row
- Tasks without a tasklist fall into a "No Tasklist" bucket at the end
- Group header: collapse/expand chevron + tasklist name + task count

### Loading skeleton (`loading.tsx`)
- Created at `src/app/v2/(hub)/projects/[projectId]/loading.tsx`
- Mirrors real layout: back link, title + badge, subtitle, pill tabs, view dropdown toolbar, 3 tasklist groups with shimmer rows

### Projects listing sort
- `projects/page.tsx`: `.order("start_date", { ascending: false, nullsFirst: false })` — latest start date first

---

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `src/app/v2/(hub)/projects/_pm-shared.tsx` | Modify | Added `Tasklist` type export |
| `src/app/v2/(hub)/projects/page.tsx` | Modify | Sort projects by `start_date DESC nulls last` |
| `src/app/v2/(hub)/projects/[projectId]/page.tsx` | Modify | Added tasklists parallel fetch (`created_at ASC`); passes `initialTasklists` to `ProjectDetail` |
| `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` | Rewrite | Primary tabs, view dropdown, removed milestone filter, removed header border/moved to toolbar |
| `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` | Rewrite | Groups by tasklist instead of milestone; O(n+m) bucket algorithm |
| `src/app/v2/(hub)/projects/[projectId]/_milestone-panel.tsx` | Create | Dedicated milestone table panel with inline CRUD |
| `src/app/v2/(hub)/projects/[projectId]/loading.tsx` | Create | New detail-page loading skeleton |

---

## Acceptance Criteria

- [x] Opening any project detail page lands on List view (not Board)
- [x] Primary tabs Tasks / Issues / Milestones shown as pill buttons
- [x] List / Board / Calendar shown as a dropdown in the Tasks toolbar
- [x] List view groups tasks by tasklist (ordered by `created_at ASC`), with collapse/expand
- [x] Tasks without a tasklist fall into "No Tasklist" bucket
- [x] Milestones tab shows the full milestone panel
- [x] Milestone panel: name, status badge, due date, task count (closed/total), inline add/edit/delete
- [x] Projects listing sorted by `start_date DESC` (nulls last)
- [x] Loading skeleton matches updated layout (tabs, toolbar, tasklist groups)
- [x] No TypeScript errors
