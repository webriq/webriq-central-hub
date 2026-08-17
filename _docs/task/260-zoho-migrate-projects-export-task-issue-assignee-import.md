# 260: Zoho Migration — Projects Export Endpoint + Task/Issue Assignee Import Mapping

**Created:** 2026-08-17
**Priority:** MEDIUM
**Type:** feature / bug
**Recommended Tier:** fast
**Status:** Completed

---

## Overview

Chat-driven session against `/admin/migrate` (the one-time Zoho Projects → Supabase decommission migration tool). Three findings surfaced while walking through the export/import flow, each fixed in the same session:

1. **No Projects export existed.** `_from_zoho/projects.json` (the file every other export/import level depends on to resolve `external_project_id → Hub project_id`) had no corresponding "Export" button or API route on `/admin/migrate` — it had apparently been produced once via `curl` and never wired into the page. Every other export level (Users, Milestones, Tasklists, Issues, etc.) already had one.
2. **Task `assignees` were never populated on import.** `zoho-import/tasks/route.ts` built a full row per task but had no `assignees` field at all — Zoho's owner data (`owners_and_work.owners[]`) was only ever stashed raw inside `source_meta`, never mapped into the real `tasks.assignees` (`string[]`, Hub `profiles.id` UUIDs) column read by `src/lib/tasks/permissions.ts` and task-creation code.
3. **Issue `assignee_id` was never populated on import**, for the same reason. `issues.assignee_id` is an FK to `profiles.id` (migration-defined), but `zoho-import/issues/route.ts` only ever wrote `assignee_name`/`assignee_email` (raw Zoho strings) — the ID column stayed `null` for every imported issue.

## Requirements

- [x] Add an Export Projects endpoint + UI card to `/admin/migrate`, producing the same `{ projects, total }` shape as the existing `_from_zoho/projects.json`.
- [x] Reuse existing pagination/auth logic rather than reimplementing it, if a suitable helper already exists.
- [x] Populate `tasks.assignees` during Tasks import by resolving Zoho task owners to Hub user IDs.
- [x] Populate `issues.assignee_id` during Issues import by resolving the Zoho assignee to a Hub user ID.
- [x] Both assignee-mapping fixes must be safe to re-run against already-imported rows (idempotent, since both import routes upsert on `external_id`).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/admin/zoho-export/projects/route.ts` | Create | New admin-only export route — calls the existing `getZohoProjects()` helper (`src/lib/zoho/index.ts:711`, already paginates the portal's `/projects` endpoint) and returns `{ projects, total }` as a downloadable `projects.json` |
| `src/app/(hub)/admin/migrate/page.tsx` | Modify | Add a `projects` entry to `EXPORT_LEVELS` (first item — every other level's export/import reads project IDs from `projects.json`), using the existing generic `handleExport()` flow, no new UI code needed |
| `src/app/api/admin/zoho-import/tasks/route.ts` | Modify | Add `assignees` to `TaskRow`; build a `hub_users` email→id lookup map; add an `ownerEmails()` helper that reads `owners_and_work.owners[].email`; resolve each task's owner emails to Hub UUIDs before upsert |
| `src/app/api/admin/zoho-import/issues/route.ts` | Modify | Add `assignee_id` to `IssueRow`; build the same `hub_users` email→id lookup map; resolve `assignee_email` (post `cleanName()`, which already nulls out Zoho's `"Unassigned User"` placeholder) to a Hub UUID before upsert |

## Implementation Notes

### What Changed

**Projects export** — `getZohoProjects()` already existed in `src/lib/zoho/index.ts` (used elsewhere in the app) and already returns exactly `{ projects: ZohoProject[], total: number }`, matching the on-disk `_from_zoho/projects.json` shape (verified: 225 projects, `{projects: [...], total: 225}`). The new route is a thin wrapper: same admin/`super_admin` role-check pattern as `zoho-export/users/route.ts`, calls the helper, streams the JSON back with a `Content-Disposition: attachment; filename="projects.json"` header. No new pagination logic was written. On the page, it renders via the existing generic (non-streaming) export card path — no custom SSE handler needed, since Projects is a single portal-level list like Users/Milestones/Tasklists, not a per-project paginated fetch like Tasks/Issues.

Note for the operator: clicking "Export" still triggers a **browser download** (blob + `<a download>`, same as every other export card) — it does not write directly into the repo's `_from_zoho/` folder. The downloaded file still needs to be moved there manually before running any import that depends on it.

**Task assignees** — verified against a real exported task record that `owners_and_work.owners` is an array of Zoho user objects with `.email`. Added:
```ts
function ownerEmails(t: ZohoTaskRaw): string[] {
  const owners = t.owners_and_work?.owners;
  if (!Array.isArray(owners)) return [];
  return owners.map((o) => o.email?.toLowerCase()).filter((email): email is string => !!email);
}
```
and a `hub_users` lookup map built once (`email.toLowerCase() → id`), alongside the pre-existing `projectMap`/`tasklistMap`/`milestoneMap` queries. Each task row's `assignees` is now `ownerEmails(t).map(email => hubUserMap.get(email)).filter(Boolean)`, or `null` if nothing resolves — same "resolve via lookup map, don't fail the row if unresolved" pattern already used for `tasklist_id`/`milestone_id`.

**Issue assignee_id** — same `hub_users` lookup map pattern, applied to the existing `assignee_email` value (computed via the pre-existing `cleanName()` helper, which already filters out Zoho's literal `"Unassigned User"` placeholder string). `assignee_id` resolves to `hubUserMap.get(assigneeEmail.toLowerCase()) ?? null`.

Both fixes share an implicit new dependency: **Users must be imported before Tasks/Issues** for assignee resolution to find anything (previously Tasks/Issues only depended on Projects being imported). `src/lib/migrate/zoho-import.ts` already has a `buildUserCache()`/`resolveUserId()` helper doing the same email→Hub-id resolution for Timelogs import — noted as a candidate for later consolidation, not changed in this session since Timelogs' single-owner-per-row shape differs from Tasks' multi-assignee-array shape.

### Files Changed
- `src/app/api/admin/zoho-export/projects/route.ts` — new file
- `src/app/(hub)/admin/migrate/page.tsx` — one line added to `EXPORT_LEVELS`
- `src/app/api/admin/zoho-import/tasks/route.ts` — `assignees` field + `ownerEmails()` helper + `hub_users` lookup map
- `src/app/api/admin/zoho-import/issues/route.ts` — `assignee_id` field + `hub_users` lookup map

### Verification Run
- `npx tsc --noEmit` — clean, run after each of the four edits and once more at the end (0 errors repo-wide).
- `npx eslint` on all four changed files — clean, no warnings or errors.
- No live browser/dev-server verification — this is an admin-only, backend data-migration tool with no client-side logic beyond the existing generic export/import handlers already exercised by other levels on the same page; the new code paths (Projects export, assignee resolution) were reasoned through against real files already present in `_from_zoho/` (`projects.json`, `tasks-*.json`, `issues-*.json`) rather than against a running import, since running a real import against production Supabase data was out of scope for this session. Recommended before relying on this in a live migration run: export Projects once via the new button and confirm the download matches the existing `_from_zoho/projects.json` shape, then run Tasks/Issues import against a small slice and spot-check `assignees`/`assignee_id` on a couple of known-owned records.
