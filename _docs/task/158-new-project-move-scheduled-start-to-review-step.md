# 158: New Project — Move "Scheduled Start" from Project Details to Review & Create

**Created:** 2026-07-15
**Priority:** LOW
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Testing

---

## Overview

The "Scheduled start" datetime field currently lives on step 2 ("Project Details",
`_content.tsx:757-767`), shown unconditionally with a helper note that it's "Optional — only
required for 'Save + Set Schedule'." The user wants it removed from step 2 entirely and instead
surfaced on step 3 ("Review & Create"), appearing/expanding **when the "Save + Set Schedule"**
button is clicked — i.e. that button's first click reveals the date picker inline instead of
submitting immediately with whatever `scheduledAt` happened to be set on step 2 (today, likely
blank, since the field was easy to skip on step 2).

**Design call (flagging, not blocking):** "show/expand it... when the button is clicked" is
interpreted as a two-click flow: the first click on "Save + Set Schedule" expands an inline
datetime field (and the button becomes "Confirm Schedule" or similarly relabeled) instead of
submitting; a second click, only enabled once a valid datetime is chosen, performs the actual
`submit("save_scheduled")` call. This avoids submitting a "save_scheduled" project with no
schedule set (today's `submit()` already guards against that with `setSubmitError("Pick a
schedule date/time...")`, but that guard fires *after* a click with no visible field to fill in,
which reads as broken). If the user meant something simpler (e.g. the field is just always
visible on step 3 but visually de-emphasized until that specific button is hovered/clicked), that
can be adjusted post-implementation — this is a small, easily-tweaked UI behavior, not treated as
worth blocking on user confirmation before starting given how contained the change is.

## Requirements

- [ ] Remove the "Scheduled start" `Field` and its helper text from step 2
      (`_content.tsx:757-767`). Step 2 keeps only "Project name" from this block.
- [ ] On step 3, clicking "Save + Set Schedule" while the datetime field is not yet shown expands
      an inline `Field` (type `datetime-local`, same as today's) directly below/near that button,
      and the button does **not** submit on this first click.
- [ ] Once expanded, the (relabeled, e.g. "Confirm & Schedule") button click with a non-empty
      `scheduledAt` performs the existing `submit("save_scheduled")` call, unchanged.
- [ ] Clicking the button again with the field still empty keeps the existing inline validation
      message ("Pick a schedule date/time to Save + Set Schedule.") rather than a silent no-op.
- [ ] The expanded field must be collapsible/cancelable back to the two-button row (e.g. an "×" or
      switching to "Just save"/"Start onboarding" collapses it) so the layout doesn't get stuck
      expanded if the user changes their mind.
- [ ] Review step's existing conditional `ReviewRow` for "Scheduled start" (`_content.tsx:788-793`,
      shown only `{scheduledAt && ...}`) stays as-is — it will now naturally reflect the
      step-3-entered value instead of a step-2-entered one.

## Out of Scope / Must-Not-Change

- Do not change the `submit()` function's existing validation/API-call logic — only where/when the
  `scheduledAt` input is rendered and how the button's first click behaves.
- Do not change "Just save" or "Start onboarding (Day 1 now)" button behavior — untouched.
- Do not add a new API field or migration — `scheduled_start_at` is already submitted the same way.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/onboarding/new/_content.tsx` | Modify | Remove step-2 scheduled-start field; add expand-on-click behavior to step 3's "Save + Set Schedule" button |

## Code Context

### Step 2 field to remove (`_content.tsx:743-768`)

```tsx
<div className="flex flex-col gap-4.5">
  <Field id="project-name" label="Project name" ... />
  <div className="flex flex-col gap-1.5">
    <Field id="scheduled-start" label="Scheduled start" type="datetime-local" value={scheduledAt} onChange={setScheduledAt} icon={<CalendarClock size={15} />} />
    <p className="text-xs text-[#94A3B8]">Optional — only required for &quot;Save + Set Schedule&quot;.</p>
  </div>
</div>
```

Becomes: keep only the `project-name` `Field`; delete the `scheduled-start` block (state
`scheduledAt`/`setScheduledAt` stays — now driven from step 3).

### Step 3 buttons (`_content.tsx:849-866`) — current

```tsx
<div className="flex gap-2.5">
  <button type="button" onClick={() => submit("save")} ...>Just save</button>
  <button type="button" onClick={() => submit("save_scheduled")} ...>Save + set schedule</button>
</div>
```

Becomes: add a `scheduleExpanded` boolean state; "Save + Set Schedule" click branches on it:

```tsx
const [scheduleExpanded, setScheduleExpanded] = useState(false);

{scheduleExpanded && (
  <div className="flex flex-col gap-1.5 mb-2.5">
    <Field id="scheduled-start" label="Scheduled start" type="datetime-local" value={scheduledAt} onChange={setScheduledAt} icon={<CalendarClock size={15} />} />
  </div>
)}
<div className="flex gap-2.5">
  <button type="button" onClick={() => submit("save")} disabled={!!submitting}>Just save</button>
  <button
    type="button"
    onClick={() => {
      if (!scheduleExpanded) { setScheduleExpanded(true); return; }
      submit("save_scheduled");
    }}
    disabled={!!submitting}
  >
    {submitting === "save_scheduled" ? "Saving…" : scheduleExpanded ? "Confirm & schedule" : "Save + set schedule"}
  </button>
</div>
```

`submit()`'s existing `if (mode === "save_scheduled" && !scheduledAt) { setSubmitError(...); return; }`
guard (`_content.tsx:482-484`) stays untouched and still fires correctly on the confirm click.

## Implementation Steps

1. Remove the step-2 "Scheduled start" `Field` block; keep `scheduledAt`/`setScheduledAt` state
   declarations as-is.
2. Add `scheduleExpanded` state (default `false`).
3. On step 3, render the datetime `Field` conditionally above the two-button row when
   `scheduleExpanded` is true.
4. Change the "Save + Set Schedule" button's `onClick` to expand-then-confirm as shown above;
   update its label to reflect state.
5. Reset `scheduleExpanded` to `false` on `goBack()` from step 3, so re-entering the review step
   doesn't leave it stuck expanded from a prior visit (only relevant if the user navigates
   back-and-forth between steps 2 and 3 before submitting).

## Acceptance Criteria

- [ ] Step 2 no longer shows a "Scheduled start" field.
- [ ] On step 3, the first click on "Save + Set Schedule" reveals the datetime field without
      submitting.
- [ ] A second click with a valid datetime submits via `mode: "save_scheduled"` exactly as before.
- [ ] A second click with the field still empty shows the existing "Pick a schedule date/time..."
      error instead of silently failing.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser: walk through the wizard to step 3, click "Save + Set Schedule" once (field should
appear, no network call), fill a date, click again (should submit and redirect to the success
screen); repeat clicking without filling a date to confirm the error path.

## Compatibility Touchpoints

- None — pure client-side UI reflow, no API/schema change.

## Implementation Notes

### What Changed
- Removed the step-2 "Scheduled start" `Field` + helper text block; step 2 now only shows
  "Project name". `scheduledAt`/`setScheduledAt` state kept as-is, per the plan.
- Added `scheduleExpanded` boolean state (default `false`). Step 3's "Save + Set Schedule" button
  now branches on it: first click sets `scheduleExpanded` true and returns (no submit); once
  expanded, the same button (relabeled "Confirm & schedule") calls `submit("save_scheduled")`
  exactly as before.
- The expanded datetime `Field` renders directly above the two-button row, paired with an "×"
  icon button that collapses it back (resets `scheduleExpanded`, clears `scheduledAt`, and clears
  any stale `submitError`) — satisfies the doc's "must be collapsible/cancelable" requirement.
- `goBack()` now resets `scheduleExpanded` to `false` whenever leaving step 3, so navigating back
  to step 2 and returning to step 3 doesn't leave the field stuck expanded from a prior visit.
- `submit()`'s existing `mode === "save_scheduled" && !scheduledAt` guard, the review step's
  conditional "Scheduled start" `ReviewRow`, and the "Just save"/"Start onboarding" buttons were
  left untouched, per Out of Scope.
- Added `X` to the `lucide-react` import for the collapse button's icon.

### Files Changed
- `src/app/v2/(hub)/onboarding/new/_content.tsx` - moved scheduled-start field from step 2 to an expand-on-click field on step 3

### Deviations From Plan
- None — implementation matches the task doc's Code Context, including its own flagged
  interpretation of "expand on click" as a two-click confirm flow (not blocked on user
  confirmation per the doc's own note that this is easily tweaked post-implementation).

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual/browser verification - SKIPPED (Claude in Chrome extension not connected this session).
  The doc's walkthrough — click "Save + Set Schedule" once (field appears, no network call), fill
  a date, click again (submits and redirects), then repeat without filling a date to confirm the
  existing error path — still needs to be exercised in the browser before this ships.
