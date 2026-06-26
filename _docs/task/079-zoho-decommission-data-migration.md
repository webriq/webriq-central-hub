# Task 079 — Zoho Decommission: Full Data Migration to Supabase

> **Type:** feature
> **Priority:** HIGH
> **Version Impact:** major (new `tasklists` table + schema additions across 5 tables)
> **Recommended Model:** sonnet
> **Investigation:** /understand ran before this spec. Findings embedded below.
> **Status:** TESTING
> **Created:** 2026-06-25
> **Completed:** 2026-06-25
> **Implementation Notes:** All 14 new files created + database.ts updated. `npx tsc --noEmit` passes clean. `time_logs.task_id` made nullable in migration (Zoho project-level time logs have no task reference). `profiles` has no email column — user lookup uses `adminClient.auth.admin.listUsers()` paginated into a per-request Map cache. All import endpoints are idempotent (upsert on `zoho_*_id` unique keys). Admin page at `/v2/admin/migrate` — works in dev; export/import routes use `fs.readFileSync` from `_from_zoho/` which is local-only.

## Goal

Migrate all Zoho Projects data into the Hub's native Supabase schema as a one-time decommission import. Zoho will be shut down afterward. Data flows top-down: projects → tasklists → tasks → comments → time logs → attachments.

**Delivery:** Two-phase admin tooling —
1. **Export**: Admin page buttons call Zoho API → auto-download JSON files → user saves to `_from_zoho/`
2. **Import**: Admin page buttons read from `_from_zoho/*.json` → upsert into Supabase (idempotent, re-runnable)

All admin endpoints require `role = 'admin'` (checked via `profiles` table).

## Scope of Migration

| Zoho Entity | Hub Table | Status |
|---|---|---|
| Projects (225) | `projects` | `_from_zoho/projects.json` already exported |
| Tasklists (per project) | `tasklists` (new) | Needs export + import |
| Tasks (per project) | `tasks` | Needs export + import |
| Task comments | `task_comments` | Needs export + import |
| Time logs (per project) | `time_logs` | Needs export + import |
| Attachments (per task) | `attachments` | Needs export (metadata) + import (download → Supabase Storage) |

## Requirements

### Schema (Migration 035)

**New table: `tasklists`**
```sql
create table tasklists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  zoho_tasklist_id text unique,
  name text not null,
  position numeric,
  is_default boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

**`projects` additions** (from /understand investigation):
```sql
alter table projects add column zoho_status_name text;
alter table projects add column zoho_status_id text;
alter table projects add column zoho_status_is_closed boolean default false;
alter table projects add column zoho_owner_zpuid text;
alter table projects add column zoho_owner_email text;
alter table projects add column zoho_modified_at timestamptz;
alter table projects add column zoho_completed_at timestamptz;
alter table projects add column zoho_synced_at timestamptz;
alter table projects add column start_date date;
alter table projects add column end_date date;
alter table projects add column percent_complete integer default 0;
alter table projects add column zoho_project_group text;
alter table projects add column zoho_tags jsonb default '[]';
alter table projects add column existing_website text;
alter table projects add column development_site text;
```

**`tasks` additions:**
```sql
alter table tasks add column tasklist_id uuid references tasklists(id) on delete set null;
alter table tasks add column zoho_task_id text unique;
alter table tasks add column start_date date;
alter table tasks add column zoho_completed boolean default false;
```

**`task_comments` changes** — `author_id` must become nullable (Zoho commenters may not be Hub users):
```sql
alter table task_comments alter column author_id drop not null;
alter table task_comments drop constraint task_comments_author_id_fkey;
alter table task_comments add constraint task_comments_author_id_fkey
  foreign key (author_id) references auth.users(id) on delete set null;
alter table task_comments add column zoho_comment_id text unique;
alter table task_comments add column author_name text;
alter table task_comments add column author_email text;
```

**`attachments` additions:**
```sql
alter table attachments add column zoho_attachment_id text unique;
alter table attachments add column zoho_url text;
```

**`time_logs` additions:**
```sql
alter table time_logs add column zoho_timelog_id text unique;
alter table time_logs add column owner_name text;
alter table time_logs add column owner_email text;
```

**RLS for `tasklists`:** mirror `milestones` (staff read; PM/Admin full write).

### Export Endpoints (GET, returns JSON for browser download)

Auth: authenticated hub user with `role = 'admin'`.
Response: `Content-Disposition: attachment; filename="<level>.json"` so browser auto-saves.
Rate-limit safety: add 100ms delay between per-project Zoho API calls.

| Endpoint | Zoho API Called | Output File |
|---|---|---|
| `GET /api/admin/zoho-export/tasklists` | `/projects/{id}/tasklists` per project | `_from_zoho/tasklists.json` |
| `GET /api/admin/zoho-export/tasks` | `/projects/{id}/tasks?per_page=100` (paginated) per project | `_from_zoho/tasks.json` |
| `GET /api/admin/zoho-export/comments` | `/projects/{pid}/tasks/{tid}/comments` per task | `_from_zoho/comments.json` |
| `GET /api/admin/zoho-export/timelogs` | `/projects/{id}/timelogs?per_page=100` per project | `_from_zoho/timelogs.json` |
| `GET /api/admin/zoho-export/attachment-meta` | `/projects/{pid}/tasks/{tid}/attachments` per task | `_from_zoho/attachment-meta.json` |

Each endpoint reads `_from_zoho/projects.json` to get the list of project IDs, then iterates. For tasks/comments/attachment-meta, read `_from_zoho/tasks.json` to get task IDs after tasks are exported.

### Import Endpoints (POST, reads from `_from_zoho/`, upserts to Supabase)

Auth: `role = 'admin'`.
All use `adminClient` (service role) for upserts — RLS bypassed intentionally (migration tool, documented exception).
All are idempotent: upsert on `zoho_*_id` unique key.
Response shape: `{ imported: N, updated: N, skipped: N, errors: string[] }`

| Endpoint | Source File | Target Table | Conflict Key |
|---|---|---|---|
| `POST /api/admin/zoho-import/projects` | `_from_zoho/projects.json` | `projects` | `zoho_project_id` |
| `POST /api/admin/zoho-import/tasklists` | `_from_zoho/tasklists.json` | `tasklists` | `zoho_tasklist_id` |
| `POST /api/admin/zoho-import/tasks` | `_from_zoho/tasks.json` | `tasks` | `zoho_task_id` |
| `POST /api/admin/zoho-import/comments` | `_from_zoho/comments.json` | `task_comments` | `zoho_comment_id` |
| `POST /api/admin/zoho-import/timelogs` | `_from_zoho/timelogs.json` | `time_logs` | `zoho_timelog_id` |
| `POST /api/admin/zoho-import/attachments` | `_from_zoho/attachment-meta.json` | `attachments` | `zoho_attachment_id` |

### Admin UI: `/v2/admin/migrate`

New page at `/v2/admin/migrate/page.tsx` (Server Component shell, Client Component for interactions).

Layout:
- Page heading: "Zoho Decommission Migration"
- Warning banner: "Run export first, then import in order: Projects → Tasklists → Tasks → Comments → Time Logs → Attachments"
- Two sections: **Export Phase** and **Import Phase**
- Each section has cards, one per data type
- Each card: title, description, button, result display (`{ imported, updated, errors }`)
- Export cards: button triggers download, shows file size / record count on response
- Import cards: button calls POST endpoint, shows result summary
- All buttons show loading spinner while running; disable sibling buttons mid-run

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `supabase/migrations/035_zoho_decommission_schema.sql` | Create | All schema changes above |
| `src/types/database.ts` | Modify | Add `tasklists` table type; update `projects`, `tasks`, `task_comments`, `attachments`, `time_logs` Row/Insert/Update blocks |
| `src/lib/migrate/zoho-import.ts` | Create | Shared helpers: `readFromZoho(filename)`, `getAdminClient()`, `mapPriority()`, `mapStatus()`, `resolveUserId(email)` |
| `src/app/api/admin/zoho-export/tasklists/route.ts` | Create | GET — export tasklists |
| `src/app/api/admin/zoho-export/tasks/route.ts` | Create | GET — export tasks (paginated per project) |
| `src/app/api/admin/zoho-export/comments/route.ts` | Create | GET — export comments (per task) |
| `src/app/api/admin/zoho-export/timelogs/route.ts` | Create | GET — export time logs (per project) |
| `src/app/api/admin/zoho-export/attachment-meta/route.ts` | Create | GET — export attachment metadata |
| `src/app/api/admin/zoho-import/projects/route.ts` | Create | POST — import projects |
| `src/app/api/admin/zoho-import/tasklists/route.ts` | Create | POST — import tasklists |
| `src/app/api/admin/zoho-import/tasks/route.ts` | Create | POST — import tasks |
| `src/app/api/admin/zoho-import/comments/route.ts` | Create | POST — import comments |
| `src/app/api/admin/zoho-import/timelogs/route.ts` | Create | POST — import time logs |
| `src/app/api/admin/zoho-import/attachments/route.ts` | Create | POST — download files from Zoho + upload to Supabase Storage |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | Create | Admin migration UI |

## Implementation Steps

### Step 1 — Migration 035

Create `supabase/migrations/035_zoho_decommission_schema.sql` with all schema changes in this order:

1. Create `tasklists` table (must come before `tasks` FK addition)
2. Add `tasklist_id`, `zoho_task_id`, `start_date`, `zoho_completed` to `tasks`
3. Add all Zoho metadata columns to `projects`
4. Alter `task_comments.author_id` (drop NOT NULL → nullable, change FK to on delete set null, add new columns)
5. Add `zoho_attachment_id`, `zoho_url` to `attachments`
6. Add `zoho_timelog_id`, `owner_name`, `owner_email` to `time_logs`
7. RLS for `tasklists` (mirror `milestones` policy pattern)
8. Indexes: `tasklists(project_id)`, `tasks(zoho_task_id)`, `tasks(tasklist_id)`

Update `src/types/database.ts`: add `tasklists` table block; extend all modified table Row/Insert/Update types with the new columns.

### Step 2 — Shared Migration Helpers (`src/lib/migrate/zoho-import.ts`)

```ts
import fs from "fs";
import path from "path";
import { adminClient } from "@/lib/supabase/admin";

export function readFromZoho<T>(filename: string): T[] {
  const filePath = path.join(process.cwd(), "_from_zoho", filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T[];
}

// Map Zoho priority string → Hub priority (tasks table lowercase enum)
export function mapPriority(zoho: string): "critical" | "high" | "normal" | "low" {
  const p = zoho?.toLowerCase();
  if (p === "critical") return "critical";
  if (p === "high") return "high";
  if (p === "low") return "low";
  return "normal"; // medium, normal, none, or unknown
}

// Map Zoho task status + is_completed → Hub task status
export function mapTaskStatus(zohoStatusName: string, isCompleted: boolean): string {
  if (isCompleted) return "closed";
  const s = zohoStatusName?.toLowerCase() ?? "";
  if (s.includes("progress") || s === "in progress") return "in_progress";
  if (s.includes("qa") || s.includes("testing")) return "ready_for_qa";
  if (s.includes("closed") || s.includes("complete") || s.includes("done")) return "closed";
  return "open";
}

// Look up a Hub user id by email via profiles table
// Returns null if no Hub user with that email exists
export async function resolveUserId(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const { data } = await adminClient
    .from("profiles")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return data?.id ?? null;
}

// Look up a Hub project id by zoho_project_id
export async function resolveProjectId(zohoProjectId: string): Promise<string | null> {
  const { data } = await adminClient
    .from("projects")
    .select("id")
    .eq("zoho_project_id", zohoProjectId)
    .maybeSingle();
  return data?.id ?? null;
}

// Look up a Hub task id by zoho_task_id
export async function resolveTaskId(zohoTaskId: string): Promise<string | null> {
  const { data } = await adminClient
    .from("tasks")
    .select("id")
    .eq("zoho_task_id", zohoTaskId)
    .maybeSingle();
  return data?.id ?? null;
}

// Look up a Hub tasklist id by zoho_tasklist_id
export async function resolveTasklistId(zohoTasklistId: string): Promise<string | null> {
  const { data } = await adminClient
    .from("tasklists")
    .select("id")
    .eq("zoho_tasklist_id", zohoTasklistId)
    .maybeSingle();
  return data?.id ?? null;
}

export { adminClient };
```

### Step 3 — Export Endpoints

**Pattern for all export routes** (auth guard + Zoho fetch + download response):

```ts
// src/app/api/admin/zoho-export/tasklists/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const DELAY_MS = 100;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  // Read project IDs from already-exported projects.json
  const { projects } = JSON.parse(require("fs").readFileSync(require("path").join(process.cwd(), "_from_zoho/projects.json"), "utf-8"));
  
  const all: unknown[] = [];
  for (const project of projects) {
    const res = await fetch(`${BASE}/projects/${project.id}/tasklists`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    if (res.ok) {
      const json = await res.json();
      const tasklists = (json?.tasklists ?? []).map((tl: Record<string, unknown>) => ({
        ...tl,
        _zoho_project_id: String(project.id),
      }));
      all.push(...tasklists);
    }
    await sleep(DELAY_MS);
  }

  return new NextResponse(JSON.stringify(all, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="tasklists.json"',
    },
  });
}
```

Follow the same pattern for `tasks`, `comments`, `timelogs`, `attachment-meta`:
- `tasks`: loop projects → `GET /projects/{id}/tasks?per_page=100` + paginate until `has_next_page === false`; attach `_zoho_project_id` to each task
- `comments`: loop over exported `tasks.json` → `GET /projects/{pid}/tasks/{tid}/comments`; attach `_zoho_task_id` and `_zoho_project_id`
- `timelogs`: loop projects → `GET /projects/{id}/timelogs?per_page=100&module=task`; paginate
- `attachment-meta`: loop over exported `tasks.json` → `GET /projects/{pid}/tasks/{tid}/attachments`; attach `_zoho_task_id` and `_zoho_project_id`

### Step 4 — Import Endpoints

**`POST /api/admin/zoho-import/projects`** — read `_from_zoho/projects.json`, upsert to `projects` on `zoho_project_id`:

```ts
// For each project in JSON:
const row = {
  zoho_project_id: String(p.id),         // conflict key (existing column)
  name: p.name,
  zoho_status_name: p.status?.name ?? null,
  zoho_status_id: String(p.status?.id ?? ""),
  zoho_status_is_closed: p.status?.is_closed_type ?? false,
  zoho_owner_zpuid: String(p.owner?.zpuid ?? ""),
  zoho_owner_email: p.owner?.email ?? null,
  zoho_modified_at: p.modified_time ?? null,
  zoho_completed_at: p.completed_time ?? null,
  start_date: p.start_date ?? null,
  end_date: p.end_date ?? null,
  percent_complete: Number(p.percent_complete ?? 0),
  zoho_project_group: p.project_group?.name ?? null,
  zoho_tags: p.tags ?? [],
  existing_website: p.existing_website ?? null,
  development_site: p.development_site ?? null,
  zoho_synced_at: new Date().toISOString(),
};

await adminClient.from("projects")
  .upsert(row, { onConflict: "zoho_project_id", ignoreDuplicates: false })
```

Note: do NOT touch `customer_id`, `project_type`, `status` (Hub fields) — only upsert Zoho metadata columns. Projects that have no Hub record yet (no `zoho_project_id` match) are skipped — they aren't in the Hub because they were never onboarded through the Hub.

**`POST /api/admin/zoho-import/tasklists`** — read `_from_zoho/tasklists.json`, resolve `project_id` via `resolveProjectId()`, upsert to `tasklists`:

```ts
const zohoTasklistId = String(tl.id_string ?? tl.id);
const projectId = await resolveProjectId(tl._zoho_project_id);
if (!projectId) { errors.push(`tasklist ${zohoTasklistId}: project not found`); continue; }

await adminClient.from("tasklists").upsert({
  zoho_tasklist_id: zohoTasklistId,
  project_id: projectId,
  name: tl.name,
  position: tl.sequence ?? null,
  is_default: tl.is_default ?? false,
}, { onConflict: "zoho_tasklist_id" });
```

**`POST /api/admin/zoho-import/tasks`** — read `_from_zoho/tasks.json`:

```ts
const zohoTaskId = String(t.id_string ?? t.id);
const projectId = await resolveProjectId(t._zoho_project_id);
const tasklistId = t.tasklist?.id ? await resolveTasklistId(String(t.tasklist.id_string ?? t.tasklist.id)) : null;

// Map assignees: Zoho owners_and_work.owners[].email → Hub auth.users.id
const assignees: string[] = [];
for (const owner of (t.owners_and_work?.owners ?? [])) {
  const uid = await resolveUserId(owner.email);
  if (uid) assignees.push(uid);
}

await adminClient.from("tasks").upsert({
  zoho_task_id: zohoTaskId,
  project_id: projectId,
  tasklist_id: tasklistId,
  title: t.name,
  description: t.description ?? null,
  priority: mapPriority(t.priority ?? ""),
  status: mapTaskStatus(t.status?.name ?? "", t.completed ?? false),
  zoho_completed: t.completed ?? false,
  due_date: t.end_date ?? null,
  start_date: t.start_date ?? null,
  assignees,
}, { onConflict: "zoho_task_id" });
```

**`POST /api/admin/zoho-import/comments`** — read `_from_zoho/comments.json`:

```ts
const taskId = await resolveTaskId(c._zoho_task_id);
const authorId = await resolveUserId(c.added_by?.email);

await adminClient.from("task_comments").upsert({
  zoho_comment_id: String(c.id),
  task_id: taskId,
  author_id: authorId,              // null if not a Hub user
  author_name: c.added_by?.name ?? null,
  author_email: c.added_by?.email ?? null,
  body: c.content ?? c.body ?? "",
  created_at: c.added_time ?? new Date().toISOString(),
}, { onConflict: "zoho_comment_id" });
```

**`POST /api/admin/zoho-import/timelogs`** — read `_from_zoho/timelogs.json`:

```ts
// Zoho logs hours as "HH:MM" — convert to decimal
function parseHours(s: string): number {
  const [h = 0, m = 0] = s.split(":").map(Number);
  return h + m / 60;
}

const taskId = log.task?.id ? await resolveTaskId(String(log.task.id_string ?? log.task.id)) : null;
const projectId = await resolveProjectId(log._zoho_project_id);
const employeeId = await resolveUserId(log.owner?.email);

await adminClient.from("time_logs").upsert({
  zoho_timelog_id: String(log.id),
  task_id: taskId,
  project_id: projectId,
  employee_id: employeeId,
  owner_name: log.owner?.name ?? null,
  owner_email: log.owner?.email ?? null,
  date_logged: log.log_date,
  hours: parseHours(log.log_hours ?? "0:00"),
  billable: log.billing_status === "billable",
  source: "manual",
}, { onConflict: "zoho_timelog_id" });
```

**`POST /api/admin/zoho-import/attachments`** — download files from Zoho, upload to Supabase Storage:

```ts
for (const att of attachments) {
  const taskId = await resolveTaskId(att._zoho_task_id);
  const zohoUrl = att.download_link ?? att.url;

  // Download from Zoho
  let storagePathOrNull: string | null = null;
  try {
    const token = await getZohoAccessToken();
    const file = await fetch(zohoUrl, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    const blob = await file.blob();
    const safeName = `zoho/${att._zoho_task_id}/${att.id}_${att.filename}`;
    const { error } = await adminClient.storage.from("project-assets").upload(safeName, blob, { upsert: true });
    if (!error) storagePathOrNull = safeName;
  } catch { /* non-blocking — fall back to zoho_url */ }

  await adminClient.from("attachments").upsert({
    zoho_attachment_id: String(att.id),
    entity_type: "task",
    entity_id: taskId,
    storage_path: storagePathOrNull ?? "",
    zoho_url: zohoUrl,
    filename: att.filename,
    size: att.size ?? null,
  }, { onConflict: "zoho_attachment_id" });
}
```

### Step 5 — Admin UI (`/v2/admin/migrate/page.tsx`)

Client component with two sections. Use existing `SectionCard` / `KpiCard` patterns from `src/app/v2/(hub)/dashboard/_components/dashboard-shared.tsx`.

Export section cards (5):
- `Tasklists` — "Export from Zoho" → `GET /api/admin/zoho-export/tasklists` → auto-download JSON
- `Tasks` — same pattern
- `Comments` — same
- `Time Logs` — same
- `Attachment Metadata` — same

Import section cards (6):
- `Projects` — "Import" button → `POST /api/admin/zoho-import/projects` → show `{ imported, updated, errors }`
- `Tasklists` → POST import
- `Tasks` → POST import
- `Comments` → POST import
- `Time Logs` → POST import
- `Attachments` → POST import (this is slow — show progress note)

Download helper for export:
```ts
async function handleExport(level: string) {
  const res = await fetch(`/api/admin/zoho-export/${level}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${level}.json`; a.click();
  URL.revokeObjectURL(url);
}
```

## Code Context

### `task_comments` current schema — `supabase/migrations/025_v2_schema.sql:62–68`

```sql
create table task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
```

`author_id` is currently `NOT NULL` — migration 035 must drop NOT NULL and change FK to `on delete set null`.

### `attachments` current schema — `supabase/migrations/025_v2_schema.sql:70–81`

```sql
create table attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  storage_path text not null,
  filename text not null,
  size bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
```

`storage_path` is NOT NULL — when Zoho file download fails, use empty string `""` and rely on `zoho_url` as fallback.

### `time_logs` current schema — `supabase/migrations/025_v2_schema.sql:83–96`

```sql
create table time_logs (
  ...
  employee_id uuid references auth.users(id) on delete set null,  -- already nullable
  ...
  source text not null check (source in ('timer', 'manual')) default 'manual',
  ...
);
```

`employee_id` is already nullable — no constraint change needed. All Zoho-imported logs use `source = 'manual'`.

### `milestones` RLS pattern to mirror for `tasklists` — `supabase/migrations/033_milestones.sql`

```sql
alter table milestones enable row level security;
create policy "milestones_staff_read"
  on milestones for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'));
create policy "milestones_pm_write"
  on milestones for all to authenticated
  using (get_my_role() in ('admin', 'pm'))
  with check (get_my_role() in ('admin', 'pm'));
```

### Zoho task fields (from existing `ZohoTask` type) — `src/lib/zoho/index.ts:124–133`

```ts
export type ZohoTask = {
  id: string;
  name: string;
  project: { id: string; name: string };
  priority: string;
  status: { name: string };
  due_date?: string | null;
  completed: boolean;
  link?: { web?: { url: string } };
  owners_and_work?: { owners?: Array<{ name: string; zuid: string | number; email?: string }> };
};
```

The export endpoint will capture additional fields not in this type: `description`, `start_date`, `tasklist`, `is_completed`, `end_date`. Use `[key: string]: unknown` index on the raw export type.

### `getZohoAccessToken` — `src/lib/zoho/index.ts:13`

Token cache with 60s buffer. Import endpoints that download attachments need this — import from `@/lib/zoho`.

### Admin auth check pattern (use in all admin/* routes)

```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```

### `SectionCard` and `KpiCard` — `src/app/v2/(hub)/dashboard/_components/dashboard-shared.tsx`

Reuse for the admin migrate page layout. Use `SectionCard` per data type; put the trigger button and result inside.

## Notes for Implementation Agent

- **Sonnet recommended** because this spans 6 tables, 14 new files, a schema migration, Zoho API integration, Supabase Storage upload, and a new admin UI page. Multiple judgment calls at each mapping layer.

- **`projects` upsert is additive only** — only update the new `zoho_*` columns. Never overwrite `customer_id`, `project_type`, `status`, `name` (user may have corrected these in the Hub). Use Supabase upsert with explicit column list, not `*`.

- **Zoho `project_type` field collision** (from investigation) — Zoho's `project_type` field always equals `"active"` for all 225 projects. It is NOT a project category. Never map it to `projects.project_type` (which stores `Content Site | Ecommerce` etc.).

- **`zoho_project_id` is the bridge** — all imports depend on the projects import running first (so `zoho_project_id` is indexed). Import order must be enforced in the UI (numbered steps or disabled buttons until previous step completes).

- **`existing_website` and `development_site` are top-level Zoho fields**, not nested in `description`. They are WebriQ custom fields surfaced at the API root level.

- **`task_comments` author_id FK change** — the current FK is `on delete cascade` (deleting a user deletes their comments). The migration changes this to `on delete set null`. This is intentional — imported Zoho comments should survive user account deletion.

- **Attachment `storage_path` NOT NULL constraint** — when download fails, insert `""` (empty string) as `storage_path` and the real URL in `zoho_url`. The UI should prefer `storage_path` if non-empty, else fall back to `zoho_url`.

- **Rate limiting during export** — 100ms delay between Zoho API calls in the export loops. Comments and attachment-meta exports loop per-task (potentially thousands of calls) — add a 200ms delay for those to be safe.

- **`fs.readFileSync` in import endpoints** — this works in development (`pnpm dev`) because API routes run in Node.js. It will fail on Vercel (read-only filesystem). These are intentionally local-only migration endpoints. Add a comment: `// dev-only migration endpoint — reads from local _from_zoho/ files`.

- **`resolveUserId` cache** — the comments and time logs imports call `resolveUserId()` for every row. Cache results in a `Map<string, string | null>` within the request to avoid repeated DB lookups for the same email.

- **Supabase Storage bucket** — use the existing `project-assets` bucket (created in migration 005). Do not create a new bucket. Upload path: `zoho/{zoho_task_id}/{zoho_attachment_id}_{filename}`.

- **`_zoho_project_id` and `_zoho_task_id` prefixed fields** are synthetic keys added during export (underscore prefix signals non-Zoho fields). The import endpoints read these to resolve Hub IDs. Strip them before upserting.

- **`profiles` table has no `email` column directly** — email comes from `auth.users`, not `profiles`. For `resolveUserId`, query `auth.users` via `adminClient.auth.admin.listUsers()` or use the `profiles` join to `auth.users`. The cleanest approach: use `adminClient.from("profiles").select("id, auth_users!inner(email)")` if there's a join — but profiles may not have a direct email field. Fallback: use `adminClient.auth.admin.getUserByEmail(email)` (Supabase Admin API method).

- **`pnpm-workspace.yaml` was modified** (from git status) — verify `src/lib/migrate/` is not excluded from workspace. It's under `src/`, should be fine.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` passes after migration 035 and database.ts update
- [ ] `GET /api/admin/zoho-export/tasklists` returns downloadable JSON (403 for non-admin, 401 for unauthenticated)
- [ ] `GET /api/admin/zoho-export/tasks` paginates all Zoho task pages, returns flat array
- [ ] `POST /api/admin/zoho-import/projects` upserts Zoho metadata onto existing `projects` rows, returns `{ imported, updated, errors }`
- [ ] `POST /api/admin/zoho-import/tasks` correctly maps priority, status, assignees; skips tasks with no matching Hub project
- [ ] `POST /api/admin/zoho-import/comments` inserts with `author_id = null` when commenter has no Hub account
- [ ] `POST /api/admin/zoho-import/attachments` downloads file from Zoho, uploads to `project-assets` bucket, falls back to `zoho_url` on download failure
- [ ] All import endpoints are idempotent — running twice produces the same DB state
- [ ] `/v2/admin/migrate` page is accessible to admin role, shows all export + import cards
- [ ] Migration 035 applies clean: `npx supabase db push --include-all`
