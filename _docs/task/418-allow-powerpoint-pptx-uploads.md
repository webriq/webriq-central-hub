# 418: Allow Presentations (`.ppt` / `.pptx` / `.pps` / `.ppsx` / `.odp`) on the Projects Files Tab and Every Upload Surface Except Wiki

**Created:** 2026-10-05
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

PowerPoint files are rejected everywhere in the Hub today (`grep -i "ppt|presentationml"` over `src/` returns nothing). Add these presentation types to the allowed types on the project **Files** tab and every other file-upload surface **except the Wiki**:

| Ext | MIME |
|-----|------|
| `.ppt`, `.pps` | `application/vnd.ms-powerpoint` |
| `.pptx` | `application/vnd.openxmlformats-officedocument.presentationml.presentation` |
| `.ppsx` | `application/vnd.openxmlformats-officedocument.presentationml.slideshow` |
| `.odp` | `application/vnd.oasis.opendocument.presentation` |

**Decisions (confirmed with user 2026-10-05):** `api/kb/upload` stays excluded (Wiki); StackShift order uploads are **included**; `.pps/.ppsx/.odp` are **included**.

Upload type rules are hand-copied across ~20 files in four independent allowlists (see `src/config/attachment-types.ts` header and tasks 273/372/377 — the lists were deliberately kept independent). This task does **not** merge them. To avoid adding a fifth round of hand-copying, the PowerPoint entries live in **one small new module** that each list spreads in.

Follows `nextjs-file-length-best-practices.md`: one concern per file, new logic goes in a small focused module, no growth of already-oversized files (`_onboarding-wizard.tsx` is 6,180 lines — it gets at most a one-line import/spread, no new logic), config stays "data not logic".

## Surfaces

| # | Surface | Gate (where the allowlist lives) | Bucket |
|---|---------|----------------------------------|--------|
| A | **Project Files tab**, onboarding-workspace Files tab, Customers → Assets tab | `onboarding-workspace/_file-upload-constants.ts` (client) + `src/lib/uploads/customer-asset-storage.ts` (server `sign` + legacy `upload` routes) + **bucket `allowed_mime_types`** (migration 142) | `customer-assets` |
| B | Task / issue attachments (dropzone, New Task/Issue modals) | `src/config/attachment-types.ts` `EXTENSION_INFO` → `verify-file.ts` (magic bytes) + `client-signature-check.ts` | `project-assets` (no bucket MIME restriction) |
| C | Comment attachments (task + ticket, v2, legacy, projects-old) | Per-file `COMMENT_ATTACHMENT_MIME_TYPES` in 5 client files + `ALLOWED_MIME_TYPES` in 2 server routes | `project-assets` |
| D | Public onboarding form engine | `src/app/api/upload/route.ts`, `src/components/onboarding/file-upload.tsx` + **bucket `allowed_mime_types`** (migrations 005/141) | `onboarding-assets` |
| F | StackShift order uploads (Proposal + FlowForge spec) | `src/lib/stackshift-orders/uploads.ts` extension allow-lists; extension-only check, no MIME | `project-assets` |
| E | Previews/icons so a `.pptx` isn't a blank tile once uploaded | `_file-previews.tsx`, `_attachment-grid-tile.tsx`, `_onboarding-wizard.tsx` (Office mime list ~L4993) | — |

## Requirements

- [ ] All five extensions accepted on surfaces A–D and F, client **and** server, including the file picker `accept` string where one exists (`file-upload.tsx`).
- [ ] Unsupported-type error/hint copy ("allowed: …") lists PPT/PPTX automatically (labels derive from the lists — verify `ALLOWED_TYPES_LABEL` outputs include them).
- [ ] Server-side byte verification (surface B) accepts genuine PPT/PPTX and still rejects mislabeled/corrupt files.
- [ ] `customer-assets` and `onboarding-assets` Storage buckets accept the four MIME types (otherwise Storage 400s *after* the app gate passes — the exact failure mode noted in task 377).
- [ ] `.pptx` renders a recognizable tile/icon and previews via the same Office Online path used for docx/xlsx.
- [ ] Single new shared module holds the PPT constants; no PPT literals copy-pasted into >1 file.

## Out of Scope / Must-Not-Change

- **Wiki — explicitly excluded.** Do not touch `src/app/(hub)/wiki/_wiki-import-modal.tsx`, `api/wiki/**` (incl. `description-images/sign`), or the `wiki-assets` / `wiki-imports` buckets (migrations 153/154).
- **`src/app/api/kb/upload/route.ts` (+ `_hub_(OLD)/kb/page.tsx`)** — legacy KB endpoint that `/kb` → `/wiki` replaced; treated as Wiki. **Left untouched** (confirmed).
- **Image-only endpoints** (`description-images` routes for tasks/tickets/notes, avatars) — images only by design.
- **CSV/XLSX project import** (`projects/v2/import/_content.tsx`) — a data importer, not a file store.
- **Do not merge the independent allowlists** (task 273/372/377 precedent) and **do not add malware scanning** (task 373).
- **Do not add `image/svg+xml`** or anything else to `onboarding-assets` — only PPT/PPTX are added.
- **Do not apply the migration** — write only; user applies (repo convention).
- No `git` commands.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/config/powerpoint-types.ts` | **Create** (~25 lines, data only) | Exports `POWERPOINT_MIME_TYPES` (4 values), `POWERPOINT_EXTENSIONS` (`.ppt,.pptx,.pps,.ppsx,.odp`), per-ext `{ mime, label }` for `EXTENSION_INFO`, and a `POWERPOINT_MIME_LABELS` map for label builders |
| `src/config/attachment-types.ts` | Modify | Add `"powerpoint"` to `AttachmentCategory`; add `ppt`/`pptx`/`pps`/`ppsx`/`odp` to `EXTENSION_INFO` (spread from new module) |
| `src/lib/uploads/verify-file.ts` | Modify | Add `"powerpoint"` to `BINARY_CATEGORIES`; add `DETECTED_MIME_CATEGORIES` entries for `…presentationml.presentation` → `["powerpoint"]`, `application/vnd.ms-powerpoint`, `…presentationml.slideshow`, `application/vnd.oasis.opendocument.presentation` → `["powerpoint"]`; add `"powerpoint"` to the `application/zip` and `application/x-cfb` category arrays; extend the no-detection fallback (`zip`/`ole` branches) to allow `powerpoint` |
| `src/lib/uploads/customer-asset-storage.ts` | Modify | Spread `POWERPOINT_MIME_TYPES` into `ALLOWED_MIME_TYPES` |
| `…/onboarding-workspace/_file-upload-constants.ts` | Modify | Spread into `ALLOWED_UPLOAD_TYPES`; spread labels into `MIME_LABELS` (PPT/PPTX) |
| `src/app/api/upload/route.ts` | Modify | Spread into `ALLOWED_MIME_TYPES`; update error-message type list |
| `src/components/onboarding/file-upload.tsx` | Modify | Spread into `ALLOWED_MIME_TYPES`; append `POWERPOINT_EXTENSIONS` to `ALLOWED_EXTENSIONS`; update hint copy |
| 5 client comment files: `projects/v2/[projectId]/tasks/[taskId]/_task-comments.tsx`, `projects/v2/[projectId]/tickets/[ticketId]/_ticket-comments.tsx`, `projects/legacy/[projectId]/tasks/[taskId]/_task-comments.tsx`, `projects/legacy/[projectId]/tickets/[ticketId]/_ticket-comments.tsx`, `projects-old/[projectId]/{tasks/[taskId]/_task-comments,issues/[issueId]/_ticket-comments}.tsx` | Modify | Spread into `COMMENT_ATTACHMENT_MIME_TYPES` (6 files total — confirm none dead before editing; `projects-old` is the old route) |
| `src/app/api/v2/tasks/[taskId]/comments/[commentId]/attachments/route.ts`, `src/app/api/v2/projects/[projectId]/tickets/[ticketId]/comments/[commentId]/attachments/route.ts` | Modify | Spread into `ALLOWED_MIME_TYPES`. Note: these are multipart, 25 MB — unchanged |
| `src/lib/stackshift-orders/uploads.ts` | Modify | Append the 5 extensions to both `proposal` and `flowforge_spec` lists |
| `…/onboarding-workspace/_file-previews.tsx` | Modify | `PPT_MIME_TYPES` tile (`Presentation`/`FileText` icon, orange `PPT` label) + Office Online branch at ~L199 |
| `src/app/(hub)/projects/_shared/_attachment-grid-tile.tsx` | Modify | Add `powerpoint: ["ppt","pps","pptx","ppsx","odp"]` to `OFFICE_EXTENSIONS` + tile branch |
| `…/projects/v2/[projectId]/_onboarding-wizard.tsx` | Modify (**minimal**) | Spread into `OFFICE_MIME_TYPES` (~L4993) and add the PPT tile entry (~L5073) via import only — no new logic in this 6,180-line file |
| `supabase/migrations/158_powerpoint_allowed_mime_types.sql` | Create | Append the 4 MIME types to `allowed_mime_types` on `customer-assets` and `onboarding-assets` (idempotent; see below). Written, **not applied** |
| `CLAUDE.md` | Modify | One sentence under the upload conventions noting PPT/PPTX allowed and where the constants live |

## Code Context

**Bucket gating is the easy-to-miss piece.** Migration 142 sets `customer-assets.allowed_mime_types` to a fixed array; 141/005 do the same for `onboarding-assets`. `project-assets` has **no** bucket MIME restriction (no `allowed_mime_types` in 050/055/117), so surfaces B/C need no migration. Use an append, not a full re-list, so it can't drift:

```sql
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct m)
  from unnest(allowed_mime_types || array[
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
    'application/vnd.oasis.opendocument.presentation'
  ]) as m
)
where id in ('customer-assets', 'onboarding-assets');
```

**`attachment-types.ts` pattern** (category + mime + label per extension; extension is authoritative, `file.type` only a hint):
```ts
export type AttachmentCategory = "image" | "pdf" | "word" | "excel" | "zip" | "rar" | "text" | "video";
xlsx: { category: "excel", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "XLSX" },
```

**`verify-file.ts` — why the category arrays matter.** `file-type` returns `…presentationml.presentation` for a real PPTX but may return generic `application/zip` for an unusual one, and `application/x-cfb` for legacy `.ppt` (same OLE container as `.doc`/`.xls`). Existing handling for DOCX/XLSX is the model:
```ts
"application/zip": ["zip", "word", "excel"],
"application/x-cfb": ["word", "excel"],
```
→ add `"powerpoint"` to both, plus the fallback `known.category === "zip"` / `"ole"` branches (`info.category === "word" || "excel"` → also `"powerpoint"`). `client-signature-check.ts` needs no change (it only blocks executables / binary-looking text).

**Customer-asset constants** use a flat MIME list + `MIME_LABELS` map (`_file-upload-constants.ts`) — spread the new module into both.

## Implementation Steps

1. Create `src/config/powerpoint-types.ts` (data only; no logic).
2. Wire surface B: `attachment-types.ts` category + `EXTENSION_INFO`; `verify-file.ts` mappings. Confirm `ALLOWED_TYPES_LABEL` (derived from `EXTENSION_INFO`) now includes PPT, PPTX.
3. Wire surface A: `customer-asset-storage.ts` and `_file-upload-constants.ts`.
4. Wire surface D: `api/upload/route.ts` and `file-upload.tsx` (incl. `accept` string).
5. Wire surface C: the 6 client comment lists + 2 server routes. Before editing, grep `COMMENT_ATTACHMENT_MIME_TYPES` and `ALLOWED_MIME_TYPES` again and update every hit that is not Wiki/images-only/KB.
6. Surface E: tiles/previews (`_file-previews.tsx`, `_attachment-grid-tile.tsx`, wizard Office list).
7. Write migration 158 (do not apply).
8. Update `CLAUDE.md` note.
9. Final sweep: `grep -rniE "wordprocessingml" src` — every file listing DOCX and not PPTX must be explained (Wiki, KB, importer, or preview-only-by-design).
10. Keep every touched file at or under its current line count except the new module; if any non-wizard file would cross 400 lines, extract rather than append.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` and `pnpm lint` pass.
- [ ] Project Files tab: dropping a `.pptx` and a `.ppt` uploads and registers (after migration 158 is applied); neither is rejected with "isn't supported — allowed: …"; the allowed list shown includes PPT, PPTX.
- [ ] Same file uploads via the onboarding-workspace Files tab and Customers → Assets tab.
- [ ] Task attachment dropzone and issue/ticket attachments accept a real `.pptx`; a `.txt` renamed to `.pptx` is rejected by `verify-file.ts`; a real `.ppt` (legacy OLE) is accepted.
- [ ] Comment attachments (task + ticket) accept `.pptx`.
- [ ] Public onboarding form file field offers `.ppt/.pptx` in its picker and uploads one.
- [ ] Uploaded `.pptx` shows a labeled tile and opens in the preview modal (Office Online).
- [ ] Wiki import and wiki image uploads behave exactly as before; `git`-independent check: no file under `wiki/` or `api/wiki/` or `api/kb/` modified.
- [ ] Migration 158 file exists and is **not** applied by the agent.

## Verification

```bash
npx tsc --noEmit
pnpm lint
grep -rniE "presentationml|ms-powerpoint" src | grep -v powerpoint-types   # should show only spreads/tiles/verify mappings, no duplicated literal lists
```
Browser (after the user applies migration 158): upload a real `.pptx` and `.ppt` on each surface above; upload a renamed text file as `.pptx` on a task attachment and confirm rejection.

## Compatibility Touchpoints

- **Migration 158 must be applied by the user** before A and D work in a real environment — until then Storage rejects the new MIME types for `customer-assets`/`onboarding-assets` even though the app allows them. Surfaces B/C work immediately.
- Size limits unchanged: A/D 50 MB, B 200 MB, C 25 MB (multipart). Large decks over ~4.5 MB on the multipart paths (C, D) hit Vercel's body cap — pre-existing, not addressed here (see CLAUDE.md note on task 339).
- Browsers occasionally report an empty `file.type` for `.ppt`; surfaces A and D validate by `file.type` only (pre-existing, same caveat as `.ico`/`.ts`), so a legacy `.ppt` may be rejected there on such a browser. B uses extension, so it is unaffected.

## Notes on Added Scope

- **StackShift (F):** the Hub gate is extension-only, so the Hub change is trivial. The public webriq.com form has its **own client-side list outside this repo** — it must be updated separately or users are blocked in the browser before reaching the Hub. Flag in handoff.
- **`.odp`:** `file-type` identifies it as `application/vnd.oasis.opendocument.presentation`; Office Online can't preview ODP, so show the tile with download-only (no iframe).
- **`.pps`** shares the legacy OLE signature with `.ppt`; **`.ppsx`** is an OOXML zip like `.pptx`.

## Implementation Notes

### What Changed
- New data-only `src/config/powerpoint-types.ts` (MIME list, labels, extensions, `accept` string, `EXTENSION_INFO` entries, previewable subset excluding `.odp`), spread into every in-scope allowlist.
- `attachment-types.ts` gains a `"powerpoint"` category and the 5 extensions; `verify-file.ts` maps the new detected MIME types, adds `powerpoint` to the zip/OLE (`x-cfb`) arrays and the no-detection fallback (via a new `OFFICE_CATEGORIES` set replacing inline word/excel checks).
- Surfaces A (customer assets), C (6 client comment lists + 2 server routes), D (onboarding upload route + component incl. `accept`, copy), F (StackShift order extensions) wired.
- Previews: PPT tile + Office Online iframe for ppt/pps/pptx/ppsx (not `.odp`) in `_file-previews.tsx`, `_attachment-grid-tile.tsx` and the wizard's Office/tile lists.
- Migration 158 appends the 4 MIME types to `customer-assets` and `onboarding-assets` (written, not applied). `CLAUDE.md` note added.

### Files Changed
- `src/config/powerpoint-types.ts` (new), `src/config/attachment-types.ts`, `src/lib/uploads/verify-file.ts`, `src/lib/uploads/customer-asset-storage.ts`, `src/lib/stackshift-orders/uploads.ts`
- `…/onboarding-workspace/_file-upload-constants.ts`, `_file-previews.tsx`, `projects/_shared/_attachment-grid-tile.tsx`, `projects/v2/[projectId]/_onboarding-wizard.tsx` (import + 2 one-line entries only)
- `src/app/api/upload/route.ts`, `src/components/onboarding/file-upload.tsx`
- 6 comment files (v2/legacy/projects-old task + ticket) and 2 server comment-attachment routes
- `supabase/migrations/158_powerpoint_allowed_mime_types.sql` (new), `CLAUDE.md`, `TASKS.md`

### Deviations From Plan
- `POWERPOINT_PREVIEWABLE_MIME_TYPES` added to the shared module (plan implied a local filter) so the previews file and wizard don't each re-derive it.
- The wizard uses `FileText` for its PPT tile (no new lucide import in the 6,180-line file).
- Not done: webriq.com's own client-side form list (outside this repo) must be updated separately.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in `_checklist-tab.tsx`)
- Sweep for files listing DOCX but not presentations - only `api/kb/upload/route.ts` (excluded by decision)
- Browser upload tests - SKIPPED (migration 158 must be applied first)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Presentation types are defined once (`powerpoint-types.ts`, ~40 lines, data only) and spread into each allowlist; no PPT literal lists duplicated. Existing lists were kept independent per the task 273/372/377 precedent.
- `verify-file.ts`: the inline `word`/`excel` category checks in the fallback were replaced by one `OFFICE_CATEGORIES` set — less repetition, same behavior plus `powerpoint`. Adding `powerpoint` to the `application/msword` / `application/vnd.ms-excel` detected-MIME arrays mirrors the existing deliberate OLE leniency (legacy Office formats can't be told apart by signature); not a new weakness class.
- `_onboarding-wizard.tsx` (6,180 lines) received only an import and two one-line entries; no logic added. No touched file grew past a size threshold due to this task.
- No dead code, `any`, debug logging, or secrets. `pnpm lint` 0 errors (2 pre-existing warnings), `npx tsc --noEmit` clean.
- Wiki and `api/kb/upload` untouched (verified by sweep).

### Deviations
- **Minor (fixed in this gate):** the three task-attachment viewer modals (`v2`, `legacy`, `projects-old` `_task-attachment-viewer-modal.tsx`) have their own `OFFICE_EXTENSIONS` list and were missed in implementation, so an uploaded `.pptx` would have been download-only rather than previewing via Office Online. Added `POWERPOINT_PREVIEWABLE_EXTENSIONS` (excludes `.odp`) to the shared module and spread it into all three.
- **Minor:** `POWERPOINT_PREVIEWABLE_MIME_TYPES` added to shared module; wizard tile uses `FileText` (see Implementation Notes).

### Required Fixes
- None.
