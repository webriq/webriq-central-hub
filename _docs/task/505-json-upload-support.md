# 505: Allow `.json` files on comment attachments and every general-purpose upload/drag-and-drop surface

**Created:** 2026-11-26
**Priority:** MEDIUM
**Type:** enhancement (+ migration, written-not-applied)
**Recommended Tier:** fast (one MIME string appended to existing allowlists + one idempotent bucket migration; follows the 158/175/176 pattern exactly)
**Status:** Planned

---

## Overview

Users want to attach/upload `.json` files. Task/ticket **attachments** already accept JSON (`src/config/attachment-types.ts:57`, `json → application/json`, task 273). Every other general-purpose upload surface rejects it because its MIME allowlist is a separate hand-kept list without `application/json`:

| Surface | Client gate | Server gate | Storage bucket gate |
|---|---|---|---|
| Task comments (v2 `[classification]`, `legacy`, `projects-old`) | `COMMENT_ATTACHMENT_MIME_TYPES` in each `_task-comments.tsx` | `ALLOWED_MIME_TYPES` in `api/v2/tasks/[taskId]/comments/[commentId]/attachments/route.ts:13` | `project-assets` — none (migration 158 note) |
| Ticket comments (same three trees) | `COMMENT_ATTACHMENT_MIME_TYPES` in each `_ticket-comments.tsx` | `api/v2/projects/[projectId]/tickets/[ticketId]/comments/[commentId]/attachments/route.ts:12` | `project-assets` — none |
| Task/ticket attachments (detail tab, New Task modal, dropzone) | `attachment-types.ts` | same | **already supports JSON — no change** |
| Onboarding workspace Files tab (customer assets) | `ALLOWED_UPLOAD_TYPES` in `onboarding-workspace/_file-upload-constants.ts:21` | `ALLOWED_MIME_TYPES` in `src/lib/uploads/customer-asset-storage.ts:32` (used by `customers/[id]/assets/upload`, `.../upload/sign`, `admin/zoho-import/documents`) | `customer-assets` — has list (142/158/175/176) |
| Personal Drive | — | `DRIVE_ALLOWED_MIME_TYPES = [...ALLOWED_MIME_TYPES, ...]` (`src/lib/drive/storage.ts:9`) — inherits the change above | `user-drive` — has list (166) |
| Customer onboarding form uploads (`(public)`, `FileUpload`) | `ALLOWED_MIME_TYPES` + `ALLOWED_EXTENSIONS` in `src/components/onboarding/file-upload.tsx:24,52` | `ALLOWED_MIME_TYPES` in `src/app/api/upload/route.ts:8` | `onboarding-assets` — has list (141) |

## Requirements

1. `.json` files can be attached to task comments and ticket comments (all three page trees), via picker and drag-and-drop, and are stored/listed/downloadable like other comment attachments.
2. `.json` files can be uploaded in the onboarding workspace Files tab, Personal Drive, and the customer onboarding form.
3. Every "allowed types" label shown to users on those surfaces includes `JSON`.
4. A browser that reports an empty `file.type` for a `.json` file is still accepted (resolved by extension), consistent with how fonts/design files already work.
5. Storage buckets with an `allowed_mime_types` list accept `application/json` (otherwise uploads 400 at Storage — task 418 lesson).

## Out of Scope / Must-Not-Change

- Task/ticket attachment allowlist (`attachment-types.ts`) — already has JSON.
- Inline JSON preview/pretty-printing in viewers — JSON falls to each viewer's existing download/"no preview" fallback (see D1).
- Wiki import (`_wiki-import-modal.tsx`, converts `.docx/.md/.pdf` into pages — JSON is not a page source), description-image routes (images only), project CSV/XLSX import, old KB (`src/app/_hub_(OLD)/kb`, unrouted) and `api/kb/upload` (only caller is that unrouted page).
- No other type is added or removed; size limits unchanged.
- `verify-file.ts` byte verification: unchanged — JSON is already `category: "text"` there for attachments; comment routes don't call it today and this task doesn't add it.

## Proposed File Changes

| File | Change |
|---|---|
| `src/config/upload-mime.ts` | Add `json: "application/json"` to the extension map so `resolveUploadMime()` returns it when `file.type` is empty (Req 4). |
| `src/app/api/v2/tasks/[taskId]/comments/[commentId]/attachments/route.ts` | Append `"application/json"` to `ALLOWED_MIME_TYPES`; check/store `resolveUploadMime(file)` instead of raw `file.type` (only if `file.type` is used for the content-type too — keep the same value for both). |
| `src/app/api/v2/projects/[projectId]/tickets/[ticketId]/comments/[commentId]/attachments/route.ts` | Same. |
| `src/app/(hub)/projects/[classification]/[projectId]/tasks/[taskId]/_task-comments.tsx` | Append `"application/json"` to `COMMENT_ATTACHMENT_MIME_TYPES`. |
| `src/app/(hub)/projects/[classification]/[projectId]/tickets/[ticketId]/_ticket-comments.tsx` | Same. |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-comments.tsx` | Same. |
| `src/app/(hub)/projects/legacy/[projectId]/tickets/[ticketId]/_ticket-comments.tsx` | Same. |
| `src/app/(hub)/projects-old/[projectId]/tasks/[taskId]/_task-comments.tsx` | Same (route still live: `ROUTES.PROJECTS_OLD`, `src/config/constants.ts:25`). |
| `src/app/(hub)/projects-old/[projectId]/issues/[issueId]/_ticket-comments.tsx` | Same. |
| `src/app/(hub)/projects/_shared/_task-attachment-picker.tsx:44,56` | Override check uses `resolveUploadMime(file)`; label string gains `JSON`. |
| `src/lib/uploads/customer-asset-storage.ts:32` | Append `"application/json"` (Drive + Zoho documents import inherit). |
| `src/app/(hub)/projects/[classification]/[projectId]/onboarding-workspace/_file-upload-constants.ts` | Append `"application/json"` to `ALLOWED_UPLOAD_TYPES` and `"application/json": "JSON"` to `MIME_LABELS`. |
| `src/components/onboarding/file-upload.tsx:24,52` | Append `"application/json"` and `.json` to `ALLOWED_EXTENSIONS`. |
| `src/app/api/upload/route.ts:8` | Append `"application/json"`. |
| `supabase/migrations/194_json_allowed_mime_types.sql` (new) | Append `application/json` to `customer-assets`, `user-drive`, `onboarding-assets` bucket lists — idempotent `array_agg(distinct …)`, same shape as 176. Written, not applied. |

Implementer: check whether any other `file.type` gate sits in the onboarding workspace sign flow (`_files-tab.tsx:88` uses `isAllowedUpload`) or in Drive's client — if so it should also go through `resolveUploadMime()`. Grep `resolveUploadMime` for the existing call sites (task 451) and follow them.

## Code Context

### Bucket migration pattern (`supabase/migrations/176_customer_assets_design_mime_types.sql`)
```sql
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct m)
  from unnest(allowed_mime_types || array['application/postscript', ...]) as m
)
where id = 'customer-assets';
```
Use `where id in ('customer-assets','user-drive','onboarding-assets')`. Guard: a bucket whose `allowed_mime_types` is null must stay null (null = unrestricted; `null || array[...]` would *restrict* it). Add `and allowed_mime_types is not null`.

### Comment route gate (`api/v2/tasks/[taskId]/comments/[commentId]/attachments/route.ts:72`)
```ts
if (!ALLOWED_MIME_TYPES.includes(file.type)) { return NextResponse.json(... 400) }
```

### `src/config/upload-mime.ts`
`EXTENSION_MIME = { ...FONT_EXTENSION_MIME, ...DESIGN_EXTENSION_MIME }`; `resolveUploadMime(file)` returns the extension's MIME or `file.type`. Adding `json` inline here is enough — no new config file.

### Security note
`application/json` is not rendered/executed by browsers, so it does not carry the SVG stored-XSS risk that keeps `image/svg+xml` out of `onboarding-assets` (public bucket) and attachments. Serving stays as today (signed URL / public URL with the stored content type).

## Implementation Steps

1. Add `json` to `upload-mime.ts`.
2. Append `application/json` to every list in the table above; route the two comment routes' and the picker override's checks through `resolveUploadMime(file)`.
3. Update visible type labels (picker override label, onboarding workspace `MIME_LABELS`; `ALLOWED_TYPES_LABEL` in `attachment-types.ts` already includes JSON).
4. Write migration 194 (do not apply).
5. `npx tsc --noEmit`.

## Acceptance Criteria

| # | Check | Expected | When |
|---|---|---|---|
| 1 | `npx tsc --noEmit` | exit 0 | pre-merge |
| 2 | `grep -c '"application/json"'` on each file in Proposed File Changes (except migration/upload-mime) | ≥1 in every file | pre-merge |
| 3 | Browser: v2 task detail → comment composer → drag a `sample.json` in, post | comment shows the JSON tile; download returns identical bytes | pre-merge (dev) |
| 4 | Browser: same on a v2 ticket detail comment | same | pre-merge (dev) |
| 5 | `npx tsx -e 'import {resolveUploadMime} from "./src/config/upload-mime"; console.log(resolveUploadMime({name:"a.JSON",type:""}))'` | `application/json` | pre-merge |
| 6 | Browser: onboarding workspace Files tab → upload `sample.json` | upload succeeds, tile shows; label lists JSON | post-deploy (after migration 194 applied — Storage 400s before) |
| 7 | Browser: Personal Drive → upload `sample.json` | succeeds | post-deploy (after 194) |
| 8 | Browser: `/onboarding/[customerId]` file field → upload `sample.json` | succeeds | post-deploy (after 194) |
| 9 | SQL: `select id, 'application/json' = any(allowed_mime_types) from storage.buckets where id in ('customer-assets','user-drive','onboarding-assets')` | all `true`; re-running 194 leaves array lengths unchanged | post-deploy |
| 10 | **No-regression:** comment attachment of a `.exe` renamed is still rejected; a `.png` and `.pdf` comment attachment still succeed; uploading `.svg` to the customer onboarding form is still rejected | unchanged behaviour | pre-merge (dev) |

## Verification

```bash
npx tsc --noEmit
npx tsx -e 'import {resolveUploadMime} from "./src/config/upload-mime"; console.log(resolveUploadMime({name:"a.JSON",type:""}))'
```
Plus browser checks 3, 4, 10 on the dev server; 6–9 after the operator applies 194.

## Coordination

- **373** (Planned, malware scanning for the customer-asset pipeline) — conceptual overlap on `customer-asset-storage.ts` allowlist; 373 is design-only today, no file conflict. Its doc's type inventory should list JSON once this lands.
- **460** (Planned, Cliq DMs + `@mention` in task comment editor) — touches the comment editor, not `_task-comments.tsx` allowlists per its doc; if 460's implementation edits `_task-comments.tsx`, merge is trivial (different lines). No ordering rule needed.
- Migration number **194**: last on disk is `193_stackshift_orders_pm_read.sql`; renumber if another task claims 194 first.

## Open Decisions

- **D1 — NON-BLOCKING:** inline JSON preview in the attachment viewers? Default: no — JSON uses the existing download fallback. Can be a follow-up.
- **D2 — NON-BLOCKING:** also add JSON to `api/kb/upload` (only reachable from the unrouted `_hub_(OLD)/kb` page)? Default: no.

## Operator Steps

1. Apply `supabase/migrations/194_json_allowed_mime_types.sql` to the Supabase project (SQL editor or `supabase db push`). Until then, comment attachments work (bucket `project-assets` is unrestricted) but onboarding-workspace, Drive and customer-onboarding-form JSON uploads fail at Storage.
2. Deploy the Next.js app (only deployable; `worker/` doesn't import any changed module — verify with `grep -rn "customer-asset-storage\|upload-mime" worker`).

## Baseline (2026-11-26, before changes)
- AC5 `resolveUploadMime({name:"a.JSON",type:""})` → `""` (fails, as required).
- AC2 comment files/routes, customer-asset list, onboarding form lists: no `application/json`.
- AC1 `npx tsc --noEmit`: 2 errors, both in stale `.next/types/validator.ts` (references removed `src/app/(hub)/stackshift-orders/*`), 0 in `src/`.

## Implementation Notes

### What Changed
- `application/json` added to every comment-attachment allowlist (client + both server routes), the customer-asset list (Drive, onboarding workspace sign/upload, Zoho documents import inherit), the onboarding workspace client list + label, and the customer onboarding form (client + `/api/upload`).
- `.json` → `application/json` added to `resolveUploadMime()`; gates that read raw `file.type` on these surfaces now go through it, and the resolved type is what gets stored (`contentType`).
- Migration 194 written (not applied).

### Files Changed
- `src/config/upload-mime.ts` - json extension mapping
- `src/app/api/v2/tasks/[taskId]/comments/[commentId]/attachments/route.ts`, `src/app/api/v2/projects/[projectId]/tickets/[ticketId]/comments/[commentId]/attachments/route.ts` - allow + resolve + store resolved type; error text lists JSON
- 6 × `_task-comments.tsx` / `_ticket-comments.tsx` (`[classification]`, `legacy`, `projects-old`) - client allowlist
- `src/app/(hub)/projects/_shared/_task-attachment-picker.tsx` - override check resolves by extension; label lists JSON
- `src/lib/uploads/customer-asset-storage.ts` - server allowlist
- `src/app/(hub)/projects/[classification]/[projectId]/onboarding-workspace/_file-upload-constants.ts` - client allowlist + JSON label
- `src/components/onboarding/file-upload.tsx`, `src/app/api/upload/route.ts` - allowlist, `.json` accept, resolver, error text
- `src/app/(hub)/drive/_use-drive-upload-flow.ts`, `src/app/(hub)/drive/_drive-upload.ts` - resolver
- `supabase/migrations/194_json_allowed_mime_types.sql` - new

### Deviations From Plan
- Drive client (`_use-drive-upload-flow.ts`, `_drive-upload.ts`) also routed through `resolveUploadMime()` — the plan's "implementer: check" note; it read raw `file.type`, so empty-type `.json` would have been rejected. Side effect: fonts/design files now resolve by extension in Drive too (same as the onboarding workspace since task 451; both are in `DRIVE_ALLOWED_MIME_TYPES`).
- Migration skips buckets whose list is null (keeps them unrestricted), as noted in Code Context.

### Verification Run
- `npx tsx -e '…resolveUploadMime…'` - PASS (baseline `""` → now `["application/json","image/png",""]` for a.JSON/"", a.png/image/png, x.exe/"")
- AC2 grep `"application/json"` - PASS (≥1 in all 12 files)
- `npx tsc --noEmit` - PASS for `src/` (0 errors; the same 2 stale `.next` errors as baseline)
- AC3, AC4, AC10 browser checks - SKIPPED (not run in this session; for the test stage)
- AC6–AC9 - SKIPPED (post-deploy, need migration 194)

### Attempts That Failed
- None

### Operator Steps
- Apply `supabase/migrations/194_json_allowed_mime_types.sql`. Until then, JSON uploads to onboarding workspace, Drive, and the customer onboarding form 400 at Storage; comment attachments work (project-assets is unrestricted).
- Deploy the Next.js app — the only deployable. `worker/` imports none of the changed modules (`grep -rn "customer-asset-storage\|upload-mime" worker` → no hits).

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. Changes are list appends plus one shared resolver (`resolveUploadMime`) reused at every gate; no new abstraction, no dead code, no debug logging.
- Gate and stored type agree on every surface that was changed: both comment routes and `/api/upload` check the resolved `mimeType` and also store it (`contentType`), and Drive sends the same value to sign, PUT and register.
- Security: unchanged trust model. `file.type` was already client-supplied; extension-resolved `application/json` isn't rendered or executed by browsers, so it doesn't add the stored-XSS risk that keeps SVG out of public buckets. The migration only appends and skips buckets whose list is null, so it can't restrict an unrestricted bucket.
- Nit (not fixed): the Drive rejection message (`_use-drive-upload-flow.ts:35`) still prints raw `file.type` instead of the resolved type. It only changes the wording of the error, and the resolved type would be `""` for unmapped files anyway.
- Nit (not fixed): `resolveUploadMime` import in `_task-attachment-picker.tsx` sits above the lucide import; cosmetic only.
- Evidence quality: AC2 (grep for the string) only checks the source text, so it's weak evidence. AC5 is a real behaviour check. The behaviour criteria AC3/AC4/AC10 are browser checks still owed by the test stage; AC6–9 are post-migration.

### Deviations
- Minor: Drive client routed through `resolveUploadMime()` (doc said "implementer: check"). Needed for empty-type `.json`; side effect is fonts/design files resolve by extension in Drive, matching the onboarding workspace since task 451 and still within `DRIVE_ALLOWED_MIME_TYPES`.
- Minor: comment routes and `/api/upload` now store the resolved type instead of raw `file.type`. Same value for every file except `.json` and font/design extensions. Fonts/design aren't in the comment allowlists, so for comments the only difference is `.json`.

### Required Fixes
- None
