# 338: Enhance New Issue Modal — RTE Description, Combined Date+Time Due Field, Internal Notes, Per-Field Validation

**Created:** 2026-08-31
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Completed (2026-08-31 — marked complete at the user's explicit request; browser acceptance + `supabase db push` of migration 128 outstanding)

---

## Overview

The **New Issue** modal (`CreateIssueModal`, `src/app/(hub)/projects/_shared/_create-issue-modal.tsx`) is the plainer sibling of the **New Task** modal (`CreateTaskModal`, same directory, redesigned in task 274). This task brings the Issue modal's three lagging fields up to the Task modal's treatment:

1. **Description** → replace the plain `<textarea>` with the same Tiptap rich-text editor the New Task modal uses (`TaskDescriptionEditor` — bold/italic/bullet toolbar + paste/drag image embed).
2. **Due date** → replace the native `<input type="date">` with the New Task modal's combined calendar + time-of-day popover (`DateTimeFieldPicker`), adding a time component. Per the confirmed decision, the picker is **always-on and defaults to 7:00 PM today** (matching New Task's Due field), so every new issue now gets a due date + time.
3. **Notes (optional)** → add a new internal-notes RTE field (second `TaskDescriptionEditor` instance), matching New Task's "Notes (optional)" field.
4. **Per-field error validation** → formalise field-level errors (red border + red text directly below the offending field) for every field that can error; keep the bottom-of-form line only as the fallback for server/submit errors.

Because an issue's due-time and notes have nowhere to live today (`issues` table has `due_date date` only, no `notes`), this task adds two additive nullable columns (`due_time time`, `notes text`) — mirroring task 274 / migration 110's `tasks.start_time` / `due_time` / `notes` decision exactly.

Per the confirmed decision, the new `due_time` and `notes` values are also **surfaced on the Issue Detail page** (`_issue-detail.tsx`), and — for parity — the equivalent already-write-only `tasks.start_time` / `due_time` / `notes` values from task 274 are surfaced on the **Task Detail page** (`_task-detail.tsx`) in the same change. Detail pages use their own native-input idiom (native `type="date"` throughout), so the detail surfacing uses a paired native `type="time"` input next to the existing date input plus a "Notes" accordion — **not** the heavyweight `DateTimeFieldPicker` popover (which was purpose-built for the modal).

## Requirements

- [ ] **R1 — RTE Description in New Issue modal.** Swap `<textarea>` for `TaskDescriptionEditor`, wired to the issues image-upload endpoint (`/api/v2/projects/[projectId]/issues/description-images`, which already exists — task 234). Keep it inside the existing `CollapsibleSection title="Description" defaultOpen`.
- [ ] **R2 — Combined date+time Due field in New Issue modal.** Replace the native date input with `DateTimeFieldPicker`. State becomes `dueValue: string` (`"YYYY-MM-DDTHH:mm"` local, same shape the Task modal uses); default value = `dueDefaultValue()` → `<today>T19:00`. Split into `due_date` + `due_time` at submit time.
- [ ] **R3 — Optional Notes RTE in New Issue modal.** Add a `notes` state + a second `TaskDescriptionEditor` instance, label "Notes (optional)", placed at the bottom of the `Issue Information` `CollapsibleSection` (mirrors New Task's placement inside "Task Information"). Submitted as `notes` (trimmed, `|| undefined`).
- [ ] **R4 — Per-field validation & error placement (New Issue modal).** Keep the existing `title` field-level error (required + project-wide duplicate). Render each field's error immediately below that field via the `fieldErrors` map; server / unexpected submit errors stay in the existing bottom `{error}` line. No new *required* fields are introduced (Description/Notes stay optional; Due now always has a value from the picker, matching Task modal — the defensive "due date required" guard from the Task modal is carried over as a bottom-of-form fallback only).
- [ ] **R5 — Schema: `issues.due_time` + `issues.notes`.** New migration `supabase/migrations/128_issues_time_notes_columns.sql`: `alter table issues add column due_time time; add column notes text;`. Additive, nullable — zero impact on existing `select("*")` consumers. Update `src/types/database.ts` `issues` Row/Insert/Update.
- [ ] **R6 — API: issues create + patch accept the new fields.** `POST /api/v2/projects/[projectId]/issues/route.ts` — accept & persist `due_time`, `notes` (`|| null`, same pattern as `description`). `PATCH /api/v2/issues/[issueId]/route.ts` — add `if ("due_time" in body)` and `if ("notes" in body)` inside the `perm.canEditDetails` block.
- [ ] **R7 — `TaskDescriptionEditor` gains an optional `uploadUrl` prop.** Currently hard-codes `/api/v2/projects/${projectId}/tasks/description-images`. Add `uploadUrl?: string` defaulting to that exact string, so the Issue modal can point it at the issues endpoint. New Task modal call site unchanged (relies on the default).
- [ ] **R8 — Surface `due_time` + `notes` on Issue Detail.** `_issue-detail.tsx` (both the `v2/` and `legacy/` copies — see "Duplication" below): add a native `type="time"` input paired with the existing "Due date" `Meta` (new `dueTime` state → `saveField({ due_time })`), and a new `AccordionCard title="Notes"` below the Description card using `DescriptionField` (issues upload URL, `perm.canEditDetails` gate).
- [ ] **R9 — Parity: surface `start_time` / `due_time` / `notes` on Task Detail.** `_task-detail.tsx` (both copies): native `type="time"` inputs paired with the existing "Due date" and "Start date" `Meta`s, and a "Notes" `AccordionCard` below Description. Also wire the currently-missing `start_date`, `start_time`, `due_time`, `notes` (and the pre-existing-bug `estimate_hours`) into `PATCH /api/v2/tasks/[taskId]/route.ts`'s `canEditDetails` block — see "Bug found during research".
- [ ] **R10 — File-length hygiene.** Extract the duplicated datetime helpers (`pad2`, `nowDateTimeValue`, `dueDefaultValue`, plus a small `splitDateTimeValue`) into a shared `src/app/(hub)/projects/_shared/_datetime-helpers.ts` and import from both `_create-task-modal.tsx` and `_create-issue-modal.tsx` (removes ~12 duplicated lines from the Task modal and keeps the Issue modal near ~300 lines). Per `nextjs-file-length-best-practices.md`.

## Out of Scope / Must-Not-Change

- **No change to `issues.due_date` / `tasks.start_date` / `tasks.due_date` column types.** They stay `date`. The time-of-day half goes to the new `*_time` columns only (task 274 precedent).
- **`DateTimeFieldPicker` is not modified.** It is reused as-is (no new "clearable/empty" state — hence R2's always-on-with-default decision).
- **New Task modal behaviour is unchanged** apart from importing the shared datetime helpers (R10) and `TaskDescriptionEditor` gaining a defaulted optional prop (R7). Its fields, layout, and payload stay exactly as task 274 shipped them.
- **`projects-old/[projectId]/…` (the oldest generation) detail pages are not touched.** Only `projects/v2/` and `projects/legacy/` are live.
- **No board/list/calendar/milestone/export changes.** The new `issues.due_time`/`notes` columns are read only by the Issue modal (write) and Issue Detail (read/write) in this task; existing list/board views keep showing `due_date` only.
- **No Zoho export/import changes.** `issues` import (`zoho-import/issues`) does not populate `due_time`/`notes` and is not expected to.
- **Attachments section of the New Issue modal is unchanged.**

## Duplication note (important for the implementer)

`_issue-detail.tsx` and `_task-detail.tsx` each exist as **two near-identical copies**:

| File | Copy A | Copy B | Diff between copies |
|---|---|---|---|
| `_task-detail.tsx` | `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/` | `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/` | only lines 161 & 169 (`/projects/v2/` vs `/projects/legacy/` in the back-nav `router.push`) |
| `_issue-detail.tsx` | `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/` | `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/` | only line 107 (same route-prefix difference) |

Apply every detail-page edit to **both copies**. Do not attempt to de-duplicate them into a shared file in this task — that is a larger unrelated refactor.

## Bug found during research

`PATCH /api/v2/tasks/[taskId]/route.ts` currently only maps `title`, `description`, `milestone_id`, `due_date`, `assignees`, `labels`, `priority`, `position`, `status` into its `patch` object. But `_task-detail.tsx` already sends `start_date` (line ~318) and `estimate_hours` (line ~334) via `saveField(...)` — **those edits silently no-op today** (the field is dropped, request "succeeds" with no change). R9 fixes this by adding `start_date`, `start_time`, `due_time`, `notes`, and `estimate_hours` handling to the `canEditDetails` block. (The `issues` PATCH route does not have this bug — it maps `due_date` and every other editable field the Issue Detail page sends.)

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/128_issues_time_notes_columns.sql` | Create | Additive nullable `due_time time`, `notes text` on `issues`. **Written, not applied** (user runs `npx supabase db push`). |
| `src/types/database.ts` | Modify | Add `due_time: string \| null`, `notes: string \| null` to `issues` Row/Insert/Update. |
| `src/app/(hub)/projects/_shared/_datetime-helpers.ts` | Create | Shared `pad2` / `nowDateTimeValue` / `dueDefaultValue` / `splitDateTimeValue` (extracted from `_create-task-modal.tsx`). |
| `src/app/(hub)/projects/_shared/_create-task-modal.tsx` | Modify | Import the shared datetime helpers instead of defining them inline (R10). No behaviour change. |
| `src/app/(hub)/projects/_shared/_task-description-editor.tsx` | Modify | Add optional `uploadUrl?: string` prop, default = tasks endpoint (R7). |
| `src/app/(hub)/projects/_shared/_create-issue-modal.tsx` | Modify | RTE Description, `DateTimeFieldPicker` Due, Notes RTE, per-field errors, shared-helper split payload (R1–R4). |
| `src/app/api/v2/projects/[projectId]/issues/route.ts` | Modify | POST accepts/persists `due_time`, `notes` (R6). |
| `src/app/api/v2/issues/[issueId]/route.ts` | Modify | PATCH maps `due_time`, `notes` in the `canEditDetails` block (R6). |
| `src/app/api/v2/tasks/[taskId]/route.ts` | Modify | PATCH maps `start_date`, `start_time`, `due_time`, `notes`, `estimate_hours` in the `canEditDetails` block (R9 + bug fix). |
| `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/_issue-detail.tsx` | Modify | "Due time" native input + "Notes" accordion (R8). |
| `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/_issue-detail.tsx` | Modify | Same as above — second copy. |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | "Due time" + "Start time" native inputs + "Notes" accordion (R9). |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Same as above — second copy. |

## Code Context

### `_create-issue-modal.tsx` — current shape (267 lines)

State (lines 47–56): `title`, `description`, `status`, `severity`, `assigneeId`, `dueDate` (`""`), `attachmentFiles`, `saving`, `error`, `fieldErrors: { title?: string }`.

Current Description field (lines 187–195):
```tsx
<CollapsibleSection title="Description" defaultOpen>
  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
    className={cn(inputClass, "resize-none")} placeholder="Optional details…" />
</CollapsibleSection>
```
→ becomes:
```tsx
<CollapsibleSection title="Description" defaultOpen>
  <TaskDescriptionEditor projectId={projectId} value={description} onChange={setDescription}
    uploadUrl={`/api/v2/projects/${projectId}/issues/description-images`} />
</CollapsibleSection>
```

Current Due date field (lines 236–244):
```tsx
<label className="flex flex-col gap-1.5">
  <span className={labelClass}>Due date</span>
  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
</label>
```
→ becomes (`div`, not `label`, since `DateTimeFieldPicker` renders a `<button>` — see New Task modal lines 399–402):
```tsx
<div className="flex flex-col gap-1.5">
  <span className={labelClass}>Due date &amp; time</span>
  <DateTimeFieldPicker value={dueValue} onChange={setDueValue} />
</div>
```

Current submit body (lines 99–106):
```tsx
body: JSON.stringify({
  title: title.trim(),
  description: description.trim() || undefined,
  status, severity,
  assignee_name: assignee?.full_name || undefined,
  due_date: dueDate || undefined,
}),
```
→ becomes:
```tsx
const { date: dueDate, time: dueTime } = splitDateTimeValue(dueValue);
// ...
body: JSON.stringify({
  title: title.trim(),
  description: description.trim() || undefined,
  status, severity,
  assignee_name: assignee?.full_name || undefined,
  due_date: dueDate || undefined,
  due_time: dueTime || undefined,
  notes: notes.trim() || undefined,
}),
```

### `_create-task-modal.tsx` — helpers to extract (lines 38–55)

```tsx
function pad2(n: number): string { return n.toString().padStart(2, "0"); }
function nowDateTimeValue(): string { /* local "YYYY-MM-DDTHH:mm" */ }
function dueDefaultValue(dueDate?: string | null): string {
  const datePart = dueDate || nowDateTimeValue().slice(0, 10);
  return `${datePart}T19:00`;
}
```
Move to `_datetime-helpers.ts`; add:
```tsx
export function splitDateTimeValue(v: string): { date: string; time: string } {
  const [date, time] = v.split("T");
  return { date: date ?? "", time: time ?? "" };
}
```
(The Task modal currently does `const [dueDate, dueTime] = dueValue.split("T")` inline at line 166 — switch it to `splitDateTimeValue` too for consistency, optional but tidy.)

### `_task-description-editor.tsx` — prop change (R7)

```tsx
export function TaskDescriptionEditor({
  projectId, value, onChange,
  uploadUrl = `/api/v2/projects/${projectId}/tasks/description-images`,
}: {
  projectId: string; value: string; onChange: (html: string) => void; uploadUrl?: string;
}) {
  async function uploadAndInsertImage(file: File) {
    // ...
    const res = await fetch(uploadUrl, { method: "POST", body: fd });
    // ...
  }
```

### `issues` POST route — current insert (lines 55–65 of `.../issues/route.ts`)

```tsx
.insert({
  project_id: project.id,
  title: body.title.trim(),
  description: body.description?.trim() || null,
  status: body.status || "open",
  severity: body.severity || null,
  assignee_name: body.assignee_name?.trim() || null,
  assignee_email: body.assignee_email?.trim() || null,
  due_date: body.due_date || null,
  // + due_time: body.due_time || null,
  // + notes: body.notes?.trim() || null,
})
```

### `issues` PATCH route — add to the `perm.canEditDetails` block (after line 57)

```tsx
if ("due_time" in body) patch.due_time = body.due_time || null;
if ("notes" in body) patch.notes = body.notes?.trim?.() || null;
```

### `tasks` PATCH route — add to the `perm.canEditDetails` block (after line ~57, R9 + bug fix)

```tsx
if ("start_date" in body) patch.start_date = body.start_date || null;
if ("start_time" in body) patch.start_time = body.start_time || null;
if ("due_time" in body) patch.due_time = body.due_time || null;
if ("notes" in body) patch.notes = body.notes?.trim?.() || null;
if ("estimate_hours" in body) patch.estimate_hours = body.estimate_hours ?? null;
```

### Issue Detail — current "Due date" Meta (`_issue-detail.tsx` ~278–290)

```tsx
<Meta label="Due date">
  <input type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); void saveField({ due_date: e.target.value || null }); }}
    disabled={!perm.canEditDetails} className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`} />
</Meta>
```
→ add a sibling `Meta label="Due time"` with `<input type="time" value={dueTime} …>` → `saveField({ due_time: next || null })`, plus `const [dueTime, setDueTime] = useState(issue.due_time ?? "")`.

New "Notes" card — place right after the `AccordionCard title="Description"` (`_issue-detail.tsx` ~306):
```tsx
<AccordionCard title="Notes" defaultOpen={false}>
  <DescriptionField
    uploadUrl={`/api/v2/projects/${projectId}/issues/description-images`}
    value={notes}
    readOnly={!perm.canEditDetails}
    onSave={(html) => { setNotes(html); void saveField({ notes: html || null }); }}
  />
</AccordionCard>
```
with `const [notes, setNotes] = useState(issue.notes ?? "")`.

### Task Detail — analogous (`_task-detail.tsx`)

- `const [dueTime, setDueTime] = useState(task.due_time ?? "")`, `startTime` similarly, `notes` similarly.
- Add "Due time" `Meta` after "Due date" (~309), "Start time" `Meta` after "Start date" (~323).
- Add `<Card title="Notes" noPadding>` (uses local `Card` helper, not `AccordionCard`, on this page — check which helper the file defines) with `DescriptionField` right after the Description `Card` (~401), tasks upload URL.

## Implementation Steps

1. **Migration + types.** Write `128_issues_time_notes_columns.sql` (do **not** apply). Add `due_time` / `notes` to `issues` Row/Insert/Update in `src/types/database.ts`.
2. **Shared helpers.** Create `_datetime-helpers.ts` with `pad2` / `nowDateTimeValue` / `dueDefaultValue` / `splitDateTimeValue`. Update `_create-task-modal.tsx` to import them (delete the inline copies); verify no behaviour change.
3. **`TaskDescriptionEditor`.** Add the defaulted `uploadUrl` prop; route `fetch` through it.
4. **API routes.** `issues` POST + PATCH accept `due_time` / `notes`. `tasks` PATCH: add `start_date` / `start_time` / `due_time` / `notes` / `estimate_hours` mapping (R9 + bug fix). Add `type IssueUpdate` fields are already covered by the regenerated `database.ts`.
5. **`_create-issue-modal.tsx`.** Replace Description `<textarea>` → `TaskDescriptionEditor` (issues upload URL). Replace `dueDate` state → `dueValue` seeded from `dueDefaultValue()`; Due field → `DateTimeFieldPicker`. Add `notes` state + second `TaskDescriptionEditor` in the Issue Information section. Rework `submit()` to split `dueValue` and add `due_time` / `notes` to the body. Formalise `fieldErrors` rendering per field (title stays the only validated field; keep bottom `{error}` for server errors).
6. **Issue Detail (×2 copies).** Add "Due time" `Meta` + "Notes" `AccordionCard`; new `dueTime` / `notes` state + `saveField` calls.
7. **Task Detail (×2 copies).** Add "Due time" + "Start time" `Meta`s + "Notes" card; new state + `saveField` calls.
8. **Verify:** `npx tsc --noEmit` and `pnpm lint`. Then browser acceptance (see Verification).

## Acceptance Criteria

- [ ] New Issue modal Description is a rich-text editor with B / I / • toolbar and "Paste or drag an image to embed it" hint; pasting an image uploads it and embeds it inline; created issue's `description` is HTML.
- [ ] New Issue modal "Due date & time" field is the calendar + hour/minute/AM-PM popover, pre-filled to **7:00 PM today**; picking a date/time and creating the issue persists `due_date` (date) + `due_time` (time) correctly, with no timezone shift.
- [ ] New Issue modal has a "Notes (optional)" rich-text field; its content is saved to `issues.notes`; leaving it blank sends no `notes`.
- [ ] Title validation still shows "Title is required" / "An issue with this title already exists." as a red-bordered field with red helper text directly below the Title input; the pre-submit toast still fires; server errors still render in the bottom line.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.
- [ ] Issue Detail shows an editable "Due time" input next to "Due date" and a "Notes" accordion; edits persist via PATCH and survive reload.
- [ ] Task Detail shows editable "Due time" + "Start time" inputs and a "Notes" card; edits persist. A Task Detail "Start date" or "Estimate (hours)" edit **now persists** (previously silently dropped).
- [ ] New Task modal is visually and behaviourally unchanged (regression check).
- [ ] Both `legacy/` and `v2/` detail routes show the new fields (same underlying project/issue/task).

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Browser (dev server, a project with the v2 route):
1. Project → Issues tab → **New Issue**. Confirm RTE Description (type, bold, bullet, paste an image), the Due date+time popover (defaults 7 PM today), and the Notes RTE. Submit with a blank title → inline red error + toast. Fix title, submit → issue created.
2. Open the created issue's Detail page (both `/projects/v2/…/issues/[id]` and `/projects/legacy/…/issues/[id]`). Confirm Description renders the HTML, "Due time" shows the picked time, "Notes" accordion shows the notes. Edit due time + notes, reload → persisted.
3. Open any Task Detail page (both route prefixes). Confirm new "Due time" / "Start time" inputs + "Notes" card. Edit each + "Start date" + "Estimate (hours)", reload → all persisted.
4. Open **New Task** modal → confirm unchanged.
5. Direct Supabase check (or after `db push`): `select due_date, due_time, notes from issues order by created_at desc limit 1;`

> **Migration not applied by the implementer** (repo policy — hard-to-reverse external action). Until the user runs `npx supabase db push`, issue creation/patch with `due_time`/`notes` fails cleanly with an inline error (`Could not find the 'due_time' column…`), exactly as task 274 predicted for its own migration 110. Call this out in Implementation Notes.

## Compatibility Touchpoints

- **DB migration 128** — additive nullable columns only; no backfill; no RLS change (existing `issues_*` policies cover the new columns). **Migration number collision risk:** planned task 337 also claims `127` for a different table — this task uses `128`. Confirm the next free number at implementation time (`ls supabase/migrations/ | tail`).
- **`src/types/database.ts`** must be updated in lockstep with the migration or `tsc` fails on the new `patch.due_time` / `patch.notes` assignments.
- No packaging / adapter / install-surface impact. No MCP tool changes. No `env.example` changes.
- `_docs/mcp-tools.md` — not affected (no `registerTool` changes).

## Implementation Notes

### What Changed
- **Migration 128** (`128_issues_time_notes_columns.sql`) — additive nullable `issues.due_time time` + `issues.notes text`. **Written, NOT applied.** `src/types/database.ts` `issues` Row/Insert/Update updated in lockstep.
- **Shared `_datetime-helpers.ts`** — `pad2` / `nowDateTimeValue` / `dueDefaultValue` / `splitDateTimeValue` extracted from `_create-task-modal.tsx` (inline copies deleted; the modal's `startValue.split("T")` / `dueValue.split("T")` at submit switched to `splitDateTimeValue` too). No behaviour change to the Task modal.
- **`TaskDescriptionEditor`** gained an optional `uploadUrl?: string` prop defaulting to the tasks endpoint; the paste/drop `fetch` routes through it. New Task modal call site unchanged.
- **New Issue modal (`_create-issue-modal.tsx`)** — Description `<textarea>` → `TaskDescriptionEditor` (issues upload URL); Due `<input type="date">` → `DateTimeFieldPicker` with `dueValue` state seeded from `dueDefaultValue()` (7:00 PM today), split into `due_date` + `due_time` at submit; new optional Notes RTE at the bottom of "Issue Information"; submit body gains `due_time` / `notes`. Title validation + per-field error rendering unchanged (already field-level). Doc comment at top rewritten.
- **API** — `issues` POST persists `due_time` / `notes`; `issues` PATCH maps `"due_time" in body` / `"notes" in body` in the `canEditDetails` block. `tasks` PATCH now maps `start_date`, `start_time`, `due_time`, `notes`, `estimate_hours` (fixes the pre-existing silent no-op for `start_date` / `estimate_hours`, which `_task-detail.tsx` was already sending).
- **Issue Detail (v2 + legacy)** — new "Due time" `Meta` (native `type="time"`) after "Due date"; new collapsed "Notes" `AccordionCard` (`DescriptionField`, issues upload URL) after Description. `dueTime` / `notes` state + `saveField` calls.
- **Task Detail (v2 + legacy)** — new "Due time" + "Start time" `Meta`s; new "Notes" `Card` after Description. `dueTime` / `startTime` / `notes` state + `saveField` calls.

### Files Changed
- `supabase/migrations/128_issues_time_notes_columns.sql` — new; additive nullable columns.
- `src/types/database.ts` — `issues` Row/Insert/Update gain `due_time` / `notes`.
- `src/app/(hub)/projects/_shared/_datetime-helpers.ts` — new shared module.
- `src/app/(hub)/projects/_shared/_create-task-modal.tsx` — import shared helpers, drop inline copies, use `splitDateTimeValue`.
- `src/app/(hub)/projects/_shared/_task-description-editor.tsx` — `uploadUrl` prop.
- `src/app/(hub)/projects/_shared/_create-issue-modal.tsx` — RTE Description + Notes, `DateTimeFieldPicker` Due, split payload.
- `src/app/api/v2/projects/[projectId]/issues/route.ts` — POST persists `due_time` / `notes`.
- `src/app/api/v2/issues/[issueId]/route.ts` — PATCH maps `due_time` / `notes`.
- `src/app/api/v2/tasks/[taskId]/route.ts` — PATCH maps `start_date` / `start_time` / `due_time` / `notes` / `estimate_hours` (R9 + bug fix).
- `src/app/(hub)/projects/{v2,legacy}/[projectId]/issues/[issueId]/_issue-detail.tsx` — Due time + Notes.
- `src/app/(hub)/projects/{v2,legacy}/[projectId]/tasks/[taskId]/_task-detail.tsx` — Due time + Start time + Notes.

### Deviations From Plan
- **Migration number left at 128 as the doc instructs**, even though `127` is currently the next free number (latest applied is `126`; task 337's `127` is not yet written). This leaves a one-file gap. If task 337 later lands `127` *after* `128` is applied remotely, `supabase db push` will flag the out-of-order migration — the user should reconcile numbering when pushing (either renumber this to 127, or ensure 337 uses 129).
- Empty RTE Description/Notes emit Tiptap's `"<p></p>"`, which is truthy, so `description.trim() || undefined` sends `"<p></p>"` rather than nothing. This exactly mirrors the New Task modal's existing behaviour (the doc explicitly said "match New Task's") — not changed here.
- Impeccable `design-system-font-size` hook fired ~30 times across the 10 touched files. Every flagged line is a pre-existing `text-[Npx]` literal, none introduced by this task. CLAUDE.md "UI Polish Conventions" explicitly keeps this codebase's hand-rolled sidebar/label font sizes off a formal type ramp, so these are left unchanged (fixing them would be unrequested scope across files this task only touches incidentally).

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in unrelated `_checklist-tab.tsx`)
- Browser acceptance — **NOT RUN** (implement stage). Until the user runs `npx supabase db push` for migration 128, issue create/patch with `due_time`/`notes` fails cleanly with an inline `Could not find the 'due_time' column…` error (same as task 274 predicted for migration 110). Task Detail `due_time`/`start_time`/`notes` edits likewise no-op until 128… (those columns are on `tasks` and already exist from migration 110 — they work immediately; only the `issues` side waits on 128).

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. New code follows the surrounding idiom exactly: detail-page edits are copy-paste of the existing `Meta` + native-input + `saveField` pattern; the API-route additions mirror the existing `if ("x" in body) patch.x = …` chain; `_datetime-helpers.ts` is a clean, well-commented extraction with no behaviour change to the Task modal (verified via the identical `nowDateTimeValue()` / `dueDefaultValue()` seeds and the `splitDateTimeValue` swap).
- No `any` / untyped escape hatches. `estimate_hours` in the tasks PATCH route is defensively narrowed (`typeof … === "number" && Number.isFinite(…)`) rather than trusting the request body — an improvement over the plan's `?? null` sketch.
- `TaskDescriptionEditor`'s `uploadUrl` default references an earlier-destructured param (`projectId`) in the same object pattern — valid JS, `tsc` confirms, and keeps every existing call site untouched (R7 satisfied).
- Both `_issue-detail.tsx` copies and both `_task-detail.tsx` copies were diffed post-edit and differ **only** by the intended `/projects/v2/` vs `/projects/legacy/` route prefix — the "apply to both copies" invariant held.
- Migration 128 restyled during this gate for convention parity: dropped the `public.` schema prefix (recent migrations use bare `alter table issues`) and aligned the header to `-- Migration 128: … (task 338)`.
- No secrets, no debug logging, no dead code. `tsc` + `lint` clean.

### Deviations
- **Minor — R4's optional "due date required" fallback guard not added to the Issue modal `submit()`.** R4 described it as "carried over as a bottom-of-form fallback only". `dueValue` is always seeded (7 PM today) and `DateTimeFieldPicker` exposes no clear-to-empty, so `splitDateTimeValue(dueValue).date` is never empty — the guard would be unreachable. Left out as genuinely dead defensive code; the New Task modal keeps its copy only because that modal predates the always-on picker decision. No functional gap.
- **Minor — empty RTE emits `"<p></p>"`.** `description.trim() || undefined` (and the detail-page `saveField({ notes: html || null })`) therefore persist `"<p></p>"` for a touched-then-emptied editor. This is the New Task modal's existing behaviour, which the plan explicitly said to match. Not a regression; not worth special-casing here.
- **Minor — migration numbered 128, leaving 127 unused.** The task doc chose this deliberately to avoid colliding with planned task 337. Documented in Implementation Notes with the `supabase db push` ordering caveat. A doc-sanctioned decision, not an implementer deviation.
- **Minor — Impeccable `design-system-font-size` fired ~30× across the 10 touched files.** Every flagged line is a pre-existing `text-[Npx]` literal; none introduced here. CLAUDE.md "UI Polish Conventions" keeps this codebase's hand-rolled label sizes off a formal ramp. Correctly left unchanged.

### Required Fixes
- None.

## Testing-Phase Fixes

### 1. `DateTimeFieldPicker` opened below the trigger on the first click even when it overflowed the viewport bottom (flipped correctly only on the 2nd+ click)

**Reported:** New Issue modal "Due date & time" field — first click opens the calendar/time popover downward, overflowing the screen; closing and re-opening positions it correctly (above the trigger).

**Cause:** `_datetime-field-picker.tsx` rendered its portal panel only when `open && pos`. On the first open `pos` is `null`, so the panel is not in the DOM when `usePopoverPosition` first measures it — `panelRef.current?.offsetHeight` reads `0`, the `openAbove` check is skipped (`panelHeight > 0` is false), and it falls back to opening below. It self-corrects on the next open only because `pos` is now a stale-but-non-null value, so the panel mounts immediately and the height read succeeds. Same latent pattern exists in `_searchable-select.tsx` (left untouched — its panel is short and hasn't surfaced the bug; noted for a future pass).

**Fix:** render the panel as soon as `open` is true (`open && createPortal(...)`), positioned via `pos?.*` and held `visibility: hidden` for the single frame until `pos` resolves. The panel is now in the DOM when the hook measures it, so the first open flips correctly. No flash (a `visibility: hidden` element isn't painted). One file: `src/app/(hub)/projects/_shared/_datetime-field-picker.tsx`.

**Verification:** `npx tsc --noEmit` + `pnpm lint` PASS. Browser re-check of the first-open flip still pending with the rest of the task's browser acceptance.

### 2. "File an Issue" from a ticket thread message flattened the message to plain text (dropped inline images, collapsed paragraph spacing)

**Reported:** "File an Issue" (task 333, ticket conversation kebab) seeds the New Issue Description without the message's inline images, and with different line spacing than "Create Task" for the same message.

**Cause:** task 333 pre-dates task 338. Back then the New Issue modal's Description was a plain `<textarea>`, so `_thread-to-project-modal.tsx` ran the message body through a local `htmlToPlainText()` for the issue path while the task path (already a Tiptap RTE) passed `sanitizeMessageHtml()` HTML directly. Task 338 made the Issue Description the same `TaskDescriptionEditor` RTE, so the plain-text conversion is now both unnecessary and lossy.

**Fix:** the issue path now uses the exact same seed expression as the task path — `message.isHtml ? sanitizeMessageHtml(message.body) : message.body` — so inline images and `<p>` paragraph spacing carry through identically. The now-dead `htmlToPlainText()` helper was removed. One file: `src/app/(hub)/desk/tickets/[ticketId]/_thread-to-project-modal.tsx`. (Field/line spacing inside the modal was already identical — both modals render the seed through the same `TaskDescriptionEditor` and lay fields out via the same `CollapsibleSection` `gap-4`.)

**Verification:** `tsc` reports **no errors in any task-338/339 file**; a fully-green `npx tsc --noEmit` is currently blocked only by unrelated in-progress task-337 (Notes folder sharing) work in the tree (`_note-folder-share-dialog` not yet created, `shares/route.ts` role typing). `pnpm lint` — 0 errors (pre-existing task-337 + `_checklist-tab` warnings only). Browser re-check pending with the rest of the task's acceptance pass.
