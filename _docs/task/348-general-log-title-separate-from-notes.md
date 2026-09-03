# 348: General Log = Log Title, kept separate from Notes on the Add/Edit Time Log modal

**Created:** 2026-09-03
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

On the **Add / Edit Time Log** modal (`/dashboard/timelogs`, also embedded in the project
detail Time Logs tab), choosing **"Enter General Log"** currently **hides the Notes field**
(`_time-log-entry-modal.tsx:350` — `{pickerValue?.kind !== "general" && ( … )}`). The
free-text General Log string is then written straight into `time_logs.note`, so for a
general entry the *note* column doubles as both the title and the notes.

The user's intent: **the General Log text is a Log Title** — the equivalent of the task
title / issue title for a work-item-linked entry — and it is a **different field from
Notes**. A general-log entry should be able to carry an optional rich-text Notes value
just like a task- or issue-linked entry does.

`time_logs` has no title column today (only `note`), so this needs a small additive
schema change plus wiring through the two write routes, the GET shaping, the modal, and
the inline table editor.

## Requirements

- [ ] On the Add/Edit Time Log modal, the **Notes (optional)** field is visible for a
      General Log entry (remove the `kind !== "general"` guard).
- [ ] The General Log text is stored as a **Log Title**, separate from Notes, in a new
      `time_logs.log_title` column. `note` becomes purely optional rich-text notes for
      **every** entry kind.
- [ ] General Log title stays **required**; Notes stays **optional** (matches task/issue
      entries).
- [ ] `POST /api/v2/time-logs` and `PATCH /api/v2/time-logs/[timeLogId]` accept
      `log_title`, require it for a general entry (instead of requiring `note`), and
      persist `note` independently.
- [ ] `GET /api/v2/time-logs` returns the general entry's `log_title` as its
      `log_title` (untruncated, falling back to the legacy truncated-note behaviour only
      when the column is null), and `note` as the notes.
- [ ] The inline **Log Title** cell editor in the Time Logs table edits `log_title` for a
      general entry (not `note`), and no longer overwrites `note`.
- [ ] Editing an existing general entry pre-fills the General Log field from `log_title`
      and the Notes field from `note`.
- [ ] Migration backfills existing general rows: `log_title := note`, then `note := NULL`
      (see "Open decision" — recommended: move, not copy).
- [ ] Zoho general-timelogs import (`zoho-import/general-timelogs`) writes the stripped
      description to `log_title` and leaves `note` null, consistent with the backfill.
- [ ] PDF export continues to print the general entry's title in the Log Title column and
      its notes (now usually empty for legacy rows) in the Notes column — no code change
      expected, verify only.
- [ ] `npx tsc --noEmit` clean; `pnpm lint` clean.

## Out of Scope / Must-Not-Change

- The task-scoped time-log modals `projects/**/tasks/[taskId]/_time-log-form.tsx`
  (legacy / v2 / projects-old) — they have **no** General Log mode and must not change.
- The nested `/api/v2/tasks/[taskId]/time-logs` routes — untouched (task-linked only).
- Timer-created rows (`source: "timer"`) — always task/issue-linked, never general; no
  `log_title` involvement.
- No change to how task-linked / issue-linked entries derive their displayed title (still
  the live task / issue title, `log_title` column stays null for them).
- Do not add image upload to the Notes editor (out of scope per task 230 Assumption 8).
- Do not rename `note` or restructure the `time_logs` write payload beyond adding
  `log_title`.

## Open decision (confirm during review)

**Legacy-row backfill:** move (`log_title := note; note := NULL` for
`task_id IS NULL AND issue_id IS NULL`) vs. copy (`log_title := note`, keep `note`).
Recommendation: **move** — copying makes every pre-existing general entry render the same
string in both the Log Title and Notes columns, which reads as a bug. A re-import from
Zoho (upsert on `external_id`) would re-null `note` anyway under the new import mapping.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/131_time_logs_log_title.sql` | Create | Add `time_logs.log_title text`; backfill + null `note` for existing general rows |
| `src/types/database.ts` | Modify | Add `log_title` to `time_logs` Row/Insert/Update |
| `src/app/api/v2/time-logs/route.ts` | Modify | POST accepts/persists `log_title`; require it (not `note`) for general; GET shapes `log_title` from the column |
| `src/app/api/v2/time-logs/[timeLogId]/route.ts` | Modify | PATCH accepts/persists `log_title`; require it (not `note`) for general |
| `src/app/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` | Modify | Always render Notes; seed general text from `log_title`; send `log_title` + independent `note` |
| `src/app/(hub)/dashboard/timelogs/_time-logs-table.tsx` | Modify | Inline Log Title editor edits `log_title`; `basePatchBody`/`patchEntry` carry `log_title`; `pickerValueFromEntry` reads `log_title` |
| `src/app/api/admin/zoho-import/general-timelogs/route.ts` | Modify | Map stripped description → `log_title`, `note` → null |
| `_docs/task/348-general-log-title-separate-from-notes.md` | Create | This document |
| `TASKS.md` | Modify | Add row under Planned |

_No RLS change_ — `time_logs_*` policies gate by row, not column (same reasoning as
migration 128).

## Code Context

### `src/app/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx`

The guard to remove and the note-vs-title logic to split:

```tsx
// line 100 — seed notes only for non-general today
const [notesHtml, setNotesHtml] = useState(initial && initial.entry_kind !== "general" ? initial.note ?? "" : "");

// line 193 — note currently IS the general text
const noteToSend = pickerValue.kind === "general" ? pickerValue.text.trim() : notesHtml || null;

// line 196 — body has no log_title
const body = {
  project_id: initial ? initial.project_id : selectedProject?.id ?? "",
  task_id: pickerValue.kind === "task" ? pickerValue.id : null,
  issue_id: pickerValue.kind === "issue" ? pickerValue.id : null,
  date_logged: date,
  ...(timeMode === "period" ? { start_time: startIso, end_time: endIso } : { duration_hours: durationHours }),
  note: noteToSend,
};

// line 350 — the guard to delete
{pickerValue?.kind !== "general" && (
  <div>
    <FieldLabel>Notes (optional)</FieldLabel>
    <TimeLogNotesEditor content={notesHtml} onChange={setNotesHtml} />
  </div>
)}
```

Target:

```tsx
const [notesHtml, setNotesHtml] = useState(initial?.note ?? "");

const noteToSend = notesHtml || null;
const logTitleToSend = pickerValue.kind === "general" ? pickerValue.text.trim() : null;

const body = { /* …unchanged… */ , note: noteToSend, log_title: logTitleToSend };

// Notes block: always rendered (drop the `pickerValue?.kind !== "general" &&` wrapper)
```

`initialPickerValue()` (line 38) — general branch:

```tsx
return { kind: "general", text: initial.note ?? "" };   // before
return { kind: "general", text: initial.log_title ?? "" }; // after
```

`onSaved({...})` already computes `log_title` correctly (lines 215–216, 229) — keep, and
set `note: saved.note` (it already does).

### `src/app/(hub)/dashboard/timelogs/_time-logs-table.tsx`

```tsx
// line 100 — pickerValueFromEntry general branch
return { kind: "general", text: entry.note ?? "" };        // before
return { kind: "general", text: entry.log_title ?? "" };   // after

// line 74 — basePatchBody: add log_title so PATCH doesn't wipe it
note: entry.note,
// + log_title: entry.log_title (only meaningful for general; null for task/issue)

// line 129 — LogTitleEditor.commit
const note = value.kind === "general" ? value.text.trim() : entry.note;   // before
// after: note stays entry.note; send log_title instead
const logTitle = value.kind === "general" ? value.text.trim() : null;
const result = await patchEntry(entry.id, {
  ...basePatchBody(entry), task_id: taskId, issue_id: issueId, log_title: logTitle,
});

// line 141 — onSaved log_title already: value.kind === "general" ? value.text.trim() || "General log" : value.label  ✓
```

`patchEntry`'s return type (line 56) — add `log_title: string | null` to `data` if the
editor reads it back (it reads `result.data.note/hours/start_time/end_time` today; keep
`note` from `entry`, so no strict need, but the routes should return `log_title` for
consistency).

### `src/app/api/v2/time-logs/route.ts`

```ts
// GET — line 150
const entryKind = r.task_id ? "task" : r.issue_id ? "issue" : "general";
const logTitle = entryKind === "task"
  ? taskTitles.get(r.task_id!) ?? "Untitled task"
  : entryKind === "issue"
    ? issueTitles.get(r.issue_id!) ?? "Untitled issue"
    : (r.log_title ?? truncateNote(r.note));   // <- was truncateNote(r.note) only
// add `log_title` to the .select("…") column list and TimeLogRow type

// POST — line 215/227
const logTitle = typeof body.log_title === "string" && body.log_title.trim() ? body.log_title.trim() : null;
// validation:
if (!taskId && !issueId && !logTitle) {
  return NextResponse.json({ error: "A General Log entry requires a title" }, { status: 400 });
}
// note is now always optional — drop it from the general-required check
// insert: add `log_title: logTitle` (null for task/issue)
```

`PATCH` mirrors POST (`[timeLogId]/route.ts` lines 52, 60, 89–97, 103).

### `src/types/database.ts` — `time_logs` (line 1787)

Add `log_title: string | null` to Row, `log_title?: string | null` to Insert & Update.

### `supabase/migrations/128_issues_time_notes_columns.sql` — style precedent

```sql
alter table issues
  add column if not exists due_time time,
  add column if not exists notes text;
comment on column issues.notes is '…';
```

### `src/app/api/admin/zoho-import/general-timelogs/route.ts` (line 138)

```ts
note: stripHtml(log.notes ?? log.log_notes ?? null),   // before
// after:
log_title: stripHtml(log.notes ?? log.log_notes ?? null),
note: null,
```

Add `log_title` to the `GeneralTimelogRow` type (line 30).

## Implementation Steps

1. **Migration 131** — `supabase/migrations/131_time_logs_log_title.sql`:
   ```sql
   alter table time_logs add column if not exists log_title text;
   comment on column time_logs.log_title is
     'Free-text title for a task-less/issue-less General Log entry (task 348). NULL for task- or issue-linked rows, whose title derives from the linked work item. Distinct from note (optional rich-text notes).';
   update time_logs
     set log_title = note, note = null
     where task_id is null and issue_id is null and log_title is null;
   ```
2. `src/types/database.ts` — add `log_title` to `time_logs` Row/Insert/Update.
3. `route.ts` (v2/time-logs):
   - GET: add `log_title` to the `.select()` list + `TimeLogRow` type; use
     `r.log_title ?? truncateNote(r.note)` for the general branch of `logTitle`; add
     `log_title` to the returned `.select()` in POST insert response if useful.
   - POST: parse `body.log_title`; replace the general-requires-`note` check with a
     general-requires-`log_title` check; make `note` unconditionally optional; insert
     `log_title`.
4. `[timeLogId]/route.ts` — mirror the POST changes in PATCH (`patch` object gets
   `log_title`; validation swap).
5. `_time-log-entry-modal.tsx`:
   - `initialPickerValue` general branch → `initial.log_title`.
   - `notesHtml` initial → `initial?.note ?? ""`.
   - `noteToSend` → `notesHtml || null`; add `logTitleToSend`.
   - `body` → add `log_title`.
   - Delete the `pickerValue?.kind !== "general" &&` wrapper around the Notes block so it
     always renders.
   - Verify `onSaved` sets `note: saved.note` and `log_title` correctly for the general
     kind (it already computes `logTitle`).
6. `_time-logs-table.tsx`:
   - `pickerValueFromEntry` general branch → `entry.log_title`.
   - `basePatchBody` → include `log_title: entry.log_title`.
   - `LogTitleEditor.commit` → send `log_title` (general) / `null` (task/issue); stop
     sending the general text as `note`; keep `note: entry.note`.
   - `patchEntry` return type → add `log_title` if read back.
7. `zoho-import/general-timelogs/route.ts` — map description to `log_title`, set
   `note: null`; update `GeneralTimelogRow`.
8. `npx tsc --noEmit`, `pnpm lint`.
9. Browser acceptance (below).

## Acceptance Criteria

- [ ] Add Time Log → **Enter General Log**: both the General Log textarea **and** the
      **Notes (optional)** editor are visible.
- [ ] Saving a general entry with a title and no notes → row shows the title in the Log
      Title column, Notes column empty; DB row has `log_title` set, `note` null,
      `task_id`/`issue_id` null.
- [ ] Saving a general entry with title + notes → both persist independently; reopening
      the entry in the modal pre-fills General Log from the title and Notes from the notes.
- [ ] Title still required for a general entry (Add button disabled / inline error when
      blank); Notes never required.
- [ ] Inline Log Title cell editor on a general row edits only the title; the entry's
      Notes are unchanged after an inline title edit.
- [ ] Switching a general entry to a task/issue (modal or inline) clears `log_title`;
      switching back to general restores an editable title field.
- [ ] Existing (pre-migration) general entries: title still displays (from backfilled
      `log_title`); Notes column now empty; editing them works.
- [ ] Task- and issue-linked entries: unchanged in list, modal, export, and DB
      (`log_title` stays null).
- [ ] PDF export: general row prints its title in Log Title; no crash / no `undefined`.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then browser acceptance at /dashboard/timelogs and a project → Time Logs tab
```

Manual DB spot-check after applying migration 131 (Supabase SQL editor):

```sql
select id, task_id, issue_id, log_title, note
from time_logs
where task_id is null and issue_id is null
order by created_at desc limit 20;
-- expect: log_title populated, note null for legacy rows
```

## Compatibility Touchpoints

- **DB migration** — `131_time_logs_log_title.sql` must be applied to every environment
  (local + Supabase) before the deployed code that reads/writes `log_title`. Additive +
  nullable; the `update` backfill is idempotent (`where … log_title is null`).
- **Zoho re-import** — a re-run of `zoho-import/general-timelogs` after this change
  upserts `log_title` from the description and nulls `note` (upsert on `external_id`);
  intended, consistent with the backfill. A re-import from a *pre-task-348* export is
  unaffected (same source field).
- No packaging / adapter / install-surface impact.
- `_docs/mcp-tools.md` — not affected (no `server.registerTool` change).

## Implementation Notes

### What Changed
- Added `time_logs.log_title` (migration 131, additive + nullable) — the free-text title
  for a task-less/issue-less General Log entry. `note` is now purely optional rich-text
  notes for every entry kind.
- Migration 131 backfills existing general rows with `log_title := note, note := NULL`
  (the **move** option from the "Open decision", per the doc's recommendation).
- `POST` / `PATCH /api/v2/time-logs` now parse `log_title`, require it (not `note`) for a
  general entry, force it `null` for task-/issue-linked rows, and return it in the row
  payload. `GET` shapes the general entry's `log_title` from the column
  (`r.log_title ?? truncateNote(r.note)` fallback for un-backfilled rows).
- Add/Edit Time Log modal: the **Notes (optional)** field renders for every entry kind
  (removed the `pickerValue?.kind !== "general"` guard); the General Log free text is sent
  as `log_title`, `note` is sent independently from the Notes editor; edit mode seeds the
  General Log field from `log_title` and Notes from `note`. Inline validation copy changed
  from "description" to "title".
- Time Logs table inline **Log Title** editor edits `log_title` for a general entry and no
  longer overwrites `note`; `basePatchBody` / `patchEntry` / `pickerValueFromEntry` carry
  `log_title`.
- Zoho `general-timelogs` import maps the stripped description to `log_title` and sets
  `note` to `null`, consistent with the migration backfill.

### Files Changed
- `supabase/migrations/131_time_logs_log_title.sql` — new column + backfill
- `src/types/database.ts` — `log_title` on `time_logs` Row/Insert/Update
- `src/app/api/v2/time-logs/route.ts` — GET shaping + POST accept/persist/return `log_title`
- `src/app/api/v2/time-logs/[timeLogId]/route.ts` — PATCH accept/persist/return `log_title`
- `src/app/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` — always-render Notes; split title/notes payload; seed from both columns; validation copy
- `src/app/(hub)/dashboard/timelogs/_time-logs-table.tsx` — inline Log Title editor targets `log_title`; helpers carry the field
- `src/app/api/admin/zoho-import/general-timelogs/route.ts` — description → `log_title`, `note` → null

### Deviations From Plan
- `_task-issue-picker.tsx` copy ("Enter General Log" button, "Describe the work you did…"
  textarea placeholder) left unchanged — not in the plan's file list, and the picker is
  shared with the inline table editor. The modal's own validation-error copy was updated
  to "title" as the plan allowed.
- Backfill uses the recommended **move** (not copy) — no further review needed, the plan
  flagged this as the recommendation.

### Verification Run
- `npx tsc --noEmit` — PASS (no output)
- `pnpm lint` — PASS (0 errors; 2 pre-existing unrelated warnings in
  `projects/v2/[projectId]/onboarding-workspace/_checklist-tab.tsx`)
- Migration 131 not yet applied to any database — must be run in Supabase before deploy
  (see Compatibility Touchpoints); browser acceptance pending in the test stage.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. No dead code (`truncateNote` retained as the intentional
  legacy-row fallback), no `any`, no debug logging, error handling unchanged from the
  established route patterns.
- Stale header/inline comments in both `v2/time-logs` route files that still described the
  General Log text as living in `note` were updated to reference `log_title`; the modal's
  header doc block gained a task-348 paragraph.
- Swept every other `time_logs` consumer (`_get-project-detail-data.ts`, timer
  stop/pause, nested task/issue time-log routes, zoho export routes): none read `note`
  for a task-less row — they either aggregate `hours` or only handle task/issue-linked
  entries, so migration 131 nulling `note` on legacy general rows has no other surface.
- `npx tsc --noEmit` PASS; `eslint` on all changed files PASS.

### Deviations
- **Minor** — `_task-issue-picker.tsx` copy ("Enter General Log" button, "Describe the
  work you did…" textarea placeholder, `rows={3}`) left unchanged. The field is now a
  title; the placeholder wording is loose but not wrong, the component is shared with the
  inline table editor, and the plan explicitly scoped this file out. Flagged for the user;
  a follow-up could tighten the copy / make it single-line.
- **Minor** — backfill uses the **move** strategy (`log_title := note, note := NULL`), the
  plan's stated recommendation; no separate approval needed.

### Required Fixes
- None.
