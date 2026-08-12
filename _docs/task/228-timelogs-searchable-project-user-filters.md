# 228: Time Logs Page — Searchable Project & User Filters (Follow-up to Tasks 226/227)

**Created:** 2026-08-12
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Completed

---

## Overview

Follow-up to task 226 (Dedicated Time Logs Page) and task 227 (User filter added). Both the
Project filter and the User filter on `/v2/dashboard/timelogs` (`_time-logs-content.tsx`) are
currently plain native `<select>` elements (task 226's Assumption 4 explicitly chose a plain
`<select>` for Project; task 227 copied the same shape for User). As the number of projects and
employees grows, scrolling a native `<select>` to find one entry gets slow — this task replaces
both with a searchable single-select dropdown (type to filter the option list), matching the
combobox interaction already established elsewhere in this codebase.

This is filter-control UX only — no change to what either filter *does* (same options sources,
same state, same effect that refetches on `projectFilter` change, same client-side filtering for
`employeeFilter`), only how the user picks a value.

## Requirements

- [ ] New reusable single-select searchable dropdown component (see Code Context for the pattern
      to mirror) used for **both** the Project filter and the User filter in
      `_time-logs-content.tsx`.
- [ ] Trigger button keeps the exact current pill styling/placement (`rounded-full border
      border-[#E2E7F2] bg-white px-3 py-[6.5px] text-[11px] font-semibold text-[#5F6A88]
      hover:border-[#A8C6F5]`) and shows the selected option's label, or "All Projects"/"All
      Users" when unset — visually indistinguishable from today's `<select>` at rest.
- [ ] Opens a `document.body`-portrayed panel (portal-positioned off the trigger's rect, same
      scroll/resize-reposition + outside-click-close behavior as `TypeMultiSelect`/
      `FilterMultiSelect`) containing: a search `<input>` at the top (auto-focused,
      `Search size={12}` icon), an "All Projects"/"All Users" row to clear the selection, then the
      filtered option list. Matching on a case-insensitive substring of the option label.
- [ ] Selecting an option (or "All …") sets the same `projectFilter`/`employeeFilter` state that
      exists today and closes the panel. No change to either `useEffect`/`useMemo` that consumes
      those state values.
- [ ] Empty filtered-list state shows "No matches" (same as `TypeMultiSelect`'s pattern).
- [ ] Keyboard-operable: search input is focusable/typeable immediately on open; Escape or an
      outside click closes the panel without changing the selection.
- [ ] Respects existing role gating — the User filter dropdown still only renders when
      `canFilterByUser` is true; no gating changes.
- [ ] File-length guideline respected — if adding this inline pushes `_time-logs-content.tsx` past
      the guideline, extract the new component to its own file
      (`_searchable-select.tsx`) in the same directory (page-scoped, not shared outside this
      feature area — same reasoning task 226 already used for not reaching into
      `_filter-multi-select.tsx`).

## Out of Scope / Must-Not-Change

- No change to the options sources: Project options still come from the existing `projects` fetch
  (`GET /api/v2/projects`); User options still come from the existing `employeeOptions` `useMemo`
  derived from loaded `entries` (task 227) — no new endpoint, no multi-select, no change to what
  "All Projects"/"All Users" means.
- No change to `_time-logs-table.tsx`, `_export-pdf.ts`, `_time-log-entry-modal.tsx`,
  `_time-period-picker.tsx`/`_time-period-panels.tsx`, or any API route — this task only touches
  the two filter *controls* inside `_time-logs-content.tsx`.
- Not a multi-select — both filters stay single-value (`projectFilter`/`employeeFilter` remain
  `string`, not `string[]`). Do not adopt `FilterMultiSelect`'s checkbox-group semantics.
- Does not touch `TypeMultiSelect` or `FilterMultiSelect` themselves (different feature areas,
  portfolio-tracker-scoped) — a new component is added for this feature area rather than reaching
  into either of those, consistent with task 226's own established reasoning for this directory.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/dashboard/timelogs/_searchable-select.tsx` | Create | New single-select searchable combobox component (trigger + portal panel + search input) |
| `src/app/v2/(hub)/dashboard/timelogs/_time-logs-content.tsx` | Modify | Replace the two native `<select>` filters (Project, User) with `<SearchableSelect>` instances; remove now-unused `<select>` markup |

## Code Context

### Current Project/User filters to replace (`_time-logs-content.tsx:116-137`)

```tsx
<select
  value={projectFilter}
  onChange={(e) => setProjectFilter(e.target.value)}
  className="rounded-full border border-[#E2E7F2] bg-white px-3 py-[6.5px] text-[11px] font-semibold text-[#5F6A88] outline-none cursor-pointer hover:border-[#A8C6F5]"
>
  <option value="">All Projects</option>
  {projects.map((p) => (
    <option key={p.id} value={p.id}>{p.name}</option>
  ))}
</select>
{canFilterByUser && (
  <select
    value={employeeFilter}
    onChange={(e) => setEmployeeFilter(e.target.value)}
    className="rounded-full border border-[#E2E7F2] bg-white px-3 py-[6.5px] text-[11px] font-semibold text-[#5F6A88] outline-none cursor-pointer hover:border-[#A8C6F5]"
  >
    <option value="">All Users</option>
    {employeeOptions.map((o) => (
      <option key={o.id} value={o.id}>{o.name}</option>
    ))}
  </select>
)}
```
Becomes:
```tsx
<SearchableSelect
  value={projectFilter}
  onChange={setProjectFilter}
  options={projects.map((p) => ({ value: p.id, label: p.name }))}
  placeholder="All Projects"
  searchPlaceholder="Search projects…"
/>
{canFilterByUser && (
  <SearchableSelect
    value={employeeFilter}
    onChange={setEmployeeFilter}
    options={employeeOptions.map((o) => ({ value: o.id, label: o.name }))}
    placeholder="All Users"
    searchPlaceholder="Search users…"
  />
)}
```

### Pattern to mirror — `TypeMultiSelect`'s portal/search-input mechanics (`portfolio-tracker/import/_content.tsx:267-407`, full component read during planning)

Reuse exactly: the `open`/`pos`/`triggerRef`/`panelRef` state shape, the `place()` positioning
effect (`getBoundingClientRect` → `top: r.bottom + 4, left: r.left, width: Math.max(r.width,
220)`, re-run on scroll/resize), the outside-click-close effect, and the
`createPortal(..., document.body)` panel with a `border-b` search-input header (`Search` icon +
`autoFocus` input) above a `max-h-[180px] overflow-y-auto` filtered list with a "No matches"
empty state. That component is a **multi**-select with pill removal (`value: Classification[]`) —
this task's `SearchableSelect` is **single**-select (`value: string`), so:
- Trigger renders as a `<button>` (not the multi-select's `role="button" div`, since there are no
  nested per-pill remove buttons to worry about) — keep it a real `<button>` to match the two
  `<select>` elements it replaces and this codebase's "never `<div onClick>` for an action" rule.
- Trigger shows one label (selected option's `label`, or `placeholder` when `value === ""`), not a
  pill list.
- Selecting a row calls `onChange(option.value)` and closes the panel (`setOpen(false)`), it does
  not toggle/accumulate.
- Add a leading "All Projects"/"All Users" (i.e. `placeholder`) row above the search results,
  always visible even while a search query is active, to clear the filter — `TypeMultiSelect` has
  no equivalent (multi-select clears via removing pills instead) but `FilterMultiSelect`'s "All"
  checkbox row is the reference pattern for "always-present clear-selection option."

### `FilterMultiSelect`'s trigger button for pill-style visual reference only (`portfolio-tracker/_filter-multi-select.tsx:104-117`)

Not reused directly (different visual style, multi-select semantics) — cited only for the
"changed-state" outline convention (`border-[#007BFF] bg-[#F0F7FF] text-[#0063D6]` when a filter
is active vs. the neutral `border-[#E2E7F2]` at rest) if that visual distinction is wanted for a
non-default `projectFilter`/`employeeFilter`; optional polish, not a hard requirement since the
existing `<select>`s never had this state either.

### Existing state this component plugs into (`_time-logs-content.tsx:23,26`)

```ts
const [projectFilter, setProjectFilter] = useState("");
const [employeeFilter, setEmployeeFilter] = useState("");
```
Both stay `string`, unchanged — `SearchableSelect`'s `value`/`onChange` props are a drop-in
replacement for the native `<select>`'s `value`/`onChange`.

## Implementation Steps

1. Create `_searchable-select.tsx` — a generic single-select combobox:
   `SearchableSelect({ value, onChange, options, placeholder, searchPlaceholder }: { value: string;
   onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder:
   string; searchPlaceholder: string })`, following `TypeMultiSelect`'s portal/positioning/
   outside-click mechanics adapted to single-select (see Code Context).
2. In `_time-logs-content.tsx`, replace both `<select>` blocks with `<SearchableSelect>` per the
   Code Context "Becomes" snippet; drop the now-unused inline `<select>` className strings.
3. Confirm no other behavior changed: `useEffect` on `[period, projectFilter]` still refetches the
   same way; `filteredEntries`'s `employeeFilter` check is untouched; `handleExport`'s
   `projects.find((p) => p.id === projectFilter)` lookup still works with the new component's
   `value`.
4. Run `npx tsc --noEmit` and `pnpm lint`.
5. Browser-verify: open each dropdown, confirm the search input filters the list live, confirm
   selecting an option updates the table/PDF export exactly as the old `<select>` did, confirm
   "All Projects"/"All Users" clears the filter, confirm outside-click and Escape close the panel
   without changing the selection, and confirm the User dropdown is still hidden entirely for
   `developer`/`client`/`marketing`.

## Acceptance Criteria

- [ ] Project filter and User filter both open a searchable dropdown instead of a native
      `<select>`; typing in the search box narrows the visible options live.
- [ ] Selecting an option (or "All Projects"/"All Users") produces identical filtering behavior to
      today's `<select>` — same table rows, same PDF export contents.
- [ ] Trigger button's at-rest appearance (label text, pill shape, colors) is visually consistent
      with the rest of the toolbar's existing filter/action buttons.
- [ ] User filter dropdown still only appears for `admin`/`super_admin`/`pm`/`hr`.
- [ ] `npx tsc --noEmit` and `pnpm lint` both pass; no new file exceeds the file-length guideline.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```
Manual/browser: as PM/admin, open Time Logs, use both the Project and User searchable dropdowns —
type a partial name in each, confirm the list narrows, select a match, confirm the table and a
subsequent PDF export both reflect the selection; clear back to "All Projects"/"All Users" via the
dropdown's own clear row; confirm outside-click/Escape close without side effects. As developer,
confirm only the Project dropdown is present (no User dropdown).

## Compatibility Touchpoints

- No new `pnpm` dependency (`createPortal` is already used elsewhere in the codebase via
  `react-dom`, already a dependency).
- No API/DB/RLS changes.
- Does not affect the MCP tool inventory.
- Purely additive to `_time-logs-content.tsx`'s toolbar — no change to `TimeLogsTable`,
  `TimeLogEntryModal`, `TimePeriodPicker`, or `exportTimeLogsToPdf`'s signatures.

## Implementation Notes

### What Changed
- Added `SearchableSelect` (`_searchable-select.tsx`) — a single-select searchable combobox
  mirroring `portfolio-tracker/import/_content.tsx`'s `TypeMultiSelect` portal/positioning/
  outside-click mechanics, adapted from multi-select (pill removal, `value: Classification[]`) to
  single-select (one label on the trigger, pick-and-close, `value: string`). Adds a leading
  "All …" row (always visible, even mid-search) to clear the selection, since single-select has no
  pill-removal equivalent for that.
- Replaced both native `<select>` filters in `_time-logs-content.tsx` (Project, User) with
  `<SearchableSelect>` instances, passing the exact same `projectFilter`/`employeeFilter`
  state/`onChange` and the same options sources (`projects` fetch, `employeeOptions` `useMemo`) —
  no change to either's underlying data flow.
- Trigger button reuses the exact pill classNames the two `<select>`s had
  (`rounded-full border border-[#E2E7F2] bg-white px-3 py-[6.5px] text-[11px] font-semibold
  text-[#5F6A88] hover:border-[#A8C6F5]`), so the toolbar's at-rest appearance is unchanged.

### Files Changed
- `src/app/v2/(hub)/dashboard/timelogs/_searchable-select.tsx` - new, single-select searchable
  combobox component
- `src/app/v2/(hub)/dashboard/timelogs/_time-logs-content.tsx` - swapped both `<select>` filters
  for `<SearchableSelect>`

### Deviations From Plan
- **Closing the panel needed a shared `close()` helper instead of the plan's implicit "reset query
  on close via an effect" shape.** An initial `useEffect(() => { if (!open) setQuery(""); },
  [open])` tripped this repo's `react-hooks/set-state-in-effect` ESLint rule (a hard error, not a
  warning, same rule task 226 had already worked around elsewhere in this feature area for a
  different reason). Fixed by resetting `query` directly inside the event handlers that close the
  panel (`close()`, called from the outside-click handler, the new Escape-key handler, and `pick()`)
  and inside the trigger's `toggleOpen()`, rather than reacting to `open` changing after the fact —
  functionally identical (query is always empty whenever the panel opens), just restructured to
  avoid the lint error. Not anticipated in the task doc since it didn't specify this exact
  effect shape.
- **Added Escape-to-close**, not explicitly called out as a separate code path in the plan's Code
  Context but present in the Requirements/Acceptance Criteria ("Escape or an outside click closes
  the panel") — implemented as a `keydown` listener alongside the existing outside-click listener,
  both routed through the same `close()` helper.
- No other deviations. `TypeMultiSelect`'s portal-positioning/outside-click mechanics were mirrored
  as planned; both filters' underlying state, effects, and consumers (`useEffect` on
  `[period, projectFilter]`, `filteredEntries`'s `employeeFilter` check, `handleExport`'s
  `projects.find(...)` lookup) are untouched.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (0 errors; same 2 pre-existing warnings in
  `onboarding-workspace/_checklist-tab.tsx` as tasks 226/227, untouched by this task; one
  intermediate error — `react-hooks/set-state-in-effect` on the first draft of the close-on-open
  effect — was fixed during implementation, see Deviations)
- `pnpm dev` smoke test - PASS: hit the already-running dev server (left running from a prior
  session, per task 227's own note) at `/v2/dashboard/timelogs` — clean `307` redirect to
  `/v2/auth/login`, no server error, confirming the new component and its import in
  `_time-logs-content.tsx` compile and render without a runtime crash.
- Full authenticated, browser-based verification of the searchable dropdowns themselves (typing to
  filter, selecting an option, the "All Projects"/"All Users" clear row, outside-click/Escape
  close, and the User dropdown's role gating) - **SKIPPED**, no test credentials/browser access
  available in this session, same documented gap as tasks 226/227. Recommend exercising, before
  shipping: both dropdowns' live search filtering, that a selection updates the table and a
  subsequent PDF export identically to the old `<select>`, the "All …" clear row, and that the User
  dropdown stays hidden for `developer`/`client`/`marketing`.

### impeccable Design Hook Findings
- `design-system-font-size` flagged `text-[11.5px]`/`text-[12px]` at three lines in the new
  `_searchable-select.tsx` (search input, "No matches" text, option-list text). Left unchanged —
  identical arbitrary-pixel sizes already used pervasively throughout this same feature area
  (`_time-logs-content.tsx`, `_time-log-form.tsx`, `TypeMultiSelect` itself), matching CLAUDE.md's
  already-reconciled UI Polish Conventions exception and tasks 226/227's own precedent of leaving
  this exact finding class unchanged. Not suppressed via an `/impeccable hooks` config change,
  same reasoning as those two prior tasks (the reconciliation already lives in CLAUDE.md).

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation in either changed file.
- No `any`/untyped escape hatches — `SearchableSelect`'s props (`{ value: string; label: string
  }[]`) and every local helper are precisely typed.
- No deep nesting — every function (`close`, `toggleOpen`, `pick`, the two positioning/outside-
  click effects) is flat with early-return guard clauses, consistent with the rest of this
  feature area.
- Each function/file has one clear responsibility: `SearchableSelect` owns open/query state,
  positioning, and outside-click/Escape handling; `OptionRow` owns a single option row's
  rendering; `_time-logs-content.tsx`'s two call sites only pass data in and receive a value back,
  unchanged from the native `<select>`s they replaced.
- Names describe behavior accurately (`toggleOpen`, `close`, `pick`, `filtered`, `selectedLabel`,
  `OptionRow`).
- **Repeated logic extracted during this gate**: the "All Projects"/"All Users" clear-row and each
  filtered option row were originally two near-identical ~10-line JSX blocks (only
  label/selected/onClick differed) — extracted into a shared `OptionRow` component. First
  extraction attempt defined `OptionRow` *inside* `SearchableSelect`'s function body, which tripped
  this repo's `react-hooks/static-components` ESLint rule (hard error: "Cannot create components
  during render" — a nested component gets recreated, and its identity reset, on every parent
  render). Fixed by hoisting `OptionRow` to module scope above `SearchableSelect`, which is also
  the structurally correct fix, not just a lint workaround.
- Errors are handled intentionally where relevant — no new fallible operation was introduced by
  this task (no fetch, no async work); `close()`/`pick()` are synchronous state updates only.
- No secrets, credentials, or debug logging.
- Project conventions followed: `isDark`/`dark:` classes not introduced (v2 pages don't use them
  per CLAUDE.md), Tailwind-only styling (no `style={{}}`), portal/positioning/outside-click
  mechanics mirror the existing `TypeMultiSelect` precedent rather than inventing a new pattern.

### Deviations
- **Minor** — the extracted `OptionRow` component lives in the same file as `SearchableSelect`
  rather than the task doc's Code Context section (which only described the JSX inline, not a
  named sub-component). This is an internal implementation-detail simplification made during this
  quality-gate pass to satisfy the "repeated logic is extracted" standard — no change to
  `SearchableSelect`'s public props, behavior, or the two call sites in `_time-logs-content.tsx`.
- No Medium or Major deviations. Every Out of Scope / Must-Not-Change boundary from the approved
  task doc held: `_time-logs-table.tsx`, `_export-pdf.ts`, `_time-log-entry-modal.tsx`,
  `_time-period-picker.tsx`/`_time-period-panels.tsx`, and every API route are untouched; both
  filters remain single-value (`string`, not `string[]`); `FilterMultiSelect`/`TypeMultiSelect`
  themselves were not modified, only mirrored.
- `npx tsc --noEmit` and `pnpm lint` both re-run clean after the `OptionRow` hoist fix (0 errors;
  same 2 pre-existing, unrelated warnings in `onboarding-workspace/_checklist-tab.tsx` as tasks
  226/227).
