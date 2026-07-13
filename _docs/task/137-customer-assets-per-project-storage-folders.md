# 137: Customer Assets — Per-Project Folder Separation in Supabase Storage

**Created:** 2026-07-13
**Priority:** MEDIUM
**Type:** refactor
**Recommended Tier:** deep

---

## Overview

Investigated per the user's question: are all Phase 1 files (business facts, checklist
attachments, HTML mockups, etc.) actually saved under one project-specific folder in the
`customer-assets` Supabase Storage bucket?

**Finding: no.** The upload route builds the storage path as:

```ts
// src/app/api/customers/[customerId]/assets/upload/route.ts
const storagePath = `${customerId}/${timestamp}_${safeFilename}`;
```

Every asset — across every project a customer has, and every phase — lands in one flat,
**customer-level** folder in the bucket (`{customerId}/{timestamp}_{filename}`), never
namespaced by `project_id`. Since one customer can have multiple projects
(`projects` table, `customer_id` FK, CLAUDE.md's "a customer can have multiple
projects"), files from *different* projects under the same customer physically
co-exist in the same bucket folder today. The only separation is logical — the
`project_id`/`phase_number` columns on the `customer_assets` DB row — and the File
Explorer's "folders" (task 134) are a UI-only grouping derived from each asset's
`label`, not real Storage subfolders.

This task makes the real bucket layout match the mental model: `{customerId}/{projectId}/{timestamp}_{filename}`.

**Confirmed low-risk for RLS**: `customer-assets`' Storage policies
(`supabase/migrations/057_customer_assets_permissions_and_files.sql`) gate purely on
`bucket_id` + `get_my_role()` — there is no path-based policy condition today, so
changing the path structure requires **no RLS migration**, only an application-code
change plus a decision on already-uploaded files (see Requirements).

## Requirements

- [ ] `POST /api/customers/[customerId]/assets/upload` accepts an optional
      `project_id` field (from the caller's form data) and, when present, builds
      `storagePath = "${customerId}/${project_id}/${timestamp}_${safeFilename}"`;
      when absent (calls that don't have a project context — e.g. general Customer
      Assets tab uploads not tied to a specific project), falls back to today's
      `"${customerId}/${timestamp}_${safeFilename}"` — **fully backward compatible**,
      not a breaking change for non-project-scoped callers.
- [ ] `PATCH /api/customers/[customerId]/assets/[assetId]/content` (task 133's route,
      overwrites content in place at the *existing* `file_path`) needs **no change** —
      it already writes back to whatever path the row already has, whether old-style
      or new-style.
- [ ] All onboarding-wizard upload call sites (`handleUpload`, `handleBusinessFactsUpload`,
      `handleOutcomeFileUpload`, and the equivalents added in tasks 131–133) pass
      `project_id: project.id` in the upload `FormData`, since they already know it and
      already pass it to the subsequent `POST .../assets` call.
- [ ] **Existing already-uploaded files are left exactly where they are** — no bucket
      migration/move of historical objects. `file_path` in the DB is the source of truth
      for reads (`file-url`/`content` routes fetch by the stored `file_path`, never
      reconstruct it), so old rows keep working unchanged; only *new* uploads from this
      point forward get the nested path.
- [ ] Document the new path convention where the old one was documented (CLAUDE.md's Key
      Conventions section, if it mentions asset storage layout — otherwise a comment at
      the upload route is sufficient).

## Out of Scope / Must-Not-Change

- No RLS policy changes — confirmed unnecessary (role-only gating today).
- No retroactive move/rename of existing Storage objects. This is an explicit scope
  boundary: a backfill migration that re-uploads and deletes every historical object
  under its new path is a meaningfully riskier, separate undertaking (potential data
  loss on a failed partial migration, signed-URL cache invalidation, etc.) and was not
  asked for — flag it as a follow-up if the user wants full historical consistency.
- No changes to `customer_assets` table schema — `project_id` already exists as a column;
  this task only changes what the *Storage path string* looks like, not the DB schema.
- No changes to the Customers → Assets tab's own upload flow behavior for assets that
  aren't tied to a specific project (its `POST .../assets/upload` calls don't currently
  send `project_id`, and per the Add Asset modal's own scope, most credentials/links
  there aren't project-scoped) — the fallback path preserves its exact current behavior.
- No changes to the `project-assets` bucket (a different bucket, used by Zoho import
  attachments — migration 050 — unrelated to this one).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/customers/[customerId]/assets/upload/route.ts` | Modify | Accept optional `project_id` form field; nest the storage path under it when present. |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Add `formData.append("project_id", project.id)` to every upload call site in this file. |

## Code Context

### Current upload route (`src/app/api/customers/[customerId]/assets/upload/route.ts:41-63`)

```ts
const { customerId } = await params;
const formData = await request.formData();
const file = formData.get("file") as File | null;
// ...
const timestamp = Date.now();
const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
const storagePath = `${customerId}/${timestamp}_${safeFilename}`;
```

Change to:

```ts
const { customerId } = await params;
const formData = await request.formData();
const file = formData.get("file") as File | null;
const projectId = formData.get("project_id") as string | null;
// ...
const timestamp = Date.now();
const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
const storagePath = projectId
  ? `${customerId}/${projectId}/${timestamp}_${safeFilename}`
  : `${customerId}/${timestamp}_${safeFilename}`;
```

No validation needed on `projectId` beyond "is it a non-empty string" — it only affects
the Storage path string, not access control (which stays role-based via `allowed_roles`,
independent of path).

### Onboarding wizard's upload call sites — add one line each

Every `handleXUpload` in `_onboarding-wizard.tsx` (there are ~7 by the time tasks
131–133 have landed: Documents, Business Facts, Outcome Target, Migration Checklist,
Content Map, HTML Mockup) already builds a `FormData` and already has `project.id` in
scope. Example (`handleUpload`):

```ts
const formData = new FormData();
formData.append("file", file);
formData.append("project_id", project.id); // new
const uploadRes = await fetch(`/api/customers/${project.customer_id}/assets/upload`, { method: "POST", body: formData });
```

Apply the same one-line addition to each of the file's upload handlers.

## Implementation Steps

1. Update `upload/route.ts` to read `project_id` from form data and conditionally nest the storage path.
2. Add `formData.append("project_id", project.id)` to every upload handler in `_onboarding-wizard.tsx`.
3. `npx tsc --noEmit` and `pnpm lint`.
4. Manually verify per Acceptance Criteria.

## Acceptance Criteria

- [ ] A new file uploaded from any onboarding wizard step lands in the bucket at `{customerId}/{projectId}/{timestamp}_{filename}` (confirm via Supabase Storage dashboard or the returned `path`).
- [ ] The Customers → Assets tab's own uploads (not project-scoped) continue to land at the old `{customerId}/{timestamp}_{filename}` path, unchanged.
- [ ] Viewing/editing a *newly* uploaded file (via the existing `file-url`/`content` routes) works identically to before — those routes are agnostic to path shape.
- [ ] Viewing/editing a *pre-existing* file (uploaded before this change) still works — confirms no regression for historical data.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.
- [ ] No new packages, no DB migration, no RLS changes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual, localhost:3000:
#   - Upload a new file from an onboarding wizard step -> inspect the returned path / Supabase Storage dashboard -> confirm it's nested under the project id
#   - Open/view that same file -> confirm it still previews correctly
#   - Upload an asset via the Customers -> Assets tab (not project-scoped) -> confirm its path is unchanged (no project subfolder)
#   - Open a pre-existing (already-uploaded, old-path) file from before this change -> confirm it still opens correctly
```

## Compatibility Touchpoints

- No DB migration, no RLS changes.
- Purely additive/backward-compatible change to the upload route's path construction — existing stored `file_path` values and existing callers that don't send `project_id` are unaffected.

## Implementation Notes

### What Changed
- `POST /api/customers/[customerId]/assets/upload` now reads an optional `project_id` field from the incoming form data; when present, the Storage path is built as `{customerId}/{projectId}/{timestamp}_{filename}` instead of the old flat `{customerId}/{timestamp}_{filename}`. When absent, behavior is unchanged (backward compatible for non-project-scoped callers like the Customers → Assets tab).
- All 6 upload handlers in the onboarding wizard (Documents, Business Facts, Outcome Target, Migration Checklist, Content Map, HTML Mockup) now send `project_id: project.id` in their upload `FormData`, so every new Phase 1 file upload lands correctly nested under its project.
- Documented the convention inline at the upload route (the task doc's own fallback, since CLAUDE.md doesn't currently document asset storage layout in a spot that needed updating).
- No changes needed to the `content` PATCH route (task 133) — it already writes back to whatever `file_path` the row already has, agnostic to path shape, confirmed by re-reading it before starting.

### Files Changed
- `src/app/api/customers/[customerId]/assets/upload/route.ts` — read `project_id` from form data; conditional nested vs. flat path construction.
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — added `formData.append("project_id", project.id)` to all 6 upload handlers (single `replace_all` edit across the identical `formData.append("file", file);` line present in each).

### Deviations From Plan
- None — implementation matched the task document's Code Context and Implementation Steps exactly.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS (no warnings/errors).
- Manual browser verification — **SKIPPED**, same standing reason as the rest of this batch: live verification requires a logged-in Hub session, and entering the user's password to authenticate is a prohibited action regardless of authorization. Verified instead by code review: the path-construction change is a straightforward conditional string template with no other logic altered; all 6 call sites were confirmed via `grep -c` to now include the new `project_id` line (6/6); the `content` and `file-url` routes were re-read and confirmed to operate purely on the stored `file_path` value, never reconstructing it, so they're correct regardless of which path shape a given row has.
