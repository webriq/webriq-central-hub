# 451: Projects > Files — allow font file uploads (.ttf .otf .woff .woff2 .eot .ttc .otc)

**Created:** 2026-10-12
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

The project **Files** tab (`/projects/v2/[projectId]/files`, shared with the Onboarding Workspace Files tab and Customers → Assets) rejects font files. The user's example is a PP Eiko Medium webfont kit: `.eot`, `.otf`, `.ttf`, `.woff`, `.woff2`. Fonts must be uploadable (single files, multi-select, drag-drop and folder upload). `.ttc`/`.otc` (TrueType/OpenType collections, several fonts in one file) are included beyond the screenshot's five.

### Answer to "is there an existing folder or zip upload?"

- **Folder upload: yes** (task 372). The Files toolbar has an "Upload folder" button (`<input webkitdirectory>`, `_files-toolbar.tsx`) and drag-and-drop of a local folder (`readDataTransferEntries`, `_folder-upload-tree.ts`). It recreates the folder tree (silent merge-by-name), then pushes each file through the normal upload queue. Cap: **200 files per drop**. Every file in the tree is still checked against the same type allowlist, so a font kit dropped as a folder has its fonts silently skipped today ("Skipped N files — unsupported type or too large"). This task fixes that too, with no folder-code change.
- **Zip upload: partially.** `.zip`/`.rar` are allowed (task 372 follow-up) but are stored **as a single opaque file**; nothing extracts them. Zip *download* exists (task 419, `client-zip`, files/folders → `.zip`). **Zip extraction on upload does not exist** and is deliberately not added here. A font kit can already be uploaded as one `.zip`, or, after this task, as a folder or as individual font files.

### Root cause (why fonts fail)

Two independent gates both reject fonts:

1. **Client**: `ALLOWED_UPLOAD_TYPES.includes(file.type)` in `_files-tab.tsx:87` and `_use-folder-upload.ts:12`. Fonts are not in the list. Even if added, browsers report font MIME types inconsistently (Windows registry-dependent: `font/ttf`, `application/x-font-ttf`, `application/font-sfnt`, `application/vnd.ms-fontobject`, or **empty** for `.eot`/`.woff2` on some machines). Allowed types are matched on `file.type` alone and an empty type is deliberately rejected, so a plain MIME-list addition would still fail for some users.
2. **Server + Storage**: `ALLOWED_MIME_TYPES` in `src/lib/uploads/customer-asset-storage.ts` (checked by `.../assets/upload/sign/route.ts`) and the `customer-assets` bucket's `allowed_mime_types` (migrations 142/158) both lack font types. A type allowed client-side but missing there fails at `/upload/sign` (400) or at the Storage PUT.

## Requirements

- [ ] Fonts `.ttf`, `.otf`, `.woff`, `.woff2`, `.eot`, `.ttc`, `.otc` upload successfully on the project Files tab, the Onboarding Workspace Files tab and Customers → Assets, via file picker, drag-drop and folder upload.
- [ ] Font detection is **extension-based with a MIME fallback**: a font file whose browser-reported `file.type` is empty, `application/octet-stream`, or any known font variant is accepted and uploaded with one **canonical** MIME (`font/ttf`, `font/otf`, `font/woff`, `font/woff2`, `application/vnd.ms-fontobject`, `font/collection` for both `.ttc` and `.otc`). The same canonical MIME is sent to `/upload/sign`, used as the Storage PUT `content-type`, and stored in `customer_assets.file_mime_type`.
- [ ] The extension fallback applies **only** to the font extensions. Every other type keeps today's strict `file.type` whitelist (empty MIME still rejected for `.ico`/`.ts` etc.). No weakening of the existing gate.
- [ ] Server allowlist and the `customer-assets` bucket accept the canonical font MIMEs plus the common legacy variants (so a stale client or the legacy multipart route does not 400).
- [ ] Font tiles render a labelled type tile ("FONT") in the grid instead of the generic blank document icon.
- [ ] "Allowed types" copy (dropzone caption, rejection message, sign-route error, Customers → Assets help text) mentions fonts.
- [ ] A pure check covers the extension → canonical MIME resolver and the unchanged strictness for non-fonts.

## Out of Scope / Must-Not-Change

- **No zip extraction / unzip-on-upload**, and no change to folder-upload behaviour or its 200-file cap.
- No malware/content scanning (still the deferred task 373; fonts are inert data but note that this pipeline remains MIME+size only).
- `onboarding-assets` bucket (public) and the public onboarding form (`components/onboarding/file-upload.tsx`, `api/upload/route.ts`) are **not** widened. Fonts are a staff Files-tab need.
- Task/issue attachments (`attachment-types.ts`), Drive, Wiki, KB, StackShift uploads: untouched.
- No file-size limit change (200 MB). No inline font preview (a tile only). No change to `customer_assets` schema.
- No git commands. Migration is **written, not applied** by the agent.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/config/font-types.ts` | Create | Single source: `FONT_MIME_TYPES` (canonical + legacy variants), `FONT_MIME_LABELS`, `FONT_EXTENSION_MIME` (ext → canonical), `resolveUploadMime(file)` / `fontMimeForName(name)`. Data + one tiny pure function, mirrors `powerpoint-types.ts`. |
| `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_file-upload-constants.ts` | Modify | Spread `FONT_MIME_TYPES` into `ALLOWED_UPLOAD_TYPES`, `FONT_MIME_LABELS` into `MIME_LABELS` so `ALLOWED_TYPES_LABEL` lists "TTF, OTF, WOFF, WOFF2, EOT, TTC, OTC". Add an `isAllowedUpload(file)` helper (resolved MIME ∈ list) used by both client checks. |
| `.../onboarding-workspace/_files-tab.tsx` | Modify | `handleFiles` (line ~87): replace `ALLOWED_UPLOAD_TYPES.includes(file.type)` with `isAllowedUpload(file)`; rejection text keeps `file.type \|\| "This file type"`. |
| `.../onboarding-workspace/_use-folder-upload.ts` | Modify | `isValidUpload` (line 12): same helper. |
| `.../onboarding-workspace/_upload-queue.tsx` | Modify | `uploadViaSignedUrl` (line 63): `const mimeType = resolveUploadMime(file)` (falls back to `file.type \|\| "application/octet-stream"` exactly as today for non-fonts). |
| `.../onboarding-workspace/_file-previews.tsx` | Modify | Add a `FILE_TYPE_TILES` entry for font MIMEs (lucide `Type` icon, label `FONT`). |
| `src/lib/uploads/customer-asset-storage.ts` | Modify | Spread `FONT_MIME_TYPES` into `ALLOWED_MIME_TYPES`; update the keep-in-sync comment. |
| `src/app/api/customers/[customerId]/assets/upload/sign/route.ts` | Modify | Add "fonts" to the unsupported-type error message. |
| `src/app/(hub)/customers/[customerId]/client.tsx` | Modify | `ASSET_TYPE_HELP.file` copy (line ~99): mention fonts. Also check whether its add-asset file picker validates `file.type` itself; if so apply `resolveUploadMime`/`isAllowedUpload`. |
| `supabase/migrations/175_customer_assets_font_mime_types.sql` | Create | Append the font MIMEs to `storage.buckets.allowed_mime_types` for `customer-assets` only; idempotent (`array_agg(distinct …)`), same shape as migration 158. **Written, not applied.** |
| `_docs/task/451-font-types.check.ts` | Create | Pure `npx tsx` checks for the resolver. |

## Code Context

Client gate (the line that rejects fonts today), `_files-tab.tsx:84-98`:

```ts
for (const file of Array.from(files)) {
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
    setRejectedFile({ name: file.name, reason: `${file.type || "This file type"} isn't supported — allowed: ${ALLOWED_TYPES_LABEL}.` });
    continue;
  }
  ...
```

Folder path, `_use-folder-upload.ts:11-13`:

```ts
function isValidUpload(file: File): boolean {
  return ALLOWED_UPLOAD_TYPES.includes(file.type) && file.size <= MAX_FILE_SIZE;
}
```

MIME actually sent/stored, `_upload-queue.tsx:62-86` (the `mimeType` const feeds the sign body, the PUT `content-type`, and the returned `mimeType` that the register call stores):

```ts
const mimeType = file.type || "application/octet-stream";
...
body: JSON.stringify({ filename: file.name, size: file.size, mimeType, project_id: projectId ?? null }),
...
xhr.setRequestHeader("content-type", mimeType);
```

Server gate, `sign/route.ts:41`: `if (!ALLOWED_MIME_TYPES.includes(mimeType)) return 400`. Allowlist is `customer-asset-storage.ts` `ALLOWED_MIME_TYPES` (already spreads `...POWERPOINT_MIME_TYPES`; follow that pattern). The three copies (`_file-upload-constants.ts`, `customer-asset-storage.ts`, bucket migration) must stay in lockstep (task 372 note); `powerpoint-types.ts` / migration 158 (task 418) is the exact precedent to copy.

Suggested `font-types.ts` shape:

```ts
export const FONT_EXTENSION_MIME = {
  ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2",
  eot: "application/vnd.ms-fontobject",
  ttc: "font/collection", otc: "font/collection", // both collection formats share one MIME
} as const;
export const FONT_MIME_TYPES = [
  ...new Set(Object.values(FONT_EXTENSION_MIME)), // dedupes the shared font/collection
  // legacy / OS-registry variants browsers still report
  "application/x-font-ttf", "application/x-font-truetype", "application/x-font-otf", "application/x-font-opentype",
  "application/font-sfnt", "application/font-woff", "application/font-woff2", "application/x-font-woff",
];
// font extension wins over whatever file.type says (incl. empty / octet-stream); else file.type unchanged.
export function resolveUploadMime(file: { name: string; type: string }): string { ... }
```

`ALLOWED_TYPES_LABEL` is built from a MIME → label map, and `font/collection` is one MIME for two extensions, so label it `"TTC/OTC"` (a single entry) rather than letting one extension hide the other. The check must assert `x.ttc` and `x.otc` both resolve to `font/collection`.

Why extension wins only for fonts: it makes the canonical MIME deterministic (what Storage and the bucket see), and confines the "trust the extension" relaxation to inert font data.

## Implementation Steps

1. Create `src/config/font-types.ts` and `_docs/task/451-font-types.check.ts`; run the check.
2. Wire constants (`_file-upload-constants.ts`, `customer-asset-storage.ts`) and add `isAllowedUpload`.
3. Swap the two client gates (`_files-tab.tsx`, `_use-folder-upload.ts`) and the sent MIME (`_upload-queue.tsx`).
4. Add the FONT tile, update error/help copy, check the Customers → Assets picker.
5. Write migration 175 (do not apply). Tell the user it must be applied before production fonts will upload (the app-level gate passes, then Storage rejects without it).
6. `npx tsc --noEmit`, `pnpm lint`, then browser test.

## Acceptance Criteria

- [ ] A `.ttc` and an `.otc` file also upload and show as FONT tiles (both stored as `font/collection`).
- [ ] The five files from the screenshot (`PPEiko-Medium.eot/.otf/.ttf/.woff/.woff2`) upload together via multi-select on Projects > Files, show as FONT tiles, download intact, and show `file_mime_type` as the canonical value.
- [ ] Dropping a local folder containing those fonts uploads them (no "Skipped" toast).
- [ ] A font whose browser MIME is empty (simulate by `new File([...], "x.woff2", { type: "" })`) uploads; a non-font with empty MIME (e.g. `x.ts`, `x.ico`) is still rejected.
- [ ] `.exe`, `.dmg`, `.bin` and other non-listed types are still rejected with the updated message.
- [ ] Same behaviour on Onboarding Workspace Files tab and Customers → Assets.
- [ ] A `.zip` still uploads as a single file and is not extracted.
- [ ] After migration 175 is applied, no Storage 400 on font PUT; before it, the failure is a clear upload error, not a silent hang.
- [ ] Existing types (images, PDF, Office, PPT, zip, js/ts/xml, ico) unaffected.

## Verification

```bash
npx tsc --noEmit
pnpm lint
npx tsx _docs/task/451-font-types.check.ts
```

Browser acceptance: run `pnpm dev`, open a v2 project's Files tab, upload the five font files (picker, then drag-drop, then a folder containing them), confirm tiles + download, then an `.exe` for the negative case. Requires migration 175 applied to the target Supabase project.

## Compatibility Touchpoints

- Migration 175 (customer-assets bucket MIME list) — written, not applied; operator runs it.
- `CLAUDE.md`: at the document stage add a one-line note beside the "Presentation uploads (task 418)" bullet: fonts defined in `src/config/font-types.ts`, extension-resolved MIME, `customer-assets` bucket only.
- Legacy multipart `POST .../assets/upload` (used by `_onboarding-wizard.tsx`) shares `ALLOWED_MIME_TYPES` so it widens automatically; its client still sends `file.type` raw, so fonts there depend on the browser's reported type. Acceptable (legacy surface), noted not fixed.
- Related: task 372 (folder upload + type widening), task 373 (scanning, still deferred), task 418 (PowerPoint precedent), task 350 (signed-URL upload flow).

## Implementation Notes

### What Changed
- New `src/config/font-types.ts`: font extension → canonical MIME map (`.ttf .otf .woff .woff2 .eot .ttc .otc`; `.ttc`/`.otc` share `font/collection`), legacy MIME variants, labels, `fontMimeForName()` / `resolveUploadMime()`.
- Client gates (`_files-tab.tsx`, `_use-folder-upload.ts`) now use `isAllowedUpload(file)` (validates the resolved MIME), so picker, drag-drop and folder upload all accept fonts, including ones with an empty browser MIME. Non-fonts resolve to `file.type` unchanged, so their gate is as strict as before.
- `uploadViaSignedUrl` sends/stores the resolved canonical MIME (sign body, Storage PUT `content-type`, `customer_assets.file_mime_type`).
- Server allowlist (`customer-asset-storage.ts`) spreads `FONT_MIME_TYPES`; migration 175 adds them to the `customer-assets` bucket. Written, **not applied**.
- FONT tile in `_file-previews.tsx`; copy updated in the sign-route error and Customers → Assets help text.
- Customers → Assets has no client-side `file.type` check of its own (it goes straight through `uploadViaSignedUrl`), so it needed no extra gate change.

### Files Changed
- `src/config/font-types.ts` (new), `_docs/task/451-font-types.check.ts` (new), `supabase/migrations/175_customer_assets_font_mime_types.sql` (new)
- `.../onboarding-workspace/_file-upload-constants.ts`, `_files-tab.tsx`, `_use-folder-upload.ts`, `_upload-queue.tsx`, `_file-previews.tsx`
- `src/lib/uploads/customer-asset-storage.ts`, `src/app/api/customers/[customerId]/assets/upload/sign/route.ts`, `src/app/(hub)/customers/[customerId]/client.tsx`

### Deviations From Plan
- None.

### Verification Run
- `npx tsx _docs/task/451-font-types.check.ts` - PASS
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (0 errors; 3 pre-existing warnings, e.g. unused `describeFolderContents` in `_files-tab.tsx`)
- Browser acceptance (five font files, folder drop, `.exe` negative case) - SKIPPED (needs migration 175 applied and a running app; left for the test stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. Changed files reviewed from the Implementation Notes list (CLAUDE.md forbids git commands, so `git diff --name-only` was not used).
- Single source of truth: font MIMEs/extensions live only in `src/config/font-types.ts`; the client list, server list and `FILE_TYPE_TILES` all derive from it. Migration 175 repeats the list by necessity (SQL) and carries a keep-in-sync comment.
- Extension fallback is confined to font extensions (`fontMimeForName` uses an own-property lookup, so `constructor`/`toString` names can't resolve). Non-font gate unchanged: empty-MIME `.ts`/`.ico` still rejected (covered in the check).
- No dead code, no `any`, no debug logging. `isAllowedUpload` is the one helper shared by both client gates, so the picker/drop path and the folder path can't drift.
- Checked the two surfaces the plan flagged: the Files tab file inputs have no `accept` attribute (so the OS picker doesn't hide fonts), and Customers → Assets "Choose File" has no client MIME check of its own. The `FileUpload` component in the same file belongs to the onboarding form (out of scope, unchanged).

### Deviations
- Minor: the server (`/upload/sign`) validates the claimed MIME only, not that a font MIME matches a font file extension. This is the same trust level every existing type has; no regression, and content scanning remains the deferred task 373.
- Minor: legacy multipart `POST .../assets/upload` widens automatically but its client (`_onboarding-wizard.tsx`) still sends raw `file.type`, as the plan's Compatibility Touchpoints already noted.

### Required Fixes
- None.
