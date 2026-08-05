# 211: Task Detail Page — Column Swap, Attachments/Comments Tabs, Grid+Modal Attachment Viewer, Assignee Avatar Fix, Required Creation Dates

**Created:** 2026-08-05
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

Five usability fixes to `/v2/projects/[projectId]/tasks/[taskId]` (`_task-detail.tsx`) and the "New Task" creation flow (`CreateTaskModal` in `_project-detail.tsx`), requested against the current shipped state of task 206 (Task Detail redesign — Design System v2.0, Description/Attachments/Comments, already implemented; see that doc's Implementation Notes) and task 210 (assignee-avatar RLS fix, currently `Status: Testing`, which explicitly flagged this page's `AssigneeChip` as an out-of-scope follow-up — see below):

1. **Column order** — swap the Description (main content) and Details (sidebar) columns so Details sits on the left and Description/Attachments/Comments sit on the right (currently the reverse).
2. **Tabs** — Attachments and Comments are currently two separate stacked `Card`s below Description; convert them into a single tabbed panel (pill-tab switcher, one visible at a time). Description stays its own standalone `Card`, unaffected.
3. **Attachments viewer** — currently a flat list of file-chip rows with a "View" link that does `window.open(url, "_blank", "noopener")` (`_task-attachments.tsx`). Replace with a grid of thumbnail tiles (matching the onboarding wizard's storage-file grid, task 198/`_file-tile.tsx`) whose "View" button opens an in-app modal (matching the onboarding wizard's `FileViewerModal`/`handleViewOutcomeFile` pattern, `_onboarding-wizard.tsx:1218-1234` + `:5523`) instead of a new browser tab.
4. **Assignee avatar names** — the sidebar's Assignees chips (`AssigneeChip` in `_pm-shared.tsx`, rendered at `_task-detail.tsx:308`) show raw-UUID-derived initials (e.g. the screenshotted `4B`/`65` bubbles) with a plain native `title={id}` tooltip — it never attempts name resolution at all. This is the exact gap task 210's own Out of Scope section flagged and deferred: *"`_pm-shared.tsx`'s `AssigneeChip` (used on the Task Detail page, `_task-detail.tsx:308`) — it never attempts name resolution at all... Same bug family, but not screenshotted or requested here; flag as a follow-up, don't touch in this task."* That follow-up is now requested — this task fixes it, reusing task 210's exact pattern (`adminClient` profiles lookup bypassing `profiles_read_own` RLS + styled `Tooltip` + hover-lift `motion.div` + `"Unnamed"` fallback, as already shipped on `_list-view.tsx`'s `ResolvedAssigneeChip`).
5. **Required creation dates** — `CreateTaskModal` (`_project-detail.tsx:822-1063`) has a `Due date` field but **no `Start date` field at all** (confirmed — grepped the file, only one `dueDate` state exists), and Due date is currently optional. Add a Start date field and make both dates required at task-creation time, client- and server-side. The `tasks` table itself needs no schema change — `start_date`/`due_date` stay nullable columns (existing task-detail sidebar can still clear them post-creation, unchanged); the requirement is enforced only at the creation entry point per the user's explicit scope ("For the task creation ensure that the start date and due dates are required").

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | What exactly does "switch right to left" mean? | Swap the two columns' positions: Details (currently right, `w-72 shrink-0`) moves to the left; Description+tabbed-panel (currently left, `flex-1 min-w-0`) moves to the right. Same widths/sizing, just reordered — no new responsive/stacking behavior beyond what already exists (the page has no mobile breakpoint variant for this two-column row today; not introducing one here). |
| 2 | Does Description also get tabbed in with Attachments/Comments? | **No.** Per the literal request ("instead of having stacked cards for Attachments and Comments section, convert them into tabs"), Description remains its own standalone `Card` at the top of the main column; only Attachments and Comments become a two-tab group below it. |
| 3 | Which pill-tab visual pattern to reuse? | The **local, same-subtree** pattern already shipped at `_project-detail.tsx:440-455` (`bg-[#F4F6FB] rounded-full p-1` container; active = `bg-white text-[#0B1533] shadow-[0_1px_2px_rgba(7,17,51,.05)]`; inactive = `text-[#5F6A88] hover:text-[#0B1533]`) — **not** the portfolio-tracker's `PillTabs` component (`v2/_shared-ui.tsx:132`), which is a different feature directory with a different active-state color (`text-[#007BFF]`). Cross-feature import would also be an unusual dependency direction for this codebase's page-scoped-component convention. |
| 4 | Do the Attachments/Comments tab labels show item counts? | **No — plain labels only** ("Attachments" / "Comments"). Both child components (`TaskAttachments`, `TaskComments`) currently own their fetch/list state internally with no count exposed to a parent; lifting that up is a bigger change than the task asked for. Not in scope. |
| 5 | How is a task attachment's "kind" (image vs. PDF vs. Office doc) determined for the grid thumbnail/modal, given `attachments` has no `mime_type` column? | **Infer from filename extension**, via a small local `mimeFromExtension()` mapping — using the exact same fixed extension set the upload route already allow-lists (`attachments/route.ts`'s `ALLOWED_MIME_TYPES`: jpg/jpeg/png/gif/webp → image; pdf → `application/pdf`; doc/docx → Word; xls/xlsx → Excel). No new DB column or migration — every attachment on this table was uploaded through that one allow-listed route, so the extension-to-mime mapping is exhaustive and reliable, not a guess. |
| 6 | What renders inside the new attachment-viewer modal? | A **reduced, local port** of `_onboarding-wizard.tsx`'s `FilePreview` branching (image → `<img>`; `application/pdf` → `<iframe src={url}>`; Word/Excel → Office Online embed `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`) — dropping the HTML/CSV/Markdown branches entirely, since task attachments can never be those mime types (not in `ALLOWED_MIME_TYPES`). Not importing the original component directly — it's typed against `AssetRow`/`customerId`, a different (customer-asset) domain than this task's `attachments` rows. |
| 7 | How does the new modal fit `_task-attachments.tsx`'s existing on-demand-signed-URL convention (task 206 Decision #4)? | Unchanged — the modal's "open" action calls the exact same existing `GET .../attachments/[attachmentId]/file-url` route on click (60s signed URL), same as today; only the destination changes from `window.open` to setting modal state (loading → url/error → rendered content), mirroring `_onboarding-wizard.tsx:1220-1234`'s `handleViewOutcomeFile` sequence exactly. |
| 8 | How does `AssigneeChip` get real names without duplicating `_list-view.tsx`'s `ResolvedAssigneeChip`? | **Fix `AssigneeChip` itself, in place**, in `_pm-shared.tsx` — it has exactly one caller (`_task-detail.tsx:308`, confirmed by repo-wide grep), so there's no risk of changing behavior elsewhere. Add an optional `name?: string` prop; apply the same `Tooltip`/`TooltipTrigger`/`TooltipContent` + `motion.div` hover-lift (`whileHover={{ y: -4, zIndex: 10 }}`, spring transition) + `"Unnamed"` fallback that task 210 already shipped on `ResolvedAssigneeChip`. `_list-view.tsx`'s `ResolvedAssigneeChip` stays untouched and independent, exactly as its own comment already documents ("Does NOT replace AssigneeChip in `_pm-shared.tsx`"). |
| 9 | Where do the assignee display names come from? | Mirror task 210's exact fix pattern: in `tasks/[taskId]/page.tsx` (currently fetches `task`/`milestones`/`currentUserRole` only, no profiles), add an `adminClient.from("profiles").select("id, full_name").in("id", task.assignees)` lookup (only when `task.assignees` is non-empty) — bypassing `profiles_read_own` RLS the same documented way task 210's `_get-project-detail-data.ts` fix does (a non-admin caller can only read their own `profiles` row; this is a read-only teammate-name display lookup, not an access-control decision). Pass the result down to `TaskDetailClient` as a small new prop; `_task-detail.tsx` builds a `Map<string, string \| null>` and passes `name={assigneeNamesById.get(id) ?? undefined}` into each `AssigneeChip`. |
| 10 | Required dates: client-only, or also enforced server-side? | **Both.** `CreateTaskModal.submit()` gains two checks in the same style as the existing `if (!title.trim()) { setError("Title is required"); return; }` guard — not the native HTML `required` attribute, since the modal's "Create" is a plain `<button onClick>`, not a `<form onSubmit>`, so native validation would never fire. `POST /api/v2/projects/[projectId]/tasks` (the route's only client caller, confirmed by repo-wide grep — no other UI or import script posts to it; Zoho import writes directly via `adminClient.from("tasks").insert()`, a separate code path this task doesn't touch) gains the same `start_date`/`due_date` required-checks as its existing `title` check, plus actually reading `body.start_date` into the insert (currently entirely absent from that route — confirmed by reading it in full). |
| 11 | Does this change apply to editing an existing task, or to Issue creation? | **No to both — creation-time-for-tasks only**, per the user's literal scope ("For the task creation ensure..."). `_task-detail.tsx`'s sidebar date inputs (`PATCH /api/v2/tasks/[taskId]`) keep allowing a date to be cleared post-creation, unchanged. `CreateIssueModal`'s `Due date` field stays optional, unchanged. |

## Requirements

### A — Swap Description/main column and Details sidebar (left ↔ right)
- [ ] In `_task-detail.tsx`'s content row (currently `<div className="flex gap-6 max-w-5xl">` wrapping "Left — main content" then "Right — sidebar"), reorder so the Details sidebar (`w-72 shrink-0`) renders first (left) and the Description+tabbed-panel column (`flex-1 min-w-0`) renders second (right). No class/width changes — a pure reorder of the two existing blocks.

### B — Attachments + Comments as tabs
- [ ] Create `_task-attachments-comments-panel.tsx` (colocated in `tasks/[taskId]/`): renders the panel chrome (`rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] overflow-hidden`, matching `Card`'s outer shell) with a header row containing the pill-tab switcher (Decision #3 pattern: `["Attachments", "Comments"]`, `useState<"attachments" | "comments">("attachments")`) instead of a plain title, and a `p-[18px]` body that conditionally renders `<TaskAttachments .../>` or `<TaskComments .../>` based on the active tab.
- [ ] In `_task-detail.tsx`, remove the two separate `<Card title="Attachments">...</Card>` / `<Card title="Comments">...</Card>` blocks and replace with one `<TaskAttachmentsCommentsPanel projectId={projectId} taskId={task.id} />`.

### C — Attachments: grid tiles + view-in-modal
- [ ] Rewrite `_task-attachments.tsx`'s render to a responsive grid (`grid grid-cols-2 sm:grid-cols-3 gap-3`, narrower than the onboarding wizard's `md:grid-cols-4` since this panel sits in a narrower column) of square tiles instead of the current `<ul>` of file-chip rows. Each tile: an `aspect-square` thumbnail area (image files → lazy-fetched signed-URL `<img>`, mirroring `_file-tile.tsx`'s `FileThumbnail` on-demand-fetch pattern but scoped to images only per Decision #5; non-image files → a colored icon tile keyed off `mimeFromExtension()`, reusing the exact `FileTypeTile`-style color/icon mapping from `_file-previews.tsx:14-18` — PDF red, Word blue, Excel green) + filename (truncated) + size below + a "View" button.
- [ ] Create `_task-attachment-viewer-modal.tsx` (colocated in `tasks/[taskId]/`): props `{ attachment: AttachmentRow; projectId: string; taskId: string; onClose: () => void }`. On mount, fetches the existing `GET .../attachments/[attachmentId]/file-url` route (unchanged, Decision #7), shows a loading state, then renders content per Decision #6 (`mimeFromExtension(attachment.filename)` branch: image/pdf/office). Chrome mirrors `FileViewerModal` (`_onboarding-wizard.tsx:5523`): `fixed inset-0 z-50` backdrop (`bg-[#071133]/60`) that closes on click, a centered card (`bg-white rounded-xl shadow-xl`, header with filename + close `X` button), Escape-key close via a `useEffect` keydown listener.
- [ ] In `_task-attachments.tsx`, add `const [viewing, setViewing] = useState<AttachmentRow | null>(null)`; the "View" button sets `viewing` to that tile's row (no separate `openingId`/`window.open` fetch — the modal itself fetches the signed URL on open, per Decision #7); render `{viewing && <TaskAttachmentViewerModal attachment={viewing} projectId={projectId} taskId={taskId} onClose={() => setViewing(null)} />}` at the end of the component.
- [ ] Loading and empty states stay as they are today (skeleton grid cells instead of skeleton rows; same "No attachments yet" empty state).

### D — Assignee avatar names
- [ ] In `tasks/[taskId]/page.tsx`: after fetching `task`, if `task.assignees` is a non-empty array, add `const { data: assigneeProfiles } = await adminClient.from("profiles").select("id, full_name").in("id", task.assignees);` (import `adminClient` from `@/lib/supabase/admin`; one-line comment mirroring task 210's RLS-gap phrasing). Pass `assigneeProfiles={assigneeProfiles ?? []}` to `<TaskDetailClient>`.
- [ ] In `_task-detail.tsx`: accept the new `assigneeProfiles: { id: string; full_name: string | null }[]` prop; build `const assigneeNamesById = new Map(assigneeProfiles.map((p) => [p.id, p.full_name]));`; update the Assignees `Meta` block (line 304-312) to pass `name={assigneeNamesById.get(id) ?? undefined}` into each `<AssigneeChip key={id} id={id} idx={i} name={...} />`.
- [ ] In `_pm-shared.tsx`: add a local `nameInitials(name, fallbackId)` helper (same 3-line shape as `_list-view.tsx:46-49` — accepted small duplication, not exported/shared across files, matching this codebase's existing precedent for tiny single-purpose helpers). Update `AssigneeChip` to accept optional `name?: string`; wrap its avatar bubble in `Tooltip`/`TooltipTrigger`/`TooltipContent` (import from wherever `_list-view.tsx` sources them) showing `name ?? "Unnamed"`; render the bubble as a `motion.div` (import `motion` from `framer-motion`) with `whileHover={{ y: -4, zIndex: 10 }}` and the same spring `transition` as `ResolvedAssigneeChip`; bubble initials become `nameInitials(name, id)` instead of the current raw-UUID-only initials.

### E — Task creation: Start date + Due date required
- [ ] In `_project-detail.tsx`'s `CreateTaskModal`: add `const [startDate, setStartDate] = useState<string>("");` and a new `Start date` labeled `<input type="date">` (same `inputClass`, placed next to the existing `Due date` input in that `grid grid-cols-2 gap-3` row — swap that row to 3 fields across two grid rows, or add a new `grid grid-cols-2 gap-3` row; either way both dates stay visually adjacent).
- [ ] In `submit()`, add validation before the POST call: `if (!startDate) { setError("Start date is required"); return; }` and `if (!dueDate) { setError("Due date is required"); return; }` (same early-return-with-`setError` shape as the existing Title check).
- [ ] Add `start_date: startDate` to the POST body (currently only `due_date` is sent; `start_date` isn't sent at all).
- [ ] In `src/app/api/v2/projects/[projectId]/tasks/route.ts`'s `POST`: add `if (!body.start_date) return NextResponse.json({ error: "start_date is required" }, { status: 400 });` and `if (!body.due_date) return NextResponse.json({ error: "due_date is required" }, { status: 400 });` (same shape as the existing `title` check); add `start_date: body.start_date` to the `.insert({...})` call (currently missing entirely from the insert — confirmed by reading the full route).

## Out of Scope / Must-Not-Change

- **`CreateIssueModal`** (`_project-detail.tsx:1069-1211`) and Issue creation generally — its `Due date` field stays optional; not part of this task.
- **Editing dates on an existing task** — `_task-detail.tsx`'s sidebar `Due date`/`Start date` inputs and `PATCH /api/v2/tasks/[taskId]` keep allowing a date to be cleared to `null` post-creation; only the creation entry point becomes required.
- **`tasks.start_date`/`tasks.due_date` DB columns** — stay nullable; no migration.
- **`_list-view.tsx`'s `ResolvedAssigneeChip`** — already fixed by task 210, independent component, not touched (Decision #8).
- **`_issue-detail.tsx`** — not part of this task, matching task 206's own boundary.
- **`_task-description-field.tsx`, the description Tiptap editor, and its content** — untouched; only its position within the swapped column layout changes (Requirement A).
- **`TaskComments`'/`TaskAttachments`' internal fetch/POST/state logic** — unchanged; only their visual container (grid instead of list rows for attachments; tabbed panel instead of stacked Cards) changes.
- **No `mime_type` column or Supabase migration** — extension-based inference only (Decision #5).
- **No new npm dependencies** — `framer-motion`, base-ui `Tooltip`, and Office Online's public embed URL are all already used elsewhere in this codebase.
- **Zoho task import** (`admin/zoho-import/tasks`, if it inserts directly into `tasks`) — writes via a separate code path (`adminClient.from("tasks").insert()`, not this POST route); unaffected by the new required-field checks on `POST /api/v2/projects/[projectId]/tasks`.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Swap column order (A); replace stacked Attachments/Comments `Card`s with the new tabbed panel (B); pass resolved assignee names into `AssigneeChip` (D) |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/page.tsx` | Modify | `adminClient` profiles lookup for `task.assignees`; pass `assigneeProfiles` prop (D) |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` | Create | Pill-tab switcher wrapping `TaskAttachments`/`TaskComments` (B) |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments.tsx` | Modify | Grid-tile layout with thumbnails; "View" opens the new modal instead of `window.open` (C) |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachment-viewer-modal.tsx` | Create | In-app file viewer modal, reduced port of `FileViewerModal`/`FilePreview` (C) |
| `src/app/v2/(hub)/projects/_pm-shared.tsx` | Modify | `AssigneeChip`: add `name` prop, styled `Tooltip` + hover-lift + `"Unnamed"` fallback; add local `nameInitials()` (D) |
| `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` | Modify | `CreateTaskModal`: add required `Start date` field + validation for both dates (E) |
| `src/app/api/v2/projects/[projectId]/tasks/route.ts` | Modify | `POST`: require + persist `start_date`/`due_date` (E) |

## Code Context

### Current column order to swap (`_task-detail.tsx:166-346`)
```tsx
<div className="flex gap-6 max-w-5xl">
  {/* Left — main content */}
  <div className="flex-1 flex flex-col gap-5 min-w-0"> ... Description / Attachments / Comments Cards ... </div>
  {/* Right — sidebar */}
  <div className="w-72 shrink-0"> <Card title="Details"> ... </Card> </div>
</div>
```
Swap so the `w-72 shrink-0` block renders first, `flex-1 min-w-0` block renders second — same JSX contents, just reordered (Requirement A).

### `AssigneeChip` today — the exact bug the screenshot shows (`_pm-shared.tsx:321-332`)
```tsx
export function AssigneeChip({ id, idx }: { id: string; idx: number }) {
  const initials = id.replace(/-/g, "").slice(0, 2).toUpperCase();
  return (
    <div
      className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white border-2 border-white"
      style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
      title={id}
    >
      {initials}
    </div>
  );
}
```
Only caller: `_task-detail.tsx:308` — `<AssigneeChip key={id} id={id} idx={i} />`.

### `ResolvedAssigneeChip` — the already-shipped fix pattern to mirror (`_list-view.tsx:46-49, 54-70`, task 210)
```tsx
function nameInitials(name: string | null | undefined, fallbackId: string): string {
  if (name) return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return fallbackId.replace(/-/g, "").slice(0, 2).toUpperCase();
}
function ResolvedAssigneeChip({ id, idx, name }: { id: string; idx: number; name?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={
        <motion.div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white border-2 border-white shrink-0 cursor-default"
          style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
          whileHover={{ y: -4, zIndex: 10 }}
          transition={{ type: "spring", stiffness: 500, damping: 20 }}
        >
          {nameInitials(name, id)}
        </motion.div>
      } />
      <TooltipContent side="top">{name ?? "Unnamed"}</TooltipContent>
    </Tooltip>
  );
}
```
(Exact JSX shape to confirm by reading `_list-view.tsx` in full during implementation — `TooltipTrigger`'s `render` prop usage should match that file precisely, this is a paraphrase from the task 210 doc's own Code Context.)

### `CreateTaskModal` today — Due date only, no Start date (`_project-detail.tsx:846, 987-995`)
```tsx
const [dueDate, setDueDate] = useState<string>(defaults.due_date ?? "");
// ...
<label className="flex flex-col gap-1.5">
  <span className={labelClass}>Due date</span>
  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
</label>
```
No `startDate` state or field exists anywhere in this file — confirmed by grep. `submit()` (`:858-917`) has only the `if (!title.trim())` guard; add the two new date guards immediately after it.

### `POST /api/v2/projects/[projectId]/tasks` today — no `start_date` handling at all (full file already read)
```ts
if (!body.title?.trim()) {
  return NextResponse.json({ error: "title is required" }, { status: 400 });
}
// ... status/priority validation ...
const { data, error } = await supabase.from("tasks").insert({
  project_id: project.id,
  title: body.title.trim(),
  description: body.description?.trim() || null,
  status: body.status || "backlog",
  priority: body.priority || "normal",
  milestone_id: body.milestone_id || null,
  tasklist_id: body.tasklist_id || null,
  due_date: body.due_date || null,
  // start_date is never read or inserted
  assignees: Array.isArray(body.assignees) ? body.assignees : null,
  labels: Array.isArray(body.labels) ? body.labels : null,
  position: typeof body.position === "number" ? body.position : Date.now(),
  created_by: user.id,
}).select().single();
```

### `attachments` table — no mime/type column (migration `025_v2_schema.sql:70-78`)
```sql
create table attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  storage_path text not null,
  filename text not null,
  size bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
```
Confirms Decision #5's extension-inference approach is required, not optional.

### Upload route's allow-listed mime types — the exhaustive set `mimeFromExtension()` must cover (`.../attachments/route.ts`)
```ts
const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
```

### `FileViewerModal` chrome + `handleViewOutcomeFile` sequence to mirror (`_onboarding-wizard.tsx:1220-1234`, `:5523-5640`)
Already read in full during planning — key points: modal state is `{ file, url, loading, error }` set by an async click handler that (1) sets `loading: true` + clears prior url/error, (2) fetches the signed URL, (3) sets `url` or `error`; the modal itself renders a `fixed inset-0 z-50` backdrop that closes on click, a centered card with header (filename + close button) and a content pane showing a loading message, an error message, or the resolved preview — Escape-key close via a `keydown` listener in a `useEffect`.

### `FilePreview`'s mime-branching to port in reduced form (`_onboarding-wizard.tsx:5000-5020`)
```tsx
if (mime.startsWith("image/")) {
  return <img src={url} alt={fileName} className="max-w-full max-h-full object-contain" />;
}
if (mime === "application/pdf") {
  return <iframe src={url} title={fileName} className="w-full h-full border-0" />;
}
if (OFFICE_MIME_TYPES.includes(mime)) {
  const officeViewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  return <iframe src={officeViewerUrl} title={fileName} className="w-full h-full border-0" />;
}
```

### `_file-tile.tsx`'s `FileTypeTile` color/icon mapping to reuse for non-image grid tiles (`_file-previews.tsx:14-29`)
```tsx
const FILE_TYPE_TILES = [
  { test: (m) => WORD_MIME_TYPES.includes(m), Icon: FileText, bg: "bg-[#E5F1FF]", fg: "text-[#007BFF]", label: "DOC" },
  { test: (m) => EXCEL_MIME_TYPES.includes(m), Icon: FileSpreadsheet, bg: "bg-[#E3F6EA]", fg: "text-[#177E48]", label: "XLS" },
  { test: (m) => m === "application/pdf", Icon: FileText, bg: "bg-[#FDE8E6]", fg: "text-[#C0392B]", label: "PDF" },
];
```

### Local pill-tab pattern to reuse for the new Attachments/Comments switcher (`_project-detail.tsx:439-456`, Decision #3)
```tsx
<div className="flex items-center gap-1 bg-[#F4F6FB] rounded-full p-1">
  {PRIMARY_TABS.map((tab) => (
    <button
      key={tab.id}
      onClick={() => ...}
      className={cn(
        "px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer",
        active === tab.id ? "bg-white text-[#0B1533] shadow-[0_1px_2px_rgba(7,17,51,.05)]" : "text-[#5F6A88] hover:text-[#0B1533]"
      )}
    >
      {tab.label}
    </button>
  ))}
</div>
```

## Implementation Steps

1. `_pm-shared.tsx`: add `nameInitials()` helper; update `AssigneeChip` to accept `name?: string` and render the `Tooltip`/`motion.div` hover-lift pattern (Requirement D, Decision #8).
2. `tasks/[taskId]/page.tsx`: add the `adminClient` profiles lookup for `task.assignees`; pass `assigneeProfiles` to `TaskDetailClient` (Requirement D, Decision #9).
3. `_task-attachment-viewer-modal.tsx`: build the modal per Decisions #6/#7 (mime-branch content, `FileViewerModal`-style chrome, Escape-key close).
4. `_task-attachments.tsx`: rewrite to the grid-tile layout; wire "View" to open the new modal (Requirement C).
5. `_task-attachments-comments-panel.tsx`: build the pill-tab wrapper around `TaskAttachments`/`TaskComments` (Requirement B, Decision #3/#4).
6. `_task-detail.tsx`: swap the column order (Requirement A); swap in the new `TaskAttachmentsCommentsPanel` in place of the two stacked Cards (Requirement B); resolve and pass assignee names into `AssigneeChip` calls (Requirement D).
7. `_project-detail.tsx`: add the `Start date` field + state to `CreateTaskModal`; add both required-date checks to `submit()`; include `start_date` in the POST body (Requirement E).
8. `src/app/api/v2/projects/[projectId]/tasks/route.ts`: add the two required-date checks; add `start_date` to the insert (Requirement E).
9. Manually verify in the browser: open a task with 2+ assignees and confirm real names show in a styled, animated tooltip (not raw UUIDs, no "Unnamed" unless a profile genuinely has no `full_name`); confirm Details now renders on the left and Description/tabs on the right; click between the Attachments and Comments tabs and confirm only one shows at a time with existing data intact; open the Attachments tab, confirm files render as a thumbnail grid, click "View" on an image and a PDF (and a Word/Excel file if one exists in test data) and confirm each opens in the in-app modal, not a new tab; open "New Task", try to submit with Start date and/or Due date empty and confirm the error message blocks submission, then fill both and confirm the task is created with both dates persisted (visible on the newly created task's detail page).

## Acceptance Criteria

- [ ] Task Detail page: Details sidebar renders on the left, Description (+ the new tabbed Attachments/Comments panel) renders on the right.
- [ ] Attachments and Comments are no longer two separate stacked cards — they're a single panel with a pill-tab switcher; only one is visible at a time.
- [ ] Attachments render as a thumbnail grid (not a list of chip rows); clicking "View" opens an in-app modal showing the file (image, PDF, or Office-embed as applicable) — no new browser tab is opened.
- [ ] Assignee avatar chips on the Task Detail sidebar show a styled tooltip with the real assignee name (or "Unnamed" if genuinely unresolvable), with the same hover-lift animation used elsewhere in the app — never a raw UUID.
- [ ] The "New Task" modal has a required Start date field (new) alongside the existing Due date field (now also required); attempting to submit with either empty shows an inline error and does not create the task.
- [ ] `POST /api/v2/projects/[projectId]/tasks` returns 400 if `start_date` or `due_date` is missing, and persists `start_date` on success (previously silently dropped).
- [ ] Editing an existing task's dates (Task Detail sidebar) still allows clearing either date to empty — unchanged.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new warnings/errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser verification (no test runner configured) — see Implementation Step 9 for the full walkthrough. Requires: a task with 2+ assignees whose profiles have `full_name` set (to verify the tooltip fix), a task with at least one image and one non-image attachment (to verify both grid-tile branches and the modal's mime-branching), and access to the "New Task" flow to verify the required-date validation end to end.

## Compatibility Touchpoints

- No new npm dependencies (Decision #6's Office Online embed URL, `framer-motion`, and base-ui `Tooltip` are all already used elsewhere in this codebase).
- No new Supabase migration (Decision #5 — extension-based mime inference, no `mime_type` column added).
- `POST /api/v2/projects/[projectId]/tasks` gains a breaking-for-bad-input (but not breaking-for-existing-callers) change: requests without `start_date`/`due_date` now 400 where they previously succeeded. Confirmed via repo-wide grep that `CreateTaskModal` (updated in this same task) is this route's only caller; Zoho import writes to `tasks` via a separate `adminClient` insert, unaffected.
- No MCP tool inventory changes (`_docs/mcp-tools.md`) — no `server.registerTool(...)` calls touched.
- No env var changes.

## Implementation Notes

### What Changed
- `_pm-shared.tsx`: `AssigneeChip` now accepts an optional `name` prop and renders a styled `Tooltip`/`TooltipTrigger`/`TooltipContent` + `motion.div` hover-lift (`whileHover={{ y: -4, zIndex: 10 }}`, spring transition), matching task 210's `ResolvedAssigneeChip` fix exactly; a local `nameInitials()` helper was added (same shape as `_list-view.tsx`'s, accepted small duplication per that file's own "does not replace" comment).
- `tasks/[taskId]/page.tsx`: added an `adminClient` profiles lookup for `task.assignees` (only fired when non-empty), bypassing `profiles_read_own` RLS the same way task 210's fix does; passes the result down as a new `assigneeProfiles` prop.
- `_task-detail.tsx`: accepts `assigneeProfiles`, derives an `assigneeNamesById` map, and passes `name={...}` into each `AssigneeChip`. Swapped the Details sidebar and Description/main-content column order (Details now left, Description+tabs now right) — a pure JSX reorder, no width/class changes. Replaced the two stacked Attachments/Comments `Card`s with the new `TaskAttachmentsCommentsPanel`.
- Added `_task-attachments-comments-panel.tsx` — pill-tab switcher (Attachments/Comments) reusing `_project-detail.tsx`'s local primary-tabs visual pattern, wrapping the existing panel chrome (`Card`'s outer shell shape) around whichever child is active.
- Rewrote `_task-attachments.tsx` — grid of square tiles (image files get a lazily-fetched signed-URL thumbnail; PDF/Word/Excel get a color-coded icon tile mirroring `_file-previews.tsx`'s `FileTypeTile`) instead of the flat chip-row list; "View" now opens the new `TaskAttachmentViewerModal` instead of `window.open`.
- Added `_task-attachment-viewer-modal.tsx` — in-app modal (backdrop + centered card, Escape-key close) that fetches the existing `file-url` signed-URL route on open and renders image/`<img>`, PDF/`<iframe>`, or Word-Excel/Office-Online-embed content based on the attachment's filename extension (no `mime_type` column exists on `attachments`, per Decision #5).
- `_project-detail.tsx`: `CreateTaskModal` gained a `startDate` state + a `Start date` field (previously entirely absent — the modal only had Due date); the Milestone/Due-date grid row became a 3-column Milestone/Start date/Due date row; `submit()` now validates both dates are present before posting; the POST body now includes `start_date`.
- `src/app/api/v2/projects/[projectId]/tasks/route.ts`: `POST` now 400s if `start_date` or `due_date` is missing, and the insert now includes `start_date` (previously never read from the request body at all).

### Files Changed
- `src/app/v2/(hub)/projects/_pm-shared.tsx` — `AssigneeChip` name-resolution fix, per plan (Requirement D)
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/page.tsx` — `adminClient` assignee-profiles lookup, per plan (Requirement D)
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` — column swap, tabbed-panel swap-in, assignee names wired through, per plan (Requirements A/B/D)
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` — new file, per plan (Requirement B)
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments.tsx` — grid-tile rewrite, per plan (Requirement C)
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachment-viewer-modal.tsx` — new file, per plan (Requirement C)
- `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` — `CreateTaskModal` Start date field + required-date validation, per plan (Requirement E)
- `src/app/api/v2/projects/[projectId]/tasks/route.ts` — required-date checks + `start_date` insert, per plan (Requirement E)

### Deviations From Plan
- **`_task-attachment-viewer-modal.tsx`'s initial effect had to drop its `setLoading(true)`/`setError(null)` reset calls at the top of the data-fetch `useEffect`.** `pnpm lint` flagged them under `react-hooks/set-state-in-effect` (synchronous setState in an effect body). Since the modal only ever mounts fresh per attachment (the parent conditionally renders `{viewing && <Modal .../>}`, so a new attachment means a fresh mount, not a prop update on a persisted instance), the `useState` initializers (`loading: true`, `error: null`) already cover this case correctly — removing the two redundant calls fixes the lint error with no behavior change. Not a scope deviation, just a lint-driven simplification within the same component.
- No other deviations. All Requirements (A–E) and Decisions (#1–#11) implemented as specified.

### Verification Run
- `npx tsc --noEmit` - PASS (no errors)
- `pnpm lint` - PASS (no warnings or errors, after the effect fix above)
- impeccable design-lint hook - fired after every file write/edit; all findings were `design-system-font-size` on literal pixel values that either pre-exist unchanged from the original files, or were copied verbatim from already-shipped sibling patterns (`_file-previews.tsx`'s `FileTypeTile` sizes, `_project-detail.tsx`'s primary-tabs sizes, the original `_task-attachments.tsx`'s chip-row sizes). All classified false positives per this codebase's documented convention (CLAUDE.md "UI Polish Conventions" — arbitrary pixel Tailwind classes are the real shipped pattern here); none required a change.
- Manual/browser verification (Implementation Step 9) - SKIPPED (deferred to the `test` stage per the implement skill's workflow — this stage runs typecheck/lint only, no dev server was started during implementation)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation in any new/changed file; `_task-detail.tsx`'s import block was updated to drop the now-unused `TaskAttachments`/`TaskComments` imports in favor of `TaskAttachmentsCommentsPanel` — no orphaned imports remain (confirmed by `pnpm lint`, which flags unused imports and passed clean).
- No `any` or untyped escape hatches — all new components/props are fully typed (`AttachmentRow`, `FileKind`, `TaskAttachmentViewerModal`'s props, `TaskDetailClient`'s new `assigneeProfiles` prop, `AssigneeChip`'s new optional `name`).
- No deep nesting — the two new API-route checks (`start_date`/`due_date` required) use the same early-return guard-clause shape as the existing `title` check right above them; the modal's mime-branch rendering is a flat set of sibling conditionals, not nested ifs.
- Each new/rewritten file has one clear responsibility: `_task-attachments-comments-panel.tsx` (tab switcher only), `_task-attachments.tsx` (grid list + view-trigger only), `_task-attachment-viewer-modal.tsx` (fetch-and-render one file only).
- Names accurately describe behavior (`fileKindFromFilename`, `nameInitials`, `assigneeNamesById`, `AttachmentThumbnail`).
- Repeated logic: `AttachmentRow`'s shape and `formatFileSize`-style helpers are intentionally duplicated in a small way between `_task-attachments.tsx` and `_task-attachment-viewer-modal.tsx` (each defines its own local `AttachmentRow` type) — matches this codebase's own accepted precedent for small, single-file helper/type duplication (task 206's `formatFileSize` duplication across `_task-attachments.tsx`/`_task-attachment-picker.tsx`), not worth a shared-types module for a 4-field row type used by two sibling files.
- Errors are handled by silently no-op'ing on failed list fetches (empty state stays, no crash) and by showing an inline "Failed to load file preview." message in the modal on a failed signed-URL fetch — matches this directory's existing silent-failure convention (task 206's Quality Gate Notes documented the same pattern) while still surfacing a message where the user is actively waiting (the modal), unlike the passive background list fetches.
- No secrets, credentials, or debug logging added.
- One self-caught issue during this review: `_task-attachments.tsx`'s "View" button originally wrapped a single static class string in `cn(...)` with nothing to merge/conditionally apply — a pointless abstraction. Removed the `cn()` wrapper and its now-unused import; re-ran `tsc`/`lint` after the fix, both still pass clean.
- Fixed-hex token styling throughout, no `dark:` classes, no unjustified `style={{}}` (`AssigneeChip`'s one remaining `style={{ background: ... }}` is the pre-existing, deliberately-unchanged avatar-color pattern already used by every sibling avatar chip in this codebase).
- `npx tsc --noEmit` and `pnpm lint` both re-confirmed PASS after the `cn()` cleanup.
- File sizes stay within `nextjs-file-length-best-practices.md`'s guidance: new/rewritten files are 49–172 lines each; `_task-detail.tsx` is 344 lines (down slightly from 349 pre-task) and `_pm-shared.tsx` is 356 lines — both comfortably under the guide's 400–500 hard limit.

### Deviations
- **Minor — `_task-attachment-viewer-modal.tsx`'s initial `useEffect` dropped its `setLoading(true)`/`setError(null)` reset calls**, per the lint-driven fix already documented in Implementation Notes (`react-hooks/set-state-in-effect`). No behavior change — the component only ever mounts fresh per attachment, so the `useState` initializers already cover the same case.
- **Minor — removed a redundant `cn()` wrapper** around a single static class string in `_task-attachments.tsx`'s "View" button, found during this quality pass (not part of the original implementation plan, a small in-review cleanup).
- No deviations touching the Out of Scope boundaries — confirmed via `git diff` that `CreateIssueModal`, `PATCH /api/v2/tasks/[taskId]`, `_list-view.tsx`'s `ResolvedAssigneeChip`, `_issue-detail.tsx`, `_task-description-field.tsx`, `TaskComments`'s internal logic, and `attachments`' schema are all untouched by this task's diff. (Note: `git status`/`git diff` on `_project-detail.tsx` and `tasks/[taskId]/page.tsx` also show substantial pre-existing uncommitted changes from earlier, already-completed tasks — 205/208/209 — that predate this session; those are out of this review's scope and were left untouched.)
- No new npm dependencies or Supabase migrations introduced, matching the task doc's Compatibility Touchpoints exactly.
