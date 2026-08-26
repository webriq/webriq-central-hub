# 317: Time Logs — Render Notes as Rich Text (not raw HTML tags) + Total Row for Developer's Flat View

**Created:** 2026-08-26
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Testing

---

## Overview

Two independent fixes to the dedicated Time Logs page (`/dashboard/timelogs`, task 226/227/230):

1. **Notes tooltip shows literal HTML tags.** The Notes column's hover tooltip renders `entry.note` as plain text. `note` is Tiptap-authored HTML (`_time-log-notes-editor.tsx`, task 230) — e.g. a note typed as "App analysis" is stored as `<p>App analysis</p>`. Rendering it as text prints the tags literally instead of the formatted content (see screenshot: tooltip shows `<p>App analysis</p>`).

2. **No total for the developer's flat log list.** `TimeLogsTable` has two render paths: a *grouped* path (per-employee collapsible sections with a per-group hour subtotal in the group header) used by `admin`/`super_admin`/`pm`/`hr`, and a *flat* path with no subtotal anywhere. The flat path is reached only by the `developer` role — `client`/`marketing` are redirected away from this page entirely (`page.tsx:23`), and every other role gets `groupByUser: true` from the API (`/api/v2/time-logs/route.ts:79,188`), so the flat table is exclusively the developer's self-view. The screenshot shows this exact flat, total-less state. Add a "Total" row summing the `Daily Log Hours` column to this flat view only — confirmed with the user as the intended scope (not the grouped admin/pm/hr view, which already has per-employee subtotals).

## Requirements

- [ ] Notes tooltip in `_time-logs-table.tsx` renders `entry.note` as formatted HTML (bold/italic/lists render correctly), not literal tags, for both Tiptap-authored notes (task 230) and legacy plain-text notes (Zoho-imported, already HTML-stripped at import — must keep displaying correctly, unaffected).
- [ ] The **flat** (non-grouped) branch of `TimeLogsTable` gets a total row summing `Daily Log Hours` across all visible entries, formatted the same way as each row's own Daily Log Hours cell (`formatHoursAsHHMM`).
- [ ] The grouped branch (admin/pm/hr) is unchanged — it already shows a per-employee subtotal in each group header; no grand-total-across-groups is being added (explicitly out of scope per user confirmation).
- [ ] Total row respects the currently filtered `entries` (i.e. reflects `employeeFilter`/`projectFilter`/period exactly as displayed, not an unfiltered total) — trivial since it's derived from the same `entries` prop already passed to the table.

## Out of Scope / Must-Not-Change

- Do not touch the grouped (admin/pm/hr) rendering path beyond leaving it as-is.
- Do not add a grand total across all employee groups in the grouped view — user explicitly scoped this to the developer's flat view only.
- Do not change how `note` is stored (still Tiptap HTML via `PATCH`/`POST /api/v2/time-logs`) or the Zoho-import `stripHtml()` normalization (`zoho-import/timelogs/route.ts`, `zoho-import/issue-timelogs/route.ts`) — those already produce plain text with no tags, which will continue to render correctly (no tags to interpret) once the tooltip renders as HTML.
- Do not add HTML sanitization beyond the existing codebase convention — `note` is staff-authored Tiptap content, same trust boundary already used for task/issue comment bodies rendered via `dangerouslySetInnerHTML` (see `_task-comments.tsx`); do not introduce a new sanitizer library.
- Do not modify `_time-log-notes-editor.tsx` (the Tiptap editor itself) or the Add/Edit modal.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/dashboard/timelogs/_time-logs-table.tsx` | Modify | Fix 1: render Notes tooltip content as HTML. Fix 2: add total row to the flat (`!grouped`) table branch. |

## Code Context

### File: `src/app/(hub)/dashboard/timelogs/_time-logs-table.tsx`

Notes tooltip — currently renders raw text (line ~343-356):

```tsx
<td className="py-2.5 px-3">
  {entry.note ? (
    <Tooltip>
      <TooltipTrigger render={
        <button type="button" aria-label="View notes" className="flex items-center justify-center text-[#5F6A88] hover:text-[#007BFF] cursor-pointer transition-colors">
          <MessageSquare size={13} />
        </button>
      } />
      <TooltipContent side="top" className="whitespace-pre-wrap">{entry.note}</TooltipContent>
    </Tooltip>
  ) : (
    <span className="text-[#C7CEDD]">—</span>
  )}
</td>
```

Reference pattern for rendering Tiptap-authored HTML elsewhere in the codebase (`_task-comments.tsx`, same trust boundary — staff-authored HTML, no sanitizer):

```tsx
<div
  className={cn(
    "text-[13px] text-[#3A4565] leading-relaxed mt-0.5",
    "[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5",
    "[&_a]:text-[#0063D6] [&_a]:underline"
  )}
  dangerouslySetInnerHTML={{ __html: entry.note }}
/>
```

Flat (non-grouped) table branch — currently no footer/total (line ~445-458):

```tsx
if (!grouped) {
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] overflow-x-auto">
      <table className="w-full border-collapse">
        <TableHead />
        <tbody>
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} {...rowProps(entry)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Existing group-header subtotal style to mirror for the new total row's value cell (already imported: `sumHours`, `formatHoursAsHHMM`):

```tsx
<span className="ml-auto font-mono text-[12px] font-semibold text-[#3A4565]">
  {formatHoursAsHHMM(sumHours(group.entries))}
</span>
```

Row's own Daily Log Hours cell style (for column-alignment consistency in the new total row):

```tsx
<td className="py-2.5 px-3 font-mono text-[13px] font-semibold text-[#3A4565] whitespace-nowrap">{formatHoursAsHHMM(entry.hours)}</td>
```

## Implementation Steps

1. **Notes tooltip (Fix 1):** In `EntryRow`, replace `<TooltipContent side="top" className="whitespace-pre-wrap">{entry.note}</TooltipContent>` with a version that renders `entry.note` via `dangerouslySetInnerHTML`, keeping the tooltip's max-width/wrapping behavior sane (Tiptap notes are usually short — a `<p>`/`<ul>` shouldn't need much extra styling, but include the `[&_p]:my-0.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5` margin/list classes so multi-paragraph or list notes don't collapse into a run-on). Keep the `<MessageSquare>` trigger and the `entry.note ? … : "—"` empty-state branch unchanged.
2. **Total row (Fix 2):** In the `!grouped` return branch of `TimeLogsTable`, add a `<tfoot>` after `<tbody>` with one row: a "Total" label cell aligned under the Log Title column (bold, same `text-[#0B1533]` heading color used elsewhere) and the `formatHoursAsHHMM(sumHours(entries))` value cell aligned under the Daily Log Hours column (reuse the row cell's `font-mono text-[13px] font-semibold text-[#3A4565] whitespace-nowrap` classes for visual consistency), with the remaining columns empty (use `colSpan` on a trailing empty cell, matching the 8-column layout `TableHead` defines). Give the `<tfoot>` row a top border / subtle background (e.g. `border-t border-[#EDF0F7] bg-[#F9FAFD]`) so it reads as a summary row, consistent with the grouped view's header row treatment.
3. Do not touch the grouped branch's `<tbody>`-per-group structure or its existing per-group subtotal.

## Acceptance Criteria

- [ ] A time log entry with a note containing formatting (e.g. bold text or a bullet list, entered via the Add/Edit modal's rich text Notes field) shows correctly formatted text in the hover tooltip — no visible `<p>`, `<ul>`, `<strong>`, etc. tags.
- [ ] A time log entry with a plain-text (tag-free) note — e.g. a Zoho-imported one — still displays correctly in the tooltip (no regression).
- [ ] A note with no content still shows the `—` empty state, not an empty tooltip trigger.
- [ ] Logged in as a `developer`, the Time Logs page's flat table shows a "Total" row at the bottom summing `Daily Log Hours` for all currently visible rows, in `HH:MM` format, matching what you'd get by manually summing the visible rows' `Daily Log Hours` values.
- [ ] The total updates correctly when the period, project filter, or entries themselves change (add/edit/delete a log, or navigate periods) — no stale total.
- [ ] Logged in as `admin`/`pm`/`hr`, the grouped view is visually unchanged (per-group subtotals only, no new grand-total row).
- [ ] `npx tsc --noEmit` passes.
- [ ] `pnpm lint` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Browser-based acceptance testing (per project convention, no test runner configured):
- As `developer`: view Time Logs for a day/period with 2+ entries, confirm the new Total row sums correctly; hover a Notes icon on an entry whose note has rich formatting (bold/list) and confirm it renders formatted, not as raw tags.
- As `admin` or `pm`: confirm the grouped view is unchanged, and that its own Notes tooltips also render formatted (not raw tags) for any HTML-bearing note in that view.

## Compatibility Touchpoints

- None — purely a client-component rendering fix inside `_time-logs-table.tsx`, no API, schema, packaging, or docs surface affected.

## Implementation Notes

### What Changed
- Notes tooltip now renders `entry.note` via `dangerouslySetInnerHTML` (with `p`/`ul`/`ol`/`li` margin/list classes) instead of as raw text, so Tiptap-authored HTML notes display formatted instead of showing literal tags. Legacy/Zoho-imported plain-text notes are unaffected (no tags to interpret). The HTML lives on an inner `<span>` passed as `TooltipContent`'s `children`, not as a `dangerouslySetInnerHTML` prop on `TooltipContent` itself — see Quality Gate Notes.
- Added a `<tfoot>` total row to the flat (non-grouped) branch of `TimeLogsTable`, summing `Daily Log Hours` across all currently visible `entries` via the existing `sumHours`/`formatHoursAsHHMM` helpers. This branch is reached exclusively by the `developer` role (confirmed during planning — `client`/`marketing` are redirected off the page, every other role gets the grouped view with its own per-employee subtotals), matching the scope the user confirmed.

### Files Changed
- `src/app/(hub)/dashboard/timelogs/_time-logs-table.tsx` — both fixes, scoped to `EntryRow`'s Notes cell and the `!grouped` branch of `TimeLogsTable`.

### Deviations From Plan
- None. Implementation matches the proposed file changes and steps exactly.

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (2 pre-existing unrelated warnings in `_checklist-tab.tsx`, untouched by this change)
- Browser-based acceptance testing — SKIPPED (not run in this session; recommend manual check per the task doc's Verification section: developer-role Total row sum, and rich-text Notes tooltip rendering for both roles)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused/dead code, no `any`, no deep nesting, no new error paths, no secrets/logging introduced.
- `dangerouslySetInnerHTML` usage matches the existing `_task-comments.tsx` staff-authored-HTML convention referenced in the task doc — no new sanitizer, consistent trust boundary.
- Tailwind-only styling; no `style={{}}`; the reused `text-[13px]` arbitrary-value class in the new total row matches the identical value already used on every row cell in this same table (needed for column alignment) — consistent with this file's pre-existing pixel-value convention, not a new type step. `/impeccable` flagged this and one pre-existing occurrence on every edit pass; left as-is as intentional, matching the design-system exception already documented in `CLAUDE.md` for this codebase's hand-rolled UI.
- Found and fixed a real runtime defect during review (not present in the plan, introduced during implementation): the Notes-tooltip fix initially passed `dangerouslySetInnerHTML` as a prop directly on `<TooltipContent>`. `TooltipContent` (`src/components/ui/tooltip.tsx`) destructures `children` out of its props but *always* renders `{children}` alongside its own `<Arrow>` element inside `TooltipPrimitive.Popup`, and spreads the rest of its props (including our `dangerouslySetInnerHTML`) onto that same `Popup`. That combination — a non-empty `children` render plus a `dangerouslySetInnerHTML` prop on the same element — throws React's "Can only set one of `children` or `props.dangerouslySetInnerHTML`" invariant at runtime, which would have broken every Notes-tooltip open (crashing at minimum the tooltip content, not just showing raw tags — a regression from the original bug). Fixed by moving `dangerouslySetInnerHTML` onto a plain inner `<span>` passed as `TooltipContent`'s `children`, which has no `children` prop of its own and does not conflict. Verified `npx tsc --noEmit` and `pnpm lint` still pass after the fix; the underlying React invariant (that dangerouslySetInnerHTML and children can't coexist on one element) isn't something tsc/eslint catch, so this was only caught by reading `tooltip.tsx`'s implementation during the quality-gate review, not by the earlier verification commands — flagging this class of gap for anyone touching `TooltipContent` similarly in the future.

### Deviations
- Minor: the Notes-tooltip HTML now lives on an inner `<span>` (not directly on `TooltipContent`'s `className`/props as originally sketched in the task doc's Code Context) — required to avoid the `children`/`dangerouslySetInnerHTML` conflict above. Same visual output and CSS selectors (`[&_p]`, `[&_ul]`, etc. still match descendants of the span). No scope change.

### Required Fixes
- None — the defect above was fixed during this quality-gate pass, verified, and the task doc's Implementation Notes updated to reflect the corrected structure.
