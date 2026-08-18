# 270: Task Detail Page — Description Bottom Radius Fix, Attachment Upload Section, Attachments/Comments Tab Swap

**Created:** 2026-08-18
**Priority:** MEDIUM
**Type:** bugfix + enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

The user's request heading says "Task/Issue" (mirroring the generic heading style task 257 used), but both attached screenshots are unambiguously the **Task Detail** page: the breadcrumb chip reads `TASK · 3A64D17C01-T0001` (`-T####` display-ID format is task-only per `CLAUDE.md`'s `display_id` note — issues use `-I####`) and the page title is "Forms". Task 257 already shipped the Issue Detail equivalent of two of these three asks (Comments-first tab order + default tab, `fullBleed` Description) in its Requirements F/G. This task scopes to **Task Detail only** (`_task-detail.tsx` and its direct subtree), following the same screenshot-over-heading precedent task 257 documented for the reverse case.

Three requirements from the user's message map to three independent fixes:

1. **Bottom border radius** (Image #6, red circles on the Description box's bottom-left/bottom-right corners) — a real, reproducible visual bug in the *shared* `_description-field.tsx`'s `fullBleed` mode, not Task-Detail-specific code. Fixing it in the shared file also silently fixes the same defect on Issue Detail (which uses the identical `fullBleed` prop), but that's incidental, not the scope driver.
2. **Attach/upload/drag-and-drop section below the Description** — genuinely new for Task Detail. `_task-attachments.tsx` (the Attachments tab) is read-only today by design (its own top comment: "Task Detail's tab is read-only because uploads there happen at task-creation time via the New Task modal"). This request adds the first post-creation upload path for tasks.
3. **Swap Attachments/Comments tab placement** (Image #7) — `_task-attachments-comments-panel.tsx` currently orders `["attachments", "comments", "timelogs"]` with `attachments` default-active. Bring it to `["comments", "attachments", "timelogs"]` / `comments` default, matching what task 257 already shipped for Issue Detail's `_issue-attachments-comments-panel.tsx` (kept for consistency between the two pages, not because the user asked for parity explicitly).

---

## Requirements

### A. Fix Description field's bottom-corner radius in `fullBleed` mode

**Root cause** (`src/app/(hub)/projects/[projectId]/_description-field.tsx:132-137`): the field's outer div drops its `rounded-[10px]` entirely when `fullBleed` is true —

```tsx
<div className={cn(
  "border overflow-hidden transition-colors border-[#E2E7F2]",
  !fullBleed && "rounded-[10px]",
  ...
)}>
```

The design intent (documented in task 257's Follow-up 3 and this prop's own comment) was that the parent `Card`/`AccordionCard`'s own `rounded-[14px] overflow-hidden` would visually clip this square-cornered child to match. In practice this does not happen cleanly — the child's own 1px border is drawn with square corners, and `overflow-hidden` on the parent only clips pixels that fall *outside* the parent's rounded boundary; a border corner sitting flush at the parent's inner edge still renders as a visibly square notch rather than following the parent's curve (confirmed by the screenshot's red-circled corners).

- [ ] In `_description-field.tsx`, change the `fullBleed` branch so the div gets `rounded-b-[13px]` instead of no radius (top stays square — it sits flush under the Card/AccordionCard header's `border-b` divider, where no visual radius is needed). `13px` (not `14px`) accounts for the parent's own 1px border so the two curves visually align.
- [ ] Do not touch the non-`fullBleed` path (`rounded-[10px]` on all corners) — unaffected, used elsewhere (e.g. non-fullBleed callers, if any exist today).

This is a one-file, shared-component fix — it applies to both `_task-detail.tsx` and `_issue-detail.tsx` callers automatically since both pass `fullBleed`. No caller-side changes needed.

### B. Attach/upload/drag-and-drop section below the Description (Task Detail)

`_task-attachments.tsx` (the Attachments tab content) has zero upload UI — it's a read-only grid. The task-side POST route already exists and works (`/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts:55-129`, same `ALLOWED_MIME_TYPES`/`MAX_FILE_SIZE`/storage-path pattern the Issue-side route uses) — this requirement is purely a new **client UI** that calls it, not new backend work.

- [ ] Create `src/app/(hub)/projects/[projectId]/_attachment-upload-zone.tsx` — a shared, generically-named component (same `[projectId]/`-level convention as `_accordion-card.tsx`/`_image-lightbox-modal.tsx`) so it's directly reusable by Issue Detail later without relocation, even though this task only wires it into Task Detail.
  - Props: `{ uploadUrl: string; disabled?: boolean }`.
  - Renders a dashed-border drop zone (`border-dashed border-[#E2E7F2] rounded-[10px]`, `Paperclip`/`UploadCloud` icon from `lucide-react`, text "Drag and drop files here, or click to browse") — matches the UI Polish Conventions' empty-state pattern (icon + one-line message + action) and this codebase's existing `border-dashed` precedent (`_issue-comments.tsx`'s legacy-attachment chips use a dashed border too).
  - Wires `onDragOver`/`onDrop` (`preventDefault` on both, read `e.dataTransfer.files`) and a hidden `<input type="file" multiple>` triggered by clicking the zone (mirrors `IssueAttachments`' existing `fileInputRef.current?.click()` pattern).
  - On file(s) selected/dropped: client-side pre-check against the same MIME allowlist and 25MB cap the POST route enforces (duplicate the two constants inline — matches the existing duplication already present between the task and issue attachments routes, not a new pattern), then `POST` each file as its own `FormData` request to `uploadUrl` sequentially (avoids parallel `upsert:false` collisions on identical `Date.now()`-derived storage paths if two files are dropped in the same tick).
  - Local `uploading`/`error` state per the UI Polish Conventions ("every async action needs a loading state") — a small inline spinner/text during upload, and an inline `text-[#C0392B]` error line on a rejected file (bad type, oversize, or a non-2xx response body's `error` message).
  - **No callback prop for refreshing the Attachments tab is needed.** `_task-attachments.tsx` already holds a live Supabase Realtime subscription on `attachments` filtered to `entity_id=eq.${taskId}` (lines 119-140) that appends any new row on `INSERT` regardless of which component performed the write — the same mechanism already makes Issue Detail's own "Add file" button (`_issue-attachments.tsx`) appear instantly in its Attachments tab today. Verify this holds for the new zone during implementation rather than assuming it silently.
- [ ] Mount `<AttachmentUploadZone uploadUrl={...} disabled={!perm.canEditDetails} />` in `_task-detail.tsx`, directly below the Description `Card`, above `TaskAttachmentsCommentsPanel` — a new, separate block (not nested inside the Description `Card`), matching the screenshot's implied placement ("below the description section"). Gate visibility/enabled-state on `perm.canEditDetails` (same permission already gating the Description field's own `readOnly` and the sidebar's edit controls) — a developer with view-only access to someone else's task shouldn't see an active drop zone that will 403 on submit.

### C. Uploaded attachments appear in the Attachments tab

No additional plumbing — satisfied by B's reuse of the existing POST route + the Attachments tab's existing Realtime subscription. This requirement is a verification step (see Acceptance Criteria), not a separate code change.

### D. Swap Attachments/Comments tab placement (Task Detail)

`_task-attachments-comments-panel.tsx:14,32,38` — current order/default:

```tsx
type PanelTab = "attachments" | "comments" | "timelogs";
// ...
const [tab, setTab] = useState<PanelTab>("attachments");
// ...
{(["attachments", "comments", "timelogs"] as const).map((t) => ( /* ... */ ))}
```

- [ ] Reorder the rendered tab list to `["comments", "attachments", "timelogs"]` (extract to a `TAB_ORDER` constant, matching the pattern `_issue-attachments-comments-panel.tsx:20` already established, instead of inlining the array literal in the `.map()` call).
- [ ] Change the default `useState<PanelTab>("attachments")` to `useState<PanelTab>("comments")` — keeps "leftmost tab is the default-active one" consistent with the new visual order and with Issue Detail's already-shipped behavior (task 257, Requirement G).
- [ ] Keep the existing pill/segmented-control visual style as-is (`bg-[#F4F6FB] rounded-full p-1`, no live counts). Issue Detail's panel was separately redesigned to an underline-tab style with live counts (task 257, Requirement G) — that redesign was not requested here and is out of scope; don't port it over as a side effect of this change.

---

## Out of Scope / Must-Not-Change

- **`_issue-detail.tsx`, `_issue-attachments.tsx`, `_issue-attachments-comments-panel.tsx`** — Issue Detail already has Comments-first tab order/default (task 257) and its own upload button inside the Attachments tab; nothing here changes that page's code. Requirement A's shared-file fix benefits it incidentally only.
- **No visual redesign of `_task-attachments-comments-panel.tsx`'s tab bar** (no switch to underline style, no live counts) — only the order/default per Requirement D.
- **No changes to the task attachments POST/GET/file-url routes** — Requirement B is client-only; the backend already supports everything needed.
- **No new upload entry point inside `_task-attachments.tsx` itself** (e.g. no "Add file" button added to the tab, mirroring Issue's). The new drop zone below Description is the sole new upload affordance this task adds; a second one inside the tab would be redundant and wasn't requested.
- **No change to `getTaskEditPermission` or any RLS/migration.**

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/[projectId]/_description-field.tsx` | Modify | `fullBleed` branch: `rounded-b-[13px]` instead of no radius (Requirement A) |
| `src/app/(hub)/projects/[projectId]/_attachment-upload-zone.tsx` | Create | Shared drag-and-drop/click-to-browse upload component (Requirement B) |
| `src/app/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Mount `AttachmentUploadZone` below the Description `Card` (Requirement B) |
| `src/app/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` | Modify | Reorder tabs, change default tab to `comments` (Requirement D) |

## Code Context

### `_description-field.tsx:132-137` — the div to fix

```tsx
<div className={cn(
  "border overflow-hidden transition-colors border-[#E2E7F2]",
  !fullBleed && "rounded-[10px]",
  readOnly ? "bg-white" : "bg-[#F4F6FB] focus-within:border-[#007BFF] focus-within:bg-white focus-within:ring-[3px] focus-within:ring-[#007BFF]/[0.14]"
)}>
```

Change to (illustrative — keep the rest of the className list intact):

```tsx
<div className={cn(
  "border overflow-hidden transition-colors border-[#E2E7F2]",
  fullBleed ? "rounded-b-[13px]" : "rounded-[10px]",
  ...
)}>
```

### `_task-attachments.tsx:104-140` — existing Realtime subscription the new upload zone relies on (no change needed here, confirms C is free)

```tsx
useEffect(() => {
  const ctrl = new AbortController();
  fetch(`/api/v2/projects/${projectId}/tasks/${taskId}/attachments`, { signal: ctrl.signal })
    .then((r) => (r.ok ? r.json() : []))
    .then((data: AttachmentRow[]) => setAttachments(data))
    ...
}, [projectId, taskId]);

useEffect(() => {
  const supabase = createClient();
  const channel = supabase
    .channel(`task_attachments_${taskId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "attachments", filter: `entity_id=eq.${taskId}` },
      (payload) => {
        if (payload.eventType === "INSERT") {
          const row = payload.new as AttachmentRow & { entity_type: string };
          if (row.entity_type !== "task") return;
          setAttachments((prev) => (prev.some((a) => a.id === row.id) ? prev : [...prev, row]));
        }
        ...
      })
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}, [taskId]);
```

### `_issue-attachments.tsx:183-214` — existing upload pattern to mirror for validation/error-state shape (not reused directly — Task's zone is a new component, not this file)

```tsx
async function handleUpload(file: File) {
  setError(null);
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    setError("Unsupported file type. Only images, PDF, Word, and Excel files are supported.");
    return;
  }
  setUploading(true);
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/v2/projects/${projectId}/issues/${issueId}/attachments`, { method: "POST", body: fd });
  setUploading(false);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    setError(body.error ?? "Failed to upload file.");
    return;
  }
  ...
}
```

### `_task-attachments-comments-panel.tsx:14-38` — full current state to reorder

```tsx
type PanelTab = "attachments" | "comments" | "timelogs";

const TAB_LABEL: Record<PanelTab, string> = {
  attachments: "Attachments",
  comments: "Comments",
  timelogs: "Time Logs",
};

export function TaskAttachmentsCommentsPanel({ projectId, taskId, timeLogsRefreshKey }: {...}) {
  const [tab, setTab] = useState<PanelTab>("attachments");
  return (
    ...
    {(["attachments", "comments", "timelogs"] as const).map((t) => (...))}
    ...
  );
}
```

### `_issue-attachments-comments-panel.tsx:18-20,43` — the already-shipped Issue-side pattern Requirement D matches (order/default only, not the underline-tab visual redesign)

```tsx
type PanelTab = "comments" | "attachments" | "timelogs";
const TAB_ORDER: PanelTab[] = ["comments", "attachments", "timelogs"];
...
const [tab, setTab] = useState<PanelTab>("comments");
```

---

## Implementation Steps

1. Fix `_description-field.tsx`'s `fullBleed` radius branch (Requirement A).
2. Create `_attachment-upload-zone.tsx` (Requirement B) — drag/drop + click-to-browse, client-side MIME/size pre-check, sequential POST, loading/error states.
3. Mount it in `_task-detail.tsx` below the Description `Card`, gated on `perm.canEditDetails` (Requirement B).
4. Reorder `_task-attachments-comments-panel.tsx`'s `TAB_ORDER`/default tab (Requirement D).
5. `npx tsc --noEmit` and `pnpm lint`.
6. Browser-verify (see Verification below).

## Acceptance Criteria

- [ ] Description field's bottom corners visually match the parent Card's `rounded-[14px]` curve — no square notch at either bottom corner, in both editable and read-only states.
- [ ] A new drag-and-drop / click-to-browse section appears directly below the Description card on Task Detail.
- [ ] Dropping or browsing a valid file (image/PDF/Word/Excel, ≤25MB) uploads successfully and shows a brief loading state; an invalid file (wrong type or oversize) shows an inline error and is not uploaded.
- [ ] A file uploaded via the new drop zone appears in the Attachments tab without a manual page refresh.
- [ ] The drop zone is disabled or hidden for a user without `canEditDetails` permission on the task (read-only viewer).
- [ ] Tab order on Task Detail's Attachments/Comments/Time Logs panel is Comments, Attachments, Time Logs; Comments is the default-active tab on page load.
- [ ] Issue Detail (`_issue-detail.tsx` and subtree) is visually and behaviorally unchanged except for the incidental Description bottom-radius fix.
- [ ] `npx tsc --noEmit` and `pnpm lint` both clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
```

Browser: open a Task Detail page as a user with edit permission (creator or privileged role) — confirm the Description card's bottom corners are rounded, drag a valid file onto the new drop zone and confirm it appears in the Attachments tab live, attempt an unsupported file type and confirm the inline error, and confirm the Comments tab is active by default with Attachments second. Separately open the same task as a non-privileged/non-assignee viewer to confirm the drop zone is disabled/hidden. Spot-check an Issue Detail page to confirm no regression there beyond the shared radius fix.

## Compatibility Touchpoints

- `_attachment-upload-zone.tsx` is a new, generically-named `[projectId]/`-level shared component — deliberately reusable by Issue Detail (replacing or supplementing its existing "Add file" button) in a future pass, without relocation. Not wired into Issue Detail in this task.
- No schema, RLS, or API route changes — Requirement B is a pure client addition against an already-shipped, already-permissioned POST endpoint.
- `_description-field.tsx`'s fix is additive to its own `fullBleed` branch only; the non-`fullBleed` code path and every other prop (`scrollable`, `readOnly`, `uploadUrl`) are untouched.

---

## Implementation Notes

### What Changed

Implemented Requirements A, B, C, D as scoped, plus one user-approved scope addition mid-implementation (see Deviations). All four items were verified live in the browser against real seeded data on the exact task the request's screenshots showed (`3A64D17C01-T0001`, "Forms", Summit Mainenance Website project), including one end-to-end upload (a real file dropped through the new zone, confirmed live in the Attachments tab, then cleaned up directly via Supabase's REST/Storage APIs so no test data was left behind).

- **A — Bottom-corner radius.** `_description-field.tsx`'s `fullBleed` branch now applies `rounded-b-[13px]` instead of dropping radius entirely. Verified live via a zoomed screenshot of the Description card's bottom edge — the corners now curve smoothly into the parent card's own `rounded-[14px]`, matching what the pre-fix screenshot's red circles flagged as square.
- **B/C — Attachment upload zone.** New `_attachment-upload-zone.tsx` (drag-and-drop + click-to-browse, client-side MIME/size pre-check, sequential POST) mounted in `_task-detail.tsx` directly below the Description card, gated on `perm.canEditDetails`. Verified end-to-end: uploaded a real 1x1 PNG via the zone's file input, watched "Attachments (0)" become "Attachments (1)" live with no manual refresh (the existing Realtime subscription in `_task-attachments.tsx` picked it up, exactly as the doc predicted — no callback wiring was needed for this to work), and confirmed the thumbnail/filename/size rendered correctly in the tab.
- **D — Tab order + visual parity (expanded mid-implementation).** `_task-attachments-comments-panel.tsx` reordered to Comments/Attachments/Time Logs with Comments as the default-active tab.

### Files Changed

- `src/app/(hub)/projects/[projectId]/_description-field.tsx` — `fullBleed` branch: `rounded-b-[13px]` instead of no radius (Requirement A)
- `src/app/(hub)/projects/[projectId]/_attachment-upload-zone.tsx` — new shared drag-and-drop/click-to-browse upload component (Requirement B)
- `src/app/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` — mounted `AttachmentUploadZone` below the Description card, gated on `perm.canEditDetails` (Requirement B)
- `src/app/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` — reordered tabs, default tab → `comments`, redesigned from pill switcher to underline-tab-with-counts (Requirement D + Deviation)
- `src/app/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments.tsx` — added `onCountChange` prop, wired into the initial fetch and both Realtime INSERT/DELETE branches (Deviation, mirrors `_issue-attachments.tsx`)
- `src/app/(hub)/projects/[projectId]/tasks/[taskId]/_task-comments.tsx` — added `onCountChange` prop, wired into `fetchComments` and `postComment` (Deviation, mirrors `_issue-comments.tsx`)

### Deviations From Plan

- **Tab redesign expanded beyond order/default, per user request mid-implementation.** The approved doc's Requirement D and its own Out of Scope section explicitly limited Task Detail's tab change to order/default only, keeping the pill/segmented-control visual as-is ("Issue Detail's panel was separately redesigned to an underline-tab style with live counts (task 257) — that redesign was not requested here and is out of scope"). Mid-implementation the user sent two follow-up messages: "Follow the same tab UI with the Issues details page," then a screenshot of Issue Detail's underline-tab-with-counts bar, clarifying they wanted Task Detail to visually match Issue Detail's tab treatment, not just reorder the pill tabs. This is a genuine, explicit scope broadening (approved live in chat, not assumed) — implemented by porting the exact underline/count pattern from `_issue-attachments-comments-panel.tsx`, including lifting counts via `onCountChange` from `_task-attachments.tsx` and `_task-comments.tsx` (new props on both, mirroring `_issue-attachments.tsx`/`_issue-comments.tsx` byte-for-byte in structure). No other Out-of-Scope item from the original doc was touched — Issue Detail's own files remain untouched.
- Everything else matches the approved plan; no other scope changes.

### Verification Run

- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (2 pre-existing warnings in `_checklist-tab.tsx`, unrelated to this task — same warnings task 257 also flagged as pre-existing)
- Browser (Chrome, real seeded dev data, task `3A64D17C01-T0001`) — PASS: Description bottom corners rounded (zoomed screenshot confirms no square notch), drag-and-drop zone present below Description, a real file uploaded through it appeared live in the Attachments tab (count updated 0→1 automatically via existing Realtime), tab order is Comments/Attachments/Time Logs with Comments active by default and live counts on both, test attachment cleaned up (storage object + DB row) directly via Supabase's REST/Storage APIs afterward. Spot-checked a separate real issue (`87BCA04A01-I0065`) to confirm Issue Detail is unaffected — its own tab order/style (already Comments-first, underline-with-counts from task 257) is unchanged, no upload zone was added there (correctly out of scope). No console errors observed during any step.
