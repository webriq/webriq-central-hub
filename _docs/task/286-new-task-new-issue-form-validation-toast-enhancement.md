# 286: New Issue Modal Enhancement to Match New Task — Duplicate-Title/Tasklist-Name Validation, Inline Red-Border/Red-Text Field Errors, Sonner Toasts on Both Modals

**Created:** 2026-08-21
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Two related changes to the Tasks/Issues creation flow in the unified Projects detail page (`src/app/(hub)/projects/_shared/`):

1. **`CreateIssueModal`** (currently inline in `_project-detail.tsx:877-1078`, explicitly left untouched by task 274's New Task modal redesign) gets the same structural/visual treatment task 274 gave `CreateTaskModal`: extracted to its own file, wider dialog (`max-w-lg` → `max-w-2xl`), its fields grouped into collapsible `CollapsibleSection`s (Description, Attachments, Issue Information), and its Assignee field converted from a plain `<select>` to the existing `SearchableSelect` component. Issue's field set itself is unchanged (no Milestone/Tasklist/notes/time-of-day — those don't exist on the `issues` table and are out of scope here); only the container/section structure and Assignee's control type change, matching the "same as New Task creation" instruction at the structural level task 274 already established.

2. **Both `CreateTaskModal` and `CreateIssueModal` get real duplicate-name validation with inline field-level errors, styled after the New Project form's `Field` component** (`src/app/(hub)/projects/v2/new/_content.tsx:149-204`) — red border (`border-[#C0392B]` + a soft red focus-ring shadow) on the input itself, small red text directly below it, and errors that clear as soon as the user edits the field again (that file's own `setErrors1((e) => { const n = {...e}; delete n.field; return n; })` pattern). Three specific duplicate rules, all checked client-side against data the page already holds in memory (`tasks`, `issues`, `tasklists` — all live React state in `_project-detail.tsx`, kept in sync via its existing Supabase realtime subscription):
   - **No duplicate task title within the same tasklist** — two tasks may share a title if they're in different tasklists (or one/both have no tasklist), but not within the same one.
   - **No duplicate issue title** — project-wide (issues have no tasklist grouping to scope by).
   - **No duplicate tasklist name** — checked when a task is created with `creatingTasklist`'s inline "+ Create new list…" flow (the only place a tasklist is created in this app — confirmed by grep, nothing else POSTs to `/tasklists`).

   This mirrors the New Project form's own duplicate-name pattern (`_content.tsx:589-592`'s in-memory per-card dedupe against names already loaded in state) rather than its other pattern (`_content.tsx:558-570`'s server round-trip `check-name` API), because that server-round-trip pattern exists specifically for checking against *all* customers/projects in the database, which the New Project form doesn't have loaded client-side — whereas this page already has the full `tasks`/`issues`/`tasklists` lists for the current project in memory, so a network round trip would be redundant.

3. **Sonner toast on submission for both modals** — `toast.loading(...)` → `toast.success(..., {id})` / `toast.error(..., {id})`, following the exact convention already established in this codebase (`src/components/projects/editable-project-title.tsx:58-91`, `src/app/(hub)/projects-old/[projectId]/_list-view.tsx:264-275`). `sonner` is already a dependency and `<Toaster />` is already mounted in `(hub)/layout.tsx`, so no new wiring is needed — this covers both a pre-flight validation block (toast.error with a generic "fix the errors below" message, matching `editable-project-title.tsx:58`'s own precedent of toasting a validation failure before the network call even starts) and the actual create request's loading/success/error states.

**Scope note on "no red-border support needed for `SearchableSelect`/`DateTimeFieldPicker`":** the only fields that need actual required/duplicate validation in this task are Title (both modals) and the inline new-tasklist-name `<input>` (Task modal) — all plain `<input>` elements, so the red-border/red-text treatment is just conditional Tailwind classes on those three inputs, no changes needed to the shared `SearchableSelect`/`DateTimeFieldPicker` components. (Start/Due's existing "required" checks in `CreateTaskModal` are effectively unreachable today — both fields are always pre-populated by the modal's own default-value initializers and neither picker exposes a way to clear back to empty — so no new error-prop plumbing is added there; the existing generic bottom-of-form error string remains as a defensive fallback.)

---

## Requirements

### 1. Extract `CreateIssueModal` into its own file, matching task 274's `CreateTaskModal` extraction

- [ ] New file `src/app/(hub)/projects/_shared/_create-issue-modal.tsx`, exporting `CreateIssueModal`.
- [ ] `_project-detail.tsx`: delete the inline `CreateIssueModal` function (currently lines 877-1078) and the now-unused local `MemberOption` type (line 875 — only consumer was `CreateIssueModal`; the call site already passes the same `allMembers` array used for `CreateTaskModal`, which is structurally `MemberOptionWithRole[]`, so the new file uses `MemberOptionWithRole` directly instead of redefining a near-duplicate type).
- [ ] Export `SEVERITY_OPTS` from `_project-detail.tsx` (currently a private `const` at line 88) — the extracted file needs it, same as `STATUS_OPTS`/`PRIORITY_OPTS` are already exported for `_create-task-modal.tsx`.
- [ ] Import `CreateIssueModal` from the new file at the top of `_project-detail.tsx`.

### 2. Widen the New Issue dialog and group its fields into `CollapsibleSection`s

- [ ] Outer card: `max-w-lg` → `max-w-2xl`, matching `CreateTaskModal`.
- [ ] Title stays outside any accordion, at the top (matches `CreateTaskModal`'s Title placement).
- [ ] `Description`: wrap in `CollapsibleSection` (`defaultOpen`) — content stays a plain `<textarea>`, **not** converted to the `TaskDescriptionEditor` RTE. (Out of scope — see below.)
- [ ] `Attachments`: wrap in `CollapsibleSection` (`defaultOpen={false}`) — unchanged `TaskAttachmentPicker` inside.
- [ ] New `Issue Information` `CollapsibleSection` (`defaultOpen`) wrapping the existing two 2-column grids: Status/Severity, then Assignee/Due date — field order and grouping unchanged from today, just wrapped.

### 3. Make Issue's Assignee field searchable

- [ ] Replace the plain `<select>` Assignee control with the existing `SearchableSelect` (`./_searchable-select`), same component `CreateTaskModal` already uses — no changes needed to `SearchableSelect` itself.
- [ ] `options={allMembers.map((m) => ({ value: m.id, label: m.full_name ?? "Unknown" }))}`, `placeholder="Unassigned"` — **not** filtered to `role === "developer"` (Task's Assignee filters to developers only; Issue's has never done that — this task preserves that existing difference, not a new one).

### 4. Duplicate-title validation — Task (scoped per tasklist) and Issue (project-wide)

- [ ] `CreateTaskModal` gains a new `tasks: Task[]` prop (passed from `_project-detail.tsx`'s existing `tasks` state at the `<CreateTaskModal>` call site — that state is already the full top-level task list for the project, kept live by the page's existing realtime subscription).
- [ ] `CreateIssueModal` gains a new `issues: Issue[]` prop (same pattern, from `_project-detail.tsx`'s existing `issues` state).
- [ ] Task: on submit, before the network call, compare `title.trim().toLowerCase()` against every task in `tasks` whose `(t.tasklist_id ?? "") === (tasklistId || "")` (i.e. compare within the same tasklist bucket, including the "no tasklist" bucket when neither has one). If a match exists (case-insensitive), block submit with a field error on Title: `"A task with this title already exists in this task list."` No check needed against a brand-new tasklist being created in the same submit (`creatingTasklist`) — it's empty by definition, so no duplicate is possible there.
- [ ] Issue: on submit, before the network call, compare `title.trim().toLowerCase()` against every issue in `issues` (no scoping — issues have no grouping construct). If a match exists, block submit with a field error on Title: `"An issue with this title already exists."`
- [ ] Both: keep the existing required check (`"Title is required"`) — now rendered as a field error (red border + text below), not the old single bottom-of-form string.

### 5. Duplicate tasklist-name validation (Task modal's inline "+ Create new list…" flow)

- [ ] When `creatingTasklist` is true, on submit (before the tasklist-creation `fetch` call), validate `newTasklistName`:
  - Empty/whitespace-only → field error `"Task list name is required."`
  - Case-insensitive match against any `tasklists[].name` → field error `"A task list with this name already exists."`
- [ ] Block submit (don't call the `/tasklists` POST) when either fails; render the error below the inline name `<input>` with the same red-border treatment.

### 6. Inline field-level error rendering (both modals) — red border + red text below field, matching the New Project form's `Field` component pattern

- [ ] Replace each modal's single `error: string | null` used for validation purposes with a `fieldErrors: Record<string, string>` state (keeping a separate generic `error` state only for actual network/API failure messages shown at the bottom of the form, unchanged from today — field errors are for pre-flight validation, the bottom banner is for "the request itself failed").
- [ ] Reference pattern to copy (`_content.tsx:185-201`):
  ```tsx
  className={cn(
    "...",
    error
      ? "border-[#C0392B] bg-white shadow-[0_0_0_3px_rgba(192,57,43,0.08)]"
      : "border-[#E2E7F2] bg-[#F4F6FB] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]"
  )}
  ...
  {error && <span className="text-xs text-[#C0392B]">{error}</span>}
  ```
- [ ] Apply this to exactly three inputs: Task's Title, Task's inline new-tasklist-name input, Issue's Title.
- [ ] Clear the relevant `fieldErrors` key on that field's own `onChange`, matching `_content.tsx:929-936`'s `setErrors1((e) => { const n = {...e}; delete n.key; return n; })` pattern — so the red state disappears the moment the user starts fixing it, not only on next submit attempt.

### 7. Sonner toast — loading / success / error — on both modals' submission

- [ ] Both modals: `import { toast } from "sonner";`.
- [ ] Pre-flight validation block (any field error present): `toast.error("Please fix the errors below before submitting.")` — no loading toast started yet, matches `editable-project-title.tsx:58`'s precedent of toasting a validation failure before any network call.
- [ ] Once validation passes and the actual create request starts: `const toastId = toast.loading("Creating task…")` / `toast.loading("Creating issue…")`.
- [ ] Task modal's inline tasklist-creation sub-step (when `creatingTasklist`): on failure, `toast.error(message, { id: toastId })` and return (same `toastId` — one continuous loading→outcome toast for the whole submit, not a separate toast per network call).
- [ ] Main create request: on failure, `toast.error(body.error || "Failed to create task"/"Failed to create issue", { id: toastId })`; on success, `toast.success("Task created", { id: toastId })` / `toast.success("Issue created", { id: toastId })`.
- [ ] The existing post-creation attachment-upload phase (task 273's upload queue) is unaffected — the success toast fires once the task/issue record itself is created, same moment `onCreated`/upload-queue-enqueue already happens today; no toast added for individual attachment upload progress (out of scope, the modal's own `UploadQueuePanel` already shows that).

---

## Out of Scope / Must-Not-Change

- **Issue's Description stays a plain `<textarea>`**, not converted to the `TaskDescriptionEditor` rich-text editor Task's Description/Notes use. `TaskDescriptionEditor` is currently used nowhere except `_create-task-modal.tsx`; there's no existing Issue-description HTML renderer elsewhere (list/board/calendar/detail views) to confirm safe round-tripping, and the user's request doesn't ask for it — converting the storage/rendering shape of `issues.description` is a separate, unscoped change.
- **No new fields on Issue** — no Milestone, Tasklist, combined date-time picker, or Notes. The `issues` table has no columns for any of these (confirmed: no `milestone_id`/`tasklist_id`/`notes`/`due_time` on `issues`), and the request's actual asks (validation, red borders, toasts) don't require them.
- **No server-side/API duplicate-check additions** — `POST /api/v2/projects/[projectId]/tasks`, `/issues`, and `/tasklists` are untouched. All three duplicate rules are enforced client-side only, against data already loaded in `_project-detail.tsx`'s state. (A determined API caller bypassing the UI could still create a duplicate — acceptable, matching this app's existing pattern where e.g. task/issue title uniqueness has never been enforced anywhere before this task, client or server.)
- **No Due≥Start or other cross-field date validation** — not requested, not added as a side effect.
- **`SearchableSelect` and `DateTimeFieldPicker` components are not modified.** No `error` prop added to either — nothing in this task's validation requirements needs it (see Overview's scope note).
- **Status/Severity/Priority stay plain `<select>`s on both modals** — only Title (both) and the inline tasklist-name input get the red-border/red-text treatment; only Assignee (Issue) changes control type.
- **Existing generic bottom-of-form `error` banner is preserved** for actual request/network failures (e.g. the tasklist-creation sub-step's own existing error path, or a `res.ok === false` from the main create call) — it is not replaced by `fieldErrors`, the two coexist (field errors = pre-flight validation, banner = request failed).
- **No changes to RLS, migrations, or `src/types/database.ts`.**

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_shared/_create-issue-modal.tsx` | Create | Extracted + redesigned `CreateIssueModal`: wide dialog, `CollapsibleSection`s, searchable Assignee, Title validation (required + duplicate), inline red-border/red-text, sonner toast |
| `src/app/(hub)/projects/_shared/_project-detail.tsx` | Modify | Export `SEVERITY_OPTS`; remove inline `CreateIssueModal` + now-unused `MemberOption` type; import `CreateIssueModal` from new file; pass `tasks` prop to `<CreateTaskModal>` and `issues` prop to `<CreateIssueModal>` at their call sites |
| `src/app/(hub)/projects/_shared/_create-task-modal.tsx` | Modify | Add `tasks: Task[]` prop; add `fieldErrors` state + duplicate-in-tasklist Title check + duplicate Tasklist-name check; inline red-border/red-text on Title + new-tasklist-name inputs; sonner toast loading/success/error |

## Code Context

### `_project-detail.tsx:717-737` — the two call sites to update

```tsx
{createDefaults && (
  <CreateTaskModal
    projectId={project.project_id ?? project.id}
    milestones={milestones}
    tasklists={tasklists}
    allMembers={allMembers}
    defaults={createDefaults}
    onClose={() => setCreateDefaults(null)}
    onCreated={(t) => { addTask(t); setCreateDefaults(null); }}
    onTasklistCreated={addTasklist}
    // + tasks={tasks}
  />
)}
{createIssueOpen && (
  <CreateIssueModal
    projectId={project.project_id ?? project.id}
    allMembers={allMembers}
    onClose={() => setCreateIssueOpen(false)}
    onCreated={(i) => { addIssue(i); setCreateIssueOpen(false); }}
    // + issues={issues}
  />
)}
```

`tasks`/`issues` are already component state (`_project-detail.tsx:147,162`), kept live by the existing Supabase realtime subscription (`:181-218`) — no new fetch needed, just thread the existing state down as a prop.

### `_content.tsx:149-204` — the `Field` component to copy the red-border/red-text pattern from (not imported — this is a page-scoped file in a different route; copy the class-name pattern into the two modal files' own inline `<input>`s, same as `inputClass`/`labelClass` are already locally defined per-file today)

```tsx
className={cn(
  "peer w-full rounded-[9px] border px-3.5 py-[11px] text-sm text-[#0B1533] outline-none transition-colors duration-150",
  disabled
    ? "cursor-not-allowed border-[#E2E7F2] bg-[#EDF0F7] text-[#5F6A88]"
    : error
      ? "border-[#C0392B] bg-white shadow-[0_0_0_3px_rgba(192,57,43,0.08)]"
      : "border-[#E2E7F2] bg-[#F4F6FB] focus:border-[#007BFF] focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,123,255,0.14)]"
)}
/>
{error && <span className="text-xs text-[#C0392B]">{error}</span>}
```

Note `_create-task-modal.tsx`'s own `inputClass` uses `focus:ring-[3px] focus:ring-...` instead of `_content.tsx`'s `focus:shadow-[0_0_0_3px_...]` — keep each file's own existing focus-ring mechanism, only borrow the *error* branch's colors (`border-[#C0392B]`, `shadow-[0_0_0_3px_rgba(192,57,43,0.08)]`, `text-xs text-[#C0392B]` for the message).

### `_content.tsx:929-936` — clear-error-on-change pattern to replicate

```tsx
onChange={(v) => {
  setNewCompanyName(v);
  setErrors1((e) => {
    const n = { ...e };
    delete n.companyName;
    return n;
  });
}}
```

### `_content.tsx:584-592` — in-memory duplicate-name check pattern (the one to mirror; the *other* pattern in the same file, `:558-570`'s `check-name` API round trip, is NOT the one to copy — that exists only because the New Project form doesn't have the full customer/project list loaded client-side, unlike this page's `tasks`/`issues`/`tasklists`)

```tsx
const names = selectedTypes.map((t) => displayedNameForCard(t, cardsByType[t]!).trim());
const errorsByType = new Map<Classification, string>();
selectedTypes.forEach((t, i) => {
  if (!names[i]) errorsByType.set(t, "Project name is required.");
});
selectedTypes.forEach((t, i) => {
  if (errorsByType.has(t)) return;
  const dupIndex = names.findIndex((n, j) => j !== i && n.toLowerCase() === names[i].toLowerCase());
  if (dupIndex !== -1) errorsByType.set(t, "Project names must be unique across the types you're creating.");
});
```

### `editable-project-title.tsx:55-91` — the sonner loading→outcome toast convention to follow exactly

```tsx
async function submit() {
  const trimmed = value.trim();
  if (!trimmed) {
    toast.error("Project name cannot be empty");
    return;
  }
  setSaving(true);
  const toastId = toast.loading("Saving changes…");
  try {
    const res = await fetch(...);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Failed to update project name");
    }
    toast.success("Project name updated", { id: toastId });
    ...
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Failed to update project name", { id: toastId });
  } finally {
    setSaving(false);
  }
}
```

### `_create-task-modal.tsx:126-187` — current `submit()` to extend with `fieldErrors`/`tasks`-duplicate-check/toast (full current body already read; add validation + toast wrapping around the existing tasklist-creation and task-creation `fetch` calls, logic otherwise unchanged)

### `_project-detail.tsx:877-1078` — current `CreateIssueModal` (full body already read) to move into the new file with: `max-w-lg` → `max-w-2xl`; `MemberOption` → `MemberOptionWithRole`; three field groups wrapped in `CollapsibleSection` (`import { CollapsibleSection } from "./_collapsible-section";`); Assignee `<select>` → `SearchableSelect` (`import { SearchableSelect } from "./_searchable-select";`); `title`/duplicate validation + `fieldErrors` state; `issues` prop; sonner `toast` calls.

---

## Implementation Steps

1. `_project-detail.tsx`: export `SEVERITY_OPTS`.
2. Create `_create-issue-modal.tsx`: move `CreateIssueModal` out, apply `max-w-2xl`, wrap Description/Attachments/Issue-Information in `CollapsibleSection`, swap Assignee to `SearchableSelect`, add `issues` prop + Title required/duplicate validation + `fieldErrors` rendering + sonner toast.
3. `_project-detail.tsx`: delete the old inline `CreateIssueModal` + unused `MemberOption` type; import `CreateIssueModal` from the new file; pass `tasks={tasks}` to `<CreateTaskModal>` and `issues={issues}` to `<CreateIssueModal>`.
4. `_create-task-modal.tsx`: add `tasks` prop; add `fieldErrors` state; add duplicate-in-tasklist Title check and duplicate Tasklist-name check to `submit()`'s pre-flight validation; apply red-border/red-text to Title input and the inline new-tasklist-name input; add sonner toast (loading → success/error) wrapping the existing tasklist-creation + task-creation calls.
5. `npx tsc --noEmit` and `pnpm lint`.
6. Browser-verify (see Verification below).

## Acceptance Criteria

- [ ] New Issue dialog renders at `max-w-2xl`, with Description/Attachments/Issue Information as independently collapsible sections (Description and Issue Information default open, Attachments default closed) — visually consistent with the New Task dialog's section treatment.
- [ ] Issue's Assignee field is searchable (typing filters the option list), styled like Task's Milestone/Tasklist/Assignee fields.
- [ ] Creating a task with a title that already exists in the same tasklist blocks submission, shows a red border on Title, red text "A task with this title already exists in this task list." below it, and a toast error — the same title succeeds if a different tasklist (or no tasklist) is selected instead.
- [ ] Creating a task with a blank title shows the same red-border/red-text treatment with "Title is required."
- [ ] Creating an issue with a title that already exists anywhere in the project blocks submission with the same red-border/red-text pattern and a toast error; a unique title succeeds.
- [ ] Using Task modal's "+ Create new list…" flow with a name matching an existing tasklist (case-insensitive) blocks submission, shows red border + "A task list with this name already exists." below the inline name input, and a toast error; a unique name still creates the tasklist and proceeds exactly as before.
- [ ] Fixing an errored field (typing to change Title/tasklist name) clears that field's red border/text immediately, without needing to resubmit first.
- [ ] Successful task and issue creation each show: a loading toast while the request is in flight, then that same toast updates to a success message once the record is created (verified via toast id reuse, not a stacked second toast).
- [ ] A failed create request (e.g. simulate by triggering a 4xx) shows the loading toast updating to an error message, and the existing bottom-of-form error banner still appears as before.
- [ ] `npx tsc --noEmit` and `pnpm lint` both clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
```

Browser: open a project's Tasks tab. Click "New Task" — confirm Title/duplicate-in-tasklist validation (create one task, then try the same title in the same tasklist vs. a different tasklist), confirm the inline "+ Create new list…" flow's duplicate-name check, confirm red border/text appears and clears correctly, confirm the loading→success toast on a successful create. Click "New Issue" — confirm the wider dialog, the three collapsible sections, Assignee is now searchable, Title required/duplicate validation with the same red-border/red-text pattern, and the loading→success toast. Spot-check that Board's "add in column" and Calendar's "add on day" entry points into `CreateTaskModal` still work (unaffected by this task, but confirms the extraction didn't break existing wiring).

## Compatibility Touchpoints

- `_create-issue-modal.tsx` is a new, generically-named `_shared/`-level file, consistent with `_create-task-modal.tsx`'s existing precedent — reusable elsewhere in the Projects feature area later without relocation.
- No change to `_project-detail.tsx`'s public props/exports other than adding `SEVERITY_OPTS` to the existing `STATUS_OPTS`/`PRIORITY_OPTS`/`MemberOptionWithRole` export set needed by extracted modal files.
- No DB/API/type changes — this task is UI-only (client-side validation + presentation), so nothing in `src/types/database.ts`, migrations, or route handlers changes.

---

## Implementation Notes

### What Changed
- Extracted `CreateIssueModal` out of `_project-detail.tsx` into a new `_create-issue-modal.tsx`: wider dialog (`max-w-lg` → `max-w-2xl`), Description/Attachments/Issue Information wrapped in `CollapsibleSection`s (Description and Issue Information default open, Attachments default closed), Assignee converted from a plain `<select>` to the existing `SearchableSelect`. Issue's field set itself (Status/Severity/Assignee/Due date) is unchanged.
- Added client-side duplicate validation, all checked against data already held in memory (no new API calls): task titles unique within the same tasklist (`(t.tasklist_id ?? "") === (tasklistId || "")` bucket comparison, case-insensitive/trimmed), issue titles unique project-wide, and new tasklist names unique (checked in `CreateTaskModal`'s inline "+ Create new list…" flow, the only place a tasklist is created in this app).
- Both modals now render field-level errors — red border (`border-[#C0392B]` + `shadow-[0_0_0_3px_rgba(192,57,43,0.08)]`) plus small red text below the field — for Title (both modals) and the inline new-tasklist-name input (Task modal), styled after the New Project form's `Field` component. Errors clear on the field's own `onChange`, matching that same file's clear-on-change pattern. The pre-existing generic bottom-of-form `error` string is preserved for actual network/API failures (kept separate from `fieldErrors`, which are for pre-flight validation only).
- Added sonner `toast.loading(...)` → `toast.success(..., {id})` / `toast.error(..., {id})` to both modals' `submit()`, following the exact convention already established in `editable-project-title.tsx` and `_list-view.tsx`. A pre-flight validation block also fires `toast.error("Please fix the errors below before submitting.")` before any network call starts (matching `editable-project-title.tsx`'s own precedent of toasting a validation failure pre-network-call).
- Cleaned up five now-dead imports in `_project-detail.tsx` (`Loader2`, `TaskAttachmentPicker`, `useUploadQueue`, `UploadQueuePanel`, `uploadFileWithProgress`) that were only used by the removed inline `CreateIssueModal` — `pnpm lint` flagged these as unused after the extraction, confirmed via grep that nothing else in the file referenced them, then removed.

Live-verified in-browser (Chrome, ABC Test Company Gantt project, real seeded data via `/projects/v2/{project_id}/tasks` and `/issues`): New Task's empty-title red-border/red-text/toast; typing clears the error; created a task titled "Duplicate check task" in the "Kickoff call" tasklist; submitting the same title (different casing/whitespace) into the same tasklist correctly blocked with "A task with this title already exists in this task list." plus toast; the identical title submitted into "Scope doc" instead succeeded, confirming per-tasklist scoping; the "+ Create new list…" flow correctly blocked a tasklist name matching an existing one ("kickoff CALL" vs. "Kickoff call") with "A task list with this name already exists." plus toast. New Issue's wider dialog, three collapsible sections, and searchable Assignee rendered correctly; empty-title validation matched Task's pattern; created an issue titled "Login button broken", confirmed the loading→success toast sequence, then confirmed a second issue with the same title (different casing/leading whitespace) was blocked with "An issue with this title already exists." plus toast.

### Files Changed
- `src/app/(hub)/projects/_shared/_create-issue-modal.tsx` — new, extracted + redesigned `CreateIssueModal` (wide dialog, collapsible sections, searchable Assignee, Title required/duplicate validation with inline red-border/red-text, sonner toast)
- `src/app/(hub)/projects/_shared/_project-detail.tsx` — exported `SEVERITY_OPTS`; removed the inline `CreateIssueModal` function and the now-unused `MemberOption` type; imported `CreateIssueModal` from the new file; passed `tasks={tasks}` to `<CreateTaskModal>` and `issues={issues}` to `<CreateIssueModal>`; removed five now-dead imports (`Loader2`, `TaskAttachmentPicker`, `useUploadQueue`, `UploadQueuePanel`, `uploadFileWithProgress`)
- `src/app/(hub)/projects/_shared/_create-task-modal.tsx` — added `tasks: Task[]` prop; added `fieldErrors` state and a `validate()` pre-flight check for duplicate-in-tasklist Title and duplicate Tasklist-name; applied red-border/red-text styling to the Title input and the inline new-tasklist-name input, with clear-on-change; added sonner `toast.loading`/`toast.success`/`toast.error` wrapping the existing tasklist-creation + task-creation calls

### Deviations From Plan
- None. All seven requirements and the file-change plan were implemented exactly as the approved doc specified. One internal correction made mid-implementation (not a plan deviation, a self-caught bug): an early draft of `CreateTaskModal`'s `submit()` briefly routed the Start/Due "required" defensive-fallback checks into `fieldErrors.title` via `errs.title ??= "..."` — wrong field, would have shown a Start/Due message under the Title field in the unreachable edge case where it could ever fire. Caught and fixed before running verification; the final code keeps those two checks on the pre-existing generic bottom-of-form `error` string, exactly as the approved doc's "Scope note" specified.

### Verification Run
- `npx tsc --noEmit` — PASS (clean, zero output)
- `pnpm lint` — PASS (only the 2 pre-existing, unrelated `_checklist-tab.tsx` warnings remain — same ones task 274 already flagged as pre-existing)
- Browser (Chrome, real seeded dev data, ABC Test Company Gantt project) — PASS on every acceptance criterion: New Task wider dialog/sections, Title required + duplicate-in-tasklist validation (blocked in-list, succeeded cross-list), duplicate tasklist-name validation, red-border/red-text + clear-on-change, loading→success toast on task creation; New Issue wider dialog/sections, searchable Assignee, Title required + project-wide duplicate validation, loading→success toast on issue creation

---

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation: confirmed via `pnpm lint` (0 errors; the 5 now-dead lucide/attachment imports left behind by the `CreateIssueModal` extraction were caught and removed from `_project-detail.tsx`, verified by grep that nothing else in the file referenced them).
- No `any` or untyped escape hatches: `TaskFieldErrors`/`IssueFieldErrors` are fully typed `Record`-shaped objects; `npx tsc --noEmit` is clean across all three changed files.
- No deep nesting: both `validate()` functions and both `submit()` functions use flat guard-clause style, matching the pre-existing code's own shape.
- Clear single responsibility per file: `_create-issue-modal.tsx` owns only the Issue-creation modal; `_project-detail.tsx`'s changes are limited to wiring (export, import, two prop additions, dead-import cleanup); `_create-task-modal.tsx`'s new logic is scoped entirely inside `validate()`/`submit()` and the two inputs' JSX.
- Names describe behavior accurately (`validate`, `fieldErrors`, `errorInputClass`, `TaskFieldErrors`, `IssueFieldErrors`).
- Errors handled intentionally and consistently with the pre-existing pattern in both files: field errors (pre-flight) vs. the generic bottom-of-form `error` string (request/network failure) vs. toast (user-facing feedback layer over both) — three distinct, non-overlapping channels, not three redundant ones.
- No secrets, credentials, or debug logging introduced.
- Cross-checked every Requirement (1–7) and every Out-of-Scope boundary against the final code: all seven requirements are implemented exactly as specified (verified by re-reading the diffed sections of all three files against the task doc's Code Context and Acceptance Criteria); all Out-of-Scope boundaries hold — Issue's Description is still a plain `<textarea>`, no new Issue fields, no server-side duplicate checks, no Due≥Start validation, `SearchableSelect`/`DateTimeFieldPicker` untouched, Status/Severity/Priority still plain `<select>`s, the generic error banner still coexists with `fieldErrors`, and no RLS/migration/`database.ts` changes.

### Deviations
- **Minor — `inputClass`/`errorInputClass`/`labelClass` style-string constants are duplicated verbatim between `_create-task-modal.tsx` and `_create-issue-modal.tsx`.** Matches this codebase's already-established, explicitly-accepted precedent of small per-file style/utility duplication over a shared module for a few lines (e.g. task 274's own Quality Gate Notes cite the same acceptance for its `pad2()` helper; task 270's for `ALLOWED_MIME_TYPES`/`MAX_FILE_SIZE`). Not blocking.
- **Minor — the 5-line "clear this field's error on change" closure is repeated three times** (Task's Title, Task's new-tasklist-name, Issue's Title) rather than extracted into a shared setter helper. Within this codebase's stated tolerance ("Three similar lines is better than a premature abstraction," CLAUDE.md) — not blocking.

No deviation rises to Major — no requirement was violated, no scope was expanded beyond the approved doc, and no architecture changed without sign-off.
