# 294: Add Time Log Modal — Field/Dialog Sizing Parity with "New Project", Exclude Deleted Projects, Remove Duplicate Time-Field Clock Icon, Fix Premature Validation + Mode-Toggle Error Bleed

**Created:** 2026-08-21
**Priority:** MEDIUM
**Type:** bugfix / enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Follow-up polish/bugfix pass on the Add/Edit Time Log modal (`/dashboard/timelogs`, task 226/230, most recently reworked by task 292 — native time inputs, Period ⇄ Duration toggle, live per-field validation). Task 292 shipped but its own doc flagged the create→table round-trip and the Duration edit-round-trip as **not fully browser-verified** (blocked by test-account RLS). The user has now used the shipped modal and reported five concrete problems, three of them regressions/gaps in exactly the areas 292 said were unverified:

1. **Dialog and fields read as cramped** (Image #12) — every input/select/button in this modal uses `py-1.5`/`text-[12px]` tokens, one notch below this codebase's own `13px` body-text scale (`_final_design/guide/central-hub-design-system.md` §2, "Body / UI · Inter 400–600 · 13px") and below the sibling **New Project** modal (`src/app/(hub)/projects-old/_create-project-modal.tsx`), which the user explicitly wants this modal matched to.
2. **Deleted (soft-deleted, renamed `<name>_deleted_<date>`) projects appear in the Project picker** (Image #13) — `GET /api/v2/projects`, which this modal's `useEffect` fetches with no filter, returns every row regardless of `status`, including `status = "deleted"` rows task 247's soft-delete flow renames but never removes.
3. **A duplicate clock icon shows on Start Time/End Time** (Image #14) — `NativeTimeInput` (`_native-time-input.tsx`) renders its own leading `lucide-react` `Clock` icon *and* leaves the browser's native `::-webkit-calendar-picker-indicator` (itself a clock glyph) visible on the trailing edge of the same `<input type="time">`. Task 292's own doc quoted a shadcn reference snippet that explicitly hides this indicator (`[&::-webkit-calendar-picker-indicator]:hidden`) — that rule was dropped when `NativeTimeInput` was implemented.
4. **Validation errors appear before the user has actually left a field** — reported as "Error message shows even if I didn't type anything or focused the field yet." Task 292's touched-tracking relies on a single `onBlur` handler on each field's *wrapping `<div>`* (`_time-log-entry-modal.tsx:294,302,307,314`), which bubbles from any focus-out inside that subtree — including the moment a user opens a field's own picker/dropdown (native time picker, `SearchableSelect`, `TaskIssuePicker`, `DateFieldPicker`, all portaled outside the wrapping div via `createPortal`). A portaled option/interaction can fire a spurious blur before the user has made a choice or genuinely left the field group.
5. **Switching the Period ⇄ Duration toggle doesn't clear time-field errors** — `touched.startTime`/`touched.endTime`/`touched.duration` (and `submitAttempted`) persist across a `setTimeMode()` call, so a field touched (and left invalid) under one mode can show its stale error the instant the newly-revealed field of the other mode renders, without the user having interacted with it yet.

This task **only touches the Add/Edit Time Log modal and its directly-composed field components**, plus the shared `GET /api/v2/projects` route for item 2. It does not revisit task 292's Duration-mode control-type decision (masked text input, not native `<input type="time">` — that was a deliberate, browser-tested outcome, see 292's Implementation Notes) or its `duration_hours` API contract.

## Requirements

- [ ] **Dialog chrome matches "New Project"**: `_time-log-entry-modal.tsx`'s outer panel grows from `max-w-[420px]` to `max-w-md` (448px) and gains the same three-band composition as `_create-project-modal.tsx` — header (`px-5 py-4 border-b border-[#EDF0F7]`, title `font-heading text-[15px] font-semibold text-[#0B1533]` — the modal's `<h2>` is currently missing `font-heading`/Space Grotesk entirely, a design-system miss independent of sizing), body, and a footer band (`px-5 py-4 border-t border-[#EDF0F7] bg-[#F4F6FB]`) housing Cancel/Add Time Log.
- [ ] **All text/time/search inputs in this modal bump from `py-1.5`/`text-[12px]`/`px-2.5` to `py-2`/`text-[13px]`/`px-3`**, matching `_create-project-modal.tsx`'s own input classes and the design system's `13px` body-text scale. Covers: `NativeTimeInput`/`DurationInput` (`_native-time-input.tsx`), `DateFieldPicker`'s trigger (`_date-field-picker.tsx`), `TaskIssuePicker`'s search input, general-log textarea, and dropdown item rows (`_task-issue-picker.tsx`), and `TimeLogNotesEditor`'s editable content area (`_time-log-notes-editor.tsx`) — its toolbar icon buttons are unaffected.
- [ ] **`SearchableSelect` gets a `size` prop (`"sm" | "md"`, default `"sm"`)** so the Project field (this modal's only non-toolbar caller) can render at the larger, form-field-styled `"md"` size (`rounded-[10px]`, `px-3 py-2`, `text-[13px]`, `bg-[#F4F6FB]`/`focus:bg-white` token set — matching `_create-project-modal.tsx`'s plain field look) without changing the compact `rounded-full` pill styling every toolbar filter caller (`_time-logs-content.tsx`) still needs and keeps by default.
- [ ] **Buttons match "New Project"'s sizing**: Cancel becomes a bordered ghost pill (`px-4 py-2 rounded-full text-[13px] font-semibold text-[#3A4565] border border-[#E2E7F2] bg-white hover:border-[#A8C6F5] hover:text-[#0B1533]`, replacing the current plain text-link Cancel); the primary Add Time Log/Save changes button keeps its existing orange CTA color (design guide §7: "One orange CTA per screen" — unlike New Project's blue confirm button, this stays orange, only padding/text-size changes) but grows to `px-4 py-2 text-[13px]`.
- [ ] **Deleted projects excluded from `GET /api/v2/projects`**: the route defaults to excluding `status = "deleted"` rows. `VALID_STATUS` already excludes `"deleted"` as an explicit filter value, so no caller can currently ask for deleted rows on purpose; every found consumer of this route (Add Time Log's Project field, `_time-logs-content.tsx`'s toolbar filter, `_task-issue-picker.tsx`, `_create-task-modal.tsx`/`_create-issue-modal.tsx`, `update-classification-modal.tsx`, `editable-project-title.tsx`, `use-delete-project.ts`) is a picker/selector, not a listing/restore surface — the actual Projects listing pages (`_legacy-listing/_load-list-data.ts`, `_v2-listing/_load-list-data.ts`) load their own data server-side and don't go through this API, so a "restore a deleted project" UI (if any) is unaffected.
- [ ] **`NativeTimeInput`'s duplicate clock icon removed**: the input gains `[&::-webkit-calendar-picker-indicator]:hidden` (plus `appearance-none` per the same shadcn reference pattern task 292's own doc quoted) so only the custom leading `Clock` icon shows; clicking anywhere in the field still opens the browser's native time picker (Chromium doesn't require the indicator specifically — clicking the field body works too, verify live). `DurationInput` (`type="text"`) has no native indicator and needs no change.
- [ ] **No premature "touched" state**: reproduce the reported symptom live (`pnpm dev`) before fixing — open Add Time Log, click into Start Time (or Duration, or the Project/Task pickers) without picking a value or leaving the field, and confirm whether/where an error appears prematurely. Primary hypothesis: the wrapping-`<div onBlur>` pattern fires on an intermediate focus-out inside a field's own popover/portal before the user has actually left that field group. Fix by making `markTouched` fire only on a genuine "left the field" signal — e.g. check `e.relatedTarget`/`document.activeElement` isn't still inside the same field's DOM subtree (including its portaled popover, tagged via `POPOVER_ROOT_ATTR` in `_use-popover-position.ts`) before marking touched, rather than accepting every bubbled blur unconditionally. Confirm the fix live for every field (Project, Task/Issue, Date, Start/End Time, Duration) in both directions (opening a picker without choosing shouldn't show an error; actually leaving the field afterward still should).
- [ ] **Mode toggle clears time-field errors**: clicking "Enter duration manually" or "Set start and end time" (`_time-log-entry-modal.tsx:284-290`) resets `touched.startTime`, `touched.endTime`, and `touched.duration` to `false`, and resets `submitAttempted` to `false` (since `shows()` at line 116-118 short-circuits to `true` via `submitAttempted` regardless of per-field `touched`, clearing only `touched` isn't sufficient once a submit has already been attempted once). Project/Task/Date touched state must **not** be affected by this toggle — only the time-mode-specific fields.

## Out of Scope / Must-Not-Change

- Task 292's Duration-mode control type (masked `DurationInput`, not native `<input type="time">`) and its documented rationale — not revisited.
- `duration_hours` API contract on `POST`/`PATCH /api/v2/time-logs[...]` — unchanged.
- `_time-period-inline-editor.tsx` / `_time-field-picker.tsx`'s Tile-grid quick-edit on the table — separate interaction model, untouched (per task 292's own scoping, still valid).
- `_date-field-picker.tsx`'s popover width fix (`w-[296px]`, shipped by 292) — not touched beyond the trigger button's padding/text-size bump.
- The Projects listing/restore surfaces (`_legacy-listing/`, `_v2-listing/`, `projects-old/_projects-index.tsx`) — they query Supabase directly via their own server-side loaders, not `GET /api/v2/projects`, and are unaffected by that route's new default-exclude-deleted behavior.
- `SearchableSelect`'s toolbar/filter-pill call sites (`_time-logs-content.tsx`'s Project/User filters) — must keep their current compact `rounded-full` sizing and "active filter" blue-highlight behavior exactly as today; the new `size="md"` variant is additive/opt-in, default stays `"sm"`.
- No new dependency, no shadcn `Input`/`Dialog` primitives introduced — this modal stays hand-rolled per CLAUDE.md's "Not every UI element needs to be a shadcn primitive" convention, same as `_create-project-modal.tsx`.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` | Modify | Dialog width + header/footer bands, `font-heading` title, button sizing/Cancel restyle, mode-toggle touched/submitAttempted reset, fix premature-touched root cause on each field wrapper |
| `src/app/(hub)/dashboard/timelogs/_native-time-input.tsx` | Modify | Bump `fieldClass` to `py-2`/`text-[13px]`/`px-3`(+icon inset); add `[&::-webkit-calendar-picker-indicator]:hidden appearance-none` to `NativeTimeInput` only |
| `src/app/(hub)/dashboard/timelogs/_date-field-picker.tsx` | Modify | Bump trigger button padding/text-size to match |
| `src/app/(hub)/dashboard/timelogs/_task-issue-picker.tsx` | Modify | Bump search input, general-log textarea, dropdown item row padding/text-size |
| `src/app/(hub)/dashboard/timelogs/_time-log-notes-editor.tsx` | Modify | Bump editable content area padding/text-size (toolbar buttons unchanged) |
| `src/app/(hub)/dashboard/timelogs/_searchable-select.tsx` | Modify | Add `size?: "sm" \| "md"` prop (default `"sm"`); `"md"` renders the trigger with form-field tokens (`rounded-[10px]`, `px-3 py-2`, `text-[13px]`, `bg-[#F4F6FB]`) instead of the pill-filter tokens |
| `src/app/api/v2/projects/route.ts` | Modify | `GET`: default-exclude `status = "deleted"` |

## Code Context

### Dialog shell to match — `_create-project-modal.tsx:53-89` (New Project, current/working)
```tsx
<div className="w-full max-w-md rounded-[14px] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] border border-[#E2E7F2] overflow-hidden" onClick={(e) => e.stopPropagation()}>
  <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDF0F7]">
    <h2 className="font-heading text-[15px] font-semibold text-[#0B1533]">New Project</h2>
    <button onClick={onClose} className="p-1 rounded-full text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#EDF0F7] cursor-pointer transition-colors">…</button>
  </div>
  {/* body: fields, each input className="w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]" */}
  <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EDF0F7] bg-[#F4F6FB]">
    <button className="px-4 py-2 rounded-full text-[13px] font-semibold text-[#3A4565] border border-[#E2E7F2] bg-white hover:border-[#A8C6F5] hover:text-[#0B1533] cursor-pointer transition-colors">Cancel</button>
    <button className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#007BFF] text-white text-[13px] font-semibold hover:bg-[#0063D6] disabled:opacity-45 cursor-pointer transition-colors">…</button>
  </div>
</div>
```
Add Time Log's current shell (`_time-log-entry-modal.tsx:236`) is a single flat `p-5 flex flex-col gap-3` panel with no header/footer bands — restructure into the same three-band shape, keeping the existing `gap-3` field spacing inside the body band.

### `NativeTimeInput` — current, missing indicator-hide (`_native-time-input.tsx:6-38`)
```tsx
const fieldClass = cn(
  "w-full pl-8 pr-2.5 py-1.5 rounded-[10px] border text-[12px] outline-none transition-colors",
  "border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565]",
  "focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]"
);
```
Bump to `py-2 text-[13px] pl-9 pr-3` (icon inset stays proportionate to the new height) and — **only** on `NativeTimeInput`'s own `<input>` (not `DurationInput`, which is `type="text"` and has no such indicator) — add `appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none`, matching task 292's own quoted shadcn reference (`_native-time-input.tsx` doc comment / task 292 doc's Code Context) that was never carried into the shipped component.

### Deleted-project leak — `GET /api/v2/projects` (`src/app/api/v2/projects/route.ts:16-23`, current)
```ts
let q = supabase
  .from("projects")
  .select("id,project_id,name,project_type,status,customer_id,description,created_at,updated_at")
  .order("updated_at", { ascending: false });
if (customerId) q = q.eq("customer_id", customerId);
if (status && (VALID_STATUS as readonly string[]).includes(status)) {
  q = q.eq("status", status as (typeof VALID_STATUS)[number]);
}
```
No default exclusion of `status = "deleted"` (the soft-delete/rename flow, `src/app/api/v2/projects/[projectId]/route.ts:102-146`, task 231/247). Add `q = q.neq("status", "deleted");` unconditionally before the optional `customerId`/`status` filters — `VALID_STATUS` (line 5) never includes `"deleted"`, so this can't conflict with any legitimate explicit-status request.

### Premature-touched — current wrapper pattern (`_time-log-entry-modal.tsx:302-311`, one of several identical instances)
```tsx
<div className="flex-1" onBlur={() => markTouched("startTime")}>
  <FieldLabel required hint="Time logging is not allowed for future times">Start Time</FieldLabel>
  <NativeTimeInput value={startTime} onChange={setStartTime} />
  <FieldError message={shows("startTime") ? errors.startTime : undefined} />
</div>
```
`markTouched` fires unconditionally on any bubbled blur. Guard it against focus staying logically "inside" the field (including its own popover, portaled via `createPortal` and tagged with `POPOVER_ROOT_ATTR` from `_use-popover-position.ts` for `DateFieldPicker`/`TaskIssuePicker`/`SearchableSelect`) — e.g.:
```tsx
onBlur={(e) => {
  const next = e.relatedTarget as Node | null;
  if (next && (e.currentTarget.contains(next) || next.closest(`[${POPOVER_ROOT_ATTR}]`))) return;
  markTouched("startTime");
}}
```
Confirm live in-browser that this still fires correctly once the user has genuinely left the field (task 292's doc already verified the *unguarded* version bubbles through `SearchableSelect`'s portal on a real "leave" — this task only needs to add the "but not on a same-field re-entry/picker-open" exclusion without breaking that).

### Mode toggle — current (`_time-log-entry-modal.tsx:284-290`)
```tsx
<button
  type="button"
  onClick={() => setTimeMode((m) => (m === "period" ? "duration" : "period"))}
  className="text-[11px] font-semibold text-[#0063D6] hover:underline cursor-pointer"
>
  {timeMode === "period" ? "Enter duration manually" : "Set start and end time"}
</button>
```
Change the `onClick` to also clear time-field touched/submit state:
```tsx
onClick={() => {
  setTimeMode((m) => (m === "period" ? "duration" : "period"));
  setTouched((prev) => ({ ...prev, startTime: false, endTime: false, duration: false }));
  setSubmitAttempted(false);
}}
```

## Implementation Steps

1. Reproduce the premature-validation symptom live (`pnpm dev`, Add Time Log) before writing the fix — identify exactly which field(s)/interaction sequence trigger it, since the task doc's hypothesis (spurious blur through a portaled popover) needs live confirmation, not just code reading.
2. `_native-time-input.tsx`: bump `fieldClass`, add the webkit-indicator-hide rule to `NativeTimeInput` only.
3. `_date-field-picker.tsx`, `_task-issue-picker.tsx`, `_time-log-notes-editor.tsx`: bump padding/text-size tokens on the fields identified in Proposed File Changes.
4. `_searchable-select.tsx`: add the `size` prop and its `"md"` token branch; leave every existing call site's behavior unchanged (default `"sm"`).
5. `_time-log-entry-modal.tsx`: restructure the dialog shell into header/body/footer bands sized like `_create-project-modal.tsx`; pass `size="md"` to the Project field's `SearchableSelect`; restyle Cancel as a bordered ghost pill; bump the primary button's padding/text-size; fix each field wrapper's `onBlur` per the guard pattern above; update the mode-toggle `onClick`.
6. `src/app/api/v2/projects/route.ts`: add the `neq("status", "deleted")` filter.
7. Run `npx tsc --noEmit` and `pnpm lint`.
8. Browser-verify (see Acceptance Criteria) — do not report success without an actual `pnpm dev` walkthrough.

## Acceptance Criteria

- [ ] Add Time Log dialog visually matches New Project's chrome (width, header/footer bands, title face) and every field/button reads at the same size scale (13px text, py-2 inputs, px-4 py-2 buttons) side-by-side with New Project.
- [ ] The Project dropdown never lists a project whose name ends in `_deleted_<date>` (nor any row with `status = "deleted"`), for both the Add Time Log modal and the Time Logs toolbar's own Project filter (regression check — both consume the same route).
- [ ] Start Time and End Time show exactly one clock icon (the custom leading one); clicking the field still opens the native time picker.
- [ ] Opening (but not completing) a field's picker/dropdown — Project, Task/Issue, Date, Start/End Time — does not show that field's error message; the error appears only after the user has genuinely left the field with it still invalid.
- [ ] Toggling "Enter duration manually" or "Set start and end time" never shows a leftover error on the newly-revealed field(s) until the user interacts with them again, even after a prior failed submit attempt.
- [ ] A pre-existing, already-passing flow (Period-mode create/edit, Duration-mode create/edit, General Log toggle, future-time rejection, submit-button gating) still works exactly as task 292 left it — regression check.
- [ ] `npx tsc --noEmit` passes clean.
- [ ] `pnpm lint` passes clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```
No test runner configured — verification is type-check + lint + browser-based acceptance testing (`pnpm dev`) against `/dashboard/timelogs`: dialog/field sizing comparison against New Project, deleted-project exclusion in both the modal and the toolbar filter, the clock-icon fix, the premature-touched reproduction + fix, and the mode-toggle error-clearing behavior in both directions.

## Compatibility Touchpoints

- `GET /api/v2/projects`'s new default `neq("status", "deleted")` affects every consumer of that route (listed in Requirements) — all are pickers/selectors that should never have shown deleted rows in the first place; no consumer was found that relies on deleted rows coming back from this specific endpoint.
- `SearchableSelect`'s new `size` prop is additive and defaults to the current behavior — no existing call site changes visually unless it opts in.
- No schema/migration changes; no API contract changes to `POST`/`PATCH /api/v2/time-logs[...]`.

## Implementation Notes

### What Changed
- **Dialog/field sizing (Req. 1-4)**: `_time-log-entry-modal.tsx`'s panel restructured from a flat `p-5` card into the same header/body/footer band composition as `_create-project-modal.tsx` ("New Project") — `max-w-md`, `font-heading` title, `px-5 py-4` bands with `border-b`/`border-t` dividers and a `bg-[#F4F6FB]` footer. Every input/select/textarea in this modal (`NativeTimeInput`, `DurationInput`, `DateFieldPicker`'s trigger, `TaskIssuePicker`'s search input/general-log textarea/dropdown rows, `TimeLogNotesEditor`'s content area, `SearchableSelect`'s new `"md"` size) bumped from `py-1.5`/`text-[12px]`/`px-2.5` to `py-2`/`text-[13px]`/`px-3`, matching the design system's 13px body-text scale and New Project's own field classes. Cancel restyled as a bordered ghost pill (`border-[#E2E7F2] bg-white`); the primary orange CTA kept its color (design guide: one orange CTA per screen) but grew to `px-4 py-2 text-[13px]`.
- **`SearchableSelect` size variant (Req. 3)**: added `size?: "sm" | "md"` (default `"sm"`) so the toolbar's Project/User filter pills (`_time-logs-content.tsx`) keep their exact current `rounded-full` compact look, while the Add Time Log modal's Project field opts into `size="md"` — `rounded-[10px]`, `px-3 py-2`, `text-[13px]`, `bg-[#F4F6FB]`/`focus:bg-white` tokens, matching a plain form field instead of a filter pill. Also bumped the dropdown's internal search input and `OptionRow` text to 13px (was 12px, off the documented type ramp) for consistency — this affects both `sm` and `md` callers' popover content, not just the modal.
- **Deleted projects excluded (Req. 5)**: `GET /api/v2/projects` now adds `.neq("status", "deleted")` unconditionally before the optional `customer_id`/`status` filters. Verified in-browser: searching "ABC Test" in the modal's Project field now shows only `ABC Test Company Gantt/Website 3/App 3/App 2/Website` — none of the `_deleted_<date>`-suffixed duplicates visible in the original bug report screenshot.
- **Duplicate clock icon removed (Req. 6)**: `NativeTimeInput`'s input gained `appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none`, hiding the browser's own trailing calendar-picker indicator so only the custom leading `Clock` icon shows. Verified in-browser (zoomed screenshot of both Start/End Time fields): exactly one clock icon each; clicking the field still opens the native time picker.
- **Premature validation fixed (Req. 7)**: root cause confirmed live, not just by inspection — `SearchableSelect`'s dropdown panel has `autoFocus` on its portaled search input, which steals focus from the trigger button the instant the dropdown opens, firing a `blur`/`focusout` on the trigger before the user has picked anything or left the field. The wrapping `<div onBlur={markTouched}>` pattern accepted this unconditionally, showing "Project is required" the moment the dropdown opened. Fixed with a `guardedBlur(field)` helper on the field wrapper divs that ignores a blur whose `relatedTarget` lands inside the same field's own subtree or its `[data-popover-root]`-tagged portal, combined with a new `onClose` callback (added to `SearchableSelect` and `TaskIssuePicker`, already present on `DateFieldPicker`) fired from each component's own `close()` — giving a "genuinely done with this field" signal that doesn't depend on blur bubbling correctly through a detached portal node. Verified in-browser: opening the Project dropdown shows no error; pressing Escape to close it without picking then shows "Project is required"; the same pattern verified for Start Time (click into the native time input, click away empty → "Start time is required" appears only then, not on focus).
- **Mode-toggle error clearing (Req. 8)**: the Period ⇄ Duration toggle's `onClick` now also resets `touched.startTime`/`endTime`/`duration` to `false` and `submitAttempted` to `false`. Verified in-browser: triggered "Start time is required" in Period mode, toggled to Duration — no stale error on the newly-shown Duration field; left Duration empty to trigger its own "Duration is required", toggled back to Period — no stale error on Start/End Time either.
- Fixed a lint regression introduced by adding `onClose` to `SearchableSelect`/`TaskIssuePicker`: their `close()` functions now close over the `onClose` prop, so ESLint's `exhaustive-deps` correctly required memoizing `close` via `useCallback([onClose])` and adding it to the outside-click/Escape effect's dependency array — mirrors the pattern `_date-field-picker.tsx` already used for its own `onClose`.

### Files Changed
- `src/app/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` — dialog header/body/footer restructure, button restyle/resize, `guardedBlur` helper, `onClose` wiring on Project/Task-Issue/Date fields, mode-toggle touched/submitAttempted reset.
- `src/app/(hub)/dashboard/timelogs/_native-time-input.tsx` — sizing bump; `NativeTimeInput`-only webkit indicator hide; icon inset adjusted on both `NativeTimeInput` and `DurationInput`.
- `src/app/(hub)/dashboard/timelogs/_date-field-picker.tsx` — trigger padding/text-size bump.
- `src/app/(hub)/dashboard/timelogs/_task-issue-picker.tsx` — search input/textarea/dropdown-row sizing bump; new `onClose` prop, `close` memoized with `useCallback`.
- `src/app/(hub)/dashboard/timelogs/_time-log-notes-editor.tsx` — editable content area sizing bump.
- `src/app/(hub)/dashboard/timelogs/_searchable-select.tsx` — new `size`/`onClose` props; `"md"` token branch on the trigger; `close` memoized with `useCallback`; dropdown search input/`OptionRow` sizing bump.
- `src/app/api/v2/projects/route.ts` — `GET` now excludes `status = "deleted"` by default.

### Deviations From Plan
- None — implemented as planned, including the `onClose`-callback approach for the premature-blur fix (the task doc's Requirements section already anticipated this as the correct mechanism, beyond the simpler `relatedTarget`-guard-only sketch in the Code Context section).
- One addition beyond the plan's explicit file list: bumped `SearchableSelect`'s dropdown search input and `OptionRow` text from 12px to 13px (not called out in Proposed File Changes) — done to clear a design-system-lint flag (font size off the documented type ramp) hit while editing this file for the `size` prop, and to keep the popover's own text consistent with the trigger's new 13px sizing.

### Verification Run
- `npx tsc --noEmit` — PASS (no output/errors).
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in `_checklist-tab.tsx`, unrelated to this task, already recorded by tasks 291/292).
- Browser-based acceptance testing (`pnpm dev`, Super Admin test account, Chrome via claude-in-chrome) —
  - Dialog/field/button sizing vs. New Project: **PASS** — header/footer bands, larger Project/Task/Date/Time fields, bordered ghost Cancel pill all visually confirmed via screenshot.
  - Deleted projects excluded: **PASS** — confirmed against the exact `ABC Test Company *` project family from the original bug screenshot; no `_deleted_<date>` rows in the search results.
  - Duplicate clock icon removed: **PASS** — zoomed screenshot shows exactly one clock icon per Start/End Time field; native time picker still opens on click.
  - Premature validation fix: **PASS** — reproduced the exact reported symptom (autoFocus-driven spurious blur on the Project field) and confirmed the fix live for both Project (dropdown-close-without-pick) and Start Time (native-input blur-while-empty); error appears only after a genuine "left the field" event, not on open/focus.
  - Mode-toggle error clearing: **PASS** — verified both directions (Period→Duration and Duration→Period) show no stale error on the newly-revealed field.
  - Full create round-trip (submitting a new time log end-to-end): **NOT EXERCISED** — stopped short of submitting to avoid creating test data in a real dev database outside this task's scope; all pre-submit behavior (the entirety of what this task changed) was verified. Task/Issue field's own premature-blur/`onClose` behavior was verified by code review and the shared `guardedBlur`/`onClose` mechanism (identical to the verified Project field), not independently re-clicked through in-browser — low risk given it's the same helper applied the same way.
