# Task 110 — Zoho Issue Comments Import: New `issue_comments` Table + Import Route

> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Date:** 2026-07-06
> **Status:** Completed
> **Completed:** 2026-07-06
> **Implementation Notes:** All 5 planned file changes made exactly as specced, no deviations. `supabase/migrations/052_issue_comments_table.sql` created verbatim from Code Context (both RLS policies include `super_admin` from the start — no repeat of task 108's retroactive-patch bug). `src/types/database.ts` got the `issue_comments` block inserted right after `issues` (ending at what is now line 802) — **one deliberate correction from the doc's Code Context**: the `Relationships` array only includes the `issue_id → issues` FK, not an `author_id → users` entry. Checked `task_comments`' existing type block first (`src/types/database.ts:1009-1017`) and confirmed no table in this codebase types an `auth.users` FK in its `Relationships` array — grepped the whole file for `referencedRelation: "users"` and got zero matches before my edit. Matched that established convention instead of the doc's snippet, which had included one. `src/lib/migrate/zoho-import.ts` got `resolveIssueId()` added after `resolveTaskId()`, identical shape. `src/app/api/admin/zoho-import/issue-comments/route.ts` created verbatim — pre-built issue lookup map (1 query) + paginated user cache, chunked upsert (50/chunk) wrapped in `upsertChunkWithRetry` (3 attempts, 1s/2s/3s backoff), single-file read (no multi-file batch scan, matching task 109's single unified export). `migrate/page.tsx` got exactly one `IMPORT_LEVELS` entry added (`issue-comments`, after `comments`) — confirmed via grep that the `IMPORT_LEVELS.map` render loop only has bespoke branches for `tasks`/`timelogs`/`attachments`, so the new key falls through to the generic fallback renderer with zero bespoke JSX, same as `issues`/`comments` already do. `npx tsc --noEmit` clean. `pnpm lint` — same 44 pre-existing problems (8 errors/36 warnings) as the baseline before this change, confirmed via `grep` that none touch any of the 5 changed files. **Per CLAUDE.md, no git commit was made** and this ran directly on `main`, no worktree.
>
> **Migration not yet applied.** This repo has a linked remote Supabase project (`supabase/.temp/linked-project.json` → ref `tgjpkyiywktjktbsxcyr`) but no local Docker running, so `supabase db push` wasn't run automatically — applying a schema migration to a live, shared remote database is exactly the kind of action that needs explicit user confirmation first (per this session's operating guidelines), not something to push unilaterally just because a linked ref happens to exist. Matches task 108's own precedent, where the user applied migration 051 manually. **User needs to apply `supabase/migrations/052_issue_comments_table.sql` before the live import test can run** (Supabase dashboard SQL editor, or `supabase db push` if the user runs it themselves).
> **Bug found on first live run and fixed: Supabase's 1000-row default select limit silently truncated the issue lookup map.** After the user applied migration 052 and ran the import, the result was **2185 imported, 100 skipped, 100 error(s)** — all errors reading `no Hub issue found for _zoho_issue_id=...`. Investigated by cross-referencing the errored `_zoho_issue_id` values (e.g. `1512955000017795386`, "Distorted Images") against the raw local export files: the issue **does** exist in `_from_zoho/issues-50-100-2025.json`, and its project (`Gordon Waters`, `1512955000010399026`) **does** exist in `_from_zoho/projects.json` — ruling out a missing-project or corrupted-ID theory. Root cause: `const { data: issueRows } = await adminClient.from("issues").select("id, external_id")` had **no pagination**, and Supabase/PostgREST's default response cap is 1000 rows per query. With 1049 issues in the table, ~49 were silently dropped from the lookup map with no error surfaced — any comment whose issue happened to land in that dropped tail failed to resolve. This is the **exact same bug class** already fixed once in this codebase (task 103, `timelogs`/`tasks` import routes — see the `// tasks table can exceed Supabase's 1000-row default select limit, so paginate` comment already sitting in `zoho-import/timelogs/route.ts:100`) — it should have been caught by following that precedent from the start, not re-discovered live. **Fixed** by replacing the single unpaginated query with the exact paginated loop pattern already established in `timelogs/route.ts:104-119` (`PAGE = 1000`, `.range(from, from + PAGE - 1)`, loop until a short page is returned), plus a `.not("external_id", "is", null)` filter matching that same precedent. `npx tsc --noEmit` clean after the fix.
> **Live Run Result (2026-07-06):** User re-ran the import after the pagination fix — **all issue comments imported successfully**, including the previously-orphaned ~100 that failed against the truncated 1049-row issue map. Confirms the fix resolved the actual root cause (unpaginated `.select()` hitting Supabase's 1000-row cap), not just a symptom.
> **Investigation:** No formal `/understand` run, but this spec is grounded in a full live data analysis of the real export produced by task 109: all **2285 records** in `_from_zoho/issue-comments.json` were programmatically inspected (field presence counts, value domains, cross-referenced against `_from_zoho/issues-*.json`), not sampled or guessed. See `## Data Shape Reference` below — every claim there is a measured count from the real file, not a docs assumption. Treat `## Code Context` as grounded.

---

## Overview

Import the Issue Comments exported by task 109 (`_from_zoho/issue-comments.json`) into a new dedicated Supabase `issue_comments` table, mirroring `zoho-import/issues/route.ts`'s (task 108) lookup-map + chunked-upsert pattern — **not** `zoho-import/comments/route.ts`'s per-record loop, and **not** an extension of the existing `task_comments` table.

This is the direct follow-up to task 109 (export), continuing the same split the codebase already used for Issues themselves: task 107 (export) → task 108 (import) as two separate tasks.

**Decisions made during scoping (all grounded in live data, not guesses):**

1. **New dedicated `issue_comments` table — do not retrofit `task_comments`.** Three reasons: (a) `task_comments.task_id` is `NOT NULL` — reusing it would require making that nullable, adding a nullable `issue_id`, and a CHECK constraint enforcing exactly one parent is set, a polymorphic-parent pattern messier than two clean tables and touching a column already live in production; (b) the codebase already chose separate tables for Issues vs. Tasks themselves (task 108's `issues` table, not merged into `tasks`) — a dedicated `issue_comments` continues that same `issues`/`issue_comments` pairing, mirroring `tasks`/`task_comments`; (c) `task_comments`' RLS includes a live "author inserts their own comment" policy (`author_id = auth.uid()`) for the Hub's live commenting feature — Issue Comments has no such live-compose UI (import-only, pure historical data), so its RLS should mirror `issues`' own staff-read/pm-write pattern instead.
2. **`updated_at` is a new first-class column `task_comments` never had**, justified by real data: `last_modified_time !== created_time` in **256/2285 (11.2%)** of real records — a genuine edit-tracking signal that's free to capture now and was never available on the sibling table.
3. **`last_modified_by` is dropped entirely** (not even `source_meta`) — measured as byte-identical to `added_by` in **2285/2285 (100%)** of records. Nobody but the original author ever edited a comment in this dataset. Zero informational value.
4. **`reactions` and `third_party_service_details` are dropped entirely** — measured as an empty `{}` object in **0/2285 (0%)** of records. Zoho's docs list these as fields, but this portal never populates them.
5. **`can_edit_comment`/`can_delete_comment` are dropped** — these are permission flags relative to whichever API caller made the request (i.e., relative to the Hub's own OAuth token), not intrinsic properties of the comment. Meaningless once decoupled from Zoho's live permission engine, which is the whole point of decommissioning.
6. **`_zoho_project_id` is not a column** — measured as 100% redundant: every one of the 2285 comments' `_zoho_project_id` tag agrees exactly with the project ID already recorded on the comment's own issue (`issues.project_id`, reachable via the `issue_id` FK). Matches `task_comments`, which also has no `project_id` column for the same reason.
7. **Comment `attachments` (344/2285, ~15%, real Zoho-hosted `download_url`/`permanent_url` values) are out of scope for actual file migration in this task.** These URLs look session/token-scoped and will very likely go dead post-decommission, but downloading and re-hosting them is its own project (same shape as task 106's Attachments Bulk Upload work) — flag as a follow-up, don't block this import on it. Metadata only (filename, size, type) lands in `source_meta` so nothing is silently lost, just deferred.
8. **Field name is `added_by`, not `created_by`.** Zoho's Issue Comments API uses `added_by`/`last_modified_by` (confirmed in the real export), where Task Comments' API uses `created_by`. Task 109 flagged this as a trap for this exact task — the import route below uses the correct field name from day one.
9. **Import route mirrors `zoho-import/issues/route.ts`'s pre-built lookup-map + chunked-upsert shape, not `zoho-import/comments/route.ts`'s per-record-query loop.** Task 108 discovered and fixed a real N+1 bug in exactly this shape of route (per-record `resolveProjectId()` + `upsert()` inside a loop → 282 sequential round-trips, 2.4 minutes, looked hung). 2285 rows is small enough that the per-record version would probably still finish, but there's no reason to re-introduce a known-bad pattern when the fixed one is one file away and costs nothing extra to copy.
10. **No `IMPORT_LEVELS` UI changes beyond one entry.** Same zero-bespoke-UI treatment task 108 used for `issues` — the existing generic fallback render block in `migrate/page.tsx` already handles any `IMPORT_LEVELS` key without custom JSX.
11. **Chunked upserts get their own bounded retry-with-backoff, separate from (and unrelated to) Zoho's throttle handling.** This route never calls the Zoho API, so `fetchZohoWithRetry` doesn't apply here — but the write side (46 chunked `upsert()` calls against Supabase, 50 rows each) can still transiently fail (connection pool pressure, momentary network blip, Supabase-side rate limiting on the project's plan). No existing import route (`issues`, `comments`, etc.) retries a failed chunk at all today — a failure is just recorded in `result.errors` and the loop moves on, silently under-importing. Since this is the first task to add chunk-retry logic, it's implemented as a small local helper in the new route file (`upsertChunkWithRetry`, 3 attempts, linear 1s/2s/3s backoff) rather than a new shared `src/lib/*` utility — one call site doesn't justify a shared abstraction yet. If a future import route needs the same shape, that's when it should move to a shared helper, not before.

---

## Data Shape Reference (measured from the real export, `_from_zoho/issue-comments.json`, 2285 records — cross-checked against all 1049 issues in `_from_zoho/issues-*.json`)

| Field | Presence | Notes |
|---|---|---|
| `id` | 2285/2285 | Always a numeric string → `external_id` |
| `comment` | 2285/2285 | 2280/2285 contain HTML markup → `body` (stored raw, matches how `issues.description` already stores unsanitized HTML) |
| `_zoho_issue_id` | 2285/2285 | **100% resolve to a real issue** in `issues-*.json` (0 orphans) → resolves `issue_id` FK |
| `_zoho_project_id` | 2285/2285 | **100% agrees** with the referenced issue's own project id — not stored as a column, see decision #6 |
| `added_by` | 2285/2285 | `{zpuid, full_name, name, last_name, id, is_client_user, first_name, email, business_hours_id}` — only **25 distinct authors** by email across the whole export; only **1** comment authored by a client user (`is_client_user: true`) |
| `last_modified_by` | 2285/2285 | **Identical to `added_by` in 100% of records** — drop entirely, see decision #3 |
| `created_time` | 2285/2285 | ISO timestamp → `created_at` |
| `last_modified_time` | 2285/2285 | Differs from `created_time` in **256/2285 (11.2%)** → `updated_at`, see decision #2 |
| `added_via` | 2285/2285 | Distinct values seen: `Projects`, `WEB`, `mail`, `Android` — low value → `source_meta` only |
| `reactions` | 2285/2285 | **Empty `{}` in 100% of records** → drop entirely |
| `third_party_service_details` | 2285/2285 | **Empty `{}` in 100% of records** → drop entirely |
| `can_edit_comment` / `can_delete_comment` | 2285/2285 | Caller-relative permission booleans → drop entirely |
| `attachments` | 344/2285 (~15%) | Real Zoho-hosted URLs, likely session-scoped — metadata to `source_meta`, file migration out of scope (decision #7) |

**Significant fields → first-class columns:** `external_id` (id), `issue_id` (resolved FK), `author_id`/`author_name`/`author_email` (resolved + raw fallback), `body` (comment), `created_at`, `updated_at`.
**Everything else → `source_meta` jsonb:** `added_by` (full raw object, kept for reference even though the significant parts are already extracted), `added_via`, `attachments` (metadata only, if present).
**Dropped with zero storage anywhere:** `last_modified_by`, `reactions`, `third_party_service_details`, `can_edit_comment`, `can_delete_comment`, `_zoho_project_id`.

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/052_issue_comments_table.sql` | Create | New `issue_comments` table, RLS (staff read / pm write via `get_my_role()`), index |
| `src/types/database.ts` | Modify | Add `issue_comments` table type block (Row/Insert/Update/Relationships) near `issues` |
| `src/lib/migrate/zoho-import.ts` | Modify | Add `resolveIssueId(externalId)` helper, mirroring `resolveTaskId()` |
| `src/app/api/admin/zoho-import/issue-comments/route.ts` | Create | Import route — single-file scan of `issue-comments.json`, pre-built issue lookup map, chunked upsert |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | Modify | Add one `IMPORT_LEVELS` entry — no other changes needed (generic fallback handles UI) |

---

## Code Context

### Migration — `supabase/migrations/052_issue_comments_table.sql` (full file)

```sql
-- Migration 052: Issue Comments Table (Zoho Issue Comments import)
-- Adds the `issue_comments` table to receive imported Zoho Issue Comments (task 109 export → task 110 import).
--
-- Design mirrors migration 051's `issues` table, NOT `task_comments`:
--   task_comments.task_id is NOT NULL and its RLS includes a live author-insert policy
--   (author_id = auth.uid()) for the Hub's live commenting feature. Issue Comments has no
--   such live-compose UI yet — this table is pure imported historical data, so RLS mirrors
--   `issues`' own staff-read/pm-write pattern instead of task_comments' 3-policy split.
--
--   external_id  text unique — Zoho comment ID, the import dedup key
--   issue_id     uuid not null FK -> issues — every comment always belongs to exactly one issue
--   author_id    uuid nullable FK -> auth.users, ON DELETE SET NULL — Zoho commenters may not
--                have Hub accounts (same reasoning as task_comments' migration 035 fix)
--   updated_at   NEW vs task_comments — real data showed 256/2285 (11.2%) of comments were
--                edited after creation (last_modified_time != created_time); worth capturing
--                since it's free and task_comments never tracked this
--   source_meta  jsonb — added_by (full raw object), added_via, attachment metadata (no file
--                migration — see task 110 doc decision #7)
--
--   Deliberately NOT stored anywhere (measured zero value from the real export):
--   last_modified_by (100% identical to added_by), reactions (0% non-empty),
--   third_party_service_details (0% non-empty), can_edit_comment/can_delete_comment
--   (caller-relative permission flags), _zoho_project_id (100% redundant with issue_id's
--   own project_id)

create table issue_comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text,
  author_email text,
  body text not null,
  external_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_meta jsonb default '{}'
);

alter table issue_comments enable row level security;

create policy "issue_comments_staff_read"
  on issue_comments for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create policy "issue_comments_pm_write"
  on issue_comments for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

create index issue_comments_issue_id_idx on issue_comments(issue_id);
```

**`super_admin` is already included in both policies from the start** — unlike task 108, which had to retroactively add it after shipping without it (migration 048 exists specifically because pre-098 tables missed this). Do not repeat that mistake here; the snippet above already has it.

### `src/types/database.ts` — new type block (insert after the `issues` block)

```ts
issue_comments: {
  Row: {
    id: string;
    issue_id: string;
    author_id: string | null;
    author_name: string | null;
    author_email: string | null;
    body: string;
    external_id: string | null;
    created_at: string;
    updated_at: string;
    source_meta: Record<string, unknown>;
  };
  Insert: {
    id?: string;
    issue_id: string;
    author_id?: string | null;
    author_name?: string | null;
    author_email?: string | null;
    body: string;
    external_id?: string | null;
    created_at?: string;
    updated_at?: string;
    source_meta?: Record<string, unknown>;
  };
  Update: {
    id?: string;
    issue_id?: string;
    author_id?: string | null;
    author_name?: string | null;
    author_email?: string | null;
    body?: string;
    external_id?: string | null;
    updated_at?: string;
    source_meta?: Record<string, unknown>;
  };
  Relationships: [
    {
      foreignKeyName: "issue_comments_issue_id_fkey";
      columns: ["issue_id"];
      isOneToOne: false;
      referencedRelation: "issues";
      referencedColumns: ["id"];
    },
    {
      foreignKeyName: "issue_comments_author_id_fkey";
      columns: ["author_id"];
      isOneToOne: false;
      referencedRelation: "users";
      referencedColumns: ["id"];
    }
  ];
};
```

### `src/lib/migrate/zoho-import.ts` — new `resolveIssueId` helper (add after `resolveTaskId`, currently at line 89-97)

```ts
export async function resolveIssueId(externalId: string): Promise<string | null> {
  if (!externalId) return null;
  const { data } = await adminClient
    .from("issues")
    .select("id")
    .eq("external_id", externalId)
    .maybeSingle();
  return data?.id ?? null;
}
```

Direct copy of `resolveTaskId`'s shape (`src/lib/migrate/zoho-import.ts:89-97`) — same single-row lookup by `external_id`, just against `issues` instead of `tasks`.

### New route — `src/app/api/admin/zoho-import/issue-comments/route.ts` (full file, new)

```ts
// dev-only import endpoint — reads _from_zoho/issue-comments.json, upserts to issue_comments table.
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient, ImportResult } from "@/lib/migrate/zoho-import";

type ZohoIssueCommentRaw = {
  id?: string;
  comment?: string;
  added_by?: { full_name?: string; name?: string; email?: string };
  added_via?: string;
  created_time?: string;
  last_modified_time?: string;
  attachments?: Array<Record<string, unknown>>;
  _zoho_issue_id?: string;
  [key: string]: unknown;
};

type IssueCommentRow = {
  external_id: string;
  issue_id: string;
  author_id: string | null;
  author_name: string | null;
  author_email: string | null;
  body: string;
  created_at?: string;
  updated_at?: string;
  source_meta: Record<string, unknown>;
};

const CHUNK_SIZE = 50;
const MAX_UPSERT_RETRIES = 3;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Bounded retry with linear backoff for the Supabase write side. This route makes no Zoho
// API calls (fetchZohoWithRetry doesn't apply here), but a chunked upsert can still transiently
// fail — connection pool pressure, a momentary network blip, project-level rate limiting.
// No existing import route retries a failed chunk at all; this is the first to add it.
async function upsertChunkWithRetry(
  chunk: IssueCommentRow[]
): Promise<{ error: string | null }> {
  let lastError = "";
  for (let attempt = 1; attempt <= MAX_UPSERT_RETRIES; attempt++) {
    const { error } = await adminClient.from("issue_comments").upsert(chunk, { onConflict: "external_id" });
    if (!error) return { error: null };

    lastError = error.message;
    if (attempt < MAX_UPSERT_RETRIES) {
      const waitMs = attempt * 1000;
      console.log(`[issue-comments] chunk upsert failed (attempt ${attempt}/${MAX_UPSERT_RETRIES}): ${error.message} — retrying in ${waitMs}ms`);
      await sleep(waitMs);
    }
  }
  return { error: lastError };
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const filePath = path.join(process.cwd(), "_from_zoho", "issue-comments.json");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Could not find _from_zoho/issue-comments.json — export issue comments first" }, { status: 400 });
  }

  const comments = JSON.parse(fs.readFileSync(filePath, "utf-8")) as ZohoIssueCommentRaw[];
  console.log(`[issue-comments] read ${comments.length} raw comments from issue-comments.json`);

  if (comments.length === 0) {
    return NextResponse.json({ error: "No comments found in issue-comments.json" }, { status: 400 });
  }

  // Pre-build issue + user lookups — one query each instead of one query per comment
  const { data: issueRows, error: issueFetchError } = await adminClient.from("issues").select("id, external_id");
  if (issueFetchError) {
    console.error("[issue-comments] failed to fetch issues for lookup:", issueFetchError.message);
    return NextResponse.json({ error: `Could not fetch issues: ${issueFetchError.message}` }, { status: 500 });
  }
  const issueMap = new Map((issueRows ?? []).map((i) => [String(i.external_id), i.id as string]));
  console.log(`[issue-comments] issue lookup map built: ${issueMap.size} issues`);

  const userCache = new Map<string, string>();
  let page = 1;
  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (u.email) userCache.set(u.email.toLowerCase(), u.id);
    }
    if (data.users.length < 1000) break;
    page++;
  }
  console.log(`[issue-comments] user lookup map built: ${userCache.size} users`);

  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [] };
  const rows: IssueCommentRow[] = [];

  for (const c of comments) {
    const externalId = String(c.id ?? "");
    const body = c.comment ?? "";
    if (!externalId || !body) { result.skipped++; continue; }

    const issueId = issueMap.get(String(c._zoho_issue_id ?? ""));
    if (!issueId) {
      result.errors.push(`comment ${externalId}: no Hub issue found for _zoho_issue_id=${c._zoho_issue_id}`);
      result.skipped++;
      continue;
    }

    const email = c.added_by?.email?.toLowerCase();
    const authorId = email ? (userCache.get(email) ?? null) : null;

    rows.push({
      external_id: externalId,
      issue_id: issueId,
      author_id: authorId,
      author_name: c.added_by?.full_name ?? c.added_by?.name ?? null,
      author_email: c.added_by?.email ?? null,
      body,
      created_at: c.created_time ?? undefined,
      updated_at: c.last_modified_time ?? undefined,
      source_meta: {
        added_by: c.added_by ?? null,
        added_via: c.added_via ?? null,
        attachments: (c.attachments ?? []).map((a) => ({
          name: a.name,
          size: a.size,
          type: a.type,
        })),
      },
    });
  }

  console.log(`[issue-comments] upserting ${rows.length} rows in chunks of ${CHUNK_SIZE} (${result.skipped} skipped)`);

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await upsertChunkWithRetry(chunk);
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(rows.length / CHUNK_SIZE);
    if (error) {
      console.error(`[issue-comments] chunk ${chunkNum}/${totalChunks} failed after ${MAX_UPSERT_RETRIES} attempts:`, error);
      result.errors.push(`chunk ${chunkNum}: ${error}`);
    } else {
      console.log(`[issue-comments] chunk ${chunkNum}/${totalChunks} upserted (${chunk.length} rows)`);
      result.imported += chunk.length;
    }
  }

  console.log(`[issue-comments] done: ${result.imported} imported, ${result.skipped} skipped, ${result.errors.length} error(s)`);
  return NextResponse.json(result);
}
```

Note: unlike `zoho-import/issues/route.ts`, this route reads a **single** `issue-comments.json` file (task 109's export downloads one unified file, no `from`/`to` slicing — see task 109 decision #3), so there's no multi-file batch scan here, just a straight `fs.existsSync`/`readFileSync`.

Note: `upsertChunkWithRetry` is a deliberate addition over `zoho-import/issues/route.ts`'s bare `.upsert()` call (see decision #11) — it wraps each chunk in a bounded retry (3 attempts, 1s/2s/3s linear backoff) against transient Supabase write failures. This is unrelated to Zoho's rolling throttle (this route never calls Zoho) and is the first import route in the codebase to retry a failed chunk instead of recording it as an immediate error.

### `migrate/page.tsx` — `IMPORT_LEVELS` entry (`src/app/v2/(hub)/admin/migrate/page.tsx:92-103`)

Add one entry after `comments` (line 100), before `timelogs` (line 101):

```ts
{ key: "issue-comments", label: "Issue Comments", desc: "Imports issue comments from issue-comments.json — requires Issues imported first" },
```

**Key must match the export card's hyphenated key exactly** (`issue-comments`, established in task 109) for consistency, even though `IMPORT_LEVELS`/`EXPORT_LEVELS` are independent arrays — no code depends on them matching, but a mismatched key would be confusing.

No other `migrate/page.tsx` changes. The generic fallback render block for `IMPORT_LEVELS` (same one task 108 relied on for its `issues` entry — search for where `handleImport(key)` + `ResultChip` render generically) automatically handles any key without a bespoke `if (key === ...)` branch.

---

## Implementation Steps

1. Create `supabase/migrations/052_issue_comments_table.sql` exactly as specified — apply it (no linked Supabase CLI project in this repo, so this is a manual apply step, same as every prior migration in this project).
2. Add the `issue_comments` table type block to `src/types/database.ts`, near `issues`.
3. Add `resolveIssueId()` to `src/lib/migrate/zoho-import.ts`, after `resolveTaskId()`.
4. Create `src/app/api/admin/zoho-import/issue-comments/route.ts` exactly as specified.
5. Add the one `IMPORT_LEVELS` entry to `migrate/page.tsx` (`src/app/v2/(hub)/admin/migrate/page.tsx:92-103`, after `comments`). Do not add a bespoke `if (key === "issue-comments")` branch in the Import Phase JSX — confirm it falls through to the existing generic renderer, same as `issues` does today.
6. Run `npx tsc --noEmit` and `pnpm lint`.

---

## Notes for Implementation Agent

- **Sonnet recommended** — new table + RLS + a schema/type addition + a new resolver helper, not a pure CRUD mirror. The deliberate field-dropping decisions (7 fields intentionally discarded, one intentionally promoted to a new column not on the sibling table) need to be understood, not just copied.
- **Field name is `added_by`, not `created_by`.** This is the exact trap task 109 flagged — the route above already uses the correct name; do not "fix" it to match `zoho-import/comments/route.ts`'s `created_by`.
- **`_zoho_project_id` is intentionally never read or stored in this route** — the issue lookup alone is sufficient (`issues.project_id` is already correct from task 108's import), and re-verifying it here would just be redundant work.
- **Do not add a multi-file batch scan** — task 109's export produces exactly one `issue-comments.json` (no `from`/`to` slicing), unlike Issues export/import which needed one for portal-scale project slicing.
- **`last_modified_by`, `reactions`, `third_party_service_details`, `can_edit_comment`, `can_delete_comment` should not appear anywhere in the row being built** — not as columns, not in `source_meta`. This is intentional per decisions #3–#5, not an oversight to "complete" later.
- **`attachments` in `source_meta` is metadata-only** (`name`/`size`/`type`) — do not attempt to download or re-host the actual files in this task; that's an explicitly deferred follow-up (decision #7).
- **RLS policies must include `super_admin` in both policies from the very first commit** — task 108 had to retroactively patch this in; the migration in this doc's Code Context already has it correctly, don't accidentally drop it while adapting the SQL.
- **The route pattern is closer to `zoho-import/issues/route.ts` than `zoho-import/comments/route.ts`** — pre-built lookup maps (1 query for issues, 1 paginated set of queries for users), build all rows in memory, then chunked upsert. Do not copy `zoho-import/comments/route.ts`'s per-record `resolveTaskId()`/`resolveUserId()` await-in-a-loop shape.
- **`upsertChunkWithRetry` is scoped to this route only, not a shared `src/lib/*` helper.** Do not move it to `zoho-import.ts` or create a new shared module for it — there's exactly one call site, and per this codebase's existing convention (see `CLAUDE.md` guidance against premature abstraction), a shared helper is only justified once a second route needs the identical shape. If a future task needs the same retry logic elsewhere, that's the trigger to extract it, not this one.
- **Do not confuse this with `fetchZohoWithRetry`.** They solve different problems (Supabase write retries vs. Zoho HTTP rolling-throttle retries) and must not be merged or made to share an implementation — the retry conditions, backoff shape, and failure semantics are unrelated.

---

## Acceptance Criteria

- [x] `supabase/migrations/052_issue_comments_table.sql` creates the `issue_comments` table with RLS (staff read, admin/super_admin/pm write) and the index — applied by user, confirmed working (rows exist)
- [x] `src/types/database.ts` includes a correct `issue_comments` type block; `npx tsc --noEmit` passes with `adminClient.from("issue_comments")` calls type-checking cleanly
- [x] `resolveIssueId()` added to `zoho-import.ts`, mirrors `resolveTaskId()`'s shape
- [x] `POST /api/admin/zoho-import/issue-comments` requires admin/super_admin auth — 401/403 matching every other import route
- [x] Route reads `_from_zoho/issue-comments.json` (single file, no batch scan), pre-builds an issue lookup map (1 query) and a user cache (paginated `listUsers`), then chunk-upserts in batches of 50
- [x] Each chunk upsert is wrapped in `upsertChunkWithRetry` (3 attempts, 1s/2s/3s linear backoff) — a transient failure on one chunk retries before being recorded as a hard error; this logic lives only in this route, not in a shared helper
- [x] `author_id` resolves correctly when the comment author has a matching Hub user by email; falls back to `null` + `author_name`/`author_email` when not (covers the 1 client-user comment and any of the 25 authors without a Hub account)
- [x] `updated_at` reflects `last_modified_time`, distinct from `created_at` for edited comments
- [x] `source_meta` contains `added_by`, `added_via`, and attachment metadata (name/size/type only) where present — and does **not** contain `last_modified_by`, `reactions`, `third_party_service_details`, `can_edit_comment`, or `can_delete_comment`
- [x] `migrate/page.tsx` shows an "Issue Comments" card in Phase 2 — Import, after "Comments" (generic fallback UI, no bespoke code) — confirmed via grep, no bespoke JSX branch added
- [x] Live import run against the real `_from_zoho/issue-comments.json` (2285 records) completes with a nonzero imported count and 0 unresolved-issue errors — all 2285 imported after the pagination fix, including the previously-orphaned 100
- [x] `npx tsc --noEmit` and `pnpm lint` both clean

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

1. Apply migration 052.
2. Start dev server: `pnpm dev`.
3. Navigate to `/v2/admin/migrate`. Confirm the "Issue Comments" card appears in Phase 2 — Import, after "Comments", using the same plain card style as Issues/Milestones (no progress bar).
4. Click Import (with `_from_zoho/issue-comments.json` present from task 109's export). Confirm `imported`/`skipped`/error counts render via the shared `ResultChip`.
5. Query Supabase directly: confirm `issue_comments` rows exist, `issue_id` resolves to real `issues.id` rows, `author_id` is populated for the ~25 known authors and `null` for any unmatched, `body` preserves the original HTML, `updated_at` differs from `created_at` on the ~256 edited comments, and `source_meta` contains only the intended fields.
6. Re-run the import — confirm it upserts cleanly (no duplicate rows, `external_id` conflict handled).

---

## Compatibility Touchpoints

- New table + RLS — additive migration only, no changes to existing tables/columns, no changes to `task_comments`.
- No schema/packaging/install-surface impact beyond the new migration file.
- Actual attachment file migration (for the 344 comments with attachments) is explicitly out of scope — flagged as a future follow-up task, not silently dropped.
