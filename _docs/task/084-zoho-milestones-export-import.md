# Task 084 — Zoho Milestones Export + Import + Schema Fix

> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Created:** 2026-06-26
> **Status:** TESTING
> **Completed:** 2026-06-26

## Problem

The Zoho decommission migration hierarchy is **project → milestone → tasklist → task**, but milestones are missing from the pipeline entirely:

- No export endpoint exists (`/api/admin/zoho-export/milestones`)
- No import endpoint exists (`/api/admin/zoho-import/milestones`)
- `milestones` table has no `external_id` column → can't dedup/import Zoho milestones
- `tasklists` table has no `milestone_id` FK → the grouping is lost during import
- `migrate/page.tsx` doesn't list milestones in either the export or import phases

Milestones must be imported before tasklists and tasks. Without this, the sequence breaks and the milestone hierarchy is permanently lost from imported data.

## Requirements

1. **Migration 037**: add `external_id text unique` to `milestones`; add `milestone_id uuid references milestones(id) on delete set null` to `tasklists`.
2. **Export endpoint** (`GET /api/admin/zoho-export/milestones`): same pattern as tasklists — loops over `projects.json`, fetches each project's milestones from Zoho API, annotates with `_zoho_project_id`, returns `milestones.json` as download.
3. **Import endpoint** (`POST /api/admin/zoho-import/milestones`): reads `_from_zoho/milestones.json`, resolves project via `zoho_project_id`, upserts into `milestones` using `external_id` as conflict key, maps Zoho status → Hub status.
4. **`zoho-import.ts` helper**: add `resolveMilestoneId(externalId)` — same pattern as `resolveTasklistId`.
5. **Update tasklists import**: after upserting each tasklist, also resolve `tl.milestone.id` (if present and not the "None" milestone) to a Hub `milestones.id` and set `milestone_id`.
6. **Migrate page**: add Milestones before Tasklists in both `EXPORT_LEVELS` and `IMPORT_LEVELS`; update the warning banner ordering text.

## Notes for Implementation Agent

- **Sonnet rationale**: schema migration + new API pair + cross-file updates to existing import and UI.
- **Migration number is 037** — `036_projects_indexes_tags.sql` already exists.
- **`readFromZoho` already handles flat arrays** — the export endpoint must return a flat array (not `{ milestones: [...] }`), exactly like the tasklists export does. This ensures `readFromZoho` picks it up via `Array.isArray`.
- **Zoho API endpoint for milestones**: `GET ${BASE}/projects/${projectId}/milestones` — same base URL pattern as tasklists.
- **"None" milestone handling**: In the tasklists JSON, a tasklist with `meta_info.is_none_milestone_tasklist: true` has no real milestone. Set `milestone_id = null` for these. The check: `tl.meta_info?.is_none_milestone_tasklist === true || tl.milestone?.name === "None"`.
- **Zoho milestone status mapping**:
  - `"completed"` (case-insensitive) → `"completed"`
  - `"in progress"` / `"inprogress"` → `"active"`
  - anything else (not yet started, etc.) → `"planned"`
- **Zoho milestone date field is `end_date`** (not `due_date`) — map it to the Hub's `due_date` column.
- **`milestones.created_by` should be `null`** during import — Zoho users won't have Hub `auth.users` IDs.
- **Tasklists import update**: the tasklists import currently uses `resolveProjectId` from `zoho-import.ts`. After this task, it also needs to call the new `resolveMilestoneId` using `tl.milestone?.id` (converted to string). Add the helper to `zoho-import.ts` alongside the others.
- **Import order in the UI**: Milestones must appear between Projects and Tasklists in both lists. Update `EXPORT_LEVELS` and `IMPORT_LEVELS` arrays accordingly. Also update the warning banner text which currently reads "Tasklists → Tasks → Comments → Time Logs → Attachments" — change to "Milestones → Tasklists → Tasks → Comments → Time Logs → Attachments".

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `supabase/migrations/037_milestones_migration_columns.sql` | CREATE | `external_id` on milestones + `milestone_id` on tasklists |
| `src/app/api/admin/zoho-export/milestones/route.ts` | CREATE | Mirror of tasklists export, calls `/milestones` endpoint |
| `src/app/api/admin/zoho-import/milestones/route.ts` | CREATE | Reads milestones.json, upserts with status mapping |
| `src/lib/migrate/zoho-import.ts` | MODIFY | Add `resolveMilestoneId(externalId)` helper |
| `src/app/api/admin/zoho-import/tasklists/route.ts` | MODIFY | Set `milestone_id` via `resolveMilestoneId` during upsert |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | MODIFY | Add Milestones entry to both arrays; update warning text |

## Code Context

### Tasklists export (mirror this pattern exactly)
`src/app/api/admin/zoho-export/tasklists/route.ts:1-54`
```ts
// dev-only export endpoint — reads project list from _from_zoho/projects.json,
// fetches tasklists from Zoho API, returns JSON for browser download.
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  const projectsFile = path.join(process.cwd(), "_from_zoho", "projects.json");
  if (!fs.existsSync(projectsFile)) {
    return NextResponse.json({ error: "projects.json not found in _from_zoho/" }, { status: 400 });
  }

  const { projects } = JSON.parse(fs.readFileSync(projectsFile, "utf-8")) as { projects: Array<Record<string, unknown>> };
  const all: unknown[] = [];

  for (const project of projects) {
    const projectId = String(project.id_string ?? project.id);
    const res = await fetch(`${BASE}/projects/${projectId}/tasklists`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    if (res.ok) {
      const json = await res.json() as { tasklists?: unknown[] };
      const tasklists = (json.tasklists ?? []).map((tl) => ({
        ...(tl as Record<string, unknown>),
        _zoho_project_id: projectId,
      }));
      all.push(...tasklists);
    }
    await sleep(100);
  }

  return new NextResponse(JSON.stringify(all, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="tasklists.json"',
    },
  });
}
```

### Tasklists import (mirror this pattern for milestones import)
`src/app/api/admin/zoho-import/tasklists/route.ts:1-59`
```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readFromZoho, resolveProjectId, adminClient, ImportResult } from "@/lib/migrate/zoho-import";

type ZohoTasklistRaw = {
  id?: string; id_string?: string; name?: string;
  sequence?: number; is_default?: boolean; _zoho_project_id?: string;
  [key: string]: unknown;
};

export async function POST() {
  // ... auth check (admin only) ...
  const tasklists = readFromZoho<ZohoTasklistRaw>("tasklists.json");
  for (const tl of tasklists) {
    const externalId = String(tl.id_string ?? tl.id ?? "");
    if (!externalId || !tl.name) { result.skipped++; continue; }
    const projectId = await resolveProjectId(String(tl._zoho_project_id ?? ""));
    if (!projectId) { result.errors.push(...); result.skipped++; continue; }

    await adminClient.from("tasklists").upsert(
      { external_id: externalId, project_id: projectId, name: tl.name,
        position: tl.sequence ?? null, is_default: tl.is_default ?? false },
      { onConflict: "external_id" }
    );
  }
}
```

### Existing resolve helpers in zoho-import.ts (add resolveMilestoneId after resolveTasklistId)
`src/lib/migrate/zoho-import.ts:99-107`
```ts
export async function resolveTasklistId(externalId: string): Promise<string | null> {
  if (!externalId) return null;
  const { data } = await adminClient
    .from("tasklists")
    .select("id")
    .eq("external_id", externalId)
    .maybeSingle();
  return data?.id ?? null;
}
// ADD resolveMilestoneId here, same pattern, .from("milestones")
```

### Migrate page arrays (insert milestones at index 0 of both)
`src/app/v2/(hub)/admin/migrate/page.tsx:16-32`
```ts
const EXPORT_LEVELS = [
  { key: "tasklists", label: "Tasklists", desc: "All tasklists across every project" },
  { key: "tasks", label: "Tasks", desc: "All tasks (paginated per project)" },
  { key: "comments", label: "Comments", desc: "All task comments — requires tasks.json exported first" },
  { key: "timelogs", label: "Time Logs", desc: "All time log entries per project" },
  { key: "attachment-meta", label: "Attachment Metadata", desc: "Attachment list per task — requires tasks.json exported first" },
] as const;

const IMPORT_LEVELS = [
  { key: "customers", label: "Customers", desc: "Creates Hub customer records from unique names in projects.json — run first" },
  { key: "projects", label: "Projects", desc: "Creates or upserts Hub project rows from projects.json — requires Customers imported first" },
  { key: "tasklists", label: "Tasklists", desc: "Creates Hub tasklist records from tasklists.json" },
  // ... tasks, comments, timelogs, attachments
] as const;
// Add { key: "milestones", label: "Milestones", desc: "..." } at index 0 of EXPORT_LEVELS
// and between "projects" and "tasklists" in IMPORT_LEVELS
```

### Warning banner text to update (line 123)
`src/app/v2/(hub)/admin/migrate/page.tsx:123-128`
```tsx
<strong>Run steps in order:</strong> Export projects.json is already in{" "}
<code>_from_zoho/</code>. Then export and import each level:{" "}
<strong>Tasklists → Tasks → Comments → Time Logs → Attachments</strong>.
// Change to: <strong>Milestones → Tasklists → Tasks → Comments → Time Logs → Attachments</strong>
```

## Implementation Steps

1. **Create migration 037** — add `external_id text unique` to `milestones` and `milestone_id uuid references milestones(id) on delete set null` to `tasklists`. Add index on `milestones(external_id)` where not null.

2. **Create export endpoint** at `src/app/api/admin/zoho-export/milestones/route.ts` — copy tasklists export, change endpoint to `/milestones`, response key `json.milestones`, filename `milestones.json`.

3. **Add `resolveMilestoneId`** to `src/lib/migrate/zoho-import.ts` after `resolveTasklistId`.

4. **Create import endpoint** at `src/app/api/admin/zoho-import/milestones/route.ts`:
   - Read `milestones.json` via `readFromZoho`
   - For each item: extract `external_id` from `id_string ?? id`, resolve `project_id`
   - Map `end_date` → `due_date`, map Zoho status → Hub status enum
   - Upsert with `onConflict: "external_id"`, set `created_by: null`

5. **Update tasklists import** — after resolving `projectId`, also call `resolveMilestoneId` using `tl.milestone?.id_string ?? tl.milestone?.id`. If the result is non-null and `is_none_milestone_tasklist` is not true, include `milestone_id` in the upsert payload.

6. **Update migrate page** — prepend Milestones to `EXPORT_LEVELS`; insert between Projects and Tasklists in `IMPORT_LEVELS`; update warning text to reflect new order.
