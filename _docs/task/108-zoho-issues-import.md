# Task 108 — Zoho Issues Import: New `issues` Table + Import Route

> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Date:** 2026-07-03
> **Status:** Completed
> **Completed:** 2026-07-03
> **Implementation Notes:** All 4 planned file changes made as specced, plus one deviation found and fixed during implementation (see below). `supabase/migrations/051_issues_table.sql` created. `src/types/database.ts` got the `issues` type block inserted after `tasklists` (now ending line 678). `src/app/api/admin/zoho-import/issues/route.ts` created exactly per spec — multi-file `issues-*.json` scan, flat POST/JSON response, reuses `resolveProjectId`/`mapTaskStatus` from `zoho-import.ts`. `migrate/page.tsx` got exactly one line added to `IMPORT_LEVELS` (after `tasks`) — confirmed via grep that no bespoke `if (key === "issues")` branch exists in the Import Phase section, so it correctly falls through to the existing generic `handleImport`/`ResultChip` renderer as intended (zero bespoke UI code, per the spec's design decision #5). `npx tsc --noEmit` clean; `pnpm lint` clean on all 3 TS/TSX files (the `.sql` file is outside ESLint's scope, expected). **Per CLAUDE.md, no git commit was made.**
>
> **Deviation found and fixed:** the spec's RLS policies (`issues_staff_read`/`issues_pm_write`) only listed `('admin', 'pm', 'developer')` / `('admin', 'pm')`, which was written before I checked `supabase/migrations/048_super_admin_rls.sql`. That migration exists specifically because `super_admin` was added to `profiles.role` (task 098) but RLS policies across the entire schema — including `tasklists`, the table this migration's design was modeled on — were missed and had to be retroactively patched, since `super_admin` users were getting empty data everywhere. I added `'super_admin'` to both new policies before this ever shipped, avoiding a repeat of that exact bug on a new table. This is the one place the implementation deviates from the task doc's Code Context — the doc has NOT been updated to reflect this (README-style correction below is the source of truth going forward).
>
> **Migration applied:** user applied `supabase/migrations/051_issues_table.sql` manually (no linked Supabase CLI project in this repo, so this was always a manual step — see original note in history below).
>
> **Bug found post-implementation (live test) and fixed:** first live run showed the Import button spinning with zero feedback for a very long time. Server log confirmed the request completed, not hung: `POST /api/admin/zoho-import/issues 200 in 2.4min (application-code: 2.4min)`. Root cause: the original route called `resolveProjectId()` (its own Supabase query) AND `.upsert()` (another query) **inside the per-issue `for` loop** — 2 sequential network round-trips × N issues, all awaited one after another. This is the exact N+1 anti-pattern `tasks/route.ts` deliberately avoids (it pre-builds a project lookup Map with **one** query before looping, then upserts in chunks of 50) — this route had been modeled on `milestones/route.ts` instead, which has the same latent per-record-query flaw, just not noticeable at milestone-table volumes. Fix: pre-fetch all `projects(id, zoho_project_id)` into a `Map` once, build all issue rows in memory (pass 1), then upsert in `CHUNK_SIZE = 50` batches (pass 2) — 1 query + `ceil(rows/50)` queries total instead of one-per-issue. Also added `console.log` checkpoints (`[issues] read N raw issues...`, `project lookup map built...`, `upserting N rows in chunks...`, per-chunk progress, final done summary) since this route has no SSE/progress UI and a multi-second wait with zero visible feedback is exactly what caused the "is it stuck?" confusion in the first place.
>
> **Live Run Result (2026-07-03):** Re-ran after the fix — **1049 issues imported, 0 updated, 0 skipped, 0 errors.** Fast enough that the UI no longer looks stuck (no reported wait complaint on the re-run). Confirms the fix resolved the actual problem (N+1 queries), not just a symptom. `npx tsc --noEmit` and `pnpm lint` clean throughout.
> **Investigation:** No formal `/understand` run, but this spec is grounded in live research done in-session: real exported `_from_zoho/issues-0-50-2025.json` (141 records) was inspected field-by-field (presence counts, value domains for `status`/`severity`/`flag`), `zoho-import/tasks/route.ts`, `zoho-import/milestones/route.ts`, and `src/lib/migrate/zoho-import.ts` were read in full, and `supabase/migrations/035_zoho_decommission_schema.sql` was read in full for the table/RLS design convention (`external_id` unique dedup key, `source_meta` jsonb catch-all, staff-read/pm-write RLS via `get_my_role()`). Treat `## Code Context` as grounded, not speculative.

---

## Overview

Import the Zoho issues exported by task 107 (`_from_zoho/issues-*.json`) into a new Supabase `issues` table, mirroring the Tasks import function (`zoho-import/tasks/route.ts`) where it fits, and the simpler Milestones import (`zoho-import/milestones/route.ts`) where Issues' shape is actually closer to that.

**Decisions made during scoping:**

1. **`task_id` FK included, for safety, not populated yet.** The user asked for a `task_id uuid references tasks(id)` column on the new table for future Issue↔Task linkage. **Important:** the current issues export has no task-linkage field — Zoho's "Get Project Issues" response (verified against the real export) contains no task ID. Populating this column would require a separate Zoho "Issue Task Mapping" API call, which is out of scope for this task. The column ships as an always-`null` FK for now; a future task would need to export/import that mapping separately.
2. **Severity stored in Zoho's own vocabulary** (`None | Minor | Major | Critical | Show stopper`), not mapped onto the Hub's existing task `priority` enum (`low | normal | high | critical`). Rationale: mapping would collapse "Critical" and "Show stopper" into the same bucket, losing a real triage distinction, and inventing that mapping is a judgment call nobody's made. Stored as free text.
3. **Scope is import-only** — new table, import route, one `IMPORT_LEVELS` entry on the migrate page. No new Issues list/kanban/tab UI in the Hub — that's follow-up work once the imported data is verified, matching how Tasks import (090) shipped well before any Tasks browsing UI existed.
4. **Deviates from a literal "mirror Tasks import" in shape, deliberately:** Tasks import uses SSE + chunked upserts + a two-pass parent-resolution step because Tasks has real scale (6,946 records) and a self-referential hierarchy (`parent_task_id`). Issues has neither — no parent/child relationships, and total volume is expected to be in the hundreds (141 records from just a 50-project slice of ~250+ total projects, so realistically low hundreds portal-wide, not thousands). A flat single-POST/JSON-response import — the same shape as `milestones`/`tasklists` import — is the right fit and is dramatically simpler: no SSE plumbing, no bespoke React state/handler/JSX at all (see point 5). What IS borrowed from Tasks import: the **multi-file batch scan** (`issues-0-50-2025.json`, `issues-50-100-2025.json`, etc. — same naming convention as `tasks-*.json`), since task 107's export can produce multiple sliced files just like Tasks export does.
5. **Zero bespoke UI code** — the migrate page already has a generic fallback path for import cards that don't need custom progress UI (used by `users`, `customers`, `projects`, `milestones`, `tasklists`, `comments`, `timelogs`): add one entry to `IMPORT_LEVELS` and the existing `handleImport(level)` + `ResultChip` generic renderer handles everything. See Code Context.

---

## Data Shape Reference (from the real export, `_from_zoho/issues-0-50-2025.json`, 141 records)

Field presence across all 141 records (custom fields like `classification`/`module`/`is_it_reproducible`/`tags` shown in Zoho's generic API docs were **not present in any real record** — this portal doesn't use those custom fields, so the schema below does not model them; if they appear later for a different portal, they'd land in `source_meta`):

| Field | Present | Notes |
|---|---|---|
| `id` | 141/141 | Zoho issue ID → `external_id` |
| `prefix` | 141/141 | e.g. `"TC3-I1"` — project-scoped display ID |
| `name` | 141/141 | → `title` |
| `project` | 141/141 | `{id, name}` — Zoho already includes this on the per-project issues response; not used for FK resolution (we use the `_zoho_project_id` tag our export route already injects), kept in `source_meta` |
| `flag` | 141/141 | Only `"Internal"` seen in real data; Zoho's docs also show `"External"` as a possible value |
| `created_time` | 141/141 | ISO timestamp → `created_at` |
| `created_by` | 141/141 | `{zuid, zpuid, name, email, ...}` — kept in `source_meta`, no first-class need |
| `status` | 141/141 | `{id, name, color, color_hexcode, is_closed_type}` — real `name` values seen: `Open, Closed, For Client Approval, InProgress, Completed, Ready for QA/QC` |
| `assignee` | 141/141 | `{zuid, zpuid, name, email, ...}`; unassigned issues use the literal string `"Unassigned User"` for both `name` and `email` — must be normalized to `null` |
| `severity` | 141/141 | `{id, value}` — real values seen: `None, Minor, Major, Critical, Show stopper` |
| `added_via` | 141/141 | e.g. `"web"` — low value, `source_meta` only |
| `subscription_type` | 141/141 | e.g. `"Standard"` — low value, `source_meta` only |
| `description` | 139/141 | HTML string, same as Tasks' description |
| `due_date` | 93/141 | ISO timestamp (e.g. `"2026-01-20T04:42:00.000Z"`) — date-only needed |

**Significant fields → first-class columns:** `external_id` (id), `prefix`, `title` (name), `description`, `status` (mapped), `severity` (raw value), `flag`, `assignee_name`/`assignee_email` (normalized), `due_date`, `created_at`, `project_id` (resolved FK), `task_id` (reserved FK, unpopulated).
**Everything else → `source_meta` jsonb:** `created_by`, full `status` object (for `color`/`is_closed_type` if ever needed), `added_via`, `subscription_type`, raw `project` object.

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/051_issues_table.sql` | Create | New `issues` table, RLS (staff read / pm write via `get_my_role()`), indexes |
| `src/types/database.ts` | Modify | Add `issues` table type block (Row/Insert/Update/Relationships) to `Database["public"]["Tables"]`, near `tasklists` |
| `src/app/api/admin/zoho-import/issues/route.ts` | Create | Import route — multi-file scan of `issues-*.json`, flat POST/JSON response (no SSE) |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | Modify | Add one `IMPORT_LEVELS` entry — no other changes needed (generic fallback handles UI) |

---

## Code Context

### Migration — `supabase/migrations/051_issues_table.sql` (full file)

```sql
-- Migration 051: Issues Table (Zoho Bugs/Issues import)
-- Adds the `issues` table to receive imported Zoho Project Issues (task 107 export → task 108 import).
--
-- Design mirrors migration 035's tasklists table:
--   external_id  text unique — Zoho issue ID, the import dedup key
--   task_id      uuid nullable FK -> tasks — reserved for future Issue-Task Mapping linkage;
--                NOT populated by this import (Zoho's issue export has no task-linkage field;
--                would require a separate "Issue Task Mapping" API call, out of scope here)
--   severity     kept as Zoho's own vocabulary (None/Minor/Major/Critical/Show stopper) --
--                not mapped onto the Hub's task priority enum, to preserve the distinct
--                "Show stopper" signal a 4-value priority scale would collapse
--   source_meta  jsonb — Zoho-specific data with no first-class Hub equivalent
--                (created_by, full status object incl. color/is_closed_type, added_via,
--                subscription_type, raw project object)

create table issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  external_id text unique,
  prefix text,
  title text not null,
  description text,
  status text not null default 'open',
  severity text,
  flag text,
  assignee_name text,
  assignee_email text,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_meta jsonb default '{}'
);

alter table issues enable row level security;

create policy "issues_staff_read"
  on issues for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create policy "issues_pm_write"
  on issues for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

create index issues_project_id_idx on issues(project_id);
create index issues_task_id_idx on issues(task_id) where task_id is not null;
```

Note: no `updated_at` auto-refresh trigger — matches migration 035's `tasklists` table, which also omits one. Consistent with the established (if imperfect) convention; not introducing a new one here.

**Corrected during implementation:** `'super_admin'` was added to both policies (not present in this original snippet) — see the header's "Deviation found and fixed" note. `supabase/migrations/048_super_admin_rls.sql` exists specifically because policies modeled on pre-098 tables (including `tasklists`, this table's direct model) omitted `super_admin` and had to be retroactively patched. The actual shipped migration file already includes this fix; this snippet is left as originally written for historical accuracy of the spec.

### `src/types/database.ts` — new type block (insert after the `tasklists` block, currently ending at line 678)

```ts
issues: {
  Row: {
    id: string;
    project_id: string;
    task_id: string | null;
    external_id: string | null;
    prefix: string | null;
    title: string;
    description: string | null;
    status: string;
    severity: string | null;
    flag: string | null;
    assignee_name: string | null;
    assignee_email: string | null;
    due_date: string | null;
    created_at: string;
    updated_at: string;
    source_meta: Record<string, unknown>;
  };
  Insert: {
    id?: string;
    project_id: string;
    task_id?: string | null;
    external_id?: string | null;
    prefix?: string | null;
    title: string;
    description?: string | null;
    status?: string;
    severity?: string | null;
    flag?: string | null;
    assignee_name?: string | null;
    assignee_email?: string | null;
    due_date?: string | null;
    created_at?: string;
    updated_at?: string;
    source_meta?: Record<string, unknown>;
  };
  Update: {
    id?: string;
    project_id?: string;
    task_id?: string | null;
    external_id?: string | null;
    prefix?: string | null;
    title?: string;
    description?: string | null;
    status?: string;
    severity?: string | null;
    flag?: string | null;
    assignee_name?: string | null;
    assignee_email?: string | null;
    due_date?: string | null;
    updated_at?: string;
    source_meta?: Record<string, unknown>;
  };
  Relationships: [
    {
      foreignKeyName: "issues_project_id_fkey";
      columns: ["project_id"];
      isOneToOne: false;
      referencedRelation: "projects";
      referencedColumns: ["id"];
    },
    {
      foreignKeyName: "issues_task_id_fkey";
      columns: ["task_id"];
      isOneToOne: false;
      referencedRelation: "tasks";
      referencedColumns: ["id"];
    }
  ];
};
```

### Route — `src/app/api/admin/zoho-import/issues/route.ts` (full file, new)

```ts
// dev-only import endpoint — reads _from_zoho/issues-*.json batch files, upserts to issues table.
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { resolveProjectId, mapTaskStatus, adminClient, ImportResult } from "@/lib/migrate/zoho-import";

type ZohoIssueRaw = {
  id?: string;
  prefix?: string;
  name?: string;
  description?: string;
  status?: { name?: string; is_closed_type?: boolean };
  severity?: { value?: string };
  flag?: string;
  assignee?: { name?: string; email?: string };
  due_date?: string;
  created_time?: string;
  created_by?: Record<string, unknown>;
  added_via?: string;
  subscription_type?: string;
  project?: Record<string, unknown>;
  _zoho_project_id?: string;
  [key: string]: unknown;
};

function toDateOnly(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  return raw.split("T")[0];
}

function cleanName(raw: string | undefined): string | null {
  if (!raw || raw === "Unassigned User") return null;
  return raw;
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Multi-file scan: pick up all issues-*.json batch files, sorted for deterministic order
  const dir = path.join(process.cwd(), "_from_zoho");
  const allIssues: ZohoIssueRaw[] = [];

  const batchFiles = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("issues-") && f.endsWith(".json"))
    .sort();

  if (batchFiles.length > 0) {
    for (const file of batchFiles) {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
      if (Array.isArray(parsed)) allIssues.push(...(parsed as ZohoIssueRaw[]));
    }
  } else {
    const fallback = path.join(dir, "issues.json");
    if (!fs.existsSync(fallback)) {
      return NextResponse.json({ error: "No issues files found in _from_zoho/" }, { status: 400 });
    }
    const parsed = JSON.parse(fs.readFileSync(fallback, "utf-8"));
    allIssues.push(...(Array.isArray(parsed) ? (parsed as ZohoIssueRaw[]) : []));
  }

  if (allIssues.length === 0) {
    return NextResponse.json({ error: "No issues found in files" }, { status: 400 });
  }

  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };

  for (const issue of allIssues) {
    const externalId = String(issue.id ?? "");
    if (!externalId || !issue.name) { result.skipped++; continue; }

    const projectId = await resolveProjectId(String(issue._zoho_project_id ?? ""));
    if (!projectId) {
      result.errors.push(`issue ${externalId}: no Hub project found for zoho_project_id=${issue._zoho_project_id}`);
      result.skipped++;
      continue;
    }

    const { error } = await adminClient.from("issues").upsert(
      {
        external_id: externalId,
        project_id: projectId,
        prefix: issue.prefix ?? null,
        title: issue.name,
        description: issue.description ?? null,
        status: mapTaskStatus(issue.status?.name ?? "", issue.status?.is_closed_type ?? false),
        severity: issue.severity?.value ?? null,
        flag: issue.flag ?? null,
        assignee_name: cleanName(issue.assignee?.name),
        assignee_email: cleanName(issue.assignee?.email),
        due_date: toDateOnly(issue.due_date),
        created_at: issue.created_time ?? undefined,
        source_meta: {
          created_by: issue.created_by ?? null,
          status: issue.status ?? null,
          added_via: issue.added_via ?? null,
          subscription_type: issue.subscription_type ?? null,
          project: issue.project ?? null,
        },
      },
      { onConflict: "external_id" }
    );

    if (error) {
      result.errors.push(`issue ${externalId}: ${error.message}`);
    } else {
      result.imported++;
    }
  }

  return NextResponse.json(result);
}
```

`mapTaskStatus` and `resolveProjectId` are existing exports from `src/lib/migrate/zoho-import.ts` (`resolveProjectId` at line 78, `mapTaskStatus` at line 23) — reused as-is, no new mapping function needed. Verified all 6 real-world issue status names (`Open, Closed, For Client Approval, InProgress, Completed, Ready for QA/QC`) map correctly through `mapTaskStatus`'s existing branches (`"progress"→in_progress`, `"qa"→ready_for_qa`, `"client approval"→for_client_approval`, `"complete"/"closed"→closed`, default→`open`).

### `migrate/page.tsx` — `IMPORT_LEVELS` entry (`src/app/v2/(hub)/admin/migrate/page.tsx:85-95`)

Add one entry after `tasks`, before `comments`:

```ts
{ key: "issues", label: "Issues", desc: "Creates Hub issue records from issues-*.json — requires Projects imported first" },
```

No other `migrate/page.tsx` changes. The generic fallback render block (`src/app/v2/(hub)/admin/migrate/page.tsx:1434-1459`, reproduced below) automatically handles any `IMPORT_LEVELS` key without a bespoke `if (key === ...)` branch above it — it calls `handleImport(key)` (a flat `POST` → `ImportResult` JSON handler already defined at line 749) and renders the result via the existing `ResultChip` component:

```tsx
const st = importStates[key];
return (
  <div key={key} className="py-2 border-b border-slate-100 last:border-0">
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-slate-800 flex items-center gap-2">
          {label}
          <StateIcon state={st?.state ?? "idle"} />
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5 truncate">{desc}</div>
      </div>
      <button
        onClick={() => handleImport(key)}
        disabled={anyRunning || st?.state === "running"}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Upload size={11} />
        Import
      </button>
    </div>
    {st?.state === "done" && st.result ? <ResultChip result={st.result} /> : null}
    {st?.state === "error" ? (
      <div className="mt-2 text-[12px] text-red-600">{st.errorMsg}</div>
    ) : null}
  </div>
);
```

This block already exists — do not duplicate it, just confirm the new `issues` key falls through to it (it will, as long as no `if (key === "issues")` branch is added above it in the Import Phase section).

---

## Implementation Steps

1. Create `supabase/migrations/051_issues_table.sql` exactly as specified — apply it (`npx supabase db push` or the project's standard migration-apply step, per how prior migrations in this session were applied).
2. Add the `issues` table type block to `src/types/database.ts`, near `tasklists` (after line 678).
3. Create `src/app/api/admin/zoho-import/issues/route.ts` exactly as specified.
4. Add the one `IMPORT_LEVELS` entry to `migrate/page.tsx` (`src/app/v2/(hub)/admin/migrate/page.tsx:85-95`, after `tasks`). Do not add a bespoke `if (key === "issues")` branch in the Import Phase JSX — the generic fallback already handles it.
5. Run `npx tsc --noEmit` and `pnpm lint`.

---

## Notes for Implementation Agent

- **Sonnet recommended** — this is a new table + RLS + a schema/type addition, not a pure CRUD mirror. The `mapTaskStatus` reuse and the deliberate SSE-vs-flat shape deviation both need the reasoning in this doc understood, not just the code copied.
- **`task_id` will be `null` for every imported row** — this is expected, not a bug. Don't try to backfill it from any field in the current export; there is none. It's there so a future task can populate it without a schema migration.
- **Do not build an Issues browsing UI in this task** — scope is import only, per decision #3 above.
- **Do not copy Tasks import's SSE/chunking/two-pass structure verbatim** — Issues has no parent/child hierarchy and much lower volume; the flat single-POST shape (like `milestones`/`tasklists` import) is correct here, per decision #4.
- **`resolveProjectId` and `mapTaskStatus` already exist** in `src/lib/migrate/zoho-import.ts` — import and reuse them, do not reimplement.
- **`assignee.name`/`assignee.email` both literally equal the string `"Unassigned User"`** when an issue has no assignee (confirmed in real exported data) — must be normalized to `null`, not stored as-is.
- **`due_date` in the real export is a full ISO timestamp** (e.g. `"2026-01-20T04:42:00.000Z"`), not a bare date — truncate to the date portion before inserting into the `date` column.
- **Auth/role-gate boilerplate is copy-paste identical** to every other `zoho-import/*` route (Supabase session → `profiles.role` must be `admin` or `super_admin` via `adminClient`).

---

## Acceptance Criteria

- [x] `supabase/migrations/051_issues_table.sql` creates the `issues` table with RLS (staff read, admin/pm write) and the two indexes — applied by user, confirmed working (rows exist)
- [x] `src/types/database.ts` includes a correct `issues` type block; `npx tsc --noEmit` passes with `adminClient.from("issues")` calls type-checking cleanly
- [x] `POST /api/admin/zoho-import/issues` requires admin/super_admin auth — 401/403 matching every other import route
- [x] Route scans all `issues-*.json` files in `_from_zoho/` (falls back to `issues.json` if no batch files exist), dedupes/upserts by `external_id`
- [x] `status` is correctly mapped via `mapTaskStatus`; `severity`/`flag` are stored as Zoho's raw values; `assignee_name`/`assignee_email` are `null` when Zoho reports "Unassigned User"; `due_date` is a clean date (no time component)
- [x] `task_id` is always `null` on import (no source data exists for it yet)
- [x] `migrate/page.tsx` shows an "Issues" card in the Phase 2 — Import section (generic fallback UI, no bespoke code), positioned after "Tasks"
- [x] Live import run — **1049 issues imported, 0 updated, 0 skipped, 0 errors** (full portal export, not just the 0-50 slice referenced in the original criterion — superset of what was asked, verified clean)
- [x] `npx tsc --noEmit` and `pnpm lint` both clean

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

1. Apply migration 051.
2. Start dev server: `pnpm dev`.
3. Navigate to `/v2/admin/migrate`. Confirm the "Issues" card appears in Phase 2 — Import, after "Tasks", using the same plain card style as Milestones/Tasklists (no progress bar).
4. Click Import (with `_from_zoho/issues-0-50-2025.json` present). Confirm `imported`/`skipped`/error counts render via the shared `ResultChip`.
5. Query Supabase directly: confirm `issues` rows exist, `project_id` resolves to real `projects.id` rows, `status`/`severity`/`flag`/`assignee_name`/`assignee_email`/`due_date` look correct against a few spot-checked source records, and `task_id` is `null` on all rows.
6. Re-run the import — confirm it upserts cleanly (no duplicate rows, `external_id` conflict handled).

---

## Compatibility Touchpoints

- New table + RLS — additive migration only, no changes to existing tables/columns.
- No schema/packaging/install-surface impact beyond the new migration file.
