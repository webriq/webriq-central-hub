# 142: Projects — Rename zoho_project_id → external_project_id + New Public-Facing project_id

**Created:** 2026-07-14
**Priority:** MEDIUM
**Type:** refactor
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

Two changes to the `projects` table, confirmed with the user:

1. **Rename `projects.zoho_project_id` → `external_project_id`.** Task 117's follow-up
   deliberately kept this column's Zoho-specific name (unlike `contacts`'
   `zoho_desk_contact_id` → generic `external_id` rename) specifically *because* it was
   still live-synced, unlike import-only historical columns. The user has confirmed
   this rename should proceed anyway now, since Zoho is being decommissioned — the
   "still live" justification for the specific name is going away. The column stays
   functionally identical (nullable text, still populated by `createZohoProject()`/Zoho
   import/export/webhook flows) — only its name changes, everywhere it's referenced.
2. **Add a new public-facing `projects.project_id` column** — format `<last 4 chars of
   customer_id>-PROJ-<4 random chars>` (e.g. `69FF-PROJ-56RT`), mirroring
   `generate-id.ts`'s `WRQ-CUST-XXXX` pattern for customers. Confirmed: generated via a
   **Postgres trigger** (not an app-level helper), so it's populated automatically
   regardless of which of the 4 existing project-creation code paths is used, with a
   one-time backfill for already-existing projects. The existing UUID `id` column is
   **unchanged** and stays what every route/URL uses (`/v2/projects/[projectId]`,
   `/v2/onboarding/[projectId]`, etc.) — `project_id` is display-only, not a routing key.

**Scope boundary confirmed with the user**: this task is the schema/rename/generation
work only. Where `project_id` gets *displayed* in the UI was not specified and is
explicitly deferred — see Out of Scope.

**Critical distinction for the rename** — there are two unrelated, similarly-named
things in this codebase and only one of them is in scope:

- `zoho_project_id` (no leading underscore) — the actual `projects` table column. **In
  scope**, rename everywhere.
- `_zoho_project_id` (leading underscore) — an unrelated pre-existing convention: Zoho's
  own raw project ID, tagged onto exported task/timelog/comment/issue/attachment JSON
  records purely for import-time correlation (e.g. `zoho-export/timelogs/route.ts:36,78,140`,
  `zoho-import/tasks/route.ts:38,132,134`). **Out of scope — do not touch.** It has
  nothing to do with the `projects` table column being renamed here; it happens to
  share a similar name by coincidence of both referring to "a Zoho project id" in
  different contexts.

Verified via `grep -rn "zoho_project_id"` vs `grep -rn "_zoho_project_id"` — 124 vs 40
occurrences respectively, confirming these are large, separate, overlapping-looking
result sets that must not be conflated during the rename.

## Requirements

- [ ] Migration `066`: rename column `projects.zoho_project_id` → `external_project_id`
      (`alter table projects rename column zoho_project_id to external_project_id;`).
- [ ] Same migration: add nullable `project_id` text column to `projects`, a
      `generate_project_id()` trigger function that fills it in on `INSERT` when null
      (`upper(right(NEW.customer_id, 4)) || '-PROJ-' || <4 random uppercase alphanumeric
      chars>`, retried against a per-row uniqueness check until it doesn't collide), a
      `BEFORE INSERT` trigger wiring it up, a one-time backfill loop for existing rows
      (same generation logic, since the trigger only fires on new inserts), and a
      unique constraint on `project_id` added *after* the backfill completes.
- [ ] `src/types/database.ts`: rename the 3 `zoho_project_id` occurrences (Row/Insert/
      Update on `projects`) to `external_project_id`; add `project_id: string | null` to
      Row, `project_id?: string | null` to Insert/Update (nullable/optional since the
      trigger fills it in, the app never needs to supply it).
- [ ] Every genuine (non-underscore-prefixed) `zoho_project_id` reference across the 32
      files below is renamed to `external_project_id` — DB column selects/filters/
      inserts/updates, destructured variables, TS interface fields, and UI bindings that
      read the column. `_zoho_project_id` (underscore-prefixed) occurrences are **not**
      touched anywhere, including in the same file as a genuine rename.
- [ ] `src/lib/zoho/index.ts`'s `createZohoProject()`/related functions still write to
      the (renamed) column exactly as before — only the column name changes, not the
      function's behavior, return shape, or call sites' expectations of it.
- [ ] `CLAUDE.md`'s Key Conventions section, which lists `projects` table columns
      (`zoho_project_id`, `sanity_project_id`, `github_repo`, ...), is updated to reflect
      the rename and the new `project_id` column.

## Out of Scope / Must-Not-Change

- **No routing changes.** `id` (UUID) stays exactly what every URL/route param uses —
  `project_id` is a new display-only column, not a lookup key for any existing route.
  No route needs to start accepting `project_id` as a param.
- **No UI placement decided here.** Where (if anywhere) `project_id` gets shown to
  users — project cards, detail page headers, onboarding wizard, etc. — was not
  specified by the user and is not built in this task. Flag as a follow-up if wanted.
- **`_zoho_project_id` (underscore-prefixed) is completely untouched** — see Overview.
  This includes every zoho-export/zoho-import route's local interface fields, request/
  response JSON shapes, and lookup-map keys that use this convention.
- **No changes to `sanity_project_id`, `github_repo`, or any other `projects` column** —
  only `zoho_project_id`/`project_id` are affected.
- **No changes to `createZohoProject()`'s behavior** (what it does, when it's called,
  its non-blocking-on-failure semantics) — only the column name it writes to.
- **No changes to `customer_id`'s own format or `generate-id.ts`** — this task adds an
  analogous *project*-level ID, it does not touch the existing customer-level one.
- **No retroactive Zoho-side changes** — Zoho's own project IDs are unaffected; this is
  purely a rename of our column that stores them.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/066_projects_external_id_and_public_project_id.sql` | Create | Rename column; add `project_id` + trigger + backfill + unique constraint. |
| `src/types/database.ts` | Modify | Rename `zoho_project_id` → `external_project_id` (3 places); add `project_id`. |
| `src/lib/zoho/index.ts` | Modify | 15 occurrences — column reads/writes in `createZohoProject`/related sync helpers. |
| `src/app/v2/(hub)/customers/[customerId]/client.tsx` | Modify | 9 occurrences — v2 customer profile's project display/edit. |
| `src/app/(hub)/customers/[customerId]/client.tsx` | Modify | 9 occurrences — v1 equivalent. |
| `src/app/(hub)/orchestration/_content.tsx` | Modify | 6 occurrences. |
| `src/app/(hub)/dashboard/tasks/_pm-tasks.tsx` | Modify | 5 occurrences. |
| `src/app/api/admin/zoho-import/timelogs/route.ts` | Modify | 5 occurrences — project lookup-map keyed by the column (not `_zoho_project_id`, which stays). |
| `src/app/api/admin/zoho-import/tasks/route.ts` | Modify | 5 occurrences — same lookup-map pattern (see Code Context). |
| `src/app/api/admin/zoho-import/tasklists/route.ts` | Modify | 5 occurrences. |
| `src/app/api/admin/zoho-import/issues/route.ts` | Modify | 5 occurrences. |
| `src/app/api/admin/zoho-import/issue-timelogs/route.ts` | Modify | 5 occurrences. |
| `src/app/api/zoho/route.ts` | Modify | 4 occurrences. |
| `src/app/api/classification/[id]/assign/route.ts` | Modify | 4 occurrences. |
| `src/app/api/projects/route.ts` | Modify | 3 occurrences. |
| `src/app/api/customers/[customerId]/projects/route.ts` | Modify | 3 occurrences — sets the column from `createZohoProject()`'s result on manual v1 project creation. |
| `src/app/api/admin/zoho-sync/tasklists/route.ts` | Modify | 3 occurrences. |
| `src/app/api/admin/zoho-import/projects/route.ts` | Modify | 3 occurrences — the one real `.insert()` into `projects` for bulk Zoho project import. |
| `src/app/api/admin/zoho-import/milestones/route.ts` | Modify | 3 occurrences. |
| `src/app/api/admin/zoho-export/timelogs/route.ts` | Modify | 3 occurrences (leave the file's own `_zoho_project_id` interface field untouched). |
| `src/app/api/admin/zoho-export/issue-timelogs/route.ts` | Modify | 3 occurrences. |
| `src/app/api/admin/zoho-export/issue-comments/route.ts` | Modify | 3 occurrences. |
| `src/app/api/admin/zoho-export/issue-attachment-meta/route.ts` | Modify | 3 occurrences. |
| `src/app/api/admin/zoho-export/comments/route.ts` | Modify | 3 occurrences. |
| `src/app/api/admin/zoho-export/attachment-meta/route.ts` | Modify | 3 occurrences. |
| `src/lib/migrate/zoho-import.ts` | Modify | 2 occurrences. |
| `src/components/hub/pm-tabs/tasks-tab.tsx` | Modify | 2 occurrences. |
| `src/app/api/customers/[customerId]/projects/[projectId]/route.ts` | Modify | 2 occurrences. |
| `src/app/api/webhooks/route.ts` | Modify | 1 occurrence. |
| `src/app/api/admin/zoho-export/tasks/route.ts` | Modify | 1 occurrence. |
| `src/app/api/admin/zoho-export/tasklists/route.ts` | Modify | 1 occurrence. |
| `src/app/api/admin/zoho-export/milestones/route.ts` | Modify | 1 occurrence. |
| `src/app/api/admin/zoho-export/issues/route.ts` | Modify | 1 occurrence. |
| `CLAUDE.md` | Modify | Update the Key Conventions line documenting `projects` table columns. |

## Code Context

### Migration 066 — rename + new column + trigger + backfill

```sql
alter table projects rename column zoho_project_id to external_project_id;

alter table projects add column if not exists project_id text;

create or replace function generate_project_id() returns trigger as $$
declare
  candidate text;
begin
  if new.project_id is not null then
    return new;
  end if;
  loop
    candidate := upper(right(new.customer_id, 4)) || '-PROJ-' ||
      upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    exit when not exists (select 1 from projects where project_id = candidate);
  end loop;
  new.project_id := candidate;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_generate_project_id on projects;
create trigger trg_generate_project_id
  before insert on projects
  for each row execute function generate_project_id();

-- One-time backfill for existing rows (trigger only fires on INSERT).
do $$
declare
  r record;
  candidate text;
begin
  for r in select id, customer_id from projects where project_id is null loop
    loop
      candidate := upper(right(r.customer_id, 4)) || '-PROJ-' ||
        upper(substr(md5(random()::text || clock_timestamp()::text || r.id::text), 1, 4));
      exit when not exists (select 1 from projects where project_id = candidate);
    end loop;
    update projects set project_id = candidate where id = r.id;
  end loop;
end $$;

alter table projects add constraint projects_project_id_key unique (project_id);
```

### The distinction to preserve everywhere (`zoho-import/tasks/route.ts:38,111-134`)

```ts
// This interface field is Zoho's OWN raw id, tagged for import correlation — DO NOT rename.
interface RawTask { /* ... */ _zoho_project_id?: string; }

// This IS the projects table column — rename both occurrences on this line.
const { data: projectRows } = await adminClient.from("projects").select("id, zoho_project_id");
const projectMap = new Map((projectRows ?? []).map((p) => [String(p.zoho_project_id), p.id as string]));

// Reads _zoho_project_id (untouched) to look up the map keyed by the renamed column's old values —
// no functional change here beyond the map being keyed by external_project_id now.
const projectId = projectMap.get(String(t._zoho_project_id ?? ""));
```

The identical `select("id, zoho_project_id")` → lookup-map pattern repeats in
`zoho-import/tasklists|issues|issue-timelogs/route.ts` — same treatment each time.

### `database.ts` — 3 occurrences on `projects` (Row/Insert/Update), around line 547/576/605

```ts
zoho_project_id: string | null;   // Row  -> external_project_id: string | null;
zoho_project_id?: string | null;  // Insert -> external_project_id?: string | null;
zoho_project_id?: string | null;  // Update -> external_project_id?: string | null;
```

Add alongside each: `project_id: string | null;` (Row) / `project_id?: string | null;`
(Insert/Update) — optional on Insert/Update since the trigger populates it; the app
never needs to pass a value.

## Implementation Steps

1. Write migration `066` (rename, new column, trigger function + trigger, backfill,
   unique constraint) — do not apply it (per this project's convention, the user
   applies migrations personally).
2. Update `src/types/database.ts` (rename + add `project_id`).
3. Systematically rename every genuine `zoho_project_id` reference across the 31
   application files listed in Proposed File Changes. Recommended approach: search
   case-sensitively for the literal `zoho_project_id`, and for each hit confirm it is
   **not** immediately preceded by an underscore (i.e. not `_zoho_project_id`) before
   renaming to `external_project_id`. Do this file-by-file, not as a single blind
   project-wide find/replace, given how similar the two strings look.
4. Update `CLAUDE.md`'s Key Conventions `projects` table bullet.
5. `npx tsc --noEmit` and `pnpm lint`.
6. `pnpm build` (given the size of this rename, a full build is worth running, same
   precedent as task 141).

## Acceptance Criteria

- [ ] `grep -rn "zoho_project_id" src` (excluding `_zoho_project_id` hits) returns zero
      results outside of the migration file itself (which references the old name only
      in its `rename column` statement).
- [ ] `grep -rn "_zoho_project_id" src` still returns the same 40 occurrences as before
      this task — completely unchanged.
- [ ] `createZohoProject()` and every Zoho export/import/sync/webhook flow that reads or
      writes the project's external id still works exactly as before, just under the
      new column name.
- [ ] A newly-created project (via any of the 4 creation call sites) gets a `project_id`
      automatically, formatted `<4 chars>-PROJ-<4 chars>`, with no app code needing to
      generate or pass it.
- [ ] After the migration + backfill, every existing project row has a non-null, unique
      `project_id`.
- [ ] No route, URL, or lookup uses `project_id` for routing — `id` (UUID) is unchanged
      everywhere it's used today.
- [ ] `npx tsc --noEmit`, `pnpm lint`, and `pnpm build` all pass with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm build
grep -rn "zoho_project_id" src | grep -v "_zoho_project_id"   # expect zero (post-rename)
grep -rn "_zoho_project_id" src | wc -l                        # expect unchanged (40)
# After the user applies migration 066 personally:
#   - Create a new project (any of the 4 paths) -> confirm project_id auto-populates, format correct
#   - Query an existing project -> confirm project_id was backfilled and is unique
#   - Trigger a Zoho project create/sync flow -> confirm external_project_id is read/written correctly end to end
```

## Compatibility Touchpoints

- Migration `066` is **not backward compatible for the rename** (renaming a column is a
  breaking DDL change for anything still referencing the old name) — this task's own
  file list must be complete for the app to keep working after the migration is
  applied. The `project_id` addition is purely additive.
- No route/URL/API contract changes — this is an internal column rename plus an
  additive column, not a public API surface change.

## Implementation Notes

### What Changed
- Migration `066`: renamed `projects.zoho_project_id` → `external_project_id`; added a
  nullable `project_id` text column; added a `generate_project_id()` trigger function +
  `BEFORE INSERT` trigger that auto-fills `project_id` (format `<last 4 chars of
  customer_id>-PROJ-<4 random uppercase alphanumeric chars>`, retried per-row against a
  uniqueness check) whenever a new project row doesn't already have one; a one-time
  backfill loop for pre-existing rows (the trigger only fires on `INSERT`); and a unique
  constraint on `project_id`, added after the backfill so it doesn't fail against
  interim nulls.
- `src/types/database.ts`: renamed the 3 `zoho_project_id` fields on `projects`
  (Row/Insert/Update) to `external_project_id`; added `project_id` alongside each
  (required on Row, optional/nullable on Insert/Update since the trigger populates it).
- Renamed every genuine (non-underscore-prefixed) `zoho_project_id` reference to
  `external_project_id` across the 30 remaining application files — done via a
  negative-lookbehind Perl substitution (`s/(?<!_)zoho_project_id/external_project_id/g`)
  run per-file rather than a naive global find/replace, specifically so
  `_zoho_project_id` (the unrelated Zoho-raw-id export/import correlation tag) could
  not be accidentally caught by the same substring. Verified before and after: the
  underscore-prefixed convention's occurrence count across all of `src` stayed exactly
  40, both before and after the rename; a whole-tree grep for the bare pattern
  (excluding underscore-prefixed hits) returns zero remaining occurrences.
- One incidental, correct side effect: a log message string in
  `zoho-import/tasks/route.ts` (`no Hub project for zoho_project_id=${...}`) also picked
  up the rename to `external_project_id=` in its label text, since the literal substring
  there wasn't underscore-prefixed — the interpolated value still correctly reads from
  `t._zoho_project_id` (untouched), so this only improved the label's accuracy, not a
  functional change.
- Updated `CLAUDE.md`'s `projects` table Key Conventions bullet to document the rename,
  explicitly flag the `_zoho_project_id` vs `external_project_id` distinction for future
  reference, and document the new `project_id` column and its display-only nature.
- No UI display work was done — confirmed out of scope; `project_id` is not yet shown
  anywhere in the app, per the task doc's own scope boundary.

### Files Changed
- `supabase/migrations/066_projects_external_id_and_public_project_id.sql` — new file.
  **Not yet applied** — per this project's established convention, the user applies
  migrations personally.
- `src/types/database.ts` — renamed `zoho_project_id` → `external_project_id` (3
  places); added `project_id`.
- `src/lib/zoho/index.ts`, `src/lib/migrate/zoho-import.ts`,
  `src/app/v2/(hub)/customers/[customerId]/client.tsx`,
  `src/app/(hub)/customers/[customerId]/client.tsx`,
  `src/app/(hub)/orchestration/_content.tsx`,
  `src/app/(hub)/dashboard/tasks/_pm-tasks.tsx`,
  `src/components/hub/pm-tabs/tasks-tab.tsx`,
  `src/app/api/zoho/route.ts`,
  `src/app/api/webhooks/route.ts`,
  `src/app/api/projects/route.ts`,
  `src/app/api/classification/[id]/assign/route.ts`,
  `src/app/api/customers/[customerId]/projects/route.ts`,
  `src/app/api/customers/[customerId]/projects/[projectId]/route.ts`,
  `src/app/api/admin/zoho-sync/tasklists/route.ts`,
  `src/app/api/admin/zoho-import/{projects,milestones,tasks,tasklists,issues,issue-timelogs,timelogs}/route.ts`,
  `src/app/api/admin/zoho-export/{tasks,tasklists,milestones,issues,timelogs,issue-timelogs,issue-comments,issue-attachment-meta,comments,attachment-meta}/route.ts`
  — all 30 files, genuine `zoho_project_id` references renamed to `external_project_id`;
  `_zoho_project_id` occurrences (where present) left byte-for-byte unchanged.
- `CLAUDE.md` — updated the `projects` table Key Conventions bullet.

### Deviations From Plan
- None — implementation matches the task document's Requirements, Proposed File
  Changes, and Implementation Steps exactly, including the DB-trigger generation
  approach and the underscore-prefixed exclusion confirmed with the user beforehand.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors) — this alone is strong evidence the rename is
  complete and consistent, since any lingering reference to the old `zoho_project_id`
  field against the now-renamed `Database["public"]["Tables"]["projects"]` type would
  have failed to compile.
- `pnpm lint` — PASS (no warnings/errors).
- `pnpm build` — PASS; confirmed the full production build compiles cleanly across
  every affected route (v1 and v2 customer/project pages, all zoho-export/zoho-import
  admin routes, webhooks, classification).
- Whole-tree verification greps (post-rename): `grep -rn "zoho_project_id" src | grep
  -v "_zoho_project_id"` → 0 results (expected 0); `grep -rn "_zoho_project_id" src |
  wc -l` → 40 (expected unchanged from the pre-rename baseline of 40).
- Manual DB/browser verification — **SKIPPED, cannot be done yet**: migration 066 has
  not been applied (user applies migrations personally), so there is no live
  `external_project_id`/`project_id` column to exercise yet, and live verification
  would also require a logged-in Hub session regardless. Once the user applies the
  migration, the task doc's own Verification section's manual steps (create a project,
  confirm auto-generated `project_id`, confirm backfill on existing rows, exercise a
  live Zoho project create/sync flow) still need to be run.

### Live-Run Fixes

- **Migration 066 applied successfully (2026-07-14).** `supabase db push` reported a
  single `NOTICE` — `trigger "trg_generate_project_id" for relation "projects" does
  not exist, skipping` — from the migration's defensive `drop trigger if exists`
  statement running before the trigger's first-ever creation; expected, harmless, and
  not an error (`Finished supabase db push.` confirmed success). No code changes were
  needed. The generated `project_id` format (`<last 4 chars of customer_id>-PROJ-<4
  random chars>`) was subsequently confirmed live — a screenshot the user shared while
  testing task 141/144's File Explorer shows a real generated value
  (`2EBA-PROJ-04BA`) rendered as the breadcrumb's root label — validating the trigger
  actually produces correctly-formatted, non-null values on real rows.
