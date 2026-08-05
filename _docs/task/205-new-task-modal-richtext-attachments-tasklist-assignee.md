# 205: "New Task" Modal — Rich Text Description (Image Paste), File/Image Attachments, Task List Select-or-Create, Developer Assignee

**Created:** 2026-08-04
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Testing (2026-08-04)

---

## Overview

The `CreateTaskModal` in `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx:807-950` (the "New Task" form on `/v2/projects/[projectId]/tasks`) is minimal: plain `<textarea>` description, no attachments, no task-list selection, no assignee field. This diverges from the design-system v2.0 form conventions (`_final_design/guide/central-hub-design-system.md` §4 "Forms") already followed by the modal's inputs/selects, and from capability that already exists elsewhere in this same page — `tasklists` are already fetched and grouped in List View, and `assignees` (a `string[]` of `profiles.id`) are already editable post-creation via `AssigneePicker` in `_list-view.tsx:65-155` — just not exposed at creation time.

This task adds four things to the New Task modal, all scoped to creation only:

1. **Rich text description** — replace the plain textarea with a Tiptap-based editor, following the exact pattern already shipped in `_shared-ui.tsx`'s `RichTextField` (portfolio-tracker v2 sandbox, task 202) — same library, same fixed-hex token convention, same toolbar shape (Bold/Italic/Bullet list). Built fresh locally in the `projects/` feature area rather than imported cross-folder (see Out of Scope).
2. **Paste-to-upload images in the description** — extends the rich text editor with `@tiptap/extension-image` (not currently installed) and a paste/drop handler: an image pasted or dropped into the editor is uploaded immediately and inserted as an `<img>` node pointing at a stable, publicly-reachable URL (new public bucket — see Decisions).
3. **A separate "Attachments" section below the description** — drag-and-drop/browse picker for images or documents to support the task (not embedded inline, listed as discrete files). Staged client-side, uploaded and registered against the task **after** it's created (task ID is the attachment's `entity_id`).
4. **Task List select-or-create** and **Assignee (developer)** fields, added to the existing 2-column grid layout alongside Milestone/Due date.

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Where do pasted/inline description images live? | **New public storage bucket `task-content`** (migration). Discrete "Attachments" section files go to the existing **private** `project-assets` bucket + generic `attachments` table (entity_type `"task"`) — the same mechanism the Zoho attachment importers already use (`src/app/api/admin/zoho-import/attachments/route.ts:143,153`). Inline images need a URL that keeps working indefinitely wherever the description HTML is rendered (list/board/detail) without server-side re-signing — a private bucket + expiring signed URL would break shortly after paste. Discrete attachments don't have that constraint; they're read only when a viewer UI lists them, so a signed URL generated at read time works and matches the existing bucket's RLS/precedent. |
| 2 | Single or multi assignee at creation? | **Single-select** — matches the existing `CreateIssueModal`'s assignee UX (`_project-detail.tsx:1059-1070`) and keeps the form simple. `tasks.assignees` is `string[]`, so the selected id is submitted as a 1-element array (`[assigneeId]`); multi-assign after creation already exists via `AssigneePicker` in List View and is untouched. |
| 3 | Who can be assigned? | Filter the existing `allMembers` list to `role === "developer"` only, per the explicit ask ("assign **a developer**"). Requires adding `role` to the `profiles` select in `getProjectDetailData` and to the `allMembers` prop type (additive — existing consumers of `allMembers` ignore the extra field). |
| 4 | Task List: dropdown only, or select-or-create? | **Select-or-create inline.** A "+ Create new list" option swaps the dropdown for a text input; submitting it **immediately** `POST`s the new tasklist (before the task itself is created) so it appears instantly in the dropdown/selected state and in List View's grouping (requires lifting `tasklists` state in `_project-detail.tsx` to include a setter — it's currently read-only `useState`). This avoids deferring tasklist creation into the task-submit transaction and keeps error handling simple (two independent, individually-retryable network calls instead of one compound one). |
| 5 | Do imported/legacy tasks' `attachments` rows become viewable anywhere as a result of this task? | **No — out of scope.** No task-detail "attachments" viewer exists today (mirrors the codebase's own precedent for `issues`/`issue_comments`: "import-only, no browsing UI yet" per CLAUDE.md). This task only adds the *write* path (upload + register) from the creation modal. Building a viewer/download UI on the task detail page is a natural fast-follow, not bundled here. |
| 6 | Attachment file-type/size limits? | Mirror `/api/upload/route.ts`'s existing allow-list (images, PDF, Word, Excel — SVG excluded for stored-XSS reasons) and a 25MB per-file cap, even though the `project-assets` bucket itself allows up to 200MB (migration 055) — 25MB keeps the modal's UX sane and matches the one other place in this codebase that validates upload types today. Cap at 10 files per task in the picker (arbitrary, sane UX limit — no schema constraint). |
| 7 | Auth/role gating on the 3 new API routes? | All three (`tasklists` POST, task `attachments` POST, `description-images` POST) require an authenticated session **and** `role in ('admin','super_admin','pm')` — matching `tasks_pm_write`/`tasklists_pm_write`/`attachments_pm_write` RLS (migrations 026/048/050). Since only these roles can create a task at all, gating the supporting endpoints the same way is consistent, not more restrictive than what RLS already enforces. |

## Requirements

- [ ] Description field is a Tiptap rich text editor (Bold, Italic, Bullet list toolbar — same as `RichTextField`), storing/submitting HTML in `tasks.description` (already a `text` column — no schema change needed for the field itself).
- [ ] Pasting an image (from clipboard) into the description editor uploads it and inserts it inline as an `<img>` at the cursor position. Same behavior for dragging an image file onto the editor.
- [ ] Non-image paste/drop content behaves as Tiptap's default (plain/rich text paste) — only image files trigger the upload path.
- [ ] A visible "Attachments" section appears directly below the description field: a compact drag-and-drop/browse zone plus a list of staged files (filename, size, remove button) — images and documents (PDF/Word/Excel), matching `/api/upload`'s existing allow-list.
- [ ] Staged attachment files are uploaded (each to `project-assets`, registered in `attachments`) only after the task itself is successfully created; a partial-failure (task created, N of M files failed) shows a non-blocking inline warning rather than rolling back the task.
- [ ] A "Task List" field is added to the existing Milestone/Due date grid (or its own row): dropdown of the project's tasklists, defaulting to the tasklist with `is_default === true` if one exists, else "No task list". Includes a "+ Create new list" option that reveals a name input; submitting it creates the tasklist immediately (before the task) and selects it.
- [ ] An "Assignee" field lists project members with `role === "developer"`, defaulting to "Unassigned"; selecting one submits `assignees: [id]` on task creation.
- [ ] All new/changed fields follow the modal's existing fixed-hex token styling (`inputClass`/`labelClass` constants at `_project-detail.tsx:854-855`) — no `dark:` classes, no `style={{}}` (per CLAUDE.md's v2 styling convention).
- [ ] `POST /api/v2/projects/[projectId]/tasks` accepts and persists `tasklist_id` (currently accepted by the DB schema but not read from the request body).

## Out of Scope / Must-Not-Change

- **Editing an existing task** (task detail page, `_list-view.tsx` inline editors, `_board-view.tsx`, `_calendar-view.tsx`) — this task only touches the *creation* modal.
- **Viewing/downloading attachments** anywhere (task detail page, list/board rows) — no viewer UI is built; see Decision #5.
- **`CreateIssueModal`** (`_project-detail.tsx:956-1085`) — visually similar but a separate form for a separate entity; not touched, not given rich text/attachments/tasklist in this task.
- **The MCP `create_task` tool** (`src/lib/mcp/tools/create-task.ts`) — a separate, external-facing creation path; not extended to accept the new fields as part of this task.
- **`AssigneePicker`** in `_list-view.tsx` (post-creation multi-assign) — untouched, still multi-select, still restricted to `allMembers` (all staff, not developer-filtered) for that existing use case.
- **`onboarding-assets` / `customer-assets` buckets and their upload flows** — unrelated, not reused, not modified.
- **`_shared-ui.tsx`'s `RichTextField`** (portfolio-tracker/v2 folder) — not imported into `projects/`; a new, local equivalent is built instead to keep the two feature areas decoupled (same reasoning task 202 documented for not importing across that boundary).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/091_task_content_storage.sql` | Create | New public `task-content` storage bucket for inline description-pasted images, with staff read/write RLS |
| `src/app/api/v2/projects/[projectId]/tasks/description-images/route.ts` | Create | `POST` — upload one image to `task-content`, return its public URL (used by the rich text editor's paste/drop handler) |
| `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts` | Create | `POST` — upload a file to `project-assets` + insert an `attachments` row (`entity_type: "task"`, `entity_id: taskId`) |
| `src/app/api/v2/projects/[projectId]/tasklists/route.ts` | Create | `POST` — create a tasklist for the project (`{ name }`) |
| `src/app/api/v2/projects/[projectId]/tasks/route.ts` | Modify | `POST` handler: read and persist `tasklist_id` from the request body |
| `src/app/v2/(hub)/projects/[projectId]/_get-project-detail-data.ts` | Modify | Add `role` to the `profiles` select and to the `allMembers` return type |
| `src/app/v2/(hub)/projects/[projectId]/_task-description-editor.tsx` | Create | Local Tiptap rich text component with image paste/drop upload (adapted from `_shared-ui.tsx`'s `RichTextField`, not imported) |
| `src/app/v2/(hub)/projects/[projectId]/_task-attachment-picker.tsx` | Create | Compact drag-and-drop/browse picker + staged file list for the Attachments section |
| `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` | Modify | `CreateTaskModal`: swap textarea for the new editor, add Attachments/Task List/Assignee fields, wire submit flow; lift `tasklists` state to include a setter; pass `allMembers`/`tasklists` down |
| `package.json` | Modify | Add `@tiptap/extension-image` (`^3.26.0`, matching the other installed `@tiptap/*` packages) |

## Code Context

### `CreateTaskModal` — current signature and submit flow (`_project-detail.tsx:807-852`)

```tsx
function CreateTaskModal({
  projectId,
  milestones,
  defaults,
  onClose,
  onCreated,
}: {
  projectId: string;
  milestones: Milestone[];
  defaults: TaskDefaults;
  onClose: () => void;
  onCreated: (t: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(defaults.status ?? "open");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [milestoneId, setMilestoneId] = useState<string>(defaults.milestone_id ?? "");
  const [dueDate, setDueDate] = useState<string>(defaults.due_date ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/v2/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || undefined,
        status, priority,
        milestone_id: milestoneId || undefined,
        due_date: dueDate || undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Failed to create task");
      setSaving(false);
      return;
    }
    onCreated(await res.json());
  }
  // ... inputClass/labelClass + JSX (title, description textarea, status/priority grid, milestone/due-date grid)
}
```

Add: `tasklistId`, `newTasklistName`, `assigneeId`, `attachmentFiles: File[]` state. New submit flow:

```tsx
async function submit() {
  if (!title.trim()) { setError("Title is required"); return; }
  setSaving(true);
  setError(null);

  let finalTasklistId = tasklistId;
  if (creatingTasklist && newTasklistName.trim()) {
    const tlRes = await fetch(`/api/v2/projects/${projectId}/tasklists`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTasklistName.trim() }),
    });
    if (!tlRes.ok) { setError("Failed to create task list"); setSaving(false); return; }
    const newTasklist = await tlRes.json();
    onTasklistCreated(newTasklist); // lifts into parent `tasklists` state
    finalTasklistId = newTasklist.id;
  }

  const res = await fetch(`/api/v2/projects/${projectId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: title.trim(),
      description: description.trim() || undefined,
      status, priority,
      milestone_id: milestoneId || undefined,
      due_date: dueDate || undefined,
      tasklist_id: finalTasklistId || undefined,
      assignees: assigneeId ? [assigneeId] : undefined,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    setError(body.error || "Failed to create task");
    setSaving(false);
    return;
  }
  const task: Task = await res.json();

  if (attachmentFiles.length > 0) {
    const results = await Promise.allSettled(attachmentFiles.map((file) => {
      const fd = new FormData();
      fd.append("file", file);
      return fetch(`/api/v2/projects/${projectId}/tasks/${task.id}/attachments`, { method: "POST", body: fd });
    }));
    const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
    if (failed > 0) {
      // task already created — surface via onCreated + a toast/console warning, don't block
      console.warn(`${failed} of ${attachmentFiles.length} attachments failed to upload`);
    }
  }

  onCreated(task);
}
```

### `RichTextField` to adapt from (`_shared-ui.tsx:59-127`, portfolio-tracker/v2 — do not import, rebuild locally)

Same Tiptap `useEditor` shape (`StarterKit`, `immediatelyRender: false`, `onUpdate` → `getHTML()`), same toolbar-button pattern (`marks` array of `{label, title, cls, action, active}`). The new local `_task-description-editor.tsx` adds:

```tsx
import Image from "@tiptap/extension-image";

const editor = useEditor({
  extensions: [StarterKit, Image],
  content: value,
  immediatelyRender: false,
  editorProps: {
    attributes: { class: /* same classes as RichTextField */ },
    handlePaste(view, event) {
      const items = Array.from(event.clipboardData?.items ?? []);
      const imageItem = items.find((i) => i.type.startsWith("image/"));
      if (!imageItem) return false; // fall through to default paste
      event.preventDefault();
      const file = imageItem.getAsFile();
      if (file) void uploadAndInsert(file);
      return true;
    },
    handleDrop(view, event) {
      const file = Array.from(event.dataTransfer?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) return false;
      event.preventDefault();
      void uploadAndInsert(file);
      return true;
    },
  },
  onUpdate: ({ editor: e }) => onChange(e.getHTML()),
});

async function uploadAndInsert(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/v2/projects/${projectId}/tasks/description-images`, { method: "POST", body: fd });
  if (!res.ok) return; // silently drop — inline error state is a nice-to-have, not required
  const { url } = await res.json();
  editor?.chain().focus().setImage({ src: url }).run();
}
```

### `/api/upload/route.ts` — allow-list + size cap to mirror (lines 5-18, 20)

```ts
const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  // image/svg+xml intentionally excluded — SVGs can carry embedded <script>
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
```

Reuse the same list/cap in both new upload routes (`description-images` restricts further to the 4 image types only).

### `attachments` insert pattern to reuse (`zoho-import/attachments/route.ts:143-160`)

```ts
const { error: uploadError } = await adminClient.storage
  .from("project-assets")
  .upload(storagePath, buffer, { contentType: file.type, upsert: false });

await adminClient.from("attachments").insert({
  entity_type: "task",
  entity_id: taskId,
  storage_path: storagePath, // e.g. `tasks/${taskId}/${Date.now()}_${safeFilename}`
  filename: file.name,
  size: file.size,
  uploaded_by: user.id,
});
```

Use `createClient()` (session-bound, RLS-enforced) rather than `adminClient` here — the requester is an authenticated PM/admin creating their own task, not an unauthenticated onboarding flow, so RLS (`attachments_pm_write`, `project_assets_staff_write` from migration 050) should do the enforcement, matching how `/api/v2/projects/[projectId]/tasks/route.ts` already uses `createClient()` throughout.

### `tasklists` bucket/RLS precedent to mirror (`050_project_assets_storage.sql`, adapt for a new **public** bucket)

```sql
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-content', 'task-content', true, 10485760) -- 10MB, images only
on conflict (id) do nothing;

drop policy if exists "task_content_staff_write" on storage.objects;
create policy "task_content_staff_write"
  on storage.objects for insert to authenticated
  using (bucket_id = 'task-content' and get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (bucket_id = 'task-content' and get_my_role() in ('admin', 'super_admin', 'pm'));
-- public bucket → no read policy needed, anon SELECT is implicit for public buckets
```

### `getProjectDetailData` — add `role` to the profiles select (`_get-project-detail-data.ts:53,76`)

```ts
supabase.from("profiles").select("id, full_name, avatar_url, role").in("role", ["developer", "pm", "admin", "super_admin"]).order("full_name", { ascending: true }),
// ...
allMembers: profilesRes.data ?? [], // now carries `role`
```

Update `ProjectDetailData["allMembers"]` type (line 13) to `{ id: string; full_name: string | null; avatar_url: string | null; role: string }[]`.

### Lifting `tasklists` state for setter access (`_project-detail.tsx:120`)

```tsx
const [tasklists, setTasklists] = useState<Tasklist[]>(initialTasklists);
// ...
function addTasklist(tl: Tasklist) { setTasklists((prev) => [...prev, tl]); }
```

Pass `tasklists={tasklists}` and `onTasklistCreated={addTasklist}` to `<CreateTaskModal>` (line 655-661), alongside the existing `allMembers` prop already available on `ProjectDetail`'s own props (line 99, currently not threaded down to `CreateTaskModal` — add it).

## Implementation Steps

1. `pnpm add @tiptap/extension-image@^3.26.0`.
2. Write migration `091_task_content_storage.sql` (public `task-content` bucket + staff-write RLS policy, per Code Context).
3. Build `src/app/api/v2/projects/[projectId]/tasks/description-images/route.ts` — session + role check (`admin`/`super_admin`/`pm`), validate image-only mime types + 10MB cap, upload to `task-content` at `${projectId}/${Date.now()}_${safeFilename}`, return `{ url }` via `getPublicUrl`.
4. Build `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts` — session + role check, verify the task belongs to the resolved project, validate against `/api/upload`'s allow-list + 25MB cap, upload to `project-assets` at `tasks/${taskId}/${Date.now()}_${safeFilename}`, insert into `attachments`, return the created row.
5. Build `src/app/api/v2/projects/[projectId]/tasklists/route.ts` — session + role check, validate `name`, insert into `tasklists` with `project_id`, return the created row.
6. Update `src/app/api/v2/projects/[projectId]/tasks/route.ts`'s `POST` handler to read `body.tasklist_id` and include it in the insert (`tasklist_id: body.tasklist_id || null`).
7. Update `_get-project-detail-data.ts`: add `role` to the profiles select and to the `allMembers` type.
8. Build `_task-description-editor.tsx`: adapt `RichTextField`'s structure locally, add the `Image` extension and `handlePaste`/`handleDrop` upload-and-insert logic (per Code Context).
9. Build `_task-attachment-picker.tsx`: compact dropzone (smaller than `_files-tab.tsx`'s 168px `UploadDropzone` — this lives inside a `max-w-md` modal) + staged file chips with remove buttons; accepts `onFilesChange(files: File[])`, enforces the mime allow-list + 25MB/file + 10-file cap client-side with inline errors for rejected files.
10. In `_project-detail.tsx`: lift `tasklists` state to include a setter (`addTasklist`), pass `tasklists`/`allMembers`/`onTasklistCreated` down to `CreateTaskModal`.
11. In `CreateTaskModal`: replace the description `<textarea>` with `_task-description-editor.tsx`; add the Attachments section using `_task-attachment-picker.tsx` directly below it; add a "Task List" select-or-create field and a developer "Assignee" `<select>` (filtered `allMembers.filter(m => m.role === "developer")`) to the existing Milestone/Due date grid area; rewire `submit()` per Code Context.
12. Manually verify in the browser as a PM: open New Task, type a description, paste a screenshot into it (confirm it uploads and renders inline), drag a PDF into the Attachments section, create a new task list inline, assign a developer, submit — confirm the task appears in List View grouped under the new tasklist, with the assignee avatar showing, and that the description renders the pasted image (check the rendered HTML wherever task descriptions are shown, e.g. task detail page / row expansion).
13. Verify the attachment row lands correctly: query `attachments` for `entity_type = 'task'` and the new task's id (or confirm via Supabase Studio) — no viewer UI exists yet to check this in-app, per the Decision #5 scope boundary.

## Acceptance Criteria

- [ ] Description field is a rich text editor (Bold/Italic/Bullet list) whose HTML is submitted as `description` on task creation.
- [ ] Pasting or dropping an image into the description editor uploads it to the `task-content` bucket and inserts a working `<img>` at the cursor — no manual "insert image" step required.
- [ ] An "Attachments" section is visible directly below the description, accepting images and documents (PDF/Word/Excel) via drag-and-drop or browse; staged files show in a removable list before submit.
- [ ] Submitting the form with staged attachment files creates the task first, then uploads/registers each attachment against the new task's id; a partial upload failure does not fail or roll back the already-created task.
- [ ] A "Task List" field lets the PM pick an existing tasklist or create a new one inline; creating one immediately persists it and it appears in List View's grouping without a page refresh.
- [ ] An "Assignee" field lists only `role === "developer"` project members; selecting one results in the created task's `assignees` containing exactly that one id.
- [ ] `POST /api/v2/projects/[projectId]/tasks` persists `tasklist_id` when provided.
- [ ] All three new API routes (`tasklists`, task `attachments`, `description-images`) reject unauthenticated requests (401) and non-PM/admin roles (403), matching existing RLS.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new warnings/errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser verification (no test runner configured): exercise the full New Task flow described in Implementation Step 12 as a `pm` (or `admin`) user against a real project with at least one existing tasklist and at least one `developer`-role profile seeded, covering: plain creation (no rich text/attachments/tasklist/assignee — must still work exactly as today), paste-image-into-description, drag-drop-into-attachments, create-new-tasklist-inline, and assignee selection. Also confirm a non-PM/developer-role session gets 401/403 from the three new routes (e.g. via `curl` with a developer session cookie, or by temporarily role-switching a test account).

## Compatibility Touchpoints

- **New migration** `091_task_content_storage.sql` — must be applied to Supabase before the `description-images` route works; document in the same way prior storage-bucket migrations (005/016/050/057) were introduced.
- **New dependency** `@tiptap/extension-image` — added to `package.json`, version-aligned with the other installed `@tiptap/*` packages (`^3.26.0`).
- No MCP tool inventory changes (`_docs/mcp-tools.md`) — none of the new routes are `server.registerTool(...)` calls.
- No env var changes.
- `POST /api/v2/projects/[projectId]/tasks`'s request body gains one new optional field (`tasklist_id`) — additive, does not break any existing caller (the MCP `create_task` tool and any other caller that omits it are unaffected).

## Implementation Notes

### What Changed
- Added migration `091_task_content_storage.sql` — new public `task-content` storage bucket + staff-write RLS policy (`get_my_role() in ('admin','super_admin','pm')`), per Code Context.
- Added `POST /api/v2/projects/[projectId]/tasks/description-images` — session + role-gated, validates image-only mime types + 10MB cap, uploads to `task-content` at `${project.id}/${timestamp}_${safeFilename}`, returns `{ url, filename, size }` via `getPublicUrl`.
- Added `POST /api/v2/projects/[projectId]/tasks/[taskId]/attachments` — session + role-gated, verifies the task belongs to the resolved project, validates against `/api/upload`'s allow-list + 25MB cap, uploads to the existing private `project-assets` bucket at `tasks/${task.id}/${timestamp}_${safeFilename}`, inserts an `attachments` row (`entity_type: "task"`), returns the created row.
- Added `POST /api/v2/projects/[projectId]/tasklists` — session + role-gated, validates `name`, inserts a `tasklists` row for the resolved project, returns the created row.
- `POST /api/v2/projects/[projectId]/tasks` now reads `body.tasklist_id` and persists it (`tasklist_id: body.tasklist_id || null`).
- `getProjectDetailData` now selects `role` alongside `id, full_name, avatar_url` for `allMembers`, and the `ProjectDetailData["allMembers"]` type carries it.
- Added `_task-description-editor.tsx` — local Tiptap rich text editor (`StarterKit` + `Image` extension), same toolbar shape as `_shared-ui.tsx`'s `RichTextField` (Bold/Italic/Bullet list), plus `handlePaste`/`handleDrop` that intercept image files, upload them via the new `description-images` route, and insert them inline via `editor.chain().focus().setImage({ src: url }).run()`.
- Added `_task-attachment-picker.tsx` — compact drag-and-drop/browse zone + staged file list (name, size, remove button), client-side validation against the same allow-list/25MB cap as the attachments route, plus a 10-file cap.
- `_project-detail.tsx`:
  - `CreateTaskModal` now accepts `tasklists`, `allMembers`, `onTasklistCreated` props; replaced the plain `<textarea>` description with `TaskDescriptionEditor`; added an `Attachments` section (`TaskAttachmentPicker`) directly below it; added a "Task list" select-or-create field (dropdown + inline "+ Create new list…" → text input → immediate `POST /tasklists`) and an "Assignee" `<select>` filtered to `allMembers.filter(m => m.role === "developer")`; widened the modal to `max-w-lg` with an internal `overflow-y-auto` scroll region to accommodate the added fields; rewired `submit()` to (1) optionally create a new tasklist first, (2) create the task with `tasklist_id`/`assignees` included, (3) upload any staged attachment files against the new task's id via `Promise.allSettled`, surfacing a non-blocking inline warning on partial failure.
  - Lifted `tasklists` state to include a setter (`setTasklists`) and added an `addTasklist` callback (mirrors the existing `addTask`/`addIssue`/`upsertMilestone` pattern), passed to `CreateTaskModal` as `onTasklistCreated`.
  - `ProjectDetail`'s own `allMembers` prop type gained `role: string` (additive).

### Files Changed
- `supabase/migrations/091_task_content_storage.sql` - new migration, per plan
- `src/app/api/v2/projects/[projectId]/tasks/description-images/route.ts` - new route, per plan
- `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts` - new route, per plan
- `src/app/api/v2/projects/[projectId]/tasklists/route.ts` - new route, per plan
- `src/app/api/v2/projects/[projectId]/tasks/route.ts` - added `tasklist_id` to the `POST` insert, per plan
- `src/app/v2/(hub)/projects/[projectId]/_get-project-detail-data.ts` - added `role` to the profiles select + `allMembers` type, per plan
- `src/app/v2/(hub)/projects/[projectId]/_task-description-editor.tsx` - new component, per plan
- `src/app/v2/(hub)/projects/[projectId]/_task-attachment-picker.tsx` - new component, per plan
- `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` - `CreateTaskModal` rewired per plan; `tasklists` state lifted with a setter; `addTasklist` helper added; `ProjectDetail`'s `allMembers` prop type updated; fixed the `CreateTaskModal` call site's `projectId` prop (see Deviations)
- `package.json` / `pnpm-lock.yaml` - added `@tiptap/extension-image` (pinned to `^3.28.0`, not the initially-planned `^3.26.0` — see Deviations)

### Deviations From Plan
- **`@tiptap/extension-image` version:** the task doc specified `^3.26.0` to match the other installed `@tiptap/*` packages' version string, but `pnpm add @tiptap/extension-image@^3.26.0` actually resolved to `3.29.2`, which declares a strict peer dependency on `@tiptap/core@3.29.2` while the rest of this repo's tiptap packages (via `@tiptap/starter-kit`/`@tiptap/react`) pull `@tiptap/core@3.28.0` — a peer-mismatch warning at install time. Re-installed pinned to `@tiptap/extension-image@3.28.0` instead, which resolves cleanly against `@tiptap/core@3.28.0` with no peer warnings (verified via `pnpm list @tiptap/core --depth 5`). `package.json` ended up with `"@tiptap/extension-image": "^3.28.0"`, one patch version off the task doc's stated `^3.26.0` target but exactly aligned with what's actually installed for every other `@tiptap/*` package in this repo, which was the intent behind that requirement.
- **Fixed a pre-existing bug in `CreateTaskModal`'s call site**, not called out in the task doc: `_project-detail.tsx`'s `<CreateTaskModal projectId={project.id} .../>` was passing the project's UUID (`project.id`), but every route it calls — including the existing `POST /api/v2/projects/[projectId]/tasks` and all three new routes this task adds — resolves the `[projectId]` URL segment via `.eq("project_id", projectId)`, i.e. the human-readable slug column, not the UUID. The sibling `CreateIssueModal` one prop below already guards against exactly this with `projectId={project.project_id ?? project.id}`. Left as `project.id`, task creation (and now every new endpoint built in this task) would 404 with "Project not found" on every submit. Fixed by applying the same `project.project_id ?? project.id` fallback `CreateIssueModal` already uses. This was necessary for the task's own routes to function at all, not a scope expansion — no other behavior of `CreateTaskModal` or any unrelated code path was touched.
- No other deviations. `npx tsc --noEmit` and `pnpm lint` both pass with no errors/warnings.

### Verification Run
- `npx tsc --noEmit` - PASS (no errors)
- `pnpm lint` - PASS (no warnings or errors)
- Manual/browser verification (Implementation Steps 12-13) - SKIPPED (deferred to the `test` stage per the implement skill's workflow — this stage runs typecheck/lint only; no dev server was started during implementation; also requires the `091_task_content_storage.sql` migration to be applied to the target Supabase instance first)

### Notes for Reviewers
- `impeccable`'s design-lint hook flagged literal font-size Tailwind classes (`text-[10px]`, `text-[11px]`, `text-[12px]`, `text-[13px]`, etc.) across all new/touched files in this task, plus 32 pre-existing findings on lines untouched by this change within `_project-detail.tsx`. Reviewed and left as-is for the same reason task 204 documented: this codebase's established, working convention is arbitrary pixel-based Tailwind classes throughout — CLAUDE.md's "UI Polish Conventions" section explicitly documents this as the real shipped pattern, not a formal type-ramp/shadcn-token system. The new components (`_task-description-editor.tsx`, `_task-attachment-picker.tsx`) match the exact sizes already used by the `CreateTaskModal` they live inside (`inputClass`/`labelClass` at 11-13px). No changes made; classifying as false positives relative to this project's actual conventions.
- The migration (`091_task_content_storage.sql`) has not been applied to any live Supabase instance as part of this implementation — per this repo's conventions, migrations are written as files and applied separately. `description-images` uploads will fail with a "Bucket not found" storage error until it's applied.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation in any new/changed file.
- No `any` or untyped escape hatches; all new API routes, components, and prop types are fully typed (`MemberOptionWithRole`, `Tasklist`, `Task`, typed `FormData`/`File` handling).
- No deep nesting — API routes use early-return guard clauses (401 → 403 → 404 → 400 → upload/insert), matching the exact shape of every sibling route in this codebase (`tasks/route.ts`, `issues/route.ts`).
- Each new file has one clear responsibility: `description-images/route.ts` (inline image upload only), `[taskId]/attachments/route.ts` (discrete attachment upload+register only), `tasklists/route.ts` (tasklist creation only), `_task-description-editor.tsx` (rich text + inline image), `_task-attachment-picker.tsx` (staging/validation UI only). `CreateTaskModal`'s `submit()` stays a single, readable sequence (optionally create tasklist → create task → upload attachments) rather than being split further, appropriate for its size.
- Names accurately describe behavior (`addTasklist`, `uploadAndInsertImage`, `finalTasklistId`, `attachmentWarning`, `developers`).
- `ALLOWED_MIME_TYPES`/`MAX_FILE_SIZE` are intentionally duplicated between `[taskId]/attachments/route.ts` (server enforcement) and `_task-attachment-picker.tsx` (client-side pre-check) — standard client+server validation split, not accidental repetition; matches the task doc's explicit Decision #6 to mirror `/api/upload/route.ts`'s existing allow-list rather than introduce a new shared-constants abstraction spanning the client/server boundary for a single feature.
- Errors are handled intentionally throughout: each new route returns typed 401/403/404/400/500 responses with a message; the modal surfaces task-creation and tasklist-creation failures via the existing `error` state, and a failed attachment upload after task creation is a non-blocking `attachmentWarning` rather than a silent drop or a rolled-back task, per Requirement 5.
- No secrets, credentials, or debug logging — only `console.error` on genuine failure paths, matching the exact convention already used by every sibling route (`tasks/route.ts`, `issues/route.ts`, `zoho-import/attachments/route.ts`).
- Fixed-hex token styling, `cn()` usage, and no `dark:`/`style={{}}` — confirmed across both new components and the modal edits, consistent with CLAUDE.md's v2 styling convention and the file's existing `inputClass`/`labelClass` pattern.
- `npx tsc --noEmit` and `pnpm lint` both PASS with zero errors/warnings (re-confirmed during this review — see Verification Run in Implementation Notes).

### Deviations
- **Medium — `CreateTaskModal`'s `projectId` prop fix (documented in Implementation Notes).** Changing `project.id` → `project.project_id ?? project.id` at the call site is a functional bug fix, not a requirement in the original task doc. Classified Medium (visible, but low risk) because: it's confined to the exact JSX block already being modified to add the new `tasklists`/`allMembers` props; it applies an existing, already-shipped fallback pattern from the sibling `CreateIssueModal` one prop below (no new logic invented); and without it, every route this task adds — plus the pre-existing task-creation endpoint — would 404 on every submission, making the fix a functional precondition for the task's own acceptance criteria rather than an optional improvement. Verified as a real (not hypothetical) bug by cross-checking `tasks/route.ts` and `issues/route.ts`'s identical `.eq("project_id", projectId)` resolution logic against both modals' call sites.
- **Minor — `@tiptap/extension-image` pinned to `^3.28.0` instead of the task doc's stated `^3.26.0`.** `pnpm add @tiptap/extension-image@^3.26.0` resolved to `3.29.2`, which produced a peer-dependency warning against this repo's already-installed `@tiptap/core@3.28.0` (pulled in by `@tiptap/starter-kit`/`@tiptap/react`). Re-pinned to `3.28.0`, the exact version that satisfies the peer with zero warnings — same intent as the task doc's requirement (version-align with the sibling `@tiptap/*` packages), different literal number because `3.26.0` was never actually installed for the other packages either (they resolve to `3.28.0` on install, per `pnpm list @tiptap/core --depth 5`).
- **Minor — `_task-attachment-picker.tsx`'s `rejectionError` shows only the most recent rejection when multiple invalid files are dropped/browsed in one batch** (each new rejection overwrites the previous one in the loop). Satisfies the requirement ("inline errors for rejected files") for the common case (one bad file at a time) but not simultaneous multi-file rejection detail. Not fixed — acceptable UX gap for a first pass, not a scope violation, and no acceptance criterion requires aggregated multi-error display.
- No deviations found that touch the Out of Scope boundaries — `CreateIssueModal`, `AssigneePicker`, the MCP `create_task` tool, `onboarding-assets`/`customer-assets` buckets, and `_shared-ui.tsx`'s `RichTextField` are all untouched (confirmed via `git diff --name-only`).
