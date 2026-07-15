# 152: Onboarding Wizard — Real-Time Upload Progress Bars + Kickoff/Business Facts File Preview

**Created:** 2026-07-15
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

Follow-on to task 149 (multi-file drag-and-drop for the Onboarding Wizard's `FileUploadBox`/
`HtmlMockupFileList`). Two gaps remain, both requested directly by the user:

1. **No real-time per-file progress.** Every `handle*Upload(file: File)` handler
   (`_onboarding-wizard.tsx`) uploads via a plain `fetch(...)` call with no progress signal —
   the UI only shows a single step-level `uploading` boolean ("Uploading…" text), with no
   indication of how far along any individual file is. Now that task 149 allows dropping
   several files at once, this is more noticeable: N concurrent uploads render as one
   undifferentiated "Uploading…" state.
2. **Kickoff/Business Facts has no file preview.** Every other step wired to `FileUploadBox`
   (Outcome Target, Migration Checklist, Content Map, Client Sign-Off) and `HtmlMockupFileList`
   (HTML Mockup) passes an `onView`/`viewingId` pair that opens the shared `FileViewerModal` via
   a `handleView*File` function fetching a signed URL from
   `GET /api/customers/[customerId]/assets/[assetId]/file-url`. The Kickoff/Business Facts call
   site (`_onboarding-wizard.tsx:1682`) is the one `FileUploadBox` instance that never received
   this — it only wires `onRemove`, not `onView`/`viewingId`. This looks like an original gap in
   task 129 (which built the Business Facts attachment), not something task 149 touched.

## Requirements

### 1. Real-time per-file progress bars
- [ ] Each file currently uploading (via drag-drop or file picker, including concurrent
      multi-file uploads from task 149) renders its own row with a live percentage and a filled
      progress bar, inside both `FileUploadBox` and `HtmlMockupFileList`.
- [ ] Progress reflects actual bytes-sent-so-far (via `XMLHttpRequest.upload.onprogress`), not a
      fake/simulated animation.
- [ ] Applies to all 6 existing `FileUploadBox`/`HtmlMockupFileList` upload handlers: Kickoff/
      Business Facts, Outcome Target, Migration Checklist, Content Map, Client Sign-Off, HTML
      Mockup.
- [ ] A progress row disappears once its upload finishes (success → file moves into the existing
      completed-files list; failure → row disappears, existing inline `*UploadError` text shows,
      matching current error-handling behavior — no change there).
- [ ] Concurrent uploads (multiple files dropped/selected at once) each get their own
      independent row and percentage — one slow/large file doesn't block or misreport another's
      progress.

### 2. Kickoff/Business Facts file preview
- [ ] The Business Facts `FileUploadBox` (`_onboarding-wizard.tsx:1682`) gets an eye/"View"
      button per uploaded file, opening the same shared `FileViewerModal` every other step
      already uses — identical UX to, e.g., Outcome Target's preview.

## Out of Scope / Must-Not-Change

- Do not touch the Storage/KB step's `StorageFileExplorer` or its own separate `<input
  type="file">` / `handleUpload` — task 149 already drew this boundary (it has its own upload
  path, not `FileUploadBox`/`HtmlMockupFileList`) and this task doesn't reopen it. If progress
  bars are wanted there too, that's a separate follow-up decision, not silently bundled in here.
- Do not change `/api/customers/[customerId]/assets/upload` (server route) — progress is a
  client-side concern (`XMLHttpRequest.upload.onprogress` on the existing single-file POST); the
  route's request/response contract is unchanged.
- Do not change the second request in each handler (`POST /api/customers/[customerId]/assets`,
  which creates the DB asset row) — it's a small JSON body, effectively instant; no progress
  needed there.
- Do not add a cancel/abort-in-progress button — not requested; out of scope for this pass.
- Do not change `ALLOWED_MIME_TYPES`/`MAX_FILE_SIZE` or any validation behavior.
- Preview: do not add `onEdit`/HTML-editor capability to Business Facts — that's specific to the
  HTML Mockup step (task 133) and not requested here. Business Facts gets read-only
  view-in-modal only, matching Outcome Target/Migration Checklist/Content Map/Client Sign-Off
  (none of which have `onEdit` either — only HTML Mockup does).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Add a shared XHR-based upload helper with progress callback; add per-step progress-tracking state and wire it into all 6 `handle*Upload` functions; render progress rows in `FileUploadBox`/`HtmlMockupFileList`; add `handleViewBusinessFactsFile` + `viewingBusinessFactsFileId` and wire `onView`/`viewingId` into the Business Facts `FileUploadBox` call site |

## Code Context

### Current upload handler shape (identical across all 6 sites — confirmed for Business Facts
/ line 713, Outcome Target / line 775, Migration Checklist / line 1050; Content Map / line
1122, Client Sign-Off / line 1194, HTML Mockup / line 1266 follow the same shape per task 149's
prior read-through):

```tsx
const handleBusinessFactsUpload = async (file: File) => {
  setUploadingBusinessFacts(true);
  setBusinessFactsUploadError(null);
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("project_id", project.project_id ?? project.id);
    const uploadRes = await fetch(`/api/customers/${project.customer_id}/assets/upload`, { method: "POST", body: formData });
    if (!uploadRes.ok) {
      const json = await uploadRes.json().catch(() => ({}));
      throw new Error(json.error ?? "Failed to upload file");
    }
    const uploaded = await uploadRes.json();
    const res = await fetch(`/api/customers/${project.customer_id}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "file", label: "Business Facts", file_path: uploaded.path, file_name: uploaded.filename, file_size: uploaded.size, file_mime_type: uploaded.mimeType, phase_number: 1, project_id: project.id }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? "Failed to save asset");
    }
    const newAsset: AssetRow = await res.json();
    setBusinessFactsFiles((prev) => [...prev, newAsset]);
  } catch (err) {
    setBusinessFactsUploadError(err instanceof Error ? err.message : "Failed to upload file");
  } finally {
    setUploadingBusinessFacts(false);
  }
};
```

State pairs per step (all pre-existing, one triplet per step — Business Facts shown, same shape
×6): `businessFactsFiles`/`setBusinessFactsFiles` (`AssetRow[]`), `uploadingBusinessFacts` (bool),
`businessFactsUploadError` (string|null).

### Target: shared XHR-with-progress helper (new, add near the top-level handler functions —
not extracted to a separate module; used only within this file, matching the "page-scoped UI is
inlined" convention)

```tsx
type UploadedAsset = { path: string; filename: string; size: number; mimeType: string };

function uploadFileWithProgress(url: string, formData: FormData, onProgress: (pct: number) => void): Promise<UploadedAsset> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Failed to upload file"));
        }
      } else {
        let message = "Failed to upload file";
        try { message = JSON.parse(xhr.responseText).error ?? message; } catch { /* keep default */ }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("Failed to upload file"));
    xhr.send(formData);
  });
}
```

Confirmed the server route (`/api/customers/[customerId]/assets/upload/route.ts`) returns JSON
`{ error: string }` on all failure statuses (401/403/400), so the `xhr.onload` error branch's
`JSON.parse(xhr.responseText).error` read matches the existing `fetch`-based handlers' own
`json.error ?? "..."` fallback pattern exactly.

### Target: per-step progress state + updated handler (Business Facts shown; apply identically
to the other 5)

```tsx
const [businessFactsUploadProgress, setBusinessFactsUploadProgress] = useState<{ id: string; name: string; progress: number }[]>([]);
// ...
const handleBusinessFactsUpload = async (file: File) => {
  const tempId = crypto.randomUUID();
  setBusinessFactsUploadProgress((prev) => [...prev, { id: tempId, name: file.name, progress: 0 }]);
  setBusinessFactsUploadError(null);
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("project_id", project.project_id ?? project.id);
    const uploaded = await uploadFileWithProgress(
      `/api/customers/${project.customer_id}/assets/upload`,
      formData,
      (pct) => setBusinessFactsUploadProgress((prev) => prev.map((p) => (p.id === tempId ? { ...p, progress: pct } : p)))
    );
    const res = await fetch(`/api/customers/${project.customer_id}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "file", label: "Business Facts", file_path: uploaded.path, file_name: uploaded.filename, file_size: uploaded.size, file_mime_type: uploaded.mimeType, phase_number: 1, project_id: project.id }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? "Failed to save asset");
    }
    const newAsset: AssetRow = await res.json();
    setBusinessFactsFiles((prev) => [...prev, newAsset]);
  } catch (err) {
    setBusinessFactsUploadError(err instanceof Error ? err.message : "Failed to upload file");
  } finally {
    setBusinessFactsUploadProgress((prev) => prev.filter((p) => p.id !== tempId));
  }
};
```

Note `setUploadingBusinessFacts(true)`/`setUploadingBusinessFacts(false)` are **removed** from
the handler — see Implementation Steps below for why (`uploading` becomes a derived value at the
call site instead of a separately-set boolean).

### Target: `FileUploadBox`/`HtmlMockupFileList` new `uploadProgress` prop + rendering

Both components already accept `uploading: boolean` (kept, still gates the button's `disabled`
and "Uploading…" copy) and now additionally accept an optional progress list, rendered as its
own row group between the drop zone and the existing completed-`files` list:

```tsx
uploadProgress?: { id: string; name: string; progress: number }[];
// ...
{uploadProgress && uploadProgress.length > 0 && (
  <div className="mt-2 flex flex-col gap-1.5">
    {uploadProgress.map((p) => (
      <div key={p.id} className={cn("flex flex-col gap-1.5 px-2.5 py-2 rounded-lg", isDark ? "bg-white/[0.03]" : "bg-slate-50")}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-brand/10 flex items-center justify-center shrink-0">
            <FileText size={11} className="text-brand" />
          </div>
          <div className={cn("text-[11.5px] font-medium truncate flex-1", textPrimary)}>{p.name}</div>
          <div className={cn("text-[10.5px] tabular-nums shrink-0", textMuted)}>{p.progress}%</div>
        </div>
        <div className={cn("h-1.5 rounded-full overflow-hidden", isDark ? "bg-white/[0.08]" : "bg-slate-200")}>
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${p.progress}%` }} />
        </div>
      </div>
    ))}
  </div>
)}
```

The `style={{ width }}` on the fill bar is the documented CLAUDE.md exception ("dynamic
single-property values... genuinely not expressible as Tailwind utilities") — a continuously
variable 0–100% width has no static Tailwind scale step; every other class stays `className`.

### Reference: existing preview pattern to mirror for Business Facts (`handleViewOutcomeFile`,
line 826, and its call site, line 1867-1868)

```tsx
const handleViewOutcomeFile = async (id: string) => {
  const file = outcomeFiles.find((f) => f.id === id);
  if (!file) return;
  setViewerFile(file);
  setViewerUrl(null);
  setViewerError(null);
  setViewerLoading(true);
  setViewingOutcomeFileId(id);
  try {
    const res = await fetch(`/api/customers/${project.customer_id}/assets/${id}/file-url`);
    if (!res.ok) throw new Error("Failed to get file URL");
    const { url } = await res.json();
    setViewerUrl(url);
  } catch {
    setViewerError("Failed to load file preview.");
  } finally {
    setViewerLoading(false);
    setViewingOutcomeFileId(null);
  }
};
```
```tsx
<FileUploadBox
  files={outcomeFiles}
  uploading={uploadingOutcomeFile}
  onFile={handleOutcomeFileUpload}
  onRemove={handleRemoveOutcomeFile}
  onView={handleViewOutcomeFile}
  viewingId={viewingOutcomeFileId}
  isDark={isDark}
  disabled={isStepReadOnly}
/>
```

This reuses the already-shared `viewerFile`/`viewerUrl`/`viewerLoading`/`viewerError` state and
the single `<FileViewerModal>` mounted once near the end of the component (`viewerFile && (...)`
block, ~line 2163) — no new modal instance needed.

### Current Business Facts call site (no `onView`/`viewingId`) — line 1682

```tsx
<FileUploadBox files={businessFactsFiles} uploading={uploadingBusinessFacts} onFile={handleBusinessFactsUpload} onRemove={handleRemoveBusinessFactsFile} isDark={isDark} disabled={isStepReadOnly} />
```

## Implementation Steps

1. Add the `UploadedAsset` type and `uploadFileWithProgress` helper function (near the other
   top-level handler functions, before the component body's `handle*Upload` definitions).
2. For each of the 6 handlers (`handleBusinessFactsUpload` L713, `handleOutcomeFileUpload` L775,
   `handleMigrationChecklistUpload` L1050, `handleContentMapUpload` L1122,
   `handleSignoffUpload` L1194, `handleHtmlMockupUpload` L1266 — line numbers are pre-149-edit
   references, re-locate by function name):
   - Add a new `use­State<{ id: string; name: string; progress: number }[]>([])` progress-list
     pair per step (naming convention: `{step}UploadProgress`/`set{Step}UploadProgress`).
   - Generate `const tempId = crypto.randomUUID();` at the top of the handler, push an initial
     `{ id: tempId, name: file.name, progress: 0 }` entry.
   - Replace the first `fetch(...assets/upload...)` call with `uploadFileWithProgress(url,
     formData, onProgress)`, where `onProgress` maps the matching `tempId` entry's `progress`.
   - Remove the entry from the progress list in `finally` (success and failure both clear it —
     on success the file already appears via the normal `setXFiles((prev) => [...prev,
     newAsset])`; on failure the existing `*UploadError` text is unchanged).
   - **Remove** the existing `setUploading{Step}(true)`/`setUploading{Step}(false)` calls from
     inside each handler. Instead, derive it at the JSX call site:
     `uploading={businessFactsUploadProgress.length > 0}` (etc., one per step) — see Deviation
     note below for why.
3. Add the `uploadProgress?: { id: string; name: string; progress: number }[]` prop + rendering
   block to `FileUploadBox` and identically to `HtmlMockupFileList`, per the Code Context target
   shape above, inserted between the drop-zone button and the completed-`files.map(...)` block.
4. Update all 6 JSX call sites to pass `uploadProgress={{step}UploadProgress}` and the derived
   `uploading={{step}UploadProgress.length > 0}`.
5. Add `handleViewBusinessFactsFile` (mirroring `handleViewOutcomeFile` exactly, operating on
   `businessFactsFiles`) and `viewingBusinessFactsFileId` state; wire `onView=
   {handleViewBusinessFactsFile}` and `viewingId={viewingBusinessFactsFileId}` into the Business
   Facts `FileUploadBox` call site (line 1682 pre-edit).
6. Leave the existing `uploading{Step}` state declarations removed (no longer set anywhere) —
   don't leave a dead, never-updated boolean behind.

### Deviation note (pre-approved, included here so `/implement` doesn't need to re-litigate it)

Task 149 already fires all N files from one drop concurrently (`handleFiles` calls `onFile`
once per file inside a `forEach`, not awaited). That means each step's single `uploading{Step}`
boolean was already racing across concurrent calls to the same handler — e.g. dropping 3 files,
the first to finish sets `uploading` back to `false` while the other 2 are still in flight,
prematurely re-enabling the drop zone/hiding the "Uploading…" state. This wasn't flagged as an
acceptance criterion in task 149 (single global boolean was "good enough" pre-149 when only one
upload could ever be in flight at a time). Since this task already introduces a per-file
progress-list array for every one of these 6 handlers, deriving `uploading` from
`{step}UploadProgress.length > 0` instead of a separately-maintained boolean removes the race
as a natural side effect, at zero extra cost — there is no reason to keep both a boolean and a
list tracking overlapping information. Flagged explicitly rather than silently folded in.

## Acceptance Criteria

- [ ] Dropping/selecting 1 file on any of the 6 steps shows a live-updating progress row
      (percentage + bar) that disappears once the file finishes, and the file then appears in
      the normal completed list.
- [ ] Dropping/selecting 3+ files at once shows 3+ independent progress rows updating
      concurrently and independently (verify by throttling network in browser devtools, e.g.
      "Fast 3G", to make progress visibly incremental instead of instant).
- [ ] A failed upload (e.g. unsupported type) removes its progress row and shows the existing
      inline error text; other concurrent uploads in the same batch are unaffected.
- [ ] Kickoff/Business Facts: uploaded files show a "View" (eye) button; clicking it opens the
      same in-app `FileViewerModal` used by every other step, rendering the file inline.
- [ ] `disabled` (read-only PM view) still suppresses the drop zone/input entirely on all 6
      steps — unchanged from task 149.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser: open a project's Onboarding Wizard as `admin`/`marketing`/`pm`. On the Kickoff
step, upload a file to Business Facts and confirm (a) a progress bar appears and animates to
100%, and (b) a "View" button appears on the completed file and opens the in-app preview modal.
Repeat the progress-bar check on Outcome Target, Migration Checklist, Content Map, Client
Sign-Off, and HTML Mockup — drop 2-3 files at once on at least one of them to confirm concurrent
independent progress rows. Throttle network (devtools → Network → Slow 3G) on at least one
upload to confirm the percentage genuinely increments rather than jumping straight to 100%.

## Compatibility Touchpoints

- None — client-only change to `_onboarding-wizard.tsx` (shared components + 6 handlers +
  1 new preview handler); no schema, route, or packaging changes. `XMLHttpRequest` is a
  standard browser API already implicitly relied upon everywhere `fetch` is used in this
  codebase's target browsers — no new dependency.

## Implementation Notes

### What Changed
- Added module-scope `UploadProgressEntry`/`UploadedAsset` types and a shared
  `uploadFileWithProgress(url, formData, onProgress)` helper (wraps `XMLHttpRequest` in a
  Promise, reporting `upload.onprogress` as a 0–100 integer), inserted right after
  `formatFileSize` alongside the file's other module-scope utilities.
- All 6 handlers (`handleBusinessFactsUpload`, `handleOutcomeFileUpload`,
  `handleMigrationChecklistUpload`, `handleContentMapUpload`, `handleSignoffUpload`,
  `handleHtmlMockupUpload`) now generate a `crypto.randomUUID()` temp id per call, push a
  `{ id, name, progress: 0 }` entry into a new per-step `{step}UploadProgress` state array,
  route the upload-step request through `uploadFileWithProgress` (updating that entry's
  `progress` via the callback), and remove the entry in `finally` regardless of outcome. The
  second request (`POST .../assets`, DB row creation) is untouched, still plain `fetch`.
- Per the task doc's pre-approved deviation note: each step's old `uploading{Step}` boolean
  state was removed entirely (it raced across concurrent per-file uploads introduced by task
  149 — the first upload to finish would flip it back to `false` while others were still in
  flight). `uploading` is now derived at each JSX call site as
  `{step}UploadProgress.length > 0`, which is race-free by construction since it reflects the
  actual count of in-flight uploads.
- `FileUploadBox` and `HtmlMockupFileList` both gained an optional `uploadProgress?:
  UploadProgressEntry[]` prop, rendered as a new row group (icon + filename + `NN%` + a filled
  bar, `style={{ width: '${p.progress}%' }}` per the CLAUDE.md dynamic-width exception) between
  the drop zone and the existing completed-files list.
- Added `handleViewBusinessFactsFile` + `viewingBusinessFactsFileId` state, an exact mirror of
  `handleViewOutcomeFile`, and wired `onView`/`viewingId` into the Business Facts
  `FileUploadBox` call site — it now opens the same shared `FileViewerModal` every other step
  already uses.
- All 6 call sites updated to pass `uploadProgress={...}` and the derived `uploading={...}`.

### Files Changed
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — per the plan; no other
  files touched. `handleUpload`/`uploadedFiles`/`uploading` (Storage/KB's separate
  `StorageFileExplorer` uploader) intentionally left untouched, matching the task doc's scope
  boundary.

### Deviations From Plan
- None beyond the task doc's own pre-approved deviation (removing the racy per-step `uploading`
  boolean in favor of a derived value), which was written into the plan itself, not decided ad
  hoc during implementation.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual/browser multi-file progress + Kickoff preview verification - SKIPPED (no live
  dev/browser session run this task; deferred to user, consistent with task 149's precedent for
  client-only UI changes in this session)

### Follow-Up Fix (post-handoff, user-reported during testing)

User reported the bar jumps to 100% quickly but then sits with a visible delay before the file
shows as done, and suspected the progress wasn't real. Root cause: `XMLHttpRequest.upload.
onprogress` only measures bytes leaving the browser (the request body being sent) — it hits 100
as soon as the upload's request body is fully written to the socket, which can be well before
the server has finished storing the file and responding, and before the *second* request (`POST
.../assets`, DB row creation) even starts. The implementation was already using real XHR
progress, not a simulation — the gap was a genuine, unrepresented server-processing + second-
request window after byte-transfer completion.

Fix: added an optional `finishing?: boolean` field to `UploadProgressEntry`. Each of the 6
handlers now sets `finishing: true` on its entry immediately after `uploadFileWithProgress`
resolves (bytes fully sent) and before starting the second `fetch` — the entry still only gets
removed in the existing `finally` block once both requests are done. `FileUploadBox`/
`HtmlMockupFileList` render `"Finishing…"` in place of the percentage and add a `animate-pulse`
class to the fill bar while `finishing` is true, so the delay reads as "still working" instead
of "frozen at 100%".

- Files Changed: `_onboarding-wizard.tsx` (same file, no new files)
- Verification: `npx tsc --noEmit` - PASS; `pnpm lint` - PASS; manual browser re-verification
  still deferred to user

### Follow-Up Fix 2 (post-handoff, user-reported on a real 7.8MB PDF)

User reported the bar still went to 100% "after attaching" and then waited 1-2 seconds before
showing done — on a 7.8MB file, large enough that this couldn't be explained away as an
instant small-file upload. Traced the actual gap: the first Follow-Up Fix set `finishing: true`
only *after* `uploadFileWithProgress`'s promise resolved — i.e., after `xhr.onload` had already
fired, which only happens once the server finishes processing the request and sends its
response. But `upload.onprogress` reaches 100% as soon as the browser finishes writing the
request body to the socket, well before the server (which still has to write a 7.8MB file to
Supabase Storage and respond) gets there. So the real 1-2 second wait sat entirely *inside*
`uploadFileWithProgress`, between the last `onprogress` event and `xhr.onload` — a window the
previous fix never covered, since its `finishing: true` call only ran after that gap had
already closed.

Fix: moved the `finishing` transition into the `onProgress` callback itself —
`{ ...p, progress: pct, finishing: pct >= 100 }` — so it flips the instant byte-transfer
completes, not after the full server round trip. This now covers the entire real gap: request
body fully sent → server writes to Storage + responds → second `fetch` creates the DB row. The
original post-resolve `finishing: true` call was left in place as a fallback for the rare case
`lengthComputable` is `false` and no progress event ever fires.

- Files Changed: `_onboarding-wizard.tsx` (same file, no new files)
- Verification: `npx tsc --noEmit` - PASS; `pnpm lint` - PASS; manual browser re-verification
  still deferred to user

### Follow-Up Fix 3 (post-handoff, user-requested on a real 25.4MB image)

User confirmed the fast 100% jump is genuinely correct (fast upload bandwidth — 250 Mbps ≈ 31
MB/s, well under a second for a 25MB file over the wire — not fake), but asked for "an actual
loading state, not just a fancy progress bar" for the remaining `finishing` window. Traced the
server route (`/api/customers/[customerId]/assets/upload/route.ts:74-79`): it buffers the whole
file into a `Buffer` then makes one atomic `adminClient.storage.from(...).upload(...)` call via
the standard `supabase-js` client (a single `fetch` PUT internally, no progress callback
exposed) — so there is no real percentage available for that phase today, and a pulsing *bar*
during it visually implies measured progress that doesn't exist. Confirmed this codebase's
established convention for exactly this ("still working, duration unknown") is a spinning
`Loader2` icon (`animate-spin`) — used in `_milestone-panel.tsx`, `_task-drawer.tsx`,
`_project-detail.tsx`, `admin/migrate/page.tsx`, etc.

Fix: added `Loader2` to the file's `lucide-react` import. While `finishing`, the status text is
replaced with a small spinning `Loader2` + "Finishing…" (matching the established pattern
exactly), and the fill bar's `animate-pulse` was removed — it now just sits solid/full, an
honest static representation of "the measured part is done," with the spinner carrying the
"still working, no known duration" signal instead of the bar pretending to.

Also answered a related architecture question the user raised (kept out of code — no changes
made): whether to switch to Server-Sent Events for the `finishing` phase. Confirmed SSE alone
wouldn't help, since the server has no granular progress to stream in the first place under the
current buffer-then-atomic-upload approach — real end-to-end percentage would require switching
the Storage write to a chunked/resumable protocol (e.g. Supabase's TUS support) first, which is
a materially larger change to the upload route's core mechanics. Recommended against it given
the wait is a few seconds even at 25MB, and flagged it as its own future task if ever wanted.

- Files Changed: `_onboarding-wizard.tsx` (same file, no new files)
- Verification: `npx tsc --noEmit` - PASS; `pnpm lint` - PASS; manual browser re-verification
  still deferred to user

## Final Status

User live-tested across three rounds (an initial pass, a 7.8MB PDF, and a 25.4MB image) and
approved the result after Follow-Up Fix 3. Net state of `_onboarding-wizard.tsx` at completion:

- Real per-file upload progress (`XMLHttpRequest.upload.onprogress`, not simulated) across all
  6 `FileUploadBox`/`HtmlMockupFileList` upload handlers (Business Facts, Outcome Target,
  Migration Checklist, Content Map, Client Sign-Off, HTML Mockup).
- A `finishing` sub-state (spinning `Loader2` + "Finishing…", matching this codebase's
  established loading-state convention) covers the server-side window `upload.onprogress` can't
  see — Storage write + response + the second asset-record request — so the wait reads as
  "still working" rather than "frozen at 100%."
- Kickoff/Business Facts got the `onView`/`FileViewerModal` preview every other step already
  had (`handleViewBusinessFactsFile`), closing the one gap in that pattern.
- Storage/KB's separate `StorageFileExplorer` uploader was left untouched throughout, per the
  task doc's original scope boundary — not revisited in any of the three follow-ups.
- `npx tsc --noEmit` and `pnpm lint` pass clean as of the final change. All manual verification
  was done live by the user in the browser across the three follow-up rounds; no independent
  browser re-verification was run in-session beyond that.

**Status: Completed** (2026-07-15).
