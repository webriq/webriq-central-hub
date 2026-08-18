# 265: Fix Live Timer Widget — HTML Title Decode, Project Name, hh:mm:ss Format, Break Button Alignment, Dynamic Break Icon, Auto-Resume After Break

**Created:** 2026-08-18
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

The hub-wide floating timer widget (`TimerFloatingWidget`, task 209/234) and the compact per-row timer control (`TaskTimerButton`) have six small but user-visible defects reported directly against the live timer UI:

1. Task titles imported from Zoho carry literal HTML entities (`&amp;` etc.) and render un-decoded in the widget.
2. The expanded panel shows only the task/issue title — no project context.
3. Elapsed time is formatted `mm:ss` with no rollover, so a session past 59 minutes shows e.g. `90:12` instead of `01:30:12`.
4. The three break-type buttons (60 mins / 15 mins / Few Minutes Break) don't vertically center their icon+label content — the "Few Minutes Break" label wraps to two lines and stretches the grid row, leaving the other two buttons' icons sitting at the top instead of centered against the taller one (see reported screenshot).
5. `TaskTimerButton`'s paused-on-break indicator in the task/issue list always renders a `Coffee` icon, regardless of which break type is actually active (meal/coffee/few-minutes each have distinct icons in the floating widget already, but this row hardcodes coffee).
6. Ending a break (button click or automatic countdown-to-zero) leaves the underlying task/issue timer in `paused` state — the developer must manually hit Resume. It should resume automatically.

All six are UI/behavior fixes to the existing timer feature (task 209/234) — no new tables, no route additions beyond editing one existing route.

## Requirements

- [ ] Task/issue titles rendered in the timer widget and timer button are HTML-entity-decoded (reuse existing `decodeHtmlEntities`, do not write a second decoder).
- [ ] The expanded timer panel shows the project name in small muted text directly below the task/issue title.
- [ ] All *elapsed* time displays (the running task timer, in both the expanded panel and the collapsed pill button, and in `TaskTimerButton`'s list-row indicator) use `hh:mm:ss` and roll over correctly past 60 minutes.
- [ ] The break countdown display (`breakRemainingSeconds`) is unchanged — it's bounded to ≤60 min and wasn't reported as broken; do not touch its format.
- [ ] The three break-type buttons vertically center their icon+label content so a wrapped label (Few Minutes Break) doesn't visually misalign the icons in the row.
- [ ] `TaskTimerButton`'s on-break indicator shows the icon matching `timer.break_type` (meal → Utensils, coffee → Coffee, few_minutes → Clock) instead of a hardcoded Coffee icon.
- [ ] Ending a break — via the "End break" button (`cancelBreak`) or via the countdown auto-expiring to zero (same client code path, same API route) — automatically resumes the timer to `running` if a task/issue timer exists and is currently `paused`.

## Out of Scope / Must-Not-Change

- Do not touch `_timer-timeline-popover.tsx` — it doesn't render title/project/elapsed-time and isn't part of this report.
- Do not change `breakRemainingSeconds`' `mm:ss` format — only the elapsed-timer format is in scope.
- Do not fix the pre-existing `task_id`-only checks in `pause`/`resume`/`break/cancel` routes (issue-based timers can't currently be paused/resumed at all via these routes) — that's a separate, wider gap not mentioned in this report. The auto-resume fix in `break/cancel` should mirror the same `task_id`-based precondition already used by `resume/route.ts`, not attempt to also cover `issue_id`, so behavior stays consistent with the rest of the pause/resume flow.
- No new Supabase migration. Auto-resume is inferred directly from current row state (`status === "paused"` + `task_id` present) at break-end time — do not add a tracking column to distinguish "was running before break" vs "was already paused before break." Per the request as written, ending a break with any paused task/issue timer underneath should resume it, full stop.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/timer/format.ts` | Modify | Add `formatHHMMSS(totalSeconds): string` |
| `src/lib/timer/constants.ts` | Modify | Add shared `BREAK_ICONS: Record<BreakType, LucideIcon>` so both widget and button use one source of truth |
| `src/lib/timer/serialize.ts` | Modify | `attachTaskTitle` also resolves and attaches `project_name` from `projects.name` via `project_id` |
| `src/app/(hub)/_components/timer-context.tsx` | Modify | Add `project_name: string | null` to `ActiveTimerRow` |
| `src/app/(hub)/_components/timer-floating-widget.tsx` | Modify | Decode title, render project name, use `formatHHMMSS`, center break buttons, use shared `BREAK_ICONS` |
| `src/app/(hub)/projects/[projectId]/_task-timer-button.tsx` | Modify | Decode title (if displayed), use `formatHHMMSS`, dynamic break icon from `BREAK_ICONS` |
| `src/app/api/v2/timer/break/cancel/route.ts` | Modify | Auto-resume the timer (`status: "running"`, fresh `segment_started_at`, `resumed` timeline event) when a paused task timer exists |

## Code Context

### `src/lib/timer/format.ts` — add alongside `formatMMSS`

```ts
// Live elapsed-timer display — "00:00:00" hh:mm:ss, rolls over past 60 minutes
// (unlike formatMMSS, which is only correct for durations under an hour).
export function formatHHMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600).toString().padStart(2, "0");
  const mm = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
```

Keep `formatMMSS` as-is — it's still correct and used for `breakRemainingSeconds` (≤60 min), which stays out of scope.

### `src/lib/timer/constants.ts` — shared break icon map

Currently `BREAK_META` (icon + label + tooltip) is defined only inside `timer-floating-widget.tsx`. Pull just the icon mapping out to constants so `TaskTimerButton` can use the same source instead of hardcoding `Coffee`:

```ts
import { Utensils, Coffee, Clock } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const BREAK_ICONS: Record<BreakType, LucideIcon> = {
  meal: Utensils,
  coffee: Coffee,
  few_minutes: Clock,
};
```

`timer-floating-widget.tsx`'s local `BREAK_META` can keep its label/tooltip fields but should source `icon` from `BREAK_ICONS[type]` instead of redefining it, so there's one mapping.

### `src/lib/timer/serialize.ts` — attach project name

Current (see full file at `src/lib/timer/serialize.ts:7-21`):

```ts
export async function attachTaskTitle<T extends { task_id: string | null; issue_id: string | null }>(
  supabase: SupabaseClient,
  timer: T | null
): Promise<(T & { task_title: string | null; issue_title: string | null }) | null> {
  if (!timer) return null;
  if (timer.task_id) {
    const { data } = await supabase.from("tasks").select("title").eq("id", timer.task_id).maybeSingle();
    return { ...timer, task_title: data?.title ?? null, issue_title: null };
  }
  if (timer.issue_id) {
    const { data } = await supabase.from("issues").select("title").eq("id", timer.issue_id).maybeSingle();
    return { ...timer, task_title: null, issue_title: data?.title ?? null };
  }
  return { ...timer, task_title: null, issue_title: null };
}
```

Widen the generic constraint to include `project_id: string | null` (already present on every `active_timers` row / `ActiveTimerRow`) and fetch `projects.name` in parallel with the title lookup, e.g.:

```ts
export async function attachTaskTitle<T extends { task_id: string | null; issue_id: string | null; project_id: string | null }>(
  supabase: SupabaseClient,
  timer: T | null
): Promise<(T & { task_title: string | null; issue_title: string | null; project_name: string | null }) | null> {
  if (!timer) return null;

  const titleQuery = timer.task_id
    ? supabase.from("tasks").select("title").eq("id", timer.task_id).maybeSingle()
    : timer.issue_id
    ? supabase.from("issues").select("title").eq("id", timer.issue_id).maybeSingle()
    : null;
  const projectQuery = timer.project_id
    ? supabase.from("projects").select("name").eq("id", timer.project_id).maybeSingle()
    : null;

  const [titleResult, projectResult] = await Promise.all([
    titleQuery ?? Promise.resolve({ data: null }),
    projectQuery ?? Promise.resolve({ data: null }),
  ]);

  const project_name = (projectResult.data as { name?: string } | null)?.name ?? null;
  if (timer.task_id) {
    return { ...timer, task_title: (titleResult.data as { title?: string } | null)?.title ?? null, issue_title: null, project_name };
  }
  if (timer.issue_id) {
    return { ...timer, task_title: null, issue_title: (titleResult.data as { title?: string } | null)?.title ?? null, project_name };
  }
  return { ...timer, task_title: null, issue_title: null, project_name };
}
```

Adjust typing as needed to satisfy strict mode without `as` casts if a cleaner shape is available (e.g. splitting the two awaited results before branching). All seven call sites (`route.ts`, `pause`, `resume`, `stop`, `start`, `break/start`, `break/cancel`) already pass rows that include `project_id`, so no call-site changes are needed beyond the type update.

### `src/app/(hub)/_components/timer-context.tsx` — type change only

```ts
export type ActiveTimerRow = {
  id: string;
  task_id: string | null;
  task_title: string | null;
  issue_id: string | null;
  issue_title: string | null;
  project_id: string | null;
  project_name: string | null; // NEW
  status: "running" | "paused" | null;
  ...
};
```

### `src/app/(hub)/_components/timer-floating-widget.tsx` — titles/project/format/alignment

Import `decodeHtmlEntities` from `@/app/(hub)/projects/_pm-shared` and `formatHHMMSS` from `@/lib/timer/format`. Replace the title+timer row (current lines 56-65):

```tsx
<div className="flex flex-col gap-2">
  <div className="flex items-center gap-2 min-w-0">
    <Timer size={14} className="text-[#007BFF] shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="text-[12px] font-medium text-[#3A4565] truncate">
        {decodeHtmlEntities(timer!.task_title ?? timer!.issue_title ?? "Untitled item")}
      </p>
      {timer!.project_name && (
        <p className="text-[10.5px] text-[#8A93AC] truncate">{timer!.project_name}</p>
      )}
    </div>
    <span className="text-[12px] font-mono font-semibold text-[#0B1533] tabular-nums shrink-0">
      {formatHHMMSS(elapsedSeconds)}
    </span>
  </div>
  ...
```

Collapsed pill button (current line 158) — same swap: `formatMMSS(elapsedSeconds)` → `formatHHMMSS(elapsedSeconds)`. Leave the break-countdown displays (lines 102, 153) on `formatMMSS` — out of scope.

Break button grid (current lines 112-131) — add `justify-center` (and ideally a fixed `min-h-*` so all three buttons share one height regardless of label wrap) to the per-button className:

```tsx
className="flex flex-col items-center justify-center gap-1 px-1.5 py-2 min-h-[58px] rounded-[10px] border border-[#E2E7F2] bg-white hover:border-[#A8C6F5] hover:bg-[#F0F7FF] transition-colors cursor-pointer"
```

Pick a `min-h` value that comfortably fits the two-line "Few Minutes Break" label at the existing font size — verify visually in the browser rather than guessing exactly; the point is all three buttons render at equal height with icon+label centered inside.

`BREAK_META` (lines 11-15): source `icon` from the new `BREAK_ICONS` constant instead of importing `Utensils`/`Coffee`/`Clock` directly, e.g. `meal: { icon: BREAK_ICONS.meal, label: "60 mins", tooltip: "Meal Break for 60 mins" }`.

### `src/app/(hub)/projects/[projectId]/_task-timer-button.tsx` — dynamic break icon + format

Current on-break block (lines 69-81) hardcodes `Coffee`:

```tsx
if (timer.break_type) {
  return (
    <Tooltip>
      <TooltipTrigger render={
        <span className="flex items-center gap-1 text-[#8A5A00] cursor-not-allowed">
          <Coffee size={11} />
          <span className="text-[10px] font-mono font-semibold tabular-nums">{formatMMSS(elapsedSeconds)}</span>
        </span>
      } />
      <TooltipContent side="top">Paused — on break</TooltipContent>
    </Tooltip>
  );
}
```

Replace the hardcoded icon with `BREAK_ICONS[timer.break_type]` (import from `@/lib/timer/constants`) and drop the now-unused `Coffee` import from `lucide-react`. Replace all three `formatMMSS(elapsedSeconds)` calls in this file (on-break row, running row, paused row — lines 75, 92, 109) with `formatHHMMSS(elapsedSeconds)` for consistency with the floating widget's elapsed-time format (item 3 applies to every live-elapsed display, not just the widget panel).

### `src/app/api/v2/timer/break/cancel/route.ts` — auto-resume on break end

Current (full file, `src/app/api/v2/timer/break/cancel/route.ts`):

```ts
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing } = await supabase
    .from("active_timers")
    .select("id, task_id, break_type, timeline")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing?.break_type) {
    return NextResponse.json({ error: "No active break" }, { status: 400 });
  }

  if (!existing.task_id) {
    const { error } = await supabase.from("active_timers").delete().eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ timer: null });
  }

  const { data, error } = await supabase
    .from("active_timers")
    .update({
      break_type: null,
      break_started_at: null,
      break_duration_minutes: null,
      timeline: appendTimerEvent(existing.timeline, { type: "break_end", at: new Date().toISOString() }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ timer: await attachTaskTitle(supabase, data) });
}
```

Add `status` to the `select()` and, when the row has a `task_id` (i.e. it's not the break-only case handled by the delete branch above) and its current `status` is `"paused"`, resume it in the same update — set `status: "running"`, `segment_started_at: now`, and append a `resumed` timeline event alongside `break_end`:

```ts
const { data: existing } = await supabase
  .from("active_timers")
  .select("id, task_id, status, break_type, timeline")
  .eq("user_id", user.id)
  .maybeSingle();

// ... unchanged break_type / delete-if-no-task_id checks ...

const now = new Date().toISOString();
const shouldResume = existing.status === "paused";
let timeline = appendTimerEvent(existing.timeline, { type: "break_end", at: now });
if (shouldResume) timeline = appendTimerEvent(timeline, { type: "resumed", at: now });

const { data, error } = await supabase
  .from("active_timers")
  .update({
    break_type: null,
    break_started_at: null,
    break_duration_minutes: null,
    ...(shouldResume ? { status: "running", segment_started_at: now } : {}),
    timeline,
    updated_at: now,
  })
  .eq("id", existing.id)
  .select()
  .single();
```

Update the file's top comment (currently states "The task timer, if any, stays paused — it never auto-resumes") to reflect the new behavior. This same route is called both by the "End break" button (`cancelBreak` in `timer-context.tsx`) and by the client-side auto-cancel effect when `breakRemainingSeconds` hits zero (`timer-context.tsx:99-101`), so fixing this one route covers both trigger paths described in the report (manual end + countdown expiry).

## Implementation Steps

1. Add `formatHHMMSS` to `src/lib/timer/format.ts`.
2. Add `BREAK_ICONS` to `src/lib/timer/constants.ts`; update `timer-floating-widget.tsx`'s `BREAK_META` to source icons from it.
3. Extend `attachTaskTitle` in `src/lib/timer/serialize.ts` to resolve and return `project_name`.
4. Add `project_name` to `ActiveTimerRow` in `timer-context.tsx`.
5. Update `timer-floating-widget.tsx`: decode title, render project name below it, switch elapsed displays to `formatHHMMSS`, center-align break buttons.
6. Update `_task-timer-button.tsx`: dynamic break icon via `BREAK_ICONS`, switch elapsed displays to `formatHHMMSS`.
7. Update `break/cancel/route.ts` to auto-resume a paused task timer when the break ends; update its stale comment.
8. Run `npx tsc --noEmit` and manually verify in the browser: start a timer, take each break type, confirm icon matches, confirm end-of-break resumes, confirm hh:mm:ss rollover past an hour (can fake by editing `accumulated_seconds` in Supabase for a quick check), confirm project name + decoded title render, confirm break buttons align.

## Acceptance Criteria

- [ ] A task titled with `&amp;` in Zoho renders `&` in both the floating widget and the task-timer-button tooltip/list context.
- [ ] The expanded timer panel shows the project name under the task/issue title in small muted text.
- [ ] Elapsed time in the widget (both states) and in `TaskTimerButton` displays as `hh:mm:ss` and correctly shows e.g. `01:30:12` past 60 minutes instead of `90:12`.
- [ ] Break countdown still shows `mm:ss` (unchanged).
- [ ] All three break buttons render with icon+label vertically centered at equal height, regardless of label wrapping.
- [ ] Starting a Meal Break shows the Utensils icon (not Coffee) next to the paused timer in the task/issue list; Coffee Break shows Coffee; Few Minutes Break shows Clock.
- [ ] Clicking "End break" resumes a previously-running, break-paused timer automatically (status becomes `running`, no manual Resume click needed).
- [ ] Letting the break countdown expire to zero also auto-resumes the timer (same code path as above).
- [ ] `npx tsc --noEmit` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser: start a dev-role timer on a task with an `&`-containing title in a project with a name, expand the floating widget, take each of the three break types in turn, verify icon + auto-resume + alignment, and check the elapsed counter past the one-hour mark.

## Compatibility Touchpoints

- None — purely UI/formatting/behavior fix on an existing feature (task 209/234). No schema, route surface, or packaging changes. `attachTaskTitle`'s return shape gains one new field (`project_name`); all seven existing call sites forward whatever it returns unchanged, so no call-site edits are required beyond the type constraint.

## Implementation Notes

### What Changed
- Added `formatHHMMSS` to `src/lib/timer/format.ts`, kept `formatMMSS` for the (out-of-scope) break countdown.
- Added a shared `BREAK_ICONS: Record<BreakType, LucideIcon>` map to `src/lib/timer/constants.ts`.
- Widened `attachTaskTitle` in `src/lib/timer/serialize.ts` to also resolve `project_name` from `projects.name` via `project_id`, running the title and project lookups in parallel.
- Added `project_name: string | null` to `ActiveTimerRow` in `timer-context.tsx`.
- `timer-floating-widget.tsx`: title now runs through `decodeHtmlEntities`; project name renders in small muted text under the title; both elapsed-time displays (expanded panel + collapsed pill) use `formatHHMMSS`; break buttons got `justify-center` + `min-h-[58px]` so all three center their icon+label regardless of label wrap; `BREAK_META`'s icons now source from the shared `BREAK_ICONS` instead of local imports.
- `_task-timer-button.tsx`: on-break indicator now renders `BREAK_ICONS[timer.break_type]` instead of a hardcoded `Coffee`; all three elapsed-time spans (on-break, running, paused) switched from `formatMMSS` to `formatHHMMSS`; removed the now-unused `Coffee` import.
- `break/cancel/route.ts`: `select()` on the existing row now also fetches `status`; when a task timer exists and is `paused`, the same update that clears break fields also sets `status: "running"` + a fresh `segment_started_at`, and appends a `resumed` timeline event after `break_end`. Covers both the "End break" button and the auto-cancel-at-zero client path, since both call this route. Updated the stale top-of-file comment that said breaks never auto-resume.

### Files Changed
- `src/lib/timer/format.ts` — added `formatHHMMSS`
- `src/lib/timer/constants.ts` — added `BREAK_ICONS`
- `src/lib/timer/serialize.ts` — `attachTaskTitle` now also attaches `project_name`
- `src/app/(hub)/_components/timer-context.tsx` — `ActiveTimerRow` gains `project_name`
- `src/app/(hub)/_components/timer-floating-widget.tsx` — decode title, show project name, hh:mm:ss elapsed, centered break buttons, shared break icons
- `src/app/(hub)/projects/[projectId]/_task-timer-button.tsx` — dynamic break icon, hh:mm:ss elapsed
- `src/app/api/v2/timer/break/cancel/route.ts` — auto-resume paused timer on break end

### Deviations From Plan
- None — implementation followed the task document's code context directly.

### Verification Run
- `npx tsc --noEmit` - PASS (no errors)
- `pnpm lint` - PASS (0 errors; 2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`, untouched by this change)
- Manual browser verification of all six acceptance criteria - SKIPPED (no live dev-role session with an active timer available in this session; left for the `test` stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- All 7 changed files read in full and checked against the task doc's requirements, out-of-scope list, and code context — implementation matches the plan almost verbatim.
- Naming is clear (`formatHHMMSS`, `BREAK_ICONS`) and the icon map genuinely deduplicates what was previously an inline mapping duplicated across two files (`timer-floating-widget.tsx`'s local `BREAK_META` and the hardcoded `Coffee` in `_task-timer-button.tsx`) — satisfies "repeated logic extracted."
- Unused imports were cleaned up: `Coffee` removed from `_task-timer-button.tsx`, `Utensils`/`Coffee`/`Clock` removed from `timer-floating-widget.tsx` (now sourced via `BREAK_ICONS`).
- `break/cancel/route.ts`'s auto-resume logic is gated on `existing.status === "paused"` rather than unconditional, so it can't clobber a hypothetical non-paused state — reasonable defensive check, not dead code (in the current flow `status` is always `"paused"` by the time a break is active, since `break/start` always pauses a running timer and `resume`/`pause` both refuse to run while `break_type` is set).
- No unused code, no `any`, no secrets/debug logging, no deep nesting introduced.

### Deviations
- Minor — `src/lib/timer/serialize.ts` uses two narrow `as { name?: string } | null` / `as { title?: string } | null` casts to read `.data` off the `Promise.all`-resolved union of two different Supabase query-builder result types. The task doc's code context flagged this exact spot ("Adjust typing as needed... without `as` casts if a cleaner shape is available") as an acceptable fallback. These are narrow, shape-specific casts (not `any`), `tsc --noEmit` passes clean, and the file already didn't have a stronger typed alternative to fall back to. Not blocking.
- Minor — new Tailwind classes (`min-h-[58px]` in `timer-floating-widget.tsx`, `text-[10.5px]` for the project-name line) use arbitrary bracket values rather than scale steps, which the project's general convention prefers avoiding. Both match the exact bracketed-px-value style already used pervasively throughout this same file before this task touched it (e.g. `text-[12px]`, `text-[9.5px]`, `rounded-[10px]`) — matching the file's established local convention rather than introducing a new one. Flagged by the impeccable design hook during implementation and accepted as pre-existing pattern at that time; carried forward here for the record. Not blocking.
- No Medium or Major deviations. All 7 requirements and all out-of-scope boundaries (timeline popover untouched, break-countdown format untouched, no `issue_id` handling added to pause/resume/break-cancel, no new migration) are satisfied as written.

### Required Fixes
- None.
