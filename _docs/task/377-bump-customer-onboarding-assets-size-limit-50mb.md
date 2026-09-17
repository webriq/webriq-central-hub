# 377: Bump `customer-assets` / `onboarding-assets` File Size Limit to 50MB + Sync Allowed MIME Types

**Created:** 2026-09-17
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Raise the max upload size for the two customer-facing asset buckets — **`customer-assets`** (private; Files tab, Customers → Assets tab, onboarding-workspace Files tab) and **`onboarding-assets`** (public; product onboarding form engine, `/api/upload`) — from 25MB to 50MB, and bring their MIME allowlists in sync with each other and with task 372's widening (which only touched `customer-assets`/onboarding-workspace, not the older `onboarding-assets` bucket or the onboarding form engine's own upload component).

Each bucket's size/MIME rules are currently **hand-copied across multiple files** (app-level constants, error-message strings, UI hint copy, and the Supabase `storage.buckets` row itself). This codebase has already been burned by this exact drift once — see `src/config/attachment-types.ts`'s header comment: task 114 found every task/issue attachment route's own `MAX_FILE_SIZE` constant stale at 25MB despite the bucket already supporting 200MB, which is why that surface was centralized into a single source of truth. `customer-assets`/`onboarding-assets` were explicitly kept as their **own independent allowlists** when that centralization happened (task 273) — do not merge them into `attachment-types.ts`. This task does not introduce a new shared constants module for these two buckets (out of scope — flagged as a possible follow-up, not required here); it updates every existing hand-copied location for both buckets consistently.

## Requirements

- [ ] `customer-assets` Supabase bucket: `file_size_limit` 26214400 → 52428800 (50MB), via a new migration (never edit an applied migration file in place).
- [ ] `onboarding-assets` Supabase bucket: `file_size_limit` 26214400 → 52428800 (50MB) **and** `allowed_mime_types` widened to match the current `customer-assets` app-level allowlist, **minus `image/svg+xml`** (see Must-Not-Change below) — same migration file as above.
- [ ] All app-level `MAX_FILE_SIZE` constants for these two buckets (client and server) bumped from 25MB to 50MB.
- [ ] `onboarding-assets`' app-level MIME allowlist (`src/app/api/upload/route.ts`, `src/components/onboarding/file-upload.tsx`) widened to match `customer-assets`' current list (`html`, `md`, `txt`, `csv`, `ico` ×2 variants, `zip`/`rar` ×2 variants each, `js` ×2 variants, `xml` ×2 variants) — **excluding `image/svg+xml`**.
- [ ] Fix the existing client/server MIME mismatch in the onboarding form engine while touching this: `file-upload.tsx` currently allows `image/svg+xml` client-side (in both `ALLOWED_MIME_TYPES` and the `accept` attribute) even though the server (`/api/upload/route.ts`) has always rejected it — remove `svg` from the client list/extensions/accept string so users don't hit a confusing post-upload 400.
- [ ] All hardcoded "25MB"/"25 MB" UI copy and error-message strings tied to these two buckets updated to "50MB"/"50 MB".
- [ ] `customer-assets`' own MIME list (`customer-asset-storage.ts` / onboarding-workspace `_file-upload-constants.ts`) is already current as of task 372 — verify no further additions are needed there; only the size constant changes.

## Out of Scope / Must-Not-Change

- **`image/svg+xml` must stay excluded from `onboarding-assets`.** `onboarding-assets` is a **public** bucket (customers view uploaded files unauthenticated); `/api/upload/route.ts` has an explicit comment: SVGs can carry embedded `<script>`, a stored-XSS vector when served back from the storage domain. `customer-assets` (private, staff-only, signed URLs) is a different trust boundary and is allowed to keep SVG — do not "fix" that asymmetry, it's intentional.
- **Do not touch `src/config/attachment-types.ts`** (project-assets / task & issue attachments, 200MB) — a completely separate bucket and allowlist, explicitly scoped out per its own header comment.
- **Do not touch** `kb/upload/route.ts` (25MB, KB attachments), the `description-images` routes (10MB, task/ticket/note inline images), `_task-attachment-picker.tsx`'s `COMMENT_OVERRIDE_MAX_FILE_SIZE` (25MB, comment attachments), or `src/lib/stackshift-orders/schema.ts`'s 25MB Zod cap (StackShift order proposal/spec uploads, project-assets bucket) — all different buckets/features that happen to share the same 25MB number today, coincidentally.
- **Do not touch `src/app/_hub_(OLD)/customers/[customerId]/client.tsx`** — underscore-prefixed app-dir folder, not a routed page (dead/archived code from a prior hub version).
- **Do not add malware/content scanning** — that's the explicitly deferred task 373; MIME+size is still a client-declared-type check only, not a security control, in both buckets today.
- **No new shared constants module** for `customer-assets`/`onboarding-assets` — keep updating the existing per-surface constants (per task 273's precedent of these two staying independent). A future consolidation is a possible follow-up, not part of this task.
- **Do not apply the migration to the live database.** Per this repo's established convention (see multiple "written, not applied by the agent" migrations in `CLAUDE.md`), write the migration file only — the user applies it separately.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/141_customer_onboarding_assets_50mb.sql` | Create | Bump `file_size_limit` on both buckets to 52428800; widen `onboarding-assets.allowed_mime_types` (minus svg) |
| `src/lib/uploads/customer-asset-storage.ts` | Modify | `MAX_FILE_SIZE` 25MB → 50MB (+ comment) |
| `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_file-upload-constants.ts` | Modify | `MAX_FILE_SIZE` 25MB → 50MB, `MAX_SIZE_LABEL` "25 MB" → "50 MB" (+ comment) |
| `src/app/api/customers/[customerId]/assets/upload/sign/route.ts` | Modify | Error string "File size exceeds 25MB limit" → 50MB |
| `src/app/api/customers/[customerId]/assets/upload/route.ts` | Modify | Same error string update |
| `src/app/(hub)/customers/[customerId]/client.tsx` | Modify | `ASSET_TYPE_HELP.file` copy + comment: "up to 25MB" → "up to 50MB" |
| `src/app/api/upload/route.ts` | Modify | Widen `ALLOWED_MIME_TYPES` (minus svg), `MAX_FILE_SIZE` 25MB → 50MB, update unsupported-type error message text |
| `src/components/onboarding/file-upload.tsx` | Modify | Widen `ALLOWED_MIME_TYPES`/`ALLOWED_EXTENSIONS` to match server (minus svg — also removes svg, fixing the existing client/server mismatch), `MAX_FILE_SIZE` 25MB → 50MB, hint copy "Max 25MB" → "Max 50MB" + supported-types copy |
| `src/config/onboarding-schemas.ts` | Modify | Line ~107 hint text "Max 25MB" → "Max 50MB" |

## Code Context

### `supabase/migrations/057_customer_assets_permissions_and_files.sql` (reference — do not edit)
```sql
insert into storage.buckets (id, name, public, file_size_limit)
values ('customer-assets', 'customer-assets', false, 26214400) -- 25MB
on conflict (id) do nothing;
```
No `allowed_mime_types` was ever set on this bucket row — it's unrestricted at the Storage layer; MIME is gated only in app code (`customer-asset-storage.ts`). New migration should only touch `file_size_limit` for this bucket — do not introduce a new DB-level MIME restriction here (would be a behavior change beyond this task's scope).

### `supabase/migrations/005_onboarding_storage.sql` (reference — do not edit)
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('onboarding-assets', 'onboarding-assets', true, 26214400, ARRAY[
  'image/jpeg','image/png','image/gif','image/webp','image/svg+xml','application/pdf',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
])
ON CONFLICT (id) DO NOTHING;
```
This bucket **does** enforce `allowed_mime_types` at the Storage API level — widening the app-level allowlist in `api/upload/route.ts` without also updating this array means newly-"allowed" types will still be rejected by Storage itself. The new migration must `UPDATE storage.buckets SET allowed_mime_types = ARRAY[...] WHERE id = 'onboarding-assets'` (drop `image/svg+xml` is a no-op here since it was never in this bucket's array — do not add it).

### `src/lib/uploads/customer-asset-storage.ts` (current, already-widened list — copy this for onboarding-assets, minus svg)
```ts
export const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/html", "text/markdown", "text/plain", "text/csv",
  "image/x-icon", "image/vnd.microsoft.icon",
  "application/zip", "application/x-zip-compressed",
  "application/vnd.rar", "application/x-rar-compressed",
  "text/javascript", "application/javascript",
  "video/mp2t", "application/xml", "text/xml",
];
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // → 50 * 1024 * 1024
```

### `src/app/api/upload/route.ts` (current, narrow list + explicit svg exclusion — widen but keep the exclusion)
```ts
const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  // image/svg+xml intentionally excluded — SVGs can carry embedded <script>, a stored-XSS
  // vector when served back at the storage domain.
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // → 50MB
```
Keep the svg-exclusion comment; add the same new types as `customer-asset-storage.ts` below it.

### `src/components/onboarding/file-upload.tsx` (current — client/server mismatch to fix)
```ts
const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", // ← drop svg
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const ALLOWED_EXTENSIONS = ".jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx"; // ← drop .svg
const MAX_FILE_SIZE = 25 * 1024 * 1024;
```

## Implementation Steps

1. Write `supabase/migrations/141_customer_onboarding_assets_50mb.sql`:
   - `UPDATE storage.buckets SET file_size_limit = 52428800 WHERE id = 'customer-assets';`
   - `UPDATE storage.buckets SET file_size_limit = 52428800, allowed_mime_types = ARRAY[...] WHERE id = 'onboarding-assets';` — array = the widened list (customer-assets' list minus `image/svg+xml`).
2. Update `customer-asset-storage.ts` and onboarding-workspace `_file-upload-constants.ts`: bump `MAX_FILE_SIZE` (and `MAX_SIZE_LABEL`) to 50MB. No MIME changes needed here (already current).
3. Update `src/app/api/upload/route.ts`: widen `ALLOWED_MIME_TYPES` (keep the svg-exclusion comment and behavior), bump `MAX_FILE_SIZE` to 50MB, update the unsupported-type error message text to list the new categories.
4. Update `src/components/onboarding/file-upload.tsx`: widen `ALLOWED_MIME_TYPES`/`ALLOWED_EXTENSIONS` to match step 3's server list (drop svg from both), bump `MAX_FILE_SIZE` to 50MB, update the "Supported: ..." hint copy and the "Max 25MB" text.
5. Update `src/config/onboarding-schemas.ts` line ~107: "Max 25MB" → "Max 50MB".
6. Update the two `assets/upload*/route.ts` error strings and `client.tsx`'s help copy + comment from "25MB" to "50MB".
7. Grep the repo for any remaining literal "25MB"/"25 MB" tied to `customer-assets` or `onboarding-assets` specifically (not the other unrelated 25MB buckets listed in Out of Scope) to catch anything missed.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` passes.
- [ ] `pnpm lint` passes.
- [ ] A 30–50MB file uploads successfully via: (a) Customers → Assets tab, (b) a project Files tab, (c) the onboarding-workspace Files tab, (d) the public onboarding form engine's file field — all previously capped at 25MB.
- [ ] A file over 50MB is rejected client-side with a "50MB" message on all four surfaces above.
- [ ] Uploading a `.html`, `.csv`, or `.zip` file through the public onboarding form engine (`/api/upload`) now succeeds (previously would 400 on MIME).
- [ ] Uploading an `.svg` through the public onboarding form engine is rejected both client-side (no longer offered in the file picker's `accept`) and server-side (still 400s if forced).
- [ ] The migration file is written but **not** applied/run against the live database.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```
Manual/browser: exercise the four upload surfaces listed in Acceptance Criteria with a file in the 30–50MB range and one just over 50MB; confirm mime-type acceptance/rejection behavior described above.

## Compatibility Touchpoints

- Supabase migration must be applied by the user (not the agent) before the raised size limit takes effect in any real environment — until then, `file_size_limit`/`allowed_mime_types` at the Storage layer still reflect the old 25MB/narrow-MIME values even though app code allows more, meaning uploads between 25–50MB or of newly-added `onboarding-assets` MIME types will still be rejected **by Storage itself** with a generic error until the migration lands. Worth calling out to the user explicitly at handoff.
- No effect on Vercel's ~4.5MB Route Handler body cap: `customer-assets` already uses the browser-direct signed-URL upload path (task 350) so it's unaffected; `onboarding-assets`' `/api/upload` route is still the old multipart-to-handler path and was already effectively capped by Vercel's 4.5MB gateway limit before this change regardless of the bucket's 25MB/50MB `file_size_limit` — raising the bucket limit does not fix that pre-existing limitation for files over ~4.5MB in production. Flag this to the user; migrating `/api/upload` to a signed-URL flow is out of scope here but may be worth a follow-up task.

## Implementation Notes

### What Changed
- Bumped `MAX_FILE_SIZE` from 25MB to 50MB across every app-level constant for both `customer-assets` and `onboarding-assets`, and updated every hardcoded "25MB"/"25 MB" UI/error string tied to these two buckets to "50MB"/"50 MB".
- Widened `onboarding-assets`' MIME allowlist (server `ALLOWED_MIME_TYPES` in `/api/upload/route.ts` and the onboarding form engine's `file-upload.tsx`) to match `customer-assets`' task-372 list (html/md/txt/csv/ico ×2/zip ×2/rar ×2/js ×2/xml ×2), explicitly keeping `image/svg+xml` excluded since `onboarding-assets` is a public bucket.
- Fixed the pre-existing client/server MIME mismatch in `file-upload.tsx`: it previously allowed `image/svg+xml` client-side (both in `ALLOWED_MIME_TYPES` and the `accept` attribute) even though the server always rejected it — svg removed from both.
- Wrote a new migration (`141_customer_onboarding_assets_50mb.sql`) bumping `file_size_limit` to 52428800 on both bucket rows, and widening `onboarding-assets.allowed_mime_types` to match (minus svg) — `customer-assets` has no DB-level MIME restriction and none was added, per the task's Must-Not-Change boundary.
- `customer-assets`' own app-level MIME list (`customer-asset-storage.ts`, onboarding-workspace `_file-upload-constants.ts`) needed no MIME changes — already current as of task 372; only their size constants were bumped.

### Files Changed
- `supabase/migrations/141_customer_onboarding_assets_50mb.sql` - new migration, size bump for both buckets + MIME widen for `onboarding-assets` only
- `src/lib/uploads/customer-asset-storage.ts` - `MAX_FILE_SIZE` 25MB → 50MB
- `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_file-upload-constants.ts` - `MAX_FILE_SIZE`/`MAX_SIZE_LABEL` 25MB → 50MB
- `src/app/api/customers/[customerId]/assets/upload/sign/route.ts` - error string "25MB" → "50MB"
- `src/app/api/customers/[customerId]/assets/upload/route.ts` - error string "25MB" → "50MB"
- `src/app/(hub)/customers/[customerId]/client.tsx` - `ASSET_TYPE_HELP.file` copy + comment "25MB" → "50MB"
- `src/app/api/upload/route.ts` - widened `ALLOWED_MIME_TYPES` (minus svg), `MAX_FILE_SIZE` 25MB → 50MB, updated unsupported-type error message
- `src/components/onboarding/file-upload.tsx` - widened `ALLOWED_MIME_TYPES`/`ALLOWED_EXTENSIONS` (dropped svg, fixing client/server mismatch), `MAX_FILE_SIZE` 25MB → 50MB, updated validation error text + hint copy
- `src/config/onboarding-schemas.ts` - hint text "Max 25MB" → "Max 50MB"
- `TASKS.md` - moved task 377 from Planned to In Progress, will move to Testing next

### Deviations From Plan
- None. Implementation followed the task document's Proposed File Changes and Implementation Steps exactly.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`, not touched by this task)
- Manual/browser upload testing (30–50MB file, per-surface MIME/size acceptance) - SKIPPED (requires the migration to be applied to a live Supabase instance first, which per this repo's convention the agent does not do; the user must apply `141_customer_onboarding_assets_50mb.sql` before this is testable end-to-end)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Read all 9 changed files in full (migration + 8 source files) and checked each against the task doc's Code Context reference snippets — every edit matches the plan exactly, no unlisted files touched.
- Migration is `UPDATE`-only against existing rows (never edits an applied migration file), consistent with repo convention; `onboarding-assets`' new `allowed_mime_types` array is the `customer-assets` list minus `image/svg+xml`, matching the Must-Not-Change boundary.
- `src/app/api/upload/route.ts` and `file-upload.tsx` both keep the svg-exclusion (with explanatory comment in the former, an updated header comment in the latter) — the deliberate client/server asymmetry fix is a targeted, well-scoped change, not a rewrite.
- No new abstractions, no shared constants module introduced — matches the task doc's explicit instruction to keep the three MIME lists independently maintained (task 273 precedent).
- No dead code, no `any`, no added nesting, no secrets/logging changes. Comments added are all "why" (task/bucket-trust-boundary rationale), not restating "what".
- `TASKS.md` correctly reflects `Testing` status (verified in Implementation Notes' file list and independently re-confirmed line-by-line above).

### Deviations
- None. Implementation matches every row of Proposed File Changes and every Implementation Step; Acceptance Criteria that depend on a live DB (migration application, actual upload round-trips) are correctly marked SKIPPED rather than falsely claimed as passing.

### Required Fixes
- None.

## Post-Gate Amendment (user-requested scope change)

After the quality gate passed, the user asked to also add a DB-level `allowed_mime_types` restriction to the `customer-assets` bucket (previously deliberately excluded as a Must-Not-Change boundary — see original "Out of Scope" section above and the Q&A that preceded this change). The user confirmed this is wanted, so it is no longer out of scope for this task.

**Correction:** the first attempt at this amendment edited `141_customer_onboarding_assets_50mb.sql` in place to add the `customer-assets` MIME array. The user then ran `npx supabase db push` and it reported "Remote database is up to date" — `npx supabase migration list` and `npx supabase db push --dry-run` confirmed version `141` was already recorded as applied in the remote migration history (it must have been pushed between the quality gate passing and this request), meaning the edit was never actually going to reach the database — Supabase's CLI tracks applied status by migration version number, not file content, so it silently skips a version it already has recorded regardless of later edits to that file.

**Fix:** reverted `141` back to its originally-applied content (size bump only for `customer-assets`; size + MIME widen for `onboarding-assets`), and created a new migration, `supabase/migrations/142_customer_assets_allowed_mime_types.sql`, containing only the `customer-assets` `allowed_mime_types` addition (same 25-type list as `customer-asset-storage.ts`'s `ALLOWED_MIME_TYPES`, including `image/svg+xml` — this bucket is private/staff-only, so the public-bucket XSS rationale doesn't apply). Verified via `npx supabase db push --dry-run` that `142` is now the only pending migration.

No app code changed for this amendment (app-level MIME gating for `customer-assets` was already this exact list). `npx tsc --noEmit` / `pnpm lint` unaffected (SQL-only change). `142` is written but not applied — the user applies it via their own `db push`.
