# 187: Customer ID 8-Hex Backfill (All Existing Rows) + Incremental Per-Customer `project_id` Format

**Created:** 2026-07-24
**Priority:** HIGH
**Type:** refactor
**Recommended Tier:** deep
**Status:** Testing

---

## Overview

Two related ID-format migrations, confirmed with the user via the New Project flow's
already-correct behavior (`WRQ-CUST-BDD824C5` / "Test 2"):

**1. `customers.customer_id` backfill.** `generateCustomerId()` (`src/lib/customers/generate-id.ts`)
already produces the target format `WRQ-CUST-XXXXXXXX` (8 uppercase hex chars) for every
*newly* created customer — this was hardened from a 4-char suffix to 8 in task 174/175's
security sweep specifically because this ID is the sole guard on the public,
unauthenticated onboarding endpoints (a 4-char ID is brute-forceable over HTTP). What's
missing is a one-time data migration: any customer row created **before** that hardening
still carries the old, shorter, weaker `WRQ-CUST-XXXX` (or even older `WRQ-CLIENT-XXXX`,
pre-task-040) format. This task backfills every existing `customers.customer_id` to the
new 8-hex format and propagates the new value to every table that stores it — completing
the security fix task 174/175 started, not just a cosmetic rename.

**2. `projects.project_id` format change.** Migration 066 (task 142) generates
`projects.project_id` as `<last 4 chars of customer_id>-PROJ-<4 random hex chars>` (e.g.
`2EBA-PROJ-04BA`) via a `BEFORE INSERT` trigger. The user wants this changed to
`<last 8 chars of customer_id>-PROJ-<2-digit incremental sequence>` (e.g.
`BDD824C5-PROJ-01`, `BDD824C5-PROJ-02`, ...), where the sequence number counts a
customer's projects in creation order — not random. Existing `project_id` values are
regenerated to the new scheme as part of the same migration (see Risk below).

Both changes are **pure data + trigger migrations** — `generateCustomerId()` and every
customer-creation call site already emit the correct 8-hex format today (verified: `src/app/api/customers/route.ts`,
`src/app/api/onboarding/projects/route.ts`, `src/app/api/onboarding/projects/import/route.ts`
all call the shared helper; `src/app/api/admin/zoho-import/customers/route.ts` has its own
copy that is already 8-hex and explicitly comments that it's "kept in sync" with the shared
helper). **No application code needs to change to fix generation** — this task is entirely
about the DB migration for legacy rows plus the trigger rewrite for `project_id`.

### ⚠️ Risk: this breaks any already-shared/bookmarked link that embeds the old ID

- **Onboarding links** (`(public)/onboarding/[customerId]` and `/v2` equivalent) use
  `customer_id` as the URL segment — it doubles as the unauthenticated access token. Any
  link already sent to a real customer using their *old*, shorter `customer_id` will
  404/fail to match after this migration. Confirm with the user whether any live customer
  currently holds an old-format link before running this in production, since finishing
  the security hardening necessarily means the old value can no longer work.
- **Portfolio-tracker links** (`/v2/portfolio-tracker/[projectId]`, task 150) use
  `projects.project_id` — not the UUID — as the actual routing key (a documented, scoped
  exception to the "UUID is always the routing key" rule; see `CLAUDE.md`'s Key
  Conventions). Regenerating every existing `project_id` invalidates any already-bookmarked
  portfolio-tracker URL. Same caveat: confirm acceptable before running against a
  production dataset with real usage.

Given the CLAUDE.md status line ("dev phase") and the sprint plan being mid-MVP, this is
likely low-blast-radius today, but it must be a conscious decision, not a silent side
effect — call this out to the user again at implementation time if not already
acknowledged.

## Requirements

- [ ] New migration file backfills every `customers.customer_id` not already matching
      `^WRQ-CUST-[0-9A-F]{8}$` to a freshly generated, unique value in that exact format
      (same algorithm as `generateCustomerId()`: 8 random hex chars, uppercased, collision-
      checked against both existing rows and other newly-generated values in the same run).
- [ ] Every table with a `customer_id` column receives the new value automatically via
      `ON UPDATE CASCADE` added to its FK (see table list in Code Context) — added as a
      permanent schema change (not reverted after the migration), since `customer_id` is
      documented as the cross-system universal key and should be safe to re-key again in
      the future without another bespoke migration.
- [ ] `llm_invocation_logs.customer_id` — the one table storing `customer_id` **without**
      an FK constraint (intentional: cost-attribution logs should survive customer
      deletion) — is explicitly, manually remapped in the same migration via the old→new
      mapping, since it will not cascade automatically.
- [ ] `projects.project_id` generation trigger (`generate_project_id()`, migration 066) is
      rewritten: format becomes `upper(right(customer_id, 8)) || '-PROJ-' || <2-digit,
      zero-padded, per-customer incremental sequence>`. The sequence is derived from the
      **max existing numeric suffix for that customer's projects + 1** (not `count(*) + 1`,
      which would reuse numbers after a deletion) and is race-safe under concurrent inserts
      for the same customer (see Code Context's `pg_advisory_xact_lock` pattern).
- [ ] One-time backfill regenerates `project_id` for every existing project row, grouped by
      `customer_id`, numbered `01, 02, 03...` in `created_at` order — using the customer's
      **new** (post-backfill) `customer_id` value, so this backfill must run after the
      `customers.customer_id` backfill in the same migration.
- [ ] The `projects_project_id_key` unique constraint is dropped before the bulk
      regeneration and re-added after, to avoid transient uniqueness violations while
      values are being reassigned row-by-row.
- [ ] `src/lib/mcp/tools/get-project-status.ts:6` — a Zod `.describe()` string shown to MCP
      clients — still shows the stale pre-task-040 example `WRQ-CLIENT-XXXX`; update to
      `WRQ-CUST-XXXXXXXX` for accuracy (doc-string only, no behavior change).
- [ ] `CLAUDE.md`'s Key Conventions note on `projects.project_id`'s format (currently
      documents `<last 4 chars of customer_id>-PROJ-<4 random chars>`) is updated to
      describe the new `<last 8 chars>-PROJ-<incremental 2-digit sequence>` format.

## Out of Scope / Must-Not-Change

- **No application code changes to customer/project creation flows.** `generateCustomerId()`
  and all its call sites already emit the correct format — confirmed via `run_pipeline`/grep,
  zero changes needed there. This task is migration-only for the customer_id side.
- **No changes to `id` (UUID) as the routing key anywhere** except the already-documented,
  pre-existing `/v2/portfolio-tracker/[projectId]` exception (task 150) — this task does not
  expand that exception to any other route, and does not touch how routing works, only the
  *value* stored in `project_id`.
- **No retroactive rewrite of Supabase Storage object paths.** Per task 143's established
  precedent, `file_path` columns are the source of truth for reads and are never
  reconstructed from `customer_id`/`project_id` at read time — existing uploaded files keep
  working under their old path even after the ID values above change. Do not attempt to
  move/rename Storage objects as part of this task.
- **No remapping of `customer_id`/`project_id` values embedded inside JSONB snapshot data**
  (e.g. `audit_logs.before`/`after`, `notifications` payloads, `digest_logs.content`, Zoho
  import/export raw JSON snapshots, `source_meta` on imported issues/comments) — consistent
  with task 142's precedent of leaving historical/import snapshot data untouched. Only live,
  structured `customer_id`/`project_id` columns are in scope.
- **No change to the `WRQ-CUST-` prefix, the 8-hex-char length, or `generateCustomerId()`'s
  collision-retry algorithm** — this task backfills existing rows into that already-correct
  format, it does not change the format itself.
- **No change to `external_project_id` (Zoho project ID) or any Zoho sync/import/export
  behavior** — unrelated column, untouched.
- Do not silently proceed against a production dataset with real, in-use onboarding or
  portfolio-tracker links without the user's explicit go-ahead — see Risk above.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/0NN_customer_id_backfill_and_incremental_project_id.sql` | Create | Backfill legacy `customer_id` values (8-hex format) with FK cascade; rewrite `project_id` trigger + regenerate existing values. |
| `src/lib/mcp/tools/get-project-status.ts` | Modify | Fix stale `WRQ-CLIENT-XXXX` example in a Zod `.describe()` string → `WRQ-CUST-XXXXXXXX`. |
| `CLAUDE.md` | Modify | Update `project_id` format documentation in Key Conventions. |

Use the next sequential migration number after the highest existing file in
`supabase/migrations/` at implementation time (verify via `ls supabase/migrations/ | sort | tail -5`
— do not hardcode a number here in case new migrations land between planning and
implementation).

## Code Context

### Tables with a `customer_id` FK to `customers(customer_id)` (confirmed via grep across
all of `supabase/migrations/*.sql`)

| Table | On Delete | Notes |
|---|---|---|
| `customer_products` | cascade | |
| `classification_records` | cascade | |
| `requirements_assessments` | cascade | |
| `implementation_plans` | cascade | |
| `execution_records` | cascade | |
| `playbooks` | cascade | nullable `customer_id` |
| `reply_drafts` | cascade | |
| `projects` (was `customer_projects`, renamed migration 025) | cascade | constraint renamed to `projects_customer_id_fkey` in migration 025 |
| `customer_assets` | cascade | |
| `profiles` | set null | nullable `customer_id`, only set for `client`-role users |
| `tickets` | cascade | |
| `contacts` | set null | nullable |
| `customer_phases` | cascade | still customer_id-tagged even though project-scoped since migration 060 |
| `customer_deliverables` | cascade | same |
| `programme_notifications` | cascade | same |
| `customer_asset_folders` | **no explicit ON DELETE** (defaults to `NO ACTION`) | confirm this table's exact current FK definition live before writing the `ON UPDATE CASCADE` ALTER, since it doesn't have the same shape as the others |

**`llm_invocation_logs.customer_id`** has **no FK at all** (deliberately — cost logs should
survive customer deletion). This one must be updated manually via the mapping table; it will
not cascade.

Recommend **not hardcoding this table list into the migration SQL**. Instead, discover FKs
dynamically so nothing is missed and the migration self-documents against the live schema:

```sql
do $$
declare
  fk record;
begin
  for fk in
    select conname, conrelid::regclass::text as table_name, confdeltype
    from pg_constraint
    where contype = 'f'
      and confrelid = 'customers'::regclass
      and conname not like '%_customer_id_fkey' is not null -- sanity filter, adjust as needed
  loop
    execute format(
      'alter table %I drop constraint %I',
      fk.table_name, fk.conname
    );
    execute format(
      'alter table %I add constraint %I foreign key (customer_id) references customers(customer_id) on delete %s on update cascade',
      fk.table_name, fk.conname,
      case fk.confdeltype
        when 'c' then 'cascade'
        when 'n' then 'set null'
        when 'r' then 'restrict'
        else 'no action'
      end
    );
  end loop;
end $$;
```

Verify this dynamic block actually enumerates all 16 tables above before relying on it —
inspect `pg_constraint`/`information_schema.table_constraints` live first if possible, since
constraint names may not all follow the default `<table>_customer_id_fkey` pattern (e.g. the
`projects` one is explicitly renamed).

### `customers.customer_id` backfill — mapping + cascade

```sql
create temporary table customer_id_migration_map (
  old_id text primary key,
  new_id text not null unique
);

do $$
declare
  r record;
  candidate text;
begin
  for r in
    select customer_id from customers
    where customer_id !~ '^WRQ-CUST-[0-9A-F]{8}$'
  loop
    loop
      candidate := 'WRQ-CUST-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
      exit when not exists (select 1 from customers where customer_id = candidate)
            and not exists (select 1 from customer_id_migration_map where new_id = candidate);
    end loop;
    insert into customer_id_migration_map (old_id, new_id) values (r.customer_id, candidate);
  end loop;
end $$;

-- Cascades to every FK'd table via ON UPDATE CASCADE added above.
update customers c
set customer_id = m.new_id
from customer_id_migration_map m
where c.customer_id = m.old_id;

-- Not FK'd — must update manually.
update llm_invocation_logs l
set customer_id = m.new_id
from customer_id_migration_map m
where l.customer_id = m.old_id;
```

### `project_id` trigger rewrite (replaces migration 066's `generate_project_id()`)

```sql
create or replace function generate_project_id() returns trigger as $$
declare
  next_seq int;
begin
  if new.project_id is not null then
    return new;
  end if;

  -- Serialize per-customer so concurrent inserts for the same customer don't race
  -- on the same sequence number. Auto-released at transaction end.
  perform pg_advisory_xact_lock(hashtext(new.customer_id));

  select coalesce(max(substring(project_id from '-PROJ-(\d+)$')::int), 0) + 1
  into next_seq
  from projects
  where customer_id = new.customer_id;

  new.project_id := upper(right(new.customer_id, 8)) || '-PROJ-' || lpad(next_seq::text, 2, '0');
  return new;
end;
$$ language plpgsql;
```

Trigger wiring (`trg_generate_project_id`) is unchanged — it already fires `BEFORE INSERT`.

### Existing `project_id` regeneration (numbered in creation order per customer)

```sql
alter table projects drop constraint if exists projects_project_id_key;

do $$
declare
  cust record;
  proj record;
  seq int;
begin
  for cust in select distinct customer_id from projects loop
    seq := 0;
    for proj in
      select id from projects where customer_id = cust.customer_id order by created_at asc
    loop
      seq := seq + 1;
      update projects
      set project_id = upper(right(cust.customer_id, 8)) || '-PROJ-' || lpad(seq::text, 2, '0')
      where id = proj.id;
    end loop;
  end loop;
end $$;

alter table projects add constraint projects_project_id_key unique (project_id);
```

Run this **after** the `customers.customer_id` backfill (same migration file, later
statement) so it reads each customer's already-updated, new `customer_id`.

### `get-project-status.ts` — stale example string

```ts
customer_id: z.string().describe("The customer_id (e.g. WRQ-CLIENT-XXXX) to look up."),
```
→
```ts
customer_id: z.string().describe("The customer_id (e.g. WRQ-CUST-XXXXXXXX) to look up."),
```

## Implementation Steps

1. Confirm the next migration number (`ls supabase/migrations/ | sort | tail -5`).
2. Live-inspect `pg_constraint`/`information_schema` (or ask the user to run a read-only
   query) to confirm the full, exact set of FKs referencing `customers(customer_id)` and
   their current `ON DELETE` behavior, especially `customer_asset_folders` (its migration
   text showed no explicit `ON DELETE` clause — confirm the live default before writing the
   `ON UPDATE CASCADE` recreate statement for it).
3. Write the migration file with, in order: (a) FK recreation adding `ON UPDATE CASCADE`
   to every discovered FK, (b) the `customer_id` backfill + mapping temp table + cascading
   update + manual `llm_invocation_logs` update, (c) the rewritten `generate_project_id()`
   trigger function, (d) the existing-`project_id` regeneration loop (drop unique constraint
   → loop → re-add unique constraint).
4. Update `src/lib/mcp/tools/get-project-status.ts`'s stale doc-comment string.
5. Update `CLAUDE.md`'s `project_id` format documentation in Key Conventions.
6. `npx tsc --noEmit` and `pnpm lint` (no functional TS changes expected beyond the one
   string, but run both per convention).
7. **Do not apply the migration** — per this project's established convention, the user
   applies migrations personally after reviewing.
8. Flag the Risk section's two bullet points to the user explicitly before they apply it in
   any environment with real, already-shared links.

## Acceptance Criteria

- [ ] `select customer_id from customers where customer_id !~ '^WRQ-CUST-[0-9A-F]{8}$'`
      returns zero rows after the migration.
- [ ] Every table listed in the Code Context's FK table (plus `llm_invocation_logs`) has
      its `customer_id` values consistent with the post-migration `customers.customer_id`
      (spot-check: pick one remapped old→new pair, confirm all child rows show the new
      value, zero rows show the old value anywhere).
- [ ] A brand-new project created for an existing customer with 2 prior projects gets
      `project_id` ending in `-PROJ-03` (not `-01`, not a random 4-char suffix).
- [ ] All pre-existing `projects.project_id` values match
      `^[0-9A-F]{8}-PROJ-\d{2,}$` and are numbered contiguously per customer in creation order.
- [ ] `projects_project_id_key` uniqueness holds for 100% of rows post-migration (no
      constraint violation on re-add).
- [ ] Deleting a project and creating a new one for the same customer does not reuse a
      previously-issued sequence number (max-based, not count-based).
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors.
- [ ] `src/lib/mcp/tools/get-project-status.ts`'s example string reads `WRQ-CUST-XXXXXXXX`.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# After the user applies the migration personally:
#   select customer_id from customers where customer_id !~ '^WRQ-CUST-[0-9A-F]{8}$';  -- expect 0 rows
#   select project_id from projects where project_id !~ '^[0-9A-F]{8}-PROJ-[0-9]{2,}$';  -- expect 0 rows
#   select customer_id, count(*), array_agg(project_id order by project_id) from projects group by customer_id;  -- spot-check contiguous numbering
#   Create a new project for an existing multi-project customer -> confirm the next sequence number, not a random suffix
#   Open a pre-existing onboarding/portfolio-tracker link created before the migration -> confirm expected 404/mismatch (this is the accepted breaking-change risk, not a bug)
```

## Compatibility Touchpoints

- **Breaking for any already-shared link** using the old `customer_id` (onboarding URLs) or
  old `project_id` (portfolio-tracker URLs) — see Risk section. Not backward compatible by
  design; this is a one-time cutover, not a dual-read/dual-write migration.
- `ON UPDATE CASCADE` added to `customer_id` FKs is a permanent schema change, not reverted
  after this migration — future `customer_id` changes (if ever needed again) will cascade
  automatically without a bespoke migration.
- No API route signature changes, no new packages, no RLS policy changes (RLS reads
  `get_my_role()`/`get_my_customer_id()` dynamically from `profiles`, which cascades
  correctly with everything else).

## Implementation Notes

### What Changed
- New migration `088_customer_id_backfill_and_incremental_project_id.sql`:
  - **Part 1a** dynamically discovers every single-column FK where both the local and
    foreign column are named `customer_id` and the foreign table is `customers` (via a
    `pg_constraint`/`pg_attribute` join on `conkey[1]`/`confkey[1]`, not a hardcoded table
    list), and recreates each with `ON UPDATE CASCADE` added while preserving its existing
    `ON DELETE` behavior (mapped from `confdeltype`: `c`→cascade, `n`→set null, `r`→restrict,
    `d`→set default, anything else→no action — covers `customer_asset_folders`, whose
    `customer_id` FK has no explicit `ON DELETE` clause per migration 065).
  - **Part 1b/1c** builds a temporary old→new mapping for every `customers.customer_id`
    not matching `^WRQ-CUST-[0-9A-F]{8}$`, generates a collision-checked replacement using
    the same algorithm as `generateCustomerId()`, applies it to `customers` (cascading to
    every FK'd table via Part 1a), then separately updates `llm_invocation_logs.customer_id`
    (the one table with no FK) using the same mapping.
  - **Part 2a** replaces `generate_project_id()` (migration 066) with a version that locks
    per-customer via `pg_advisory_xact_lock(hashtext(new.customer_id))`, derives the next
    sequence number from `max(existing numeric suffix) + 1` (not a row count, so a deleted
    project's number is never reused), and formats `project_id` as
    `upper(right(customer_id, 8)) || '-PROJ-' || lpad(seq, 2, '0')`.
  - **Part 2b** drops `projects_project_id_key`, regenerates every existing project's
    `project_id` grouped by (now-updated) `customer_id` and ordered by `created_at`, then
    re-adds the unique constraint.
- `src/lib/mcp/tools/get-project-status.ts`: fixed a stale pre-task-040 example in a Zod
  `.describe()` string (`WRQ-CLIENT-XXXX` → `WRQ-CUST-XXXXXXXX`).
- `CLAUDE.md`: updated the `projects.project_id` format description in Key Conventions to
  the new `<last 8 chars>-PROJ-<2-digit incremental sequence>` scheme and noted the
  max-based (not count-based) sequencing.

### Files Changed
- `supabase/migrations/088_customer_id_backfill_and_incremental_project_id.sql` — new file.
  **Not applied** — per this project's convention, the user applies migrations personally.
- `src/lib/mcp/tools/get-project-status.ts` — one-line doc-string fix.
- `CLAUDE.md` — `project_id` format convention updated.

### Deviations From Plan
- The task doc's Code Context left the dynamic-FK-discovery filter as a rough placeholder
  (`conname not like '%_customer_id_fkey' is not null`, explicitly flagged there as
  "adjust as needed"). Replaced it with a proper `pg_attribute` join matching on the actual
  local/foreign column names (`customer_id`/`customer_id`) rather than pattern-matching
  constraint names — more robust since constraint names aren't guaranteed to follow the
  default `<table>_customer_id_fkey` shape (the task doc itself notes `projects`'s was
  renamed in migration 025).
- Live `pg_constraint` inspection (Implementation Step 2) was not performed — no DB query
  tool was available in this session. Substituted with the static-analysis confirmation
  already done at planning time (grepped every migration file for `customer_id` FK
  definitions; confirmed `customer_asset_folders` has no `ON DELETE` clause per migration
  065, unchanged by migration 081 which only touched its separate `project_id` FK) plus a
  fully dynamic discovery query in the migration itself, so the migration self-corrects
  against whatever the live schema actually has regardless of this session's static read.
  The user should still eyeball the discovered constraint list after applying (e.g. via
  `select conname, conrelid::regclass from pg_constraint where confrelid = 'customers'::regclass and contype = 'f'` after running) to confirm all expected tables were touched.
- No other deviations — Parts 1 and 2 match the task document's Code Context SQL verbatim
  otherwise.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS (no warnings/errors).
- Migration SQL itself — **not executed**, per this project's standing convention that the
  user applies migrations personally; cannot be verified live in this session. The
  Acceptance Criteria's SQL spot-checks and the multi-project/incremental-numbering/
  deletion-reuse checks all remain to be run by the user after applying the migration.
- Manual browser verification of onboarding/portfolio-tracker link behavior — **not
  applicable pre-migration** (nothing to observe until the user applies it).
