# 344: Issue Attachments Import — Fan Out Ambiguous `(name, size)` Matches Instead of Skipping

**Created:** 2026-09-01
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** quick
**Status:** Testing

---

## Overview

The issue-attachments import (`POST /api/admin/zoho-import/issue-attachments`) matches each
admin-uploaded file to a `_from_zoho/issue-attachment-meta-*.json` record by a `(name, size)`
compound key. When that key matched **more than one** metadata record, the route logged an
"ambiguous matches … import manually" error and **skipped the file entirely**.

Analysis of the live metadata (`issue-attachment-meta-0-500.json` … `-1000-1500.json`, 686
records):

- **28 `(name, size)` collision groups covering 57 records** would be skipped.
- 24 of the 28 groups are the **same design file linked to two different issues** in Zoho
  (e.g. `Partner Member Invitation Experience Pg1.png` on issues `…20042005` and `…20152008`);
  the other 4 are same-issue.
- **Every record in every collision group has a distinct, populated `third_party_file_id`** —
  the field the route already uses as `attachments.external_id` / the upsert conflict key.
- All 100 `attachment_id: "-1"` records are `app_name: "Zoho Docs"`; the 586 records with a
  real `attachment_id` are all `app_name: "ZFS"`. `attachment_id` is Zoho's own sentinel for
  Docs-backed attachments and is never read anywhere in `src/` — `third_party_file_id` is the
  real key. So `-1` is **not** a data-integrity problem, it just removes the value that could
  otherwise have broken a `(name, size)` tie.

Because the colliding records are byte-identical (same name **and** same size) and each carries
its own unique `third_party_file_id` + its own `_zoho_issue_id`, the correct behaviour is to
**fan out**: upload the file once per linkage and insert one `attachments` row per record,
each keyed by its own `third_party_file_id` and pointing at its own issue.

## Requirements

- [x] A `(name, size)` key that matches N ≥ 2 metadata records imports **N** `attachments`
      rows (one per record), instead of skipping the file.
- [x] Each fanned-out row keeps the existing semantics: `external_id = third_party_file_id`,
      `entity_type = "issue"`, `entity_id` = resolved Hub issue UUID, `storage_path` under
      `zoho/issues/<_zoho_issue_id>/<third_party_file_id>_<name>`, upsert `onConflict: external_id`.
- [x] Per-record guards preserved inside the fan-out loop: missing `third_party_file_id`,
      `trashed === true`, and unresolved `_zoho_issue_id` each skip **that record only** and
      continue with the rest of the group.
- [x] The single-match path (99% of files) is behaviourally unchanged — same one upload, same
      one upsert.
- [x] Import remains idempotent on re-run (still `onConflict: "external_id"`).
- [x] The `done` SSE event carries a `fannedOut: string[]` list (`"<file> → N issues"`); the
      migrate UI shows it in amber below the error list.
- [x] `npx tsc --noEmit` + `pnpm lint` pass.

## Out of Scope / Must-Not-Change

- **`src/app/api/admin/zoho-import/attachments/route.ts`** (task-scoped to `task` entities,
  filename-only match). In that portal `attachment_id` is *always* `-1` and the code comment
  says so, but its match key is name-only and it has no documented ambiguous-skip pain — leave
  it. A follow-up can port this fan-out if the same collision shows up there.
- `ticket-attachments/route.ts` — different entity, different match logic.
- The `(name, size)` key itself, the `stripDedupSuffix` Chrome `" (N)"` handling, the paginated
  issue-lookup map, and the `attachments` table schema — all unchanged.
- The metadata JSON files in `_from_zoho/` — not rewritten. `attachment_id: "-1"` stays as
  Zoho emitted it; nothing reads it.
- No new "different files that coincidentally share name **and** exact byte count" hash check —
  see Deviations. Residual risk is documented, not eliminated.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/admin/zoho-import/issue-attachments/route.ts` | Modify | Replace the `matches.length > 1` skip with a `for (const att of matches)` fan-out loop (per-record guards + upload + upsert moved inside). Add `fannedOut: string[]`, emit it on the `done` event. Header comment gains the fan-out as a third documented delta vs. the sibling route. |
| `src/app/(hub)/admin/migrate/_zoho-projects-tab.tsx` | Modify | `IssueAttachmentsImportState.done` gains `fannedOut: string[]`; parsed SSE `evt` type gains `fannedOut?: string[]`; `done` handler passes it through; the done-summary block renders an amber "N file(s) linked to multiple issues — one row per link" line + first-3 detail rows (mirrors the existing red error-list rendering right above it). |

## Code Context

### Before — `issue-attachments/route.ts` (the skip)

```ts
if (matches.length > 1) {
  errors.push(`${file.name}: ${matches.length} ambiguous matches even after name+size — identical file content attached to multiple issues, skipped, import manually`);
  skipped++;
  send({ type: "progress", current: i + 1, total });
  continue;
}

const att = matches[0];
// ... single record: guards, storage upload, attachments upsert (onConflict: external_id)
```

### After

```ts
// matches.length >= 1. A (name, size) collision means Zoho linked the same file to
// more than one issue — each linkage is its own metadata record with its own unique
// third_party_file_id. Fan out: import one attachments row per record.
if (matches.length > 1) {
  fannedOut.push(`${file.name} → ${matches.length} issues`);
}

for (const att of matches) {
  const externalId = String(att.third_party_file_id ?? "");
  if (!externalId) { errors.push(...); skipped++; continue; }
  if (att.trashed === true) { skipped++; continue; }
  const issueId = issueMap.get(String(att._zoho_issue_id ?? "")) ?? null;
  if (!issueId) { errors.push(...); skipped++; continue; }

  const safeName = `zoho/issues/${att._zoho_issue_id}/${externalId}_${canonicalName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await adminClient.storage.from("project-assets").upload(safeName, file, { upsert: true });
  await adminClient.from("attachments").upsert(
    { external_id: externalId, entity_type: "issue", entity_id: issueId, storage_path, filename: canonicalName, size: fileSize, source_url: att.download_url ?? null },
    { onConflict: "external_id" },
  );
  imported++;
}

send({ type: "progress", current: i + 1, total });
```

The web `File` from `formData.getAll("files")` is a memory-backed undici `File`, so
`storage.upload(safeName, file, …)` is safe to call once per iteration (a `File`/`Blob` body is
re-readable; only a `ReadableStream` would be consumed).

### The metadata shape

```jsonc
{
  "attachment_id": "-1",                    // Zoho Docs sentinel — never read in src/
  "third_party_file_id": "506250000003543005", // real unique key → attachments.external_id
  "name": "Fall Fling Flyer.pdf",
  "size": "1078335",
  "app_name": "Zoho Docs",                  // "-1" rows are all "Zoho Docs"; real-id rows all "ZFS"
  "_zoho_issue_id": "1512955000019602003",  // added by the export
  "download_url": "https://download-accl.zoho.com/…"
}
```

## Implementation Steps

1. `issue-attachments/route.ts`: add `const fannedOut: string[] = [];` beside `errors`.
2. Delete the `matches.length > 1` skip block; keep the `matches.length === 0` skip.
3. Wrap the per-record body (guards → storage upload → `attachments` upsert) in
   `for (const att of matches)`; the per-record guards `continue` the inner loop (skip that
   record only), no longer `send` a progress event each.
4. Push `"<file> → N issues"` to `fannedOut` when `matches.length > 1`; prefix upsert errors
   with `→ issue <id>` when fanning out so multi-row failures are attributable.
5. One `send({ type: "progress", … })` after the inner loop; `send({ type: "done", …, fannedOut })`.
6. Update the header comment (third functional delta vs. `attachments/route.ts`).
7. `_zoho-projects-tab.tsx`: thread `fannedOut` through the state interface, the parsed `evt`
   type, the `done` handler, and the done-summary render (amber, mirrors the red error list).
8. `npx tsc --noEmit`, `pnpm lint`.
9. Browser acceptance (below) — **deferred**, needs the real downloaded attachment files.

## Acceptance Criteria

- [ ] Upload the manually-downloaded files for a known collision group (e.g. the two
      `…020042005` / `…020152008` design PNGs): both issues get the attachment; `imported`
      counts each row; the amber "linked to multiple issues" line appears.
- [ ] Re-run the same import: `imported` reflects upserts (no duplicate rows — `external_id`
      unique), no errors.
- [ ] A single-match file still imports exactly one row, no amber line.
- [ ] A group where one record's `_zoho_issue_id` isn't imported yet: the resolvable records
      still import, the unresolved one lands in `errors` with its `→ issue <id>` prefix.
- [ ] `/projects/v2/<projectId>/issues/<issueId>` Attachments tab shows the fanned-out file on
      each linked issue with a working download.
- [ ] `npx tsc --noEmit` + `pnpm lint` clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # /admin/migrate → Zoho Projects tab → Issue Attachments → select files → Import
```

## Compatibility Touchpoints

- **DB:** none — no migration; `attachments` schema unchanged, still `onConflict: "external_id"`.
- **Storage:** `project-assets` bucket; fanned-out rows write one object per
  `zoho/issues/<issueId>/…` path (distinct per linkage), same as a normal single import would.
- **SSE contract:** additive `fannedOut` field on the `done` event; older clients ignore it.
- **Env / deps / MCP tools / install surface:** no impact.
- **Docs:** none beyond this task doc + the route header comment. No `CLAUDE.md` change (the
  attachment-import convention isn't documented there).

## Implementation Notes

### What Changed

- `issue-attachments/route.ts` no longer skips a file whose `(name, size)` key matches
  multiple metadata records. It now **fans out**: one `attachments` row per matched record,
  each keyed by that record's unique `third_party_file_id`, each resolved to its own
  `_zoho_issue_id`. Recovers the ~57 records across 28 collision groups the old code dropped.
- The per-record guards (missing `third_party_file_id`, `trashed`, unresolved issue) moved
  inside the fan-out loop and now skip a single record and continue, rather than abandoning
  the whole file.
- New `fannedOut: string[]` accumulator, emitted on the `done` SSE event. The migrate UI
  (`_zoho-projects-tab.tsx`) renders it as an amber "N file(s) linked to multiple issues —
  one row per link" summary plus the first 3 entries, mirroring the existing red error list.
- Route header comment updated: the fan-out is now the third documented functional delta vs.
  the `task`-scoped `zoho-import/attachments/route.ts` sibling.
- Investigated but **not changed**: the `attachment_id: "-1"` values in the metadata. They are
  Zoho's sentinel for Zoho Docs–backed attachments (all 100 `-1` rows are `app_name: "Zoho
  Docs"`; all 586 real-id rows are `"ZFS"`), and `grep` confirms nothing in `src/` ever reads
  `attachment_id` — every consumer already uses `third_party_file_id`, which is unique and
  populated on all 686 rows. The `-1` was a latent footgun, not an active bug.

### Files Changed

- `src/app/api/admin/zoho-import/issue-attachments/route.ts` — fan-out loop, `fannedOut`
  accumulator + `done`-event field, header comment.
- `src/app/(hub)/admin/migrate/_zoho-projects-tab.tsx` — `fannedOut` through the state
  interface / parsed `evt` type / `done` handler / done-summary render.

### Deviations From Plan

- **Minor — residual "same name + same size, different content" risk not eliminated.** If two
  genuinely different files share both an identical name and an identical byte count, the
  fan-out would attach the uploaded file to both issues. The metadata carries no content hash
  to guard against this, and it did not occur in the 686 live records (all 28 groups are
  verified byte-identical design assets Zoho linked to multiple issues). Accepted and
  documented rather than adding a hashing pass; a per-issue folder-upload disambiguation
  (match on `(name, size, _zoho_issue_id)` via `File.webkitRelativePath`) is the noted
  follow-up if it ever bites.
- **Minor — `text-[11px]` on the two new amber detail lines.** Impeccable's
  `design-system-font-size` hook flagged them. They exactly match the adjacent pre-existing
  red error-list rows (`text-red-500 text-[11px]` / `text-slate-400 text-[11px]`) in the same
  block; CLAUDE.md "UI Polish Conventions" explicitly rejects forcing these hand-rolled sizes
  onto a formal type ramp. Left as-is for local consistency. The other 20+ hook findings in
  the file are all on lines this task never touched.

### Verification Run

- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in the unrelated
  `_checklist-tab.tsx`, same as tasks 339/342/343)
- Browser acceptance — **NOT RUN**. Needs the real manually-downloaded attachment files for a
  known collision group; deferred to the Testing stage / a live migrate run.
