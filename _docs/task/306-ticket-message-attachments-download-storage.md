# 306: Download & Store Actual Zoho Desk Thread/Comment Attachment Files

**Created:** 2026-08-25
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Completed
**Completed:** 2026-08-25

---

## Overview

Task 304 (Desk Threads) and task 296 (Desk Ticket Comments) already capture attachment **metadata** into `ticket_messages.source_meta.attachments` (`id`, `name`, `size`, `href`, `previewurl`, and `status` on Threads) — but no actual file content is preserved. Those `href` values are Zoho API URLs that stop resolving the moment Zoho Desk is decommissioned.

This task was blocked on one open question, now resolved: **can the Hub fetch Zoho Desk attachment content server-side, or does it need the same manual-download workaround as Zoho Projects?** A diagnostic tool built for this purpose (`src/app/api/admin/zoho-export/verify-attachment/route.ts`) was tested live against a real attachment `href` and returned **`200 OK` with `image/jpeg` content** — confirmed working, no manual step needed. This is the opposite of Zoho Projects/WorkDrive attachments, which are architecturally blocked server-side (`401 INVALID_OAUTHSCOPE` — task 106), forcing `zoho-import/attachments/route.ts` and `issue-attachments/route.ts` into a manual browser-download-then-bulk-upload flow.

Because server-side fetch works, this task can be a single fully-automated route: read attachment metadata already sitting in `ticket_messages`, fetch each file directly from Zoho, and store it in Supabase Storage + the native `attachments` table — no export step, no manual file handling.

### Data already available (no new export needed)

Confirmed via a live query against the real database:
- **~105 `ticket_messages` rows** with `source_meta->>'zohoSource' = 'thread'` have a non-empty `attachments[]` array (shape: `{id, name, size, status, href, previewurl}` — `status` always `"VALID"` in real data).
- **Exactly 1 row** with `zohoSource = 'comment'` has an attachment (shape: `{id, name, size, href, previewurl}` — no `status` field, since Comments' raw Zoho payload never had one).
- Real file sizes observed range from ~4KB to ~3.6MB; some threads carry up to 12 attachments.

### Target schema (already mostly exists)

The Hub already has a generic, polymorphic `attachments` table (`supabase/migrations/025_v2_schema.sql`): `id, entity_type, entity_id, storage_path, filename, size, uploaded_by, created_at`, extended by `supabase/migrations/035_zoho_decommission_schema.sql` with `external_id text unique` (import dedupe key) and `source_url text` ("fallback if storage upload failed", per that migration's own comment). `entity_type` has a CHECK constraint currently limited to `('task', 'project', 'comment', 'issue')` — this task adds `'ticket_message'` to that list. `entity_id` will be `ticket_messages.id` (the specific message/thread/comment), **not** `tickets.id` — the attachment belongs to one conversation entry, not the ticket as a whole.

### RLS stays staff-only (deliberate, not an oversight)

`attachments` today has zero client-facing read policy — `attachments_staff_read` (admin/super_admin/pm/developer select), `attachments_pm_write` (admin/super_admin/pm all), `attachments_developer_insert` (developer insert) are the only policies (migrations 026/048). This task imports **historical Zoho archival data**, same staff-facing purpose as every other Zoho import in this codebase — reusing that exact staff-only shape is correct. Making these attachments client-visible would be a separate, explicit future decision, not something to fold in here.

### Storage bucket decision

New dedicated bucket: **`ticket-attachments`** (private, 50MB file size limit — matching `project-assets`', generous relative to the largest real file seen, ~3.6MB). RLS policies structurally identical to `project-assets`' (`supabase/migrations/050_project_assets_storage.sql`): same role lists, same `get_my_role()` usage, same staff-only shape. A dedicated bucket (rather than reusing `project-assets`) follows the existing precedent of domain-specific buckets in this codebase (`task-content` migration 091, `user-avatars` migration 112, `kb` migration 016) and keeps ticket/helpdesk attachments cleanly separated from project-scoped assets.

## Requirements

- [ ] Migration `116_attachments_ticket_message_entity_type.sql` — widen `attachments_entity_type_check` to include `'ticket_message'`, mirroring migration 054's exact `drop constraint` / `add constraint` two-step pattern.
- [ ] Migration `117_ticket_attachments_storage.sql` (or combined with the above) — create the `ticket-attachments` storage bucket + RLS policies, mirroring migration 050's structure exactly (same role lists, same `get_my_role()` pattern, 50MB limit).
- [ ] `POST /api/admin/zoho-import/ticket-attachments/route.ts` — admin-gated (`admin`/`super_admin` only, matching every sibling route), SSE progress response:
  - Paginated query (1000-row page pattern) over `ticket_messages` selecting `id, source_meta` where `source_meta->'attachments'` is a non-empty array.
  - Flatten into a list of `{ ticket_message_id, attachment metadata }`.
  - Pre-fetch existing `attachments.external_id` values to skip already-downloaded files on re-run (idempotent; avoids redundant re-downloads).
  - For each remaining attachment: fetch `href` via `fetchZohoWithRetry(href, token, { label, headers: deskHeaders() })` (same call shape already proven in `verify-attachment/route.ts`), get the body bytes, upload to `ticket-attachments` at `${ticketMessageId}/${attachmentExternalId}_${sanitizedFilename}`, then upsert into `attachments`: `{ external_id, entity_type: 'ticket_message', entity_id: ticketMessageId, storage_path, filename, size, source_url: href }` (upsert on `external_id`, mirroring `zoho-import/attachments/route.ts`'s exact upsert shape).
  - Per-file failures (fetch error, oversized file, storage upload error) are recorded in an errors array; the run continues rather than aborting.
  - SSE `progress` frames per file (current/total), same shape as existing per-file SSE loops in this codebase.
- [ ] New "Ticket Attachments" import-level card in `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx`'s Import Phase, with its own SSE progress handler (mirroring the existing `handleTicketCommentsExport`/`handleThreadsExport` custom-handler pattern already in that file).
- [ ] Re-running the import stays idempotent — no duplicate `attachments` rows, no redundant re-downloads of already-stored files.

## Out of Scope / Must-Not-Change

- **Client-facing visibility of these attachments** — RLS stays staff-only. Not part of this task.
- **Ticket-level (not ticket_message-level) attachments** — Tickets themselves have zero attachment fields (confirmed empirically against the real export); nothing to import at that level.
- **Re-touching the Threads/Comments import routes** (`desk-threads/route.ts`, `desk-ticket-comments/route.ts`) — their metadata capture is already correct and complete (tasks 296/304's post-testing fixes). Only reading from what they already wrote to `ticket_messages`.
- **Zoho Projects/Issues attachment routes** (`zoho-import/attachments/route.ts`, `issue-attachments/route.ts`) — unrelated, already working, structurally different due to the WorkDrive server-side block. Used here only as a pattern reference, not modified.
- **Any UI to browse/preview these attachments once stored** — a consumption-side feature, separate from this ingestion task.
- **The `verify-attachment` diagnostic route and its UI card** — stays as-is; not superseded by this task (still useful for spot-checking individual URLs).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/116_attachments_ticket_message_entity_type.sql` | Create | Widen `attachments_entity_type_check` to include `'ticket_message'`. |
| `supabase/migrations/117_ticket_attachments_storage.sql` | Create | `ticket-attachments` bucket (private, 50MB) + staff-only RLS policies. |
| `src/app/api/admin/zoho-import/ticket-attachments/route.ts` | Create | Admin-gated SSE route: fetch each attachment from Zoho, upload to Storage, upsert `attachments`. |
| `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` | Modify | Add "Ticket Attachments" import-level card with SSE progress handler. |

## Code Context

### `supabase/migrations/054_attachments_issue_entity_type.sql` — exact pattern to mirror for the entity_type migration

```sql
alter table attachments
  drop constraint attachments_entity_type_check;

alter table attachments
  add constraint attachments_entity_type_check
  check (entity_type in ('task', 'project', 'comment', 'issue'));
```

New migration adds `'ticket_message'` to that list.

### `supabase/migrations/050_project_assets_storage.sql` — exact pattern to mirror for the storage bucket

```sql
insert into storage.buckets (id, name, public, file_size_limit)
values ('project-assets', 'project-assets', false, 52428800) -- 50MB
on conflict (id) do nothing;

drop policy if exists "project_assets_staff_read" on storage.objects;
create policy "project_assets_staff_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'project-assets'
    and get_my_role() in ('admin', 'super_admin', 'pm', 'developer')
  );

drop policy if exists "project_assets_staff_write" on storage.objects;
create policy "project_assets_staff_write"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'project-assets'
    and get_my_role() in ('admin', 'super_admin', 'pm')
  )
  with check (
    bucket_id = 'project-assets'
    and get_my_role() in ('admin', 'super_admin', 'pm')
  );
```

Swap `project-assets` for `ticket-attachments` throughout.

### `src/app/api/admin/zoho-import/attachments/route.ts` — upload + upsert pattern to mirror

```ts
const safeName = `zoho/${att._zoho_task_id}/${externalId}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
let storagePath = "";
const { error: uploadError } = await adminClient.storage
  .from("project-assets")
  .upload(safeName, file, { upsert: true });
if (uploadError) {
  errors.push(`${file.name}: storage upload failed: ${uploadError.message}`);
} else {
  storagePath = safeName;
}

const { error } = await adminClient.from("attachments").upsert(
  {
    external_id: externalId,
    entity_type: "task",
    entity_id: taskId,
    storage_path: storagePath,
    filename: file.name,
    size: fileSize,
    source_url: att.download_url ?? null,
  },
  { onConflict: "external_id" }
);
```

For this task: replace the `file` (from admin-uploaded `FormData`) with the response body fetched server-side from `href`; `entity_type: "ticket_message"`; `entity_id` = the `ticket_messages.id` resolved from the flattened list; path prefix `ticket-attachments` bucket instead of `project-assets`.

### `src/app/api/admin/zoho-export/verify-attachment/route.ts` — proven server-side fetch call shape

```ts
const token = await getZohoAccessToken();
const headers = deskHeaders();
const { res, throttleExhausted } = await fetchZohoWithRetry(url, token, {
  label: "verify-attachment",
  headers,
});
```

This exact call (confirmed live: `200 OK`, `image/jpeg`) is the one to reuse — swap `res.ok`/header-inspection for `await res.arrayBuffer()` (or `res.blob()`) to get the actual file bytes for upload.

### Real `source_meta.attachments` shape (from live DB query)

```json
{
  "id": "300063000088713053",
  "href": "https://desk.zoho.com/supportapi/api/v1/tickets/300063000088713003/threads/300063000088713052/attachments/300063000088713053/content",
  "name": "KohenMeyers.jpg",
  "size": "330341",
  "status": "VALID",
  "previewurl": null
}
```

`size` is a string — cast to a number for the `attachments.size` (`bigint`) column.

## Implementation Steps

1. Write and apply migration 116 (entity_type widening).
2. Write and apply migration 117 (storage bucket + RLS).
3. Build `ticket-attachments` import route: paginated `ticket_messages` query → flatten attachments → pre-fetch existing `external_id`s → per-attachment fetch/upload/upsert loop with SSE progress and per-file error tolerance.
4. Add the "Ticket Attachments" import card + SSE handler to `_zoho-desk-tab.tsx`.
5. Run once against real data; verify file count, spot-check a few downloaded files actually open correctly, confirm `attachments` rows resolve correctly via `entity_id` → `ticket_messages.id`.
6. Re-run once more to confirm idempotency (no duplicate rows, no re-downloads of already-stored files).

## Acceptance Criteria

- [ ] Running the import downloads and stores every attachment referenced in `ticket_messages.source_meta.attachments` (Threads + Comments) into the `ticket-attachments` bucket.
- [ ] Each stored file has a matching `attachments` row with `entity_type: 'ticket_message'`, `entity_id` resolving to the correct `ticket_messages.id`, correct `filename`/`size`, and `source_url` set to the original Zoho `href`.
- [ ] A spot-checked sample of downloaded files opens correctly (not corrupted, not an HTML error page saved as if it were the file).
- [ ] Per-file failures are reported in the UI/response without aborting the whole run.
- [ ] Re-running the import is idempotent — no duplicate `attachments` rows, and already-downloaded files are skipped rather than re-fetched.
- [ ] `npx tsc --noEmit` passes.
- [ ] `pnpm lint` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual, admin-logged-in: apply migrations 116/117, run the new "Ticket Attachments" import from `/admin/migrate`, confirm progress UI and final counts, spot-check several files in Supabase Storage (download and open a few of different types — image, PDF, docx), and confirm `attachments` rows via SQL (`select * from attachments where entity_type = 'ticket_message' limit 20`). Re-run once more to confirm idempotency.

## Compatibility Touchpoints

- Two new migrations (116, 117) — schema/storage change, needs to be applied to the remote database by the user (same handoff pattern as migrations 113/114 in tasks 293/296).
- Does not modify `desk-threads`/`desk-ticket-comments` import routes, the `verify-attachment` diagnostic tool, or any Zoho Projects/Issues attachment routes.
- No client-facing behavior change — this is a staff-only admin migration tool, same category as every other `/admin/migrate` level.

## Implementation Notes

### What Changed
- Added migration `116_attachments_ticket_message_entity_type.sql` — widens `attachments_entity_type_check` to include `'ticket_message'`, exact `drop constraint`/`add constraint` two-step pattern mirrored from migration 054.
- Added migration `117_ticket_attachments_storage.sql` — creates the private `ticket-attachments` storage bucket (50MB limit) with staff-only RLS policies (`ticket_attachments_staff_read`/`ticket_attachments_staff_write`), structurally identical to `project-assets`' migration 050 (same `get_my_role()` role lists).
- Added `POST /api/admin/zoho-import/ticket-attachments/route.ts` — admin-gated SSE route. No export/JSON file involved: paginates `ticket_messages` directly, flattens every `source_meta.attachments[]` entry across both Threads and Comments rows, pre-fetches existing `attachments.external_id`s to skip already-downloaded files, then for each remaining attachment fetches the Zoho `href` via `fetchZohoWithRetry()` + `deskHeaders()` (the same call shape already proven live in `verify-attachment/route.ts`), uploads the bytes to the `ticket-attachments` bucket, and upserts into `attachments` (`entity_type: 'ticket_message'`, `entity_id: ticket_messages.id`, `source_url` set to the original `href`). Per-file failures (throttle exhaustion, non-200, oversized file, upload error, DB error) are collected into an errors array without aborting the run; progress is streamed via SSE `progress`/`done` frames.
- Added a "Ticket Attachments" import-level card to `_zoho-desk-tab.tsx`'s Import Phase, following the same special-cased-SSE-handler pattern already used for the Export Phase's `desk-ticket-comments`/`desk-threads` cards (own state object for progress/done, `importStates["ticket-attachments"]` tracked separately just for the `StateIcon`/disabled-button state).

### Files Changed
- `supabase/migrations/116_attachments_ticket_message_entity_type.sql` — new
- `supabase/migrations/117_ticket_attachments_storage.sql` — new
- `src/app/api/admin/zoho-import/ticket-attachments/route.ts` — new
- `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` — added `TicketAttachmentsImportState`, `ticket-attachments` entry in `IMPORT_LEVELS`, `handleTicketAttachmentsImport()`, and a special-case render branch in the Import Phase

### Deviations From Plan
- None from the approved task doc's scope. The task doc's own acceptance criteria (spot-checking downloaded files, confirming `attachments` rows via SQL, re-running for idempotency) require live Zoho API access and a live Supabase database — not run in this session, see Verification Run below.

### Verification Run
- `npx tsc --noEmit` - PASS (zero errors)
- `pnpm lint` - PASS (0 errors; same 2 pre-existing, unrelated warnings in an untouched file)
- Migrations 116/117 applied to the remote database - **SKIPPED**, per this project's established pattern of leaving schema migration application to the user (same precedent as migrations 113/114 in tasks 293/296).
- Live run of the Ticket Attachments import (actual file downloads from Zoho, uploads to the new bucket, `attachments` row verification, idempotency re-run) - **SKIPPED**, blocked on the migrations above being applied first. The route is ready to run once migrations 116/117 are applied — someone needs to run it via `/admin/migrate`, spot-check a few downloaded files, and confirm `attachments` rows before this task can be marked fully verified.

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Fixed one real finding during review:** the per-file error-handling block in `ticket-attachments/route.ts` nested five levels deep (`throttleExhausted` → `!res.ok` → oversized → upload error → db error), against the Standards Checklist's "no deep nesting where guard clauses would be clearer." Flattened it into sequential guard clauses (`if (...) { errors.push(...); send(...); continue; }`), each followed by an explicit `continue` — same total error coverage, same SSE progress reporting per file, meaningfully easier to read top-to-bottom. Re-ran `tsc --noEmit`/`pnpm lint` after — still clean.
- Two separate inline `PAGE = 1000` pagination loops exist within the same file (the `ticket_messages` scan and the `attachments.external_id` pre-fetch). Checked against precedent: this exact inline-not-extracted pattern is how every sibling import route in this codebase does pagination — including cases with two paginated loops in one file (e.g. `desk-tickets/route.ts`'s `contactRows`/`customerRows` loops). Not a deviation; matches established convention.
- No `console.log`/`console.error` calls in the new route at all. Checked against the specific sibling the task doc's own Code Context cites as the pattern to mirror for the upload+upsert logic (`zoho-import/attachments/route.ts`) — that route also has zero console logging in its per-file loop, relying entirely on the `errors[]` array surfaced in the final SSE `done` frame. Matches that precedent exactly; not a gap.
- No unused imports/fields, no `any`/untyped escape hatches beyond the established `Record<string, unknown>`/`as Array<{...}>` casting convention already used throughout this codebase's Zoho import routes.
- Naming matches precedent: `AttachmentMeta`/`FlatAttachment` follow the `XRaw`/flattened-list naming style already used elsewhere (e.g. `desk-ticket-comments`' `DeskTicketCommentRaw`); `safeName` mirrors the exact sanitization pattern (`filename.replace(/[^a-zA-Z0-9._-]/g, "_")`) already used in `zoho-import/attachments/route.ts`.
- Migrations 116/117 are structurally exact mirrors of migrations 054 and 050 respectively (same two-step constraint pattern, same bucket-insert-plus-two-policies shape, same `get_my_role()` usage) — no deviation, no inline role-check duplication.
- No secrets, no dead code, no commented-out implementation.

### Deviations
- **Minor** — fixed inline during this gate (see above); no longer present in the shipped code.
- **Medium, user-visible** — migrations 116/117 have not been applied to the remote database, and the live download/import round-trip (including the file-integrity spot-check and idempotency re-run called for in Acceptance Criteria) has not been exercised. Already documented in Implementation Notes and reflected in `TASKS.md`. Same category of pre-existing, already-documented handoff gap accepted at this stage for tasks 293/296/302/304 — the code is ready to run, but hasn't been run against production data yet.

### Required Fixes
None — no Major deviations.

## Completion Note (2026-08-25)

Marked Completed at the user's explicit request. The code is finished and verified by inspection/`tsc`/`lint` (including the guard-clause fix applied during the quality gate), but — same precedent as tasks 296/301/302/304 in this project — the live steps outside this session's control were **not exercised here**: migrations 116/117 have not been applied to the remote database, and the Ticket Attachments import has not been run against the real Zoho Desk API. Whoever applies the migrations and runs the import should spot-check a few downloaded files in the `ticket-attachments` bucket and confirm `attachments` rows via `select * from attachments where entity_type = 'ticket_message' limit 20`, per this doc's Acceptance Criteria/Verification section.
