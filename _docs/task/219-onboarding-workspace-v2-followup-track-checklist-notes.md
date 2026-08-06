# 219: Onboarding Workspace v2 Follow-Up — Programme Track Dates/Overdue Redesign, Checklist Alert Dot, Business-Facts RTE Tweak, Notes File Card Upgrade

**Created:** 2026-08-06
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** deep

---

## Overview

Follow-up to task 217 (Onboarding Workspace v2 design redesign at `/v2/portfolio-tracker/[projectId]/v2`). Four independent changes against the shipped sandbox:

1. **Programme track** (`ProgrammeTrack`, rendered in `WorkspaceHeader`): show the real calendar date next to "Day 1" and "Day 15" in the footer, drop the "Migrate & Rebrand starts" milestone label, and redesign the overdue state — "DAY 21 OF 15" becomes "N DAYS OVERDUE", the "N SECTIONS OVERDUE" text becomes a clickable "REVIEW CHECKLIST" link that jumps to the Checklist tab, and the whole track card gets a red border when the phase itself is overdue.
2. **Checklist tab alert dot** — a small red dot on the top-right corner of the "Checklist" tab in the underline tab bar when there's something to review (mirrors the track's own overdue signal).
3. **Business facts RTE** — placeholder copy change + one more visible row of height.
4. **Notes file cards** (Business Info tab) — add a file-size line, a file-type-aware icon, swap "Open" for separate eye (in-app preview modal) and download buttons, and add real uploader attribution.

### Gap found during investigation (blocks item 4 as literally requested)

`customer_assets` (the table backing every file in this feature, including Notes) has **no uploader column** — confirmed in `src/types/database.ts` and `_wizard-v2-types.ts`'s `AssetRow`. Task 217 hit this same gap and explicitly omitted uploader names everywhere in this feature area for that reason.

**Asked the user directly; answer: add a migration and track it properly, not omit it.** This task therefore includes a new migration (see Proposed File Changes) rather than scoping the name out.

A second, non-obvious gap surfaced while designing how to *display* that name: `profiles` RLS (migration 026, tightened in 048) only allows a user to read their own row, or every row if they're `admin`/`super_admin`. The Onboarding Workspace is also usable by `pm` and `marketing` roles (`WIZARD_ROLES` in `_onboarding-wizard-v2.tsx`), who would see blank uploader names for any file they didn't upload themselves under that policy. The existing `/api/staff-directory` route has this exact same latent bug today (it queries `profiles` with the RLS-bound client but is only reachable — and expected to return full results — for `admin`/`super_admin`/`pm`/`marketing`); this task does not fix that pre-existing route, but it must not repeat the same mistake for the new uploader-name feature. The fix is a minimal, precedented RLS widen (`projects_staff_read` already does exactly this shape of "all non-client staff roles" policy) — see migration below. Flagging the staff-directory bug here for awareness; a separate task should fix it if the requester wants that resolved too, since it's out of this task's stated scope.

## Requirements

- [ ] **Programme track dates.** `ProgrammeTrack`'s footer row shows the real calendar date beside both "Day 1" and "Day 15" in parentheses, e.g. `Day 1 (AUG 1, 2026)` / `Day 15 (AUG 15, 2026)`, computed from `programme_started_at` (already fetched in `_onboarding-wizard-v2.tsx`, just not threaded down). Reuse the existing `formatDate()` util from `@/lib/utils` (`.toUpperCase()`'d) — do not write a new date formatter.
- [ ] **Remove the milestone label.** Drop `milestoneLabel` (`"Migrate & Rebrand starts"`, sourced from `PHASE2.name`) entirely — prop, footer JSX, and the now-dead `PHASE2` constant in `_onboarding-wizard-v2.tsx`.
- [ ] **Overdue state — "N DAYS OVERDUE".** When `currentDay > dayEnd` (`isOverdue`), the label row shows `{currentDay - dayEnd} DAY(S) OVERDUE` instead of `DAY {currentDay} OF {dayEnd}`. Non-overdue state is unchanged.
- [ ] **Overdue state — "REVIEW CHECKLIST" link.** Whenever `overdueCount > 0` (independent of whole-phase `isOverdue`), replace the plain `"{N} SECTIONS OVERDUE"` text with a clickable link/button labeled `REVIEW CHECKLIST` that switches to the Checklist tab (reuse the existing `onTabChange`/`setTab` plumbing already in `WorkspaceHeader` — no new navigation mechanism).
- [ ] **Overdue state — red border.** The track's card container (`cardCls`) gets a red border (`border-[#C0392B]`, the codebase's existing `--late` token, already used elsewhere in this component) when `isOverdue`.
- [ ] **Checklist tab alert dot.** `UnderlineTabs` gains an optional `alert?: boolean` per-tab flag that renders a small red dot at the tab's top-right corner. `WorkspaceHeader` sets it on the Checklist tab when `overdueCount > 0` (same signal driving the "REVIEW CHECKLIST" link above).
- [ ] **Business facts placeholder.** Change `RichTextField`'s placeholder text (in `_business-info-tab.tsx`'s `KickoffFields`) from `"Start typing, or paste from the kickoff notes…"` to `"Start typing, or paste from your notes…"`.
- [ ] **Business facts RTE height.** Add one more visible row to the fixed-height editor box in `RichTextField` (`_shared-ui.tsx`) — currently `min-h-[192px] max-h-[192px]` (fixed, min===max, per task 217's own prior follow-up); bump both to `216px` (+24px ≈ one row at this editor's line-height).
- [ ] **Notes card — file size line.** Add a line under the filename and above/beside the "Uploaded" line showing `formatFileSize(file.file_size)` (already exported from `_shared-ui.tsx`, already used identically in `_file-tile.tsx`) — e.g. `2.5 KB · Uploaded 1m ago by Danessa`. Use the codebase's existing `·` separator convention for this exact size+uploaded pairing (`_file-tile.tsx:267`), not a literal `|` — the `|` in the request read as the user's own shorthand notation, not a literal separator instruction.
- [ ] **Notes card — uploader attribution.** Append `by {uploader_name}` to the uploaded line when present; omit the `by …` clause entirely when `uploader_name` is null (historic files uploaded before this migration, or a since-deleted user — `on delete set null`). Requires the migration below plus wiring described in Proposed File Changes.
- [ ] **Notes card — file-type icon.** Replace the static `FileText` icon badge with a type-aware icon/color (HTML, DOC/DOCX, XLS/XLSX, PDF, MD, CSV, image, generic-fallback) driven by `file.file_mime_type`, sourced from a single shared mapping (extend `_file-previews.tsx`'s existing `FILE_TYPE_TILES`, don't duplicate mime-testing logic in a second place).
- [ ] **Notes card — eye button opens an in-app preview modal.** Replace the "Open" button with an eye-icon button that opens a new `FilePreviewModal` (new export in `_file-previews.tsx`, same overlay/card shell `_rename-move-modals.tsx`/`_access-tab.tsx` already use) rendering the file in-place — reuse `HtmlPreview`/`MarkdownPreview`/`CsvPreview` for those mime types, a plain `<img>` for images, a native `<iframe src={url}>` for PDF (browsers render PDF natively, no plugin), and the existing `FileTypeTile` fallback + a "Preview isn't available — use Download" note for DOC/DOCX/XLS/XLSX. Do **not** open the file in a new browser tab.
- [ ] **Notes card — download button.** Add a second icon button (Download, lucide) beside the eye button. Fetches a signed URL with `?download=1` (see the additive `file-url` route change below) so the browser downloads the file with its real filename via `Content-Disposition: attachment`, instead of navigating.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Out of Scope / Must-Not-Change

- **Files tab (`_files-tab.tsx`/`_file-tile.tsx`) file cards are untouched** — this task's Notes-card upgrade (icon, size, preview modal, download) is scoped to `_business-info-tab.tsx`'s `NoteFileCard` only. If the requester wants the same treatment on the Files tab grid/list, that's a separate follow-up (`_file-tile.tsx`'s own kebab-menu "View" still opens a new tab, unchanged).
- **Do not fix `/api/staff-directory`'s pre-existing RLS gap** (see Gap Found above) — flagged for awareness only, not in scope here. Its own follow-up task if wanted.
- **`ProgrammeTrack`'s two call sites collapsed to one after task 217's Follow-Up #2** (the Checklist tab's own copy was removed as duplicate) — do not re-add a second `<ProgrammeTrack>` render to `_checklist-tab.tsx`.
- **No change to `allDeliverablesDone`/CTA gating logic, undo-delete behavior, upload-queue/progress behavior, or any other task-217 requirement not listed above.**
- **Historic files uploaded before this migration ships will show no uploader name** (column is null, no backfill possible — there's no data anywhere recording who uploaded them). This is expected, not a bug to chase.

## Proposed File Changes

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/096_customer_assets_uploaded_by.sql` | Create | Adds `uploaded_by uuid references profiles (id) on delete set null` to `customer_assets`; widens `profiles` SELECT RLS to include `pm`/`marketing`/`developer`/`hr` (mirrors `projects_staff_read`'s existing shape) so the uploader-name join actually resolves for every Wizard-accessible role, not just admins. |
| `src/types/database.ts` | Modify (additive) | Add `uploaded_by: string \| null` to `customer_assets` Row/Insert/Update. |
| `.../v2/_wizard-v2-types.ts` | Modify (additive) | Add `uploaded_by: string \| null` and `uploader_name?: string \| null` to `AssetRow`. |
| `src/app/api/customers/[customerId]/assets/route.ts` | Modify | POST: set `uploaded_by: user.id` on insert. GET: embed-join `profiles!customer_assets_uploaded_by_fkey(full_name)` and flatten it to `uploader_name` on each returned row (additive field, existing `canSeeAsset` visibility filter unchanged). |
| `src/app/api/customers/[customerId]/assets/[assetId]/file-url/route.ts` | Modify (additive) | Accept `?download=1`; when set, pass `{ download: fileName ?? true }` as `createSignedUrl`'s third argument (Supabase Storage's own `Content-Disposition: attachment` support) instead of the default inline URL. Requires widening the existing `select("type, file_path, allowed_roles, allowed_user_ids")` to also fetch `file_name`. |
| `.../v2/_file-previews.tsx` | Modify | Extend `FILE_TYPE_TILES` with html/markdown/csv/image entries (currently only Word/Excel/PDF); extract a `getFileTypeMeta(mime)` helper so `FileTypeTile` and the new Notes-card icon share one mapping. Add new export `FilePreviewModal({ fileName, mimeType, url, onClose })`. |
| `.../v2/_shared-ui.tsx` | Modify | `RichTextField`: bump fixed editor height `192px` → `216px` (min and max both). |
| `.../v2/_programme-track.tsx` | Modify | Remove `milestoneLabel` prop; add `startedAt: string \| Date \| null` and `onReviewChecklist: () => void` props. Footer shows per-day dates; label row shows "N DAYS OVERDUE" + "REVIEW CHECKLIST" link; card border turns red when overdue. |
| `.../v2/_workspace-header.tsx` | Modify | Thread `startedAt` through to `<ProgrammeTrack>`; pass `onReviewChecklist={() => onTabChange("checklist")}`; add `alert: overdueCount > 0` to the Checklist entry in the `UnderlineTabs` `tabs` array. |
| `.../v2/_onboarding-wizard-v2.tsx` | Modify | Store `programme_started_at` in state (new `programmeStartedAt`); pass to `WorkspaceHeader` as `startedAt`; remove the `milestoneLabel={...PHASE2.name...}` prop and the now-unused `PHASE2` constant. |
| `.../v2/_business-info-tab.tsx` | Modify | `RichTextField` placeholder copy change. `NoteFileCard`: file-size line, uploader `by …` clause, type-aware icon via `getFileTypeMeta`, eye+download icon buttons replacing "Open", wired to a local `FilePreviewModal` instance. |

## Code Context

### `_programme-track.tsx` — current footer/label rows (full file already read; only the relevant excerpt shown)
```tsx
<span className={cn("font-mono text-[11px]", isOverdue ? "text-[#C0392B] font-semibold" : "text-[#5F6A88]")}>
  DAY {currentDay} OF {dayEnd}
  {typeof overdueCount === "number" && overdueCount > 0 && (
    <>&nbsp;·&nbsp;{overdueCount} SECTION{overdueCount === 1 ? "" : "S"} OVERDUE</>
  )}
</span>
...
<div className={cn(cardCls, "px-5 py-4")}>   {/* ← add isOverdue && "border-[#C0392B]" here */}
...
<div className="flex justify-between mt-1.5 font-mono text-[9px] uppercase text-[#5F6A88]">
  <span>Day {dayStart}</span>
  <span>Day {dayEnd} · {milestoneLabel}</span>   {/* ← milestoneLabel goes away; add per-day date */}
</div>
```
New label-row shape:
```tsx
{isOverdue ? (
  <>{currentDay - dayEnd} DAY{currentDay - dayEnd === 1 ? "" : "S"} OVERDUE</>
) : (
  <>DAY {currentDay} OF {dayEnd}</>
)}
{typeof overdueCount === "number" && overdueCount > 0 && (
  <>
    &nbsp;·&nbsp;
    <button type="button" onClick={onReviewChecklist} className="underline underline-offset-2 font-semibold cursor-pointer border-none bg-transparent p-0 font-mono text-[11px] text-inherit hover:text-[#0063D6]">
      REVIEW CHECKLIST
    </button>
  </>
)}
```
Date helper (local to this file, reuses the shared `formatDate` util rather than a bespoke one):
```tsx
import { formatDate } from "@/lib/utils";

function dateForDay(startedAt: string | Date, day: number): Date {
  const start = new Date(startedAt);
  const midnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  midnight.setDate(midnight.getDate() + (day - 1)); // Day 1 === startedAt's own date
  return midnight;
}
```
Footer:
```tsx
<span>Day {dayStart}{startedAt && ` (${formatDate(dateForDay(startedAt, dayStart)).toUpperCase()})`}</span>
<span>Day {dayEnd}{startedAt && ` (${formatDate(dateForDay(startedAt, dayEnd)).toUpperCase()})`}</span>
```

### `_shared-ui.tsx` — `UnderlineTabs` (add `alert` dot)
```tsx
export function UnderlineTabs<T extends string>({ tabs, active, onChange }: {
  tabs: { id: T; label: string; count?: string; alert?: boolean }[]; active: T; onChange: (id: T) => void;
}) {
  // ...existing button markup...
  {tab.alert && <span className="absolute -top-0.5 -right-2 w-1.5 h-1.5 rounded-full bg-[#C0392B]" />}
```
`WorkspaceHeader`'s tabs array gains `alert: overdueCount > 0` on the `checklist` entry only.

### `_file-previews.tsx` — current `FILE_TYPE_TILES` (Word/Excel/PDF only; extend, don't duplicate)
```tsx
const FILE_TYPE_TILES: { test: (mime: string) => boolean; Icon: typeof FileText; bg: string; fg: string; label: string }[] = [
  { test: (m) => WORD_MIME_TYPES.includes(m), Icon: FileText, bg: "bg-[#E5F1FF]", fg: "text-[#007BFF]", label: "DOC" },
  { test: (m) => EXCEL_MIME_TYPES.includes(m), Icon: FileSpreadsheet, bg: "bg-[#E3F6EA]", fg: "text-[#177E48]", label: "XLS" },
  { test: (m) => m === "application/pdf", Icon: FileText, bg: "bg-[#FDE8E6]", fg: "text-[#C0392B]", label: "PDF" },
];
export function FileTypeTile({ mime }: { mime: string }) { /* uses FILE_TYPE_TILES + default fallback */ }
```
Add entries for `text/html` (html), `text/markdown` (md), `text/csv` (csv), `image/*` (img) — reuse existing MIME lists already defined in `_files-tab.tsx`'s `MIME_LABELS`/`ALLOWED_UPLOAD_TYPES` for the exact label strings so they stay in sync. Extract:
```tsx
export function getFileTypeMeta(mime: string) {
  const match = FILE_TYPE_TILES.find((t) => t.test(mime));
  return { Icon: match?.Icon ?? FileText, bg: match?.bg ?? "bg-[#F4F6FB]", fg: match?.fg ?? "text-[#5F6A88]", label: match?.label ?? null };
}
```
`FileTypeTile` becomes a thin wrapper over `getFileTypeMeta`; `NoteFileCard` calls `getFileTypeMeta` directly for its small icon badge (no tile/label needed there, just `Icon`+`fg`+`bg` on the existing `w-8.5 h-8.5 rounded-[9px]` span).

### `_file-previews.tsx` — new `FilePreviewModal` (shell copied from `_rename-move-modals.tsx`'s established pattern)
```tsx
export function FilePreviewModal({ fileName, mimeType, url, onClose }: { fileName: string; mimeType: string; url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071133]/60 p-4" onClick={onClose}>
      <div className={cn(cardCls, "w-full max-w-3xl h-[80vh] shadow-xl overflow-hidden flex flex-col")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#EDF0F7] shrink-0">
          <h2 className={cn("text-[14px] font-semibold truncate", textPrimary)}>{fileName}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className={cn("p-2 rounded-md cursor-pointer border-none bg-transparent hover:bg-[#5F6A88]/10 transition-colors shrink-0", textMuted)}>
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          {mimeType.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL, same as FileThumbnail's existing precedent
            <img src={url} alt={fileName} className="w-full h-full object-contain bg-[#F4F6FB]" />
          ) : mimeType === "text/html" ? <HtmlPreview url={url} />
          : mimeType === "text/markdown" ? <MarkdownPreview url={url} />
          : mimeType === "text/csv" ? <CsvPreview url={url} />
          : mimeType === "application/pdf" ? <iframe src={url} title={fileName} className="w-full h-full border-0" />
          : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16"><FileTypeTile mime={mimeType} /></div>
              <p className="text-[12px] text-[#5F6A88]">Preview isn&apos;t available for this file type — use Download instead.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```
Needs `cardCls`, `textPrimary`, `textMuted` imported from `./_shared-ui` and `X` from `lucide-react` (both new imports for this file).

### `assets/[assetId]/file-url/route.ts` — current (no download support)
```tsx
export async function GET(_request: NextRequest, { params }: { params: Promise<{ customerId: string; assetId: string }> }) {
  ...
  const { data: asset, error } = await supabase.from("customer_assets")
    .select("type, file_path, allowed_roles, allowed_user_ids") // ← add file_name
    ...
  const { data: signed, error: signError } = await adminClient.storage
    .from("customer-assets")
    .createSignedUrl(asset.file_path, 60); // ← add options arg conditionally
```
New:
```tsx
export async function GET(request: NextRequest, { params }: { params: Promise<{ customerId: string; assetId: string }> }) {
  ...
  .select("type, file_path, file_name, allowed_roles, allowed_user_ids")
  ...
  const download = new URL(request.url).searchParams.get("download") === "1";
  const { data: signed, error: signError } = await adminClient.storage
    .from("customer-assets")
    .createSignedUrl(asset.file_path, 60, download ? { download: asset.file_name ?? true } : undefined);
```

### `assets/route.ts` — POST (add `uploaded_by`) and GET (add uploader join)
```tsx
// POST insert — add one field:
.insert({
  customer_id: customerId,
  type,
  ...
  uploaded_by: user.id,
})

// GET — embed join, same syntax already used in _load-detail-data.ts (profiles!<table>_<col>_fkey):
const { data, error } = await supabase
  .from("customer_assets")
  .select("*, uploader:profiles!customer_assets_uploaded_by_fkey(full_name)")
  .eq("customer_id", customerId)
  .order("created_at", { ascending: true });
...
const visible = (data ?? [])
  .filter((a) => canSeeAsset(myRole, user.id, a.allowed_roles, a.allowed_user_ids))
  .map((a) => ({ ...a, uploader_name: a.uploader?.full_name ?? null }));
```

### `_business-info-tab.tsx` — current `NoteFileCard` (full function already read above)
Add, in order: filename (unchanged) → new size line (`{formatFileSize(file.file_size)} · Uploaded {formatRelativeTime(file.created_at)}{file.uploader_name ? \` by ${file.uploader_name}\` : ""}\`) → icon badge driven by `getFileTypeMeta(file.file_mime_type ?? "")` instead of the hardcoded `<FileText>` → replace the single "Open" button with two `IconTip`-wrapped icon buttons (`Eye` → opens `FilePreviewModal` state, `Download` → fetches `file-url?download=1` and triggers a hidden-anchor download), matching the existing icon-button visual weight already used elsewhere in this file (the competitor-URL remove button: `w-9 h-9 rounded-[9px] border border-[#E2E7F2] ... hover:border-[#C0392B]` — reuse that sizing, swap the hover color per action).

### `_onboarding-wizard-v2.tsx` — current fetch effect (only the relevant line)
```tsx
if (data.programme_started_at) setCurrentDay(getCurrentProgrammeDay(data.programme_started_at));
```
Add a sibling `programmeStartedAt` state set alongside this, and remove the `PHASE2` constant (line 22) plus the `milestoneLabel={\`${PHASE2.name} starts\`}` prop (line 351) once `WorkspaceHeader` no longer accepts it.

## Implementation Steps

1. Write migration `096_customer_assets_uploaded_by.sql`: add `uploaded_by` column to `customer_assets`; widen `profiles` SELECT RLS (drop/recreate `profiles_read_own` to include `pm`, `marketing`, `developer`, `hr` alongside the existing `auth.uid() = id or role in (admin, super_admin)`, mirroring `projects_staff_read`'s exact role list style from migration 048).
2. Update `database.ts` (`customer_assets` Row/Insert/Update) additively.
3. `assets/route.ts`: POST sets `uploaded_by: user.id`; GET adds the `profiles!customer_assets_uploaded_by_fkey(full_name)` embed and flattens to `uploader_name`.
4. `assets/[assetId]/file-url/route.ts`: widen the select to include `file_name`; add `?download=1` handling.
5. `_wizard-v2-types.ts`: add `uploaded_by`/`uploader_name` to `AssetRow`.
6. `_file-previews.tsx`: extend `FILE_TYPE_TILES`, extract `getFileTypeMeta`, add `FilePreviewModal`.
7. `_shared-ui.tsx`: bump `RichTextField`'s fixed height to 216px; `UnderlineTabs` gains `alert` dot support.
8. `_programme-track.tsx`: remove `milestoneLabel`, add `startedAt`/`onReviewChecklist`, implement the date footer, "N DAYS OVERDUE" label, "REVIEW CHECKLIST" link, red border.
9. `_workspace-header.tsx`: thread `startedAt` and `onReviewChecklist` to `ProgrammeTrack`; add `alert` to the Checklist tab entry.
10. `_onboarding-wizard-v2.tsx`: store `programmeStartedAt`, pass to `WorkspaceHeader`, drop `PHASE2`/`milestoneLabel`.
11. `_business-info-tab.tsx`: placeholder copy; `NoteFileCard` rewrite (size line, uploader clause, type icon, eye/download buttons, local preview-modal state).
12. Apply the migration; re-verify `getFileTypeMeta`'s labels line up with `_files-tab.tsx`'s `MIME_LABELS` so the two don't drift.
13. Manual browser QA (see Verification).
14. `git status`/`git diff` — confirm the migration is new, and every other touched path is one of the files listed above.

## Acceptance Criteria

- [ ] Programme track footer shows real calendar dates beside Day 1 and Day 15; no "Migrate & Rebrand starts" text anywhere.
- [ ] An overdue project (`currentDay > dayEnd`) shows "N DAYS OVERDUE" (not "DAY N OF M") and a red-bordered track card.
- [ ] Any project with `overdueCount > 0` shows a working "REVIEW CHECKLIST" link that switches to the Checklist tab, replacing the old plain-text "N SECTIONS OVERDUE".
- [ ] The Checklist tab shows a red dot when `overdueCount > 0`, and no dot otherwise.
- [ ] Business facts placeholder reads "Start typing, or paste from your notes…"; the editor box is visibly one row taller than before.
- [ ] A Notes-folder file card shows: type-aware icon, filename, a size+uploaded(+by name where known) line, an eye button that opens an in-app modal preview (no new tab), and a download button that downloads the real file with its original name.
- [ ] Uploading a new file from now on records `uploaded_by`; its Notes card shows "by {name}" for every role in `WIZARD_ROLES` (admin, super_admin, marketing, pm), not just admins.
- [ ] Pre-existing files (uploaded before the migration) show no "by …" clause — no fabricated name.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.
- [ ] `git status` shows only the migration plus the files listed in Proposed File Changes as touched.

## Verification

```bash
npx tsc --noEmit
pnpm lint
git status   # migration + the listed .../v2/* and API route files only
# Manual, browser-based (no test runner configured per CLAUDE.md):
# 1. Open a project whose programme_started_at makes it currently overdue (or temporarily
#    adjust one) — confirm "N DAYS OVERDUE", the red track border, and "REVIEW CHECKLIST"
#    switching to the Checklist tab.
# 2. Open a non-overdue project — confirm "DAY N OF M" and the per-day dates in the footer,
#    with no milestone text.
# 3. Confirm the Checklist tab's red dot appears only when overdueCount > 0.
# 4. Business Info: confirm the new placeholder text and the taller Business facts box.
# 5. Upload a file into the Notes folder as a pm (or marketing) user — not admin — and confirm
#    the resulting card shows "by <that user's name>", not blank.
# 6. Click the eye icon on a Notes file of each representative type (html, md, csv, pdf, image,
#    docx) — confirm each opens the in-app modal (not a new tab) with the right rendering or the
#    documented "preview not available" fallback for docx.
# 7. Click download — confirm the browser downloads the file (not a navigation) with the correct
#    original filename.
# 8. Confirm a file uploaded before this migration (if one exists in test data) shows no "by …".
```

## Compatibility Touchpoints

- **New Supabase migration** (`096_customer_assets_uploaded_by.sql`) — the one deviation from task 217's own "no migration" constraint, explicitly requested and approved by the user for this follow-up task specifically.
- `profiles` RLS widen affects every other consumer of that table's SELECT policy — re-verify `/api/staff-directory`, permission pickers, and any other profiles-reading route still behaves correctly (this widen is a superset of the existing policy — it should only ever add visibility, never remove any).
- `_docs/mcp-tools.md` — not affected, no MCP tool changes.
- Does not touch task 204's Phase-2 gating, task 202's route boundary, or anything already shipped by task 217 beyond the four items listed here.

## Implementation Notes

### What Changed
- Programme track: real per-day dates in the footer (via the existing `formatDate()` util), "Migrate & Rebrand starts" milestone label removed, "N DAYS OVERDUE" replacing "DAY N OF M" when the phase itself is overdue, a "REVIEW CHECKLIST" link replacing the old plain "N SECTIONS OVERDUE" text, and a red card border on overdue.
- Checklist tab now shows a red alert dot in the underline tab bar whenever `overdueCount > 0`.
- Business facts RTE: placeholder copy updated; fixed editor height bumped 192px → 216px (one more row).
- Notes file cards: file-size line, uploader attribution (`by {name}`), a type-aware icon (extended the existing `FILE_TYPE_TILES` mapping in `_file-previews.tsx` with html/md/csv/image entries, extracted as `getFileTypeMeta` so the grid-tile fallback and the new Notes-card badge share one source of truth), an eye button opening a new in-app `FilePreviewModal` (reuses the existing `HtmlPreview`/`MarkdownPreview`/`CsvPreview` renderers, adds a native `<iframe>` for PDF and the existing `FileTypeTile` fallback + note for Office formats), and a download button that fetches a signed URL with `Content-Disposition: attachment` (via a new `?download=1` param on the existing `file-url` route) and triggers a real download instead of a navigation.
- Migration 096 adds `customer_assets.uploaded_by` (set on every new upload going forward; historic rows stay null, no backfill possible) and widens `profiles`' SELECT RLS policy to include `pm`/`marketing`/`developer`/`hr` alongside the existing `auth.uid() = id or admin/super_admin` — needed so the new `uploader_name` embed actually resolves for every `WIZARD_ROLES` role, not just admins.

### Files Changed
- `supabase/migrations/096_customer_assets_uploaded_by.sql` (new) — `uploaded_by` column + `profiles` RLS widen.
- `src/types/database.ts` — `customer_assets` Row/Insert/Update gain `uploaded_by`; new `customer_assets_uploaded_by_fkey` Relationships entry (required for the embedded-join type to resolve correctly, mirrors the existing `phase_members_user_id_fkey`/`project_members_user_id_fkey` entries).
- `.../v2/_wizard-v2-types.ts` — `AssetRow` gains `uploaded_by` and `uploader_name?`.
- `src/app/api/customers/[customerId]/assets/route.ts` — POST sets `uploaded_by: user.id`; GET embeds `profiles!customer_assets_uploaded_by_fkey(full_name)` and flattens it to `uploader_name` on each visible row.
- `src/app/api/customers/[customerId]/assets/[assetId]/file-url/route.ts` — widened select to include `file_name`; `?download=1` now passes `{ download: fileName ?? true }` to `createSignedUrl`.
- `.../v2/_file-previews.tsx` — `FILE_TYPE_TILES` extended (html/md/csv/image); new `getFileTypeMeta` export; new `FilePreviewModal` export.
- `.../v2/_shared-ui.tsx` — `RichTextField` editor height 192px → 216px; `UnderlineTabs` gained an `alert?: boolean` per-tab dot.
- `.../v2/_programme-track.tsx` — `milestoneLabel` removed; `startedAt`/`onReviewChecklist` added; overdue label/link/border logic rewritten.
- `.../v2/_workspace-header.tsx` — threads `startedAt`/`onReviewChecklist` to `ProgrammeTrack`; adds `alert: overdueCount > 0` to the Checklist tab entry.
- `.../v2/_onboarding-wizard-v2.tsx` — new `programmeStartedAt` state (from the existing `programme_started_at` fetch); `PHASE2` constant and `milestoneLabel` prop removed.
- `.../v2/_business-info-tab.tsx` — placeholder copy change; `NoteFileCard` rewritten (size line, uploader clause, type icon, eye/download buttons, local preview-modal state).

### Deviations From Plan
- **RLS-widen vs. `adminClient` — kept the plan's approach, documented here for the record.** While implementing, found that `.../[projectId]/_load-detail-data.ts` had already hit this exact same `profiles` RLS gap (embedded `profiles!phase_members_user_id_fkey`/`profiles!project_members_user_id_fkey` joins coming back null for pm/marketing callers) and fixed it there with `adminClient` instead of an RLS change, with an explicit comment documenting the tradeoff. Considered switching to match that precedent, but kept the task doc's original RLS-widen plan: it fixes the actual root cause rather than requiring every future profiles-embedding route to remember to reach for `adminClient`, it's a pure superset of the existing policy (adds visibility, removes none), and it avoids growing this codebase's `adminClient`-for-reads footprint further (CLAUDE.md's own stated preference). As a side effect, this also fixes `/api/staff-directory`'s identical pre-existing bug (flagged, not fixed directly, in the task doc's Gap Found section) — a positive, in-scope side effect of the same policy row, not separate work.
- Everything else matches the approved task doc's Requirements/Proposed File Changes with no scope changes.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS (0 errors, 0 warnings).
- `git status` — confirms every changed/new path is either the new migration, this task doc, `TASKS.md`, or one of the files listed above; `_checklist-tab.tsx` and the task-217 doc show as modified but were already dirty before this task started (pre-existing uncommitted work from the prior session), not touched by this implementation.
- `impeccable` design-hook findings — every finding surfaced during this pass was either (a) a pre-existing line re-flagged only because the file was touched elsewhere (confirmed via line-content match against the pre-edit file), or (b) new lines that literally copy an already-established pattern in this exact feature area (`FilePreviewModal`'s modal header/body font sizes copied verbatim from `_rename-move-modals.tsx`). None were new, unprecedented design drift — none required a fix, matching task 217's own precedent of acknowledging rather than "fixing" this feature area's real, intentional sub-13/14px micro-type scale.
- Manual browser QA (overdue states, dates, checklist alert dot, RTE height, Notes card icon/size/uploader/preview-modal/download across representative file types, cross-role uploader-name visibility) — **not run in this pass**, deferred to the `test` stage per this task doc's own Verification section (same precedent task 217 and its follow-ups established).
- The Supabase migration itself has **not been applied** — deferred to the user, same as every prior migration in this project's history (the user applies migrations manually via `supabase db push`, per established project convention observed across tasks 142/other migration-bearing tasks).

### Post-Ship Follow-Up (user feedback, same session)

Four items, reported against `/v2/portfolio-tracker/46305B0C-PROJ-01/v2` in the browser right after implementation:

1. **Preview modal replaced to match the existing, already-shipped one on the original (non-`/v2`) Onboarding Wizard, and the reported click lag fixed.** The user pointed at that wizard's own file-viewer modal (`FileViewerModal`/`FilePreview` in `_onboarding-wizard.tsx`, read-only reference — that file stays off-limits to edit per task 217's boundary and doesn't export these) as what the Notes card's eye button should look and behave like, instead of the smaller bespoke modal built in this task's first pass. Root cause of the lag: my modal only rendered once the signed-URL fetch resolved (`await`ed before any state update), so nothing appeared until the network round-trip completed. The original wizard's `handleViewOutcomeFile` opens the modal state *before* the fetch, showing a "Loading preview…" state while the URL loads — `_business-info-tab.tsx`'s `NoteFileCard.handlePreview` now does the same (no `await` before `setPreviewOpen(true)`). Rebuilt `FilePreviewModal` in `_file-previews.tsx` to match the original's shell exactly: `framer-motion` fade/scale animation, Escape-to-close, `w-[1360px] max-w-[96vw] h-[94vh]` sizing, `#EDF0F7` body background, and its exact dispatch table — including rendering Word/Excel live via Microsoft's Office Online embed (`view.officeapps.live.com/op/embed.aspx?src=...`), which the first pass didn't have (it fell back to "preview not available" for those types). The HTML-mockup viewport-size toggle (desktop/tablet/mobile pills) in the original was intentionally not replicated — it's specific to that wizard's HTML Mockup review step, not requested here, and would be dead UI on a generic Notes file.
2. **Notes-card icon now reuses the real `FileTypeTile`** (the same component already rendering the Files tab's colored type tiles the user referenced as the target look) instead of the small custom rounded-square badge from the first pass, wrapped at a fixed `44px` (`w-11 h-11 rounded-[10px] overflow-hidden`) size for the compact row. This guarantees the Notes card and Files tab render file types with pixel-identical icon/color/label, rather than a second, hand-tuned color mapping that could drift from it.
3. **Uploader name shortened to "First I" form** (e.g. "Dannea M", not "Dannea Mendoza") via a new local `shortUploaderName()` helper in `_business-info-tab.tsx` — first token kept in full, second token reduced to its capitalized initial, single-word names passed through unchanged. Applied only at the Notes-card display layer; `uploader_name` itself (and the DB `uploaded_by` column) still carries the full name, so nothing upstream lost precision.
4. **Checklist tab's alert dot, tab-to-count spacing, and count styling reworked in `UnderlineTabs`** (`_shared-ui.tsx`): the tab count (previously plain gray mono text, e.g. "2/7") is now a small neutral pill (`bg-[#EDF0F7] text-[#5F6A88] rounded-full px-1.5 py-0.5`, font-mono, matching this codebase's existing pill-badge convention already used elsewhere, e.g. `_file-tile.tsx`'s `PermissionBadge` — not a new orange color, since the reference image was read as "put it in a pill shape," not "use that exact orange" for a persistent (non-transient) tab count). Gap between the label and the pill widened (`ml-1` → `ml-2`). The red alert dot no longer floats above the tab label on its own — it's now anchored to the count pill's own top-right corner (`absolute -top-1 -right-1` relative to the pill, not the whole button) with a `ring-2 ring-white`, so it visually sits on/overlaps the pill's rounded corner with a clipped look, matching a standard notification-badge treatment instead of floating free in empty space above the text.

Files changed: `_file-previews.tsx` (`FilePreviewModal` rebuilt, `motion` import added), `_business-info-tab.tsx` (`NoteFileCard` — preview-open-before-fetch pattern, `FileTypeTile` icon, `shortUploaderName`), `_shared-ui.tsx` (`UnderlineTabs` — pill count + repositioned alert dot). No existing file outside this task's established scope touched.

`npx tsc --noEmit` and `pnpm lint` — both PASS, no errors, no warnings, after this round.

Manual browser re-verification of this specific round (preview-modal parity + lag fix across representative file types including a Word/Excel file for the new Office Online path, icon match against the Files tab, shortened uploader name, checklist dot/pill placement) — not run in this pass; still pending at the `test` stage along with the rest of the deferred manual QA noted above.

### Post-Ship Follow-Up #2 (user feedback, same session)

Reported: a markdown file opened in the new preview modal showed a native scrollbar track but wouldn't actually scroll (mouse wheel/drag had no effect).

**Root cause:** `HtmlPreview` and `MarkdownPreview` in `_file-previews.tsx` both render their content inside a sandboxed `<iframe>` with `pointer-events-none` hardcoded on the class list. That's correct for their original call site (`_file-tile.tsx`'s `FileThumbnail`, a small grid/list thumbnail that shouldn't intercept clicks meant for the tile underneath it — task 198's original intent) but wrong for `FilePreviewModal`'s `PreviewBody`, which reuses the same two components as the actual full-size, interactive preview. `pointer-events-none` blocks the iframe from receiving wheel/drag events at all, so the scrollbar shown by the iframe's own document had nothing to respond to.

**Fix:** both components gained an optional `interactive?: boolean` prop (default `false`, so `_file-tile.tsx`'s existing call sites are unaffected — no prop passed there, same inert-thumbnail behavior as before) that conditionally drops `pointer-events-none` from the iframe's class list. `_file-previews.tsx`'s own `PreviewBody` (used only inside `FilePreviewModal`) now passes `interactive` on both. `CsvPreview` needed no change — it was already a real scrollable `<div>`/`<table>`, not an iframe.

Files changed: `_file-previews.tsx` only.

`npx tsc --noEmit` and `pnpm lint` — both PASS, no errors, no warnings.

Manual browser re-verification (scroll/select working inside the modal for a markdown file, and confirming the Files-tab thumbnails still render inert as before) — not run in this pass; still pending at the `test` stage along with everything else deferred there.
