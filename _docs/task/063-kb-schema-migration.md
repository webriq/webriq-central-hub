# Task 063 — KB Schema Migration (pgvector + kb_entries + task_logs + kb_corrections)

> **Status:** TESTING
> **Completed:** 2026-06-19
> **Implementation Notes:** Migration 027 created with `create extension if not exists vector` (idempotent), all 3 tables, and `match_kb_entries` using `create or replace function`. `embedding` column typed as `unknown` in TypeScript (Supabase doesn't generate a concrete type for `vector(1536)`). `match_kb_entries` Args/Returns added to `public.Functions`. Three convenience row type exports added at bottom of database.ts. `npx tsc --noEmit` exits 0.
> **Priority:** HIGH
> **Type:** feature
> **Recommended Model:** sonnet
> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Goal

Add the Knowledge Base tables that the automation pipeline depends on: `kb_entries` (vector-indexed execution patterns), `task_logs` (full audit trail with `triggered_by`), and `kb_corrections` (human feedback loop). Enable the `vector` extension and add the `match_kb_entries` pgvector similarity function.

These tables are a hard prerequisite for Task 067 (Orchestrator) and Task 068 (KB Library). No application code changes in this task — DB layer only.

---

## Requirements

- [x] Enable `vector` extension via `create extension if not exists vector`
- [x] Create `kb_entries` table with `embedding vector(1536)`, `classification text` (`sanity | code | both`), `lane int` (1|2|3), `tools_used text[]`, `execution_steps jsonb`, `outcome text`, `project_id text`, `use_count`, `flagged`, `created_at`, `last_used_at`
- [x] Create `match_kb_entries` SQL function — pgvector cosine similarity (`<=>` operator), `match_threshold float`, `match_count int`
- [x] Create `task_logs` table with `task_id text`, `project_id text`, `description text`, `lane int`, `tools_called text[]`, `result text`, `kb_hit bool`, `triggered_by text` (Central Hub user email), `triggered_by_id text`, `created_at`
- [x] Create `kb_corrections` table with FK to `kb_entries`, `original_lane`, `corrected_lane`, `corrected_by text`, `reason text`, `corrected_at`
- [x] Update `src/types/database.ts` to reflect all 3 new tables + the `match_kb_entries` function signature
- [x] TypeScript check passes: `npx tsc --noEmit` exits 0

## Out of Scope / Must-Not-Change

- No RLS policies in this task (add in a follow-up migration if needed)
- No application code — no `src/lib/` or `src/app/api/` changes
- Do not touch the existing `playbooks` table — it is a separate human-curated system, not the same as `kb_entries`
- Do not enable any other Postgres extensions

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/027_kb_schema.sql` | Create | pgvector extension, 3 new tables, match function |
| `src/types/database.ts` | Modify | Add `kb_entries`, `task_logs`, `kb_corrections` table types + RPC signature for `match_kb_entries` |

---

## Code Context

### Current DB types pattern (from migration 025/026)

The types file follows a consistent pattern — each table gets `Row`, `Insert`, `Update` subtypes. The new tables follow the same shape. Example from `push_subscriptions` (already exists):

```ts
// src/types/database.ts:1011
push_subscriptions: {
  Row: {
    id: string
    profile_id: string | null
    endpoint: string
    ...
    created_at: string | null
  }
  Insert: { ... }
  Update: { ... }
  Relationships: [...]
}
```

Add `kb_entries`, `task_logs`, `kb_corrections` in the same `public.Tables` block.

### Schema from plan doc (exact SQL to use)

```sql
-- Enable vector extension
create extension if not exists vector;

-- KB entries
create table kb_entries (
  id uuid primary key default gen_random_uuid(),
  request_pattern text,
  embedding vector(1536),
  classification text check (classification in ('sanity', 'code', 'both')),
  lane int check (lane in (1, 2, 3)),
  tools_used text[],
  execution_steps jsonb,
  outcome text check (outcome in ('success', 'failed', 'overridden')),
  project_id text,
  use_count int default 1,
  flagged bool default false,
  created_at timestamptz default now(),
  last_used_at timestamptz default now()
);

-- Similarity search function
create function match_kb_entries(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table(
  id uuid,
  request_pattern text,
  classification text,
  lane int,
  execution_steps jsonb,
  similarity float
)
language sql stable as $$
  select id, request_pattern, classification, lane, execution_steps,
    1 - (embedding <=> query_embedding) as similarity
  from kb_entries
  where 1 - (embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;

-- Audit log
create table task_logs (
  id uuid primary key default gen_random_uuid(),
  task_id text,
  project_id text,
  description text,
  lane int,
  tools_called text[],
  result text,
  kb_hit bool,
  triggered_by text,       -- Central Hub user email
  triggered_by_id text,    -- Central Hub user UUID
  created_at timestamptz default now()
);

-- Human corrections feed back into KB
create table kb_corrections (
  id uuid primary key default gen_random_uuid(),
  kb_entry_id uuid references kb_entries(id) on delete cascade,
  original_lane int,
  corrected_lane int,
  corrected_by text,
  reason text,
  corrected_at timestamptz default now()
);
```

---

## Implementation Steps

1. Check whether `vector` extension is already enabled: `select * from pg_extension where extname = 'vector';` — if already present, skip the `create extension` line in the migration.
2. Write `supabase/migrations/027_kb_schema.sql` using the exact SQL above.
3. Update `src/types/database.ts`:
   - Add `kb_entries`, `task_logs`, `kb_corrections` to `public.Tables`
   - Add `match_kb_entries` to `public.Functions` with the correct args/return type
4. Run `npx tsc --noEmit` — fix any type errors before marking done.

---

## Acceptance Criteria

- [x] Migration file `027_kb_schema.sql` exists and is syntactically valid SQL
- [x] All 3 tables defined with correct columns and constraints
- [x] `match_kb_entries` function defined with cosine similarity (`<=>`) operator
- [x] `src/types/database.ts` reflects all new tables (Row/Insert/Update shapes)
- [x] `npx tsc --noEmit` exits 0
- [x] Existing `playbooks` table untouched

## Verification

```bash
npx tsc --noEmit
# Should exit 0 with no errors
```

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-06-19

### What was built
Migration 027 enables `vector` extension (idempotent), creates `kb_entries` (with pgvector `embedding vector(1536)` and cosine similarity), `task_logs` (audit trail with `triggered_by`), and `kb_corrections` (human feedback). `match_kb_entries` function defined with `create or replace`. TypeScript types updated in `database.ts` with correct Row/Insert/Update shapes and `match_kb_entries` in `public.Functions`.

### How to access for testing
- Apply migration via Supabase dashboard or `supabase db push`
- TypeScript: `npx tsc --noEmit` exits 0

### Deviations from plan
- `embedding` column typed as `unknown` in TypeScript (Supabase cannot generate a concrete type for `vector(1536)`) — correct behaviour, not a deviation.
- Tables use `create table if not exists` for idempotency; function uses `create or replace` — both consistent with prior migrations.

### Standards check
Pass — no `any` types, no unused imports, migration SQL is syntactically correct, TypeScript check passes.

### Convention check
Pass — DB-only change as scoped; `playbooks` table untouched; no application code modified.

---

## Notes for Implementation Agent

- The existing `playbooks` table is a human-curated document system — do NOT confuse it with `kb_entries`. They are separate systems.
- `task_logs.triggered_by` stores the Central Hub user's email, not the Sanity robot account. This is the audit identity.
- The `vector` extension may already be enabled if Supabase project has it from a prior migration — check before adding `create extension`.
- This task is sonnet-recommended because it introduces a new Postgres extension (pgvector), a SQL function with a non-obvious cosine similarity operator, and the TypeScript types for a function return type (which uses `Returns` in Supabase's generated type pattern).
