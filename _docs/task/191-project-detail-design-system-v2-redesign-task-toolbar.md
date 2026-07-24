# 191: Project Detail Page (`/v2/projects/[projectId]`) — Design System v2.0 Redesign, Task Search/Filter/Sort/Collapse-All Toolbar, Straight-Line View Toggle

**Created:** 2026-07-24
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Completed (2026-07-24)

---

## Overview

`/v2/projects/[projectId]` (`_project-detail.tsx`, 455 lines) is the project detail / task-listing page — header, a Tasks/Issues/Milestones tab switcher, and inside the Tasks tab a List/Board/Calendar view switcher (currently a dropdown, `ViewDropdown`, lines 273-305). All of it — `_project-detail.tsx`, `_list-view.tsx` (592 lines), `_board-view.tsx` (202 lines), `_calendar-view.tsx` (139 lines), and the shared style constants in `_pm-shared.tsx` — is still on the pre-v2.0 look (`slate-*` Tailwind, `bg-slate-900` active/CTA states). Task 185 explicitly carved this whole subtree out of its own scope ("`[projectId]/*` … untouched, still v1, separate future task") — **this is that task.**

Reference: `_final_design/guide/central-hub-design-system.md` (== root `DESIGN.md`, ~99% identical — same "static snapshot" relationship established in tasks 166/167/183/184/185) is the design-token source of truth. `_projects-index.tsx` (the sibling list page, task 185) is the concrete v2.0 precedent to copy patterns from — in particular its **List/Grid straight-line segmented toggle** (`_projects-index.tsx:516-541`) and its **`FilterMultiSelect`/`SortSelect`** toolbar components (`_projects-index.tsx:226-351`), which this task copies into a new page-scoped set for the detail page (see Blast-radius note below for why these are copied, not imported).

**Blast-radius check on `_pm-shared.tsx`:** task 185 explicitly stopped `_projects-index.tsx` from importing badge/style helpers out of `_pm-shared.tsx` (it now only imports `TagChip`, `businessDaysRemaining`, `PROJECT_TYPES` from it). Confirmed by grep: every other remaining consumer of `_pm-shared.tsx`'s `STATUS_STYLE`/`PRIORITY_STYLE`/`PROJECT_STATUS_STYLE`/`PROJECT_TYPE_STYLE`/`StatusBadge`/`PriorityBadge`/`ProjectStatusBadge`/`ProjectTypeBadge`/`CompletionRing`/`OwnerChip`/`AssigneeChip` lives inside this task's own subtree: `_list-view.tsx`, `_board-view.tsx`, `_calendar-view.tsx`, `_project-detail.tsx`, `_milestone-panel.tsx`, `_milestone-bar.tsx`, and `tasks/[taskId]/_task-detail.tsx`. **This means `_pm-shared.tsx`'s color constants are safe to retone to v2.0 tokens in this task** — nothing outside this task's blast radius depends on their current v1 values.

**Dead code found, not touched:** `_task-drawer.tsx` (256 lines) is not imported anywhere in `src/` (confirmed by grep across the whole tree) — task rows navigate to the full `tasks/[taskId]` route instead (task 188/190), so this file appears to be an orphan left over from before that routing change. Out of scope for this task; flagging it here rather than silently deleting it, since it's not this task's job to clean up dead code it didn't create.

## Requirements

### A. Straight-line List/Board/Calendar toggle (replaces `ViewDropdown`)

- [ ] Delete `ViewDropdown` (`_project-detail.tsx:273-305`) entirely — dropdown-with-chevron pattern goes away per the explicit ask.
- [ ] Replace with a segmented control **copied verbatim in structure** from `_projects-index.tsx:516-541`'s Grid/List toggle: `<div className="flex items-center gap-0.5 border border-[#E2E7F2] rounded-full p-1 bg-white shrink-0">`, one `<Tooltip>`-wrapped icon button per view (`ListIcon` for List, `LayoutGrid` for Board, `CalendarIcon` for Calendar — all three already imported in `_project-detail.tsx:6-9`), each `p-1.5 rounded-full transition-colors cursor-pointer`, active state `bg-[#071133] text-white`, inactive `text-[#5F6A88] hover:text-[#0B1533]`, `aria-label` per button, real `Tooltip`/`TooltipTrigger`/`TooltipContent` (`@/components/ui/tooltip`, not `title=""`).
- [ ] Three buttons instead of two (List, Board, Calendar) — same container, same active/inactive token pair, just one more `<Tooltip>` block. Order: List, Board, Calendar (matches `VIEW_ORDER` today).

### B. Task toolbar — search, status filter, priority filter, sort, collapse/expand-all

New toolbar row in `_project-detail.tsx`, replacing the current bare `justify-end` row that only holds the view switcher (`_project-detail.tsx:200-202`). Layout: search + filters + sort + collapse-all on the left, the Requirement A view toggle on the right — same left/right split as `_projects-index.tsx`'s toolbar.

- [ ] **Search input** — Forms spec tokens (`_onboarding-list.tsx:300-315`/`_projects-index.tsx:480-491`'s shipped classes: `bg-[#F4F6FB]` rest, `rounded-[10px]`, `focus:bg-white focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14]`). Matches against **task title** (all views) or, for a task that has a `tasklist_id`, that tasklist's `name` (List/"tasklist" half of "search task/tasklist bar") — case-insensitive substring, client-side (all tasks are already loaded in `_project-detail.tsx`'s state, no server round-trip needed, unlike the paginated `/v2/projects` page).
- [ ] **Status filter** — new page-scoped `FilterMultiSelect` (copy the component shape from `_projects-index.tsx:244-333`, do not import it — that component is private to its own module and the two pages are visually independent per task 185's own "different feature area" reasoning, applied symmetrically here). Options = the 8 values in `STATUS_OPTS`/`STATUS_LABEL` (`_pm-shared.tsx:27-36`).
- [ ] **Priority filter** — same `FilterMultiSelect` component, options = the 4 real `TaskPriority` values (`low`/`normal`/`high`/`critical` — `src/types/database.ts:995`; **not** `PRIORITY_STYLE`'s `"none"` key, which is a defensive fallback for malformed data, not a selectable value), labelled via `PRIORITY_STYLE[x].label`.
- [ ] **Sort** — new page-scoped `SortSelect` (copy `_projects-index.tsx:337-351`'s shape/styling). Options: Task name (A–Z / Z–A), Due date (soonest/latest), Priority (highest/lowest), Status (matches `SortKey`/`SortDir` already defined in `_list-view.tsx:11-18` and `STATUS_ORDER`/`PRIORITY_ORDER` there). **Lift `sortKey`/`sortDir` state up from `_list-view.tsx` into `_project-detail.tsx`** so one control drives sorting regardless of which view is mounted (sort is meaningful for List's table; Board/Calendar keep their own position/due-date bucketing unaffected by this control — pass `sortKey`/`sortDir` as props to `ListView` only, `BoardView`/`CalendarView` signatures don't change).
- [ ] **Collapse/expand-all** — a single ghost button, shown **only when `view === "list"`** (Board/Calendar have no collapsible groups). **Lift `collapsed: Set<string>` state up from `_list-view.tsx` into `_project-detail.tsx`** alongside the sort state, passed down as `collapsed`/`onToggleCollapseGroup` props (`ListView` stops owning this state itself). The button's label/action flips: if any group is currently in `collapsed`, it reads "Expand all" and clicking sets `collapsed` to an empty set; if none are collapsed, it reads "Collapse all" and clicking sets `collapsed` to the full group-id set — computed as `[...tasklists.map(t => t.id), "__none"]` (mirrors `_list-view.tsx:302-304`'s existing `"__none"` sentinel for the "No Tasklist" bucket; only include `"__none"` when there's at least one tasklist-less root task, otherwise it's a phantom entry that does nothing). Pick any reasonable lucide icon pair/toggle icon available in the installed `lucide-react` version — not a hard requirement, implementation-time call.

### C. Filtering behavior — root-task-level match, whole subtree follows

**Explicit scoping decision (read this before implementing filtering):** tasks in this page form a shallow tree (`parent_task_id`/`depth`, rendered recursively in `_list-view.tsx:349-376`). Filtering strictly per-row would let a subtask "orphan" — matching the search/status/priority query while its parent doesn't, so the parent row (and thus the child, since it only renders under an expanded parent) never appears. To avoid that:

- [ ] Filtering (search + status + priority, all client-side, AND semantics) is evaluated **against root tasks** (`!parent_task_id && depth === 0`). A root task's own title/tasklist-name/status/priority is checked against the active query.
- [ ] If a root task matches, **its entire subtree is included unconditionally** — i.e., filtering does not hide/show individual subtasks independent of their root ancestor's match. This is a deliberate simplification (a subtask's own status/priority is not independently filterable) — flagged here as a known, reasoned tradeoff rather than a silent gap; a "promote matching descendants with visible ancestor chain" model would be a materially bigger feature than what was asked for.
- [ ] Compute one `filteredTasks: Task[]` in `_project-detail.tsx` (root match → keep root + all descendants via the existing `parent_task_id` chain) and pass it as the `tasks` prop to whichever of `ListView`/`BoardView`/`CalendarView` is mounted, in place of the raw `tasks` state — no prop signature changes needed on those three components beyond what's already listed for sort/collapse state.
- [ ] Empty-result state: when `filteredTasks` is empty and the raw `tasks` is not, each view's existing "no tasks" empty state (`_list-view.tsx:339-345`, and whatever Board/Calendar currently render for zero items) needs a distinguishable message — "No tasks match your filters" + a "Clear filters" action, not the same copy used for a genuinely empty project (mirrors the "no projects" vs. "no results for this filter" distinction task 185 made in its `EmptyState`).

### D. `_project-detail.tsx` — v2.0 tokens (header, tabs, Create Task modal)

- [ ] "All projects" back link (`:146-152`): `text-slate-500 hover:text-slate-700` → `text-[#5F6A88] hover:text-[#0B1533]`.
- [ ] Page title (`:157-159`): `font-heading` (Space Grotesk) `text-[#0B1533]`, keep existing `text-[22px] font-bold tracking-[-0.02em]` sizing (matches task 184/185's precedent for this exact class string).
- [ ] Company/type subline (`:162-164`): `text-slate-500` → `text-[#5F6A88]`.
- [ ] `ProjectStatusBadge` (`:160`) — no code change needed here; it re-tones for free once `_pm-shared.tsx`'s `PROJECT_STATUS_STYLE` (Requirement F) is updated.
- [ ] "+ New Task" button (`:166-171`): `bg-slate-900 rounded-lg` → **CTA orange** (`bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white`, `rounded-full`) — this page's one "start something" action, same reasoning as `_onboarding-list.tsx`/task 183/184/185's own CTA precedent. Confirm no other CTA-orange element renders at the same time (Board's per-column "add" `+` icon buttons and the Milestones tab's own add-button, if any, are secondary in-context actions, not page-level CTAs — leave them as-is, out of scope per the Milestones note below).
- [ ] Primary tabs (Tasks/Issues/Milestones, `:174-191`): `bg-slate-100` container / `bg-white text-slate-900 shadow-sm` active → `bg-[#F4F6FB]` container / active `bg-white text-[#0B1533] shadow-[0_1px_2px_rgba(7,17,51,.05)]`, inactive `text-[#5F6A88] hover:text-[#0B1533]` (999px pill radius per DESIGN.md Buttons/Chips pill convention — no dedicated "Tabs" spec exists in DESIGN.md, this is the closest-fit token reuse, an implementation-time call).
- [ ] Content area background (`:195`): `bg-slate-50` → `bg-[#F4F6FB]` (DESIGN.md `--bg`).
- [ ] "Issues coming soon." placeholder (`:238-240`): one-line retone, `text-slate-400` → `text-[#5F6A88]` — trivial, not a real Issues tab build-out (that's a separate, larger future task; this page keeps the placeholder).
- [ ] Create Task modal (`:315-455`): panel `rounded-xl` → `rounded-[14px]`; all inputs/textarea/selects → Forms spec (`bg-[#F4F6FB]` rest, `focus:bg-white focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14]`, `rounded-[10px]`); labels → `text-[11px] font-semibold text-[#0B1533]` (Forms spec: "11px/600 `--ink`"); "Cancel" → ghost (`bg-white border border-[#E2E7F2] hover:border-[#A8C6F5]`); "Create" → confirm/navigate blue (`bg-[#007BFF] hover:bg-[#0063D6] text-white`) — **not** CTA orange, matching task 183's "Continue"-buttons-stay-blue reasoning (the page-level "+ New Task" trigger is already this flow's one CTA; the modal's own submit is the flow's terminal confirm step). Error text `text-red-600` → `text-[#C0392B]` (`--late`).

### E. `_list-view.tsx` — v2.0 tokens + lifted state wiring

- [ ] Retone the whole file's `slate-*`/`blue-*`/`amber-*`/`red-*` literals to DESIGN.md tokens: table container `rounded-xl border-slate-200` → `rounded-[14px] border-[#E2E7F2]`; column header row `bg-slate-50` → `bg-[#FAFBFE]`, header text → `text-[#5F6A88]` (Table spec: "9.5px/700 caps `--muted` on `#FAFBFE`"); row dividers `border-slate-100` → `border-[#EDF0F7]` (`--line-soft`); row hover `hover:bg-slate-50/70` → `hover:bg-[#F0F7FF]` (`--blue-50`, Table spec: "Row hover `--blue-50`"); selected-row tint `bg-blue-50/60` stays conceptually the same but pin to `#F0F7FF`; group header bar `bg-slate-100`/`border-slate-200` → `bg-[#F4F6FB]`/`border-[#E2E7F2]`; the "N selected / Trash" bulk-action bar (`:380-393`, currently amber) → keep the same warn-toned semantic (DESIGN.md `--warn`/`--warn-bg`: `#8A5A00`/`#FFF3D6`) rather than literal `amber-*`, since it's a "you're about to do something destructive-ish" affordance, matching DESIGN.md's semantic-state vocabulary; "Trash" button stays `--late` (`#C0392B` border/text) since it's destructive.
- [ ] `STATUS_STYLE`/`PRIORITY_STYLE`-driven inline `style={{...}}` usages (status `<select>` pill, priority dot+label, due-date color via local `getDueColor`) re-tone for free once `_pm-shared.tsx` (Requirement F) changes — no per-usage edits needed here beyond `getDueColor`'s own literals (`:31-37`): `text-slate-400`/`text-red-500`/`text-orange-500`/`text-slate-500` → `text-[#5F6A88]`/`text-[#C0392B]`/`text-[#8A5A00]`/`text-[#3A4565]` (map "overdue" to `--late`, "due within 7 days" to `--warn`, matching the semantic-state table).
- [ ] Remove the component's own `sortKey`/`sortDir`/`collapsed` `useState` (`:231-233`) — now props from `_project-detail.tsx` per Requirement B. `toggleSort`/`toggleCollapseGroup` become prop-callbacks (or the parent owns the setters and this file just calls them) — implementer's call on exact prop shape, keep it minimal (don't over-engineer a context/reducer for three lifted pieces of state).
- [ ] Avatar colors (`AVATAR_COLORS`, `:25`) and `ResolvedAssigneeChip`/`AssigneePicker` initials-bubble styling → DESIGN.md's fixed 6-color avatar rotation (`#0063D6` `#6A48E0` `#0B8A93` `#B85512` `#177E48` `#44508A`, Avatars spec) instead of the current 5-color `#2563EB`/`#7C3AED`/etc. set, for visual consistency with the avatar stacks already shipped on `/v2/projects` and `/v2/portfolio-tracker`.
- [ ] Checkboxes (row-select, group-select, `:424-429`/`:518-523`): `accent-blue-600` → keep functionally but consider the DESIGN.md Checklist-row checkbox shape (17px, 5px radius) only if it doesn't regress the existing dense-table row height — implementation-time call, not a hard requirement (these are native `<input type=checkbox>` today, not the custom `FilterCheckRow` square from Requirement B, which is toolbar-only).

### F. `_board-view.tsx` / `_calendar-view.tsx` — v2.0 tokens

- [ ] `_board-view.tsx`: column card `rounded-lg border-slate-200 shadow-[...]` → `rounded-[14px] border-[#E2E7F2] shadow-[0_1px_2px_rgba(7,17,51,.05)]` (`--sh-sm`); column header text `text-slate-700` → `text-[#0B1533]`; count pill `bg-slate-200/60 text-slate-400` → `bg-[#EDF0F7] text-[#5F6A88]`; drop-target tint `bg-blue-50/60` → `bg-[#F0F7FF]`; column background `bg-slate-100/60` → `bg-[#F4F6FB]`; card title `text-slate-800` → `text-[#0B1533]`; due/labels row `text-slate-500`/`bg-slate-100 text-slate-500` → `text-[#5F6A88]`/`bg-[#EDF0F7] text-[#5F6A88]`. `BOARD_COLUMNS`' per-status `accent` hex dots (`_pm-shared.tsx:16-25`) are a separate, already-distinct color channel from `STATUS_STYLE` — leave them as-is unless they visually clash after `STATUS_STYLE` changes (spot-check, not a hard requirement).
- [ ] `_calendar-view.tsx`: nav buttons/panel `border-slate-200`/`hover:bg-slate-50` → `border-[#E2E7F2]`/`hover:bg-[#F0F7FF]`; month grid container `rounded-xl` → `rounded-[14px]`; header row `bg-slate-50 text-slate-500` → `bg-[#FAFBFE] text-[#5F6A88]` (Table spec); day cells `border-slate-100`/`bg-slate-50/50` → `border-[#EDF0F7]`/`bg-[#F4F6FB]/50`; today-marker `bg-blue-600` → `bg-[#007BFF]`; task chips `bg-slate-50 hover:bg-slate-100 border-slate-100 text-slate-700` → `bg-[#F4F6FB] hover:bg-[#F0F7FF] border-[#EDF0F7] text-[#3A4565]`.
- [ ] Both files receive `filteredTasks` (Requirement C) in place of raw `tasks` — no other prop changes.

### G. `_pm-shared.tsx` — retone shared style constants (confirmed safe, see Overview)

- [ ] `STATUS_STYLE` (`:38-47`): re-derive each status's `{text, bg, border}` from DESIGN.md's semantic-state trio (`--ok`/`--warn`/`--late` + neutral) rather than the current ad-hoc rainbow — e.g. `open`/`in_progress` map to in-progress-ish tones, `closed` → neutral `--line-soft`/`--muted`, terminal/approval-ish states → `--ok`, blocked-ish → `--warn`. Exact per-status mapping is an implementation-time call (8 statuses don't map 1:1 onto 3 semantic states) — the constraint is: use DESIGN.md's actual hex values (`#177E48`/`#E3F5EA`, `#8A5A00`/`#FFF3D6`, `#C0392B`/`#FDE8E6`, `#5F6A88`/`#EDF0F7`), don't invent new hexes, and don't reuse a reserved phase hue (`#E2762F`/`#0063D6`/`#6A48E0`/`#0B8A93`/`#177E48` — note `#177E48` is *both* the Optimize phase hue *and* the semantic `--ok` color in DESIGN.md itself, so this one specific overlap is sanctioned by the spec, not a violation of the "never reuse a phase hue" rule).
- [ ] `PRIORITY_STYLE` (`:49-55`): same semantic-state re-derivation — `critical` → `--late`, `high` → `--warn`, `normal` → `--blue` (`#007BFF`, DESIGN.md's "PRIMARY interactive" — priority "normal" isn't a state so much as a default, blue reads as neutral-interactive here), `low`/`none` → `--muted`/`--line-soft`.
- [ ] `PROJECT_STATUS_STYLE` (`:57-63`): same mapping approach as task 184/185's precedent already established for project-level status (`active → ok`, `on_hold → warn`, `completed → ok`, `archived → neutral`, `not_started → neutral`) — apply that exact precedent here for consistency across the whole Projects feature, rather than re-deriving independently.
- [ ] `PROJECT_TYPE_STYLE` (`:65-70`): four hues currently collide with 4 of the 5 reserved phase hues for a non-phase meaning — the same violation task 183 (Requirement D) and task 185 (Requirement B) already fixed on their own pages. Fix it here too: single neutral treatment (`--line-soft`/`--muted`), not a 4-color hue table.
- [ ] `CompletionRing` (`:227-254`): track `#E2E8F0` → `#EDF0F7`; fill `pct===100 ? "#16A34A" : "#2563EB"` → `pct===100 ? "#177E48" : "#007BFF"`; text `#334155` → `#0B1533`.
- [ ] `OwnerChip`/`AssigneeChip` (`:212-225`, `:276-287`) avatar color arrays → DESIGN.md's fixed 6-color rotation (same values as Requirement E's `_list-view.tsx` change — keep both files' avatar palettes identical since they render the same conceptual "person bubble" across the same page).
- [ ] `StatusBadge`/`PriorityBadge`/`ProjectStatusBadge`/`ProjectTypeBadge` (`:102-148`) — no structural change, they just inherit the new color constants above.

## Out of Scope / Must-Not-Change

- `_task-drawer.tsx` — confirmed dead code (unused import anywhere), not touched. Flagged for a possible separate cleanup task, not this one.
- `_milestone-panel.tsx` / `_milestone-bar.tsx` (Milestones tab) — not part of "task listing page," and it's a materially different UI (gantt/timeline) than a task list/board/calendar. Left v1-styled; the Tasks/Issues/Milestones tab switcher itself (Requirement D) gets retoned, but clicking into Milestones still lands on v1 content. This is a known, deliberate half-migration of one tab within an otherwise-v2.0 page — same category of tradeoff task 185 flagged for `[projectId]/*` as a whole, now narrowed to just this one sub-tab. Separate future task.
- `tasks/[taskId]/_task-detail.tsx` (the full task-detail page reached by clicking a row) — not touched directly. It automatically inherits the `_pm-shared.tsx` color-constant updates (Requirement G) since it imports from the same file, but its own layout/JSX/tokens are untouched — mirrors how task 185 excluded `[projectId]/*` from its own scope. Separate future task if a full retone is wanted there too.
- `POST /api/v2/projects/[projectId]/tasks`, `PATCH /api/v2/tasks/[id]`, `POST /api/v2/tasks/[id]/timelog` — no request/response contract changes; everything in this task is visual + client-side filter/sort/search state.
- No schema or migration changes.
- Realtime subscription logic (`_project-detail.tsx:74-99`), `updateTask`/`addTask`/`upsertMilestone`/`removeMilestone`/`handleTimerStop` mutation logic, drag-and-drop reordering in `_board-view.tsx`, and the calendar month-navigation logic — behavior identical, restyle/new-toolbar-state only.
- `BOARD_COLUMNS`' per-status accent dot colors (`_pm-shared.tsx:16-25`) — left as-is per Requirement F, unless they visually clash after `STATUS_STYLE` changes.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` | Modify | Straight-line List/Board/Calendar toggle (Req A); new search/filter/sort/collapse-all toolbar, lifted `sortKey`/`sortDir`/`collapsed` state, `filteredTasks` computation (Req B/C); header/tabs/modal v2.0 tokens (Req D) |
| `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` | Modify | v2.0 tokens; drop own `sortKey`/`sortDir`/`collapsed` state in favor of lifted props; avatar palette swap (Req E) |
| `src/app/v2/(hub)/projects/[projectId]/_board-view.tsx` | Modify | v2.0 tokens only, no behavior change (Req F) |
| `src/app/v2/(hub)/projects/[projectId]/_calendar-view.tsx` | Modify | v2.0 tokens only, no behavior change (Req F) |
| `src/app/v2/(hub)/projects/_pm-shared.tsx` | Modify | Retone `STATUS_STYLE`/`PRIORITY_STYLE`/`PROJECT_STATUS_STYLE`/`PROJECT_TYPE_STYLE`/`CompletionRing`/`OwnerChip`/`AssigneeChip` color constants to v2.0 tokens (Req G) — confirmed safe blast radius, see Overview |

## Code Context

### File: `_project-detail.tsx:273-305` (current `ViewDropdown` — to be deleted and replaced per Requirement A)

```tsx
function ViewDropdown({ view, onChange }: { view: ViewId; onChange: (v: ViewId) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[12px] text-slate-700 hover:border-slate-300 cursor-pointer">
        {VIEW_ICONS[view]} {VIEW_LABELS[view]}
        <ChevronDown size={12} className="text-slate-400" />
      </button>
      {/* ...dropdown panel... */}
    </div>
  );
}
```

### File: `_projects-index.tsx:516-541` (the exact straight-line toggle pattern to replicate, extended from 2 to 3 buttons)

```tsx
<div className="flex items-center gap-0.5 border border-[#E2E7F2] rounded-full p-1 bg-white shrink-0">
  <Tooltip>
    <TooltipTrigger render={
      <button
        onClick={() => handleViewChange("grid")}
        aria-label="Grid view"
        className={cn("p-1.5 rounded-full transition-colors cursor-pointer", view === "grid" ? "bg-[#071133] text-white" : "text-[#5F6A88] hover:text-[#0B1533]")}
      >
        <LayoutGrid size={15} />
      </button>
    } />
    <TooltipContent side="top">Grid view</TooltipContent>
  </Tooltip>
  {/* ...one more Tooltip block for "list"... */}
</div>
```

### File: `_list-view.tsx:210-246` (current `ListView` state to be partly lifted — sortKey/sortDir/collapsed move to `_project-detail.tsx`, `expandedRows`/`selected` stay local)

```tsx
export default function ListView({ tasks, tasklists, onOpen, onUpdate, currentUserId, profilesById, allMembers, hoursById, onTimerStop }: {...}) {
  const [sortKey, setSortKey] = useState<SortKey>("status");       // → lift to parent
  const [sortDir, setSortDir] = useState<SortDir>("asc");          // → lift to parent
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()); // → lift to parent
  const [selected, setSelected] = useState<Set<string>>(new Set());  // stays local
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => {...}); // stays local
  ...
}
```

### File: `_list-view.tsx:283-307` (group computation — `"__none"` sentinel the collapse-all button in `_project-detail.tsx` must replicate)

```tsx
const groups = useMemo(() => {
  const tasklistIds = new Set(tasklists.map((tl) => tl.id));
  const buckets = new Map<string, Task[]>();
  const unassigned: Task[] = [];
  for (const t of tasks.filter((t) => !t.parent_task_id && t.depth === 0)) {
    if (t.tasklist_id && tasklistIds.has(t.tasklist_id)) { /* bucket by tasklist_id */ }
    else { unassigned.push(t); }
  }
  const out = [];
  for (const tl of tasklists) out.push({ id: tl.id, name: tl.name, tasks: sortTasks(buckets.get(tl.id) ?? []) });
  if (unassigned.length) out.push({ id: "__none", name: "No Tasklist", tasks: sortTasks(unassigned) });
  return out;
}, [tasks, tasklists, sortKey, sortDir]);
```

### File: `_pm-shared.tsx:38-70` (current v1 color constants to retone per Requirement G)

```tsx
export const STATUS_STYLE: Record<TaskStatus, { text: string; bg: string; border: string }> = {
  open: { text: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  // ...8 entries, ad-hoc rainbow, not DESIGN.md's ok/warn/late/neutral vocabulary
};
export const PRIORITY_STYLE: Record<string, { label: string; text: string; dot: string }> = { /* same issue */ };
export const PROJECT_STATUS_STYLE = { /* same issue */ };
export const PROJECT_TYPE_STYLE = { /* 4-hue table colliding with reserved phase hues — same violation as task 183/185 already fixed elsewhere */ };
```

### File: `_docs/task/184-customers-page-design-system-v2-redesign.md` / `185-projects-page-design-system-v2-redesign.md` (read-only reference — the established project-status → Chip-tone mapping to reuse verbatim for `PROJECT_STATUS_STYLE` per Requirement G)

```
active → ok (dot), on_hold → warn (dot), completed → ok (check, not dot), archived → neutral (no dot), not_started (derived) → neutral (no dot)
```

### File: `DESIGN.md` (repo root, read-only reference — Sections 1, 4, 5)

```
--ok: #177E48; --ok-bg: #E3F5EA;   /* On track, Done */
--warn: #8A5A00; --warn-bg: #FFF3D6;  /* Due soon, Blocked */
--late: #C0392B; --late-bg: #FDE8E6;  /* Late, Overdue, Error */
Filter pills: pill radius, 11px/600. Inactive: white + line border. Active: navy fill — never blue.
Table: header 9.5px/700 caps --muted on #FAFBFE; row hover --blue-50; --line-soft dividers.
Avatars: fixed 6-color rotation #0063D6/#6A48E0/#0B8A93/#B85512/#177E48/#44508A.
Don't: reuse a phase hue for a non-phase meaning (--ok's #177E48 overlapping the Optimize phase hue is the one spec-sanctioned exception, since both are literally the same token).
```

## Implementation Steps

1. `_pm-shared.tsx`: retone `STATUS_STYLE`, `PRIORITY_STYLE`, `PROJECT_STATUS_STYLE`, `PROJECT_TYPE_STYLE`, `CompletionRing`, `OwnerChip`/`AssigneeChip` avatar arrays to v2.0 tokens (Requirement G). Do this first — every other file's badges/rings/avatars inherit it for free.
2. `_project-detail.tsx`: lift `sortKey`/`sortDir`/`collapsed` state up from `_list-view.tsx`; add `taskSearch`/`statusFilter`/`priorityFilter` state; compute `filteredTasks` per Requirement C's root-task-match-then-include-subtree rule.
3. `_project-detail.tsx`: build the new toolbar row — search input, `FilterMultiSelect` × 2 (status, priority), `SortSelect`, conditional collapse/expand-all button, then the Requirement A straight-line view toggle on the right. Copy `FilterMultiSelect`/`FilterCheckRow`/`SortSelect` component bodies from `_projects-index.tsx:226-351` as new page-scoped copies in this file (or a small local helper section) — do not import them.
4. `_project-detail.tsx`: delete `ViewDropdown`; wire the three view branches (`board`/`list`/`calendar`) to receive `filteredTasks` instead of raw `tasks`, and pass `sortKey`/`sortDir`/`collapsed`/`onToggleCollapseGroup` down to `ListView` only.
5. `_project-detail.tsx`: header/tabs/Create Task modal v2.0 token pass (Requirement D), including the "+ New Task" CTA-orange swap.
6. `_list-view.tsx`: remove its own `sortKey`/`sortDir`/`collapsed` `useState`, accept them as props instead; keep `expandedRows`/`selected` local; full v2.0 token pass (Requirement E); add the distinguishable "no tasks match your filters" empty state.
7. `_board-view.tsx`, `_calendar-view.tsx`: v2.0 token pass only (Requirement F), no behavioral changes.
8. Run `npx tsc --noEmit` and `pnpm lint`.
9. Manual pass (`pnpm dev`, visit `/v2/projects/[projectId]` as a `pm`/`admin`/`developer` role): confirm the List/Board/Calendar segmented toggle switches views and shows the correct active state; search narrows results across all three views and matches on both task title and tasklist name; status/priority multi-select filters combine correctly (AND semantics) with search; sort control reorders the List view's groups; collapse-all/expand-all correctly toggles every tasklist group (and flips its own label); a root task with subtasks that doesn't match the filter hides its whole subtree, and one that does match shows all its subtasks regardless of their own status/priority; Create Task modal still creates a task end-to-end; drag-and-drop reordering on the Board view still works; realtime task updates (open a second tab, update a task, confirm it reflects live) still work.

## Acceptance Criteria

- [ ] `ViewDropdown` is deleted; List/Board/Calendar switch via a straight-line segmented control matching `/v2/projects`'s List/Grid toggle's exact container/active/inactive classes.
- [ ] A search input filters visible tasks by title or containing-tasklist name across all three views.
- [ ] Status and priority multi-select filters exist, combine with search (AND), and use the real 8 status / 4 priority values.
- [ ] A sort control (name/due date/priority/status, asc/desc) reorders the List view's task groups.
- [ ] A collapse-all/expand-all control toggles every tasklist group's collapsed state in one click, visible only in List view.
- [ ] No `bg-slate-900`/`text-slate-*`/`border-slate-*`/literal `#2563EB` remains in `_project-detail.tsx`, `_list-view.tsx`, `_board-view.tsx`, or `_calendar-view.tsx`; DESIGN.md hex literals used throughout.
- [ ] `_pm-shared.tsx`'s status/priority/project-status/project-type color constants use DESIGN.md's `--ok`/`--warn`/`--late`/`--muted` vocabulary, not the old ad-hoc rainbow, and no reserved phase hue is reused for a non-phase meaning (except the spec-sanctioned `--ok`/Optimize-phase `#177E48` overlap).
- [ ] `npx tsc --noEmit` and `pnpm lint` both pass with no new errors.
- [ ] Manual walkthrough confirms no visual or functional regressions in drag-and-drop, realtime sync, task creation, or the Milestones/Issues tabs (which stay v1/placeholder, unchanged).

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: pnpm dev
#   /v2/projects/[projectId] — toggle List/Board/Calendar via the new segmented control
#   Search by a task title fragment and by a tasklist name fragment, confirm both work
#   Combine status + priority filters with search, confirm AND semantics
#   Change sort (e.g. Due date soonest), confirm List view groups reorder
#   Click "Collapse all", confirm every tasklist group collapses and the button now reads "Expand all"; click again to confirm it expands all
#   Confirm a root task with a non-matching status/priority hides its subtree even when a subtask would individually match
#   Create a task via the modal, confirm it still appears (realtime or optimistic)
#   Drag a card between Board columns, confirm status update persists
#   Switch to Milestones/Issues tabs, confirm they still render (unchanged, still v1/placeholder)
```

## Compatibility Touchpoints

- No schema, RLS, or API contract changes.
- `_milestone-panel.tsx`, `_milestone-bar.tsx`, and `tasks/[taskId]/_task-detail.tsx` stay functionally identical; the latter two only pick up new colors transitively through `_pm-shared.tsx` constants, no layout changes.
- `_task-drawer.tsx` remains dead code, untouched.

## Implementation Notes

### What Changed
- `_pm-shared.tsx`: retoned `STATUS_STYLE` (8 statuses mapped onto neutral/blue/warn/ok per the Overview's semantic re-derivation — open→neutral, in_progress/testing_completed/ready_to_merge→blue, ready_for_qa/for_client_approval/post_live_qa→warn, closed→ok), `PRIORITY_STYLE` (critical→late, high→warn, normal→blue, low/none→muted), `PROJECT_STATUS_STYLE` (exact task 184/185 precedent: active/completed→ok, on_hold→warn, archived/not_started→neutral), `CompletionRing` (track/fill/text → `#EDF0F7`/`#177E48`|`#007BFF`/`#0B1533`), and `OwnerChip`/`AssigneeChip`'s avatar arrays (→ the DESIGN.md fixed 6-color rotation). Collapsed `PROJECT_TYPE_STYLE`'s 4-hue table into a single `PROJECT_TYPE_NEUTRAL` constant (confirmed via grep it has no other consumers) since all 4 hues collided with reserved phase hues. Since DESIGN.md's Chips spec carries no border (bg tint + text only), `border` fields were set equal to each bucket's `bg` value rather than inventing an unspecified hex.
- `_project-detail.tsx`: full-file rewrite. Deleted `ViewDropdown`; replaced with a straight-line 3-button (List/Board/Calendar) segmented toggle copied structurally from `_projects-index.tsx`'s Grid/List toggle (`Tooltip`-wrapped, `bg-[#071133] text-white` active state). Added a new toolbar row: search input (matches task title or containing-tasklist name), two `FilterMultiSelect` dropdowns (status, priority — page-scoped copies of `_projects-index.tsx`'s component, not imports), a `SortSelect` driving lifted `sortKey`/`sortDir` state, and a collapse/expand-all ghost button (visible only in List view) driving lifted `collapsedGroups` state. Added a `filteredTasks` `useMemo` implementing the root-task-match-then-include-subtree rule from Requirement C. Retoned header, primary tabs, content background, and the Create Task modal to v2.0 tokens; "+ New Task" is now the page's CTA-orange button.
- `_list-view.tsx`: dropped its own `sortKey`/`sortDir`/`collapsed` `useState` — now props (`sortKey`, `sortDir`, `onToggleSort`, `collapsed`, `onToggleCollapseGroup`) from `_project-detail.tsx`; `expandedRows`/`selected` stayed local as planned. Added `hasActiveFilters`/`onClearFilters` props and a distinguishable "No tasks match your filters" empty state (with a `SearchX` icon + Clear-filters action) separate from the genuine "No tasks yet" empty state. Exported `SortKey`/`SortDir` types (previously private) so `_project-detail.tsx` can share them. Full v2.0 token pass across the table, group headers, row hover, bulk-action bar (recolored to `--warn` tones instead of literal amber), and avatar palette.
- `_board-view.tsx` / `_calendar-view.tsx`: v2.0 token pass only (cards, columns, drop-target tint, calendar grid/nav/today-marker/task chips) — no behavioral changes. One deviation from the doc's literal suggestion: the GitHub-PR label's color was specified nowhere exactly, and the original `violet-600` would have mapped to `#6A48E0` (the reserved Publish phase hue) — used `#5F6A88` (muted neutral) instead to avoid that collision, since PR status isn't a phase indicator.

### Files Changed
- `src/app/v2/(hub)/projects/_pm-shared.tsx` — retoned shared status/priority/project-status color constants, ring colors, avatar palette; collapsed `PROJECT_TYPE_STYLE` to one neutral constant
- `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` — full rewrite: straight-line view toggle, search/filter/sort/collapse-all toolbar, `filteredTasks` computation, v2.0 tokens throughout
- `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` — lifted sort/collapse state to props, new filtered empty state, v2.0 tokens, exported `SortKey`/`SortDir`
- `src/app/v2/(hub)/projects/[projectId]/_board-view.tsx` — v2.0 tokens only
- `src/app/v2/(hub)/projects/[projectId]/_calendar-view.tsx` — v2.0 tokens only

### Deviations From Plan
- GitHub-PR label color in `_board-view.tsx`'s `CardBody` uses `#5F6A88` (muted) instead of a violet — the doc didn't specify an exact replacement and the literal Tailwind-to-hex mapping of the original `violet-600` would have reused the reserved Publish phase hue (`#6A48E0`), a direct DESIGN.md violation this task exists partly to avoid elsewhere. Reasoned substitution, not a scope change.
- `STATUS_STYLE`/`PRIORITY_STYLE`/`PROJECT_STATUS_STYLE`'s `border` fields are set equal to each entry's `bg` value rather than a separate lighter/darker shade — DESIGN.md's actual Chips spec has no border concept at all (bg tint + text/dot only, confirmed against `dashboard-shared.tsx`'s `Chip` tones cited in task 185), so this satisfies the existing `{text,bg,border}` type shape without inventing an unspecified hex, at the cost of the border becoming visually inert. Flagged as an implementation-time call per the doc's own instruction on this point.
- `BOARD_COLUMNS`' per-status accent dots (`_pm-shared.tsx`) were left untouched as the doc allowed — spot-checked against the new `STATUS_STYLE` values and they don't visually clash (different visual role: small solid column-header dot vs. tinted badge).
- No other deviations — sort options, collapse-all group-id computation (including the `"__none"` sentinel), and the root-task-filter-then-subtree-follows behavior were implemented exactly as specified.

### Verification Run
- `npx tsc --noEmit` — PASS, no errors.
- `pnpm lint` — PASS, 0 errors, 0 warnings (one `eslint-disable` directive was removed from a copied `FilterMultiSelect` effect once ESLint confirmed it was unnecessary in this file's version of the hook).
- Impeccable design-hook findings — 6 in `_project-detail.tsx`, 12 in `_list-view.tsx`, 2 each in `_pm-shared.tsx`/`_calendar-view.tsx`, all `design-system-font-size` on the same 9–12px toolbar/badge/table text sizes already shipped at those exact sizes throughout `_projects-index.tsx`, `_onboarding-list.tsx`, and this file's own pre-existing (unretoned) code — classified as false positives / accepted precedent, same stale-`.impeccable/design.json`-sidecar condition already logged and left alone in tasks 166/167/183/184/185 ("DESIGN.md is newer than .impeccable/design.json"). No new font-size steps were introduced beyond the existing dense-UI scale.
- Manual in-browser QA — **NOT RUN**, no test credentials/session available in this environment (same constraint noted in every prior v2.0 migration task: 166/167/173/179/183/184/185). Flagged for the user's own live-testing pass per the Verification section above — in particular the search/filter/sort/collapse-all interactions, the root-task-subtree filtering behavior, and drag-and-drop/realtime regressions, none of which are exercisable via `tsc`/`lint` alone.
