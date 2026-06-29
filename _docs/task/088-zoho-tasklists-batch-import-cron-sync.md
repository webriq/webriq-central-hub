# Task 088 — Zoho Tasklists: Batch Import Fix + pg_cron Sync

> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Date:** 2026-06-29
> **Status:** TESTING
> **Completed:** 2026-06-29
> **Implementation Notes:** Three files changed. Import route pre-builds two lookup maps (projectMap + milestoneMap) upfront eliminating N+1 DB calls, then batch-upserts in chunks of 50 with 100ms delay. Sync route adds 429 + Retry-After handling with one retry. Migration 041 schedules weekly Sunday 02:00 UTC cron — update placeholder URL + secret via cron.alter_job() after deployment.

---

## Problem

The existing `POST /api/admin/zoho-import/tasklists` route processes 893 tasklists
one row at a time — one `resolveProjectId` DB call + one `resolveMilestoneId` DB call
+ one upsert per row = ~2700 sequential DB round-trips. The process timed out mid-run,
leaving only 361 of 893 rows imported.

Additionally, tasklists added in Zoho after the JSON export will never appear in the Hub
without a manual re-export cycle.

**Goal:** fix the import to complete reliably and add a scheduled Zoho API sync so the
`tasklists` table stays current automatically.

---

## Requirements

1. **Batch import fix** — rewrite the import route to:
   - Pre-build lookup maps (project + milestone) with two DB queries upfront instead of N per row
   - Batch-upsert in chunks of 50 rows (array upsert, not one call per row)
   - Add 100 ms breathing room between chunks to avoid connection saturation
   - Return `{ imported, skipped, errors }` — same shape as before so the UI is unchanged

2. **Zoho API sync endpoint** — new route `POST /api/admin/zoho-sync/tasklists`:
   - Accepts admin session **or** `x-digest-secret` header (reuses `DIGEST_SECRET` env var)
   - Fetches all Hub projects that have a `zoho_project_id`
   - For each project calls Zoho `GET /api/v3/portal/{PORTAL_ID}/projects/{id}/tasklists`
   - Maps + upserts in batches of 50 (same mapping logic as the import route)
   - Returns `{ synced, errors }`
   - Does NOT delete orphans (soft approach — Zoho deletes are rare and can be handled manually)
   - Handles Zoho API rate limiting: on `429` response, read `Retry-After` header (default 60s if absent), wait, then retry once before counting as an error

3. **pg_cron job** — new migration `041_pg_cron_zoho_tasklists_sync.sql`:
   - Schedules a weekly Sunday 02:00 UTC sync via `net.http_post` to `/api/admin/zoho-sync/tasklists`
   - Uses `x-digest-secret` auth header (same `DIGEST_SECRET` env var already in use)
   - Follows exact pattern from migration 012 (placeholder URL, alter-job instructions)

---

## Notes for Implementation Agent

- **Sonnet required** — three-layer change (API route rewrite, new sync route, new migration) with an N+1 elimination that requires judgment on batching strategy.
- **Reuse `DIGEST_SECRET`** for the sync endpoint auth — do not add a new env var. The secret already exists and its purpose (cron auth) matches exactly.
- **Pre-build maps upfront** — query all projects and all milestones in two DB calls before the loop:
  - `adminClient.from("projects").select("id, zoho_project_id")` → `Map<zoho_project_id, id>`
  - `adminClient.from("milestones").select("id, external_id")` → `Map<external_id, id>`
- **Batch upsert shape** — `adminClient.from("tasklists").upsert(chunk, { onConflict: "external_id" })` where `chunk` is an array of up to 50 row objects.
- **Zoho API pattern** — see `src/app/api/admin/zoho-export/tasklists/route.ts` for the exact fetch pattern (`BASE + /projects/{id}/tasklists`, `getZohoAccessToken()`, 100ms sleep between projects).
- **Migration numbering** — next available is `041`. `040_seed_profiles_from_hub_users.sql` is the current latest.
- **Do NOT modify the `tasklists` table schema** — no migration needed for the import fix.
- **Chunk delay** — `await new Promise(r => setTimeout(r, 100))` between upsert chunks, not between projects.
- **Rate limiting** — Zoho Projects API v3 allows ~150–200 req/min. With potentially 300+ projects, naive sequential fetching can hit the cap. In the sync route:
  - Keep the 100ms sleep between project fetches (existing export pattern)
  - On `429`, read `Retry-After` header (fall back to 60000ms), await that delay, then retry the fetch once. If the retry also fails, log to errors and continue to the next project.
  - Do NOT retry on other non-OK status codes — just log and continue.
- The sync endpoint iterates over Hub DB projects (not `projects.json`) so it stays current as new projects are added.

---

## File Changes

| Action | File |
|--------|------|
| Modify | `src/app/api/admin/zoho-import/tasklists/route.ts` |
| Create | `src/app/api/admin/zoho-sync/tasklists/route.ts` |
| Create | `supabase/migrations/041_pg_cron_zoho_tasklists_sync.sql` |

---

## Code Context

### Current import route (to be rewritten) — `src/app/api/admin/zoho-import/tasklists/route.ts`

```ts
// Current bottleneck: one resolveProjectId + one resolveMilestoneId + one upsert per row
// = ~2700 sequential DB calls for 893 rows → times out

for (const tl of tasklists) {
  const externalId = String(tl.id_string ?? tl.id ?? "");
  if (!externalId || !tl.name) { result.skipped++; continue; }

  const projectId = await resolveProjectId(String(tl._zoho_project_id ?? ""));  // DB call per row
  // ...
  const milestoneId = milestoneExternalId ? await resolveMilestoneId(milestoneExternalId) : null; // DB call per row

  const { error } = await adminClient.from("tasklists").upsert(         // DB call per row
    { external_id: externalId, project_id: projectId, name: tl.name, position, is_default: tl.is_default ?? false, milestone_id: milestoneId },
    { onConflict: "external_id" }
  );
}
```

**Fix:** pre-build two maps, then batch upsert:
```ts
// Two queries total instead of 2N
const { data: projects } = await adminClient.from("projects").select("id, zoho_project_id");
const projectMap = new Map((projects ?? []).map(p => [p.zoho_project_id, p.id]));

const { data: milestones } = await adminClient.from("milestones").select("id, external_id");
const milestoneMap = new Map((milestones ?? []).map(m => [m.external_id, m.id]));

// Build rows, then chunk-upsert
const rows = tasklists.flatMap(tl => { /* map → row | skip */ });
for (let i = 0; i < rows.length; i += 50) {
  const chunk = rows.slice(i, i + 50);
  const { error } = await adminClient.from("tasklists").upsert(chunk, { onConflict: "external_id" });
  if (error) result.errors.push(error.message);
  else result.imported += chunk.length;
  await new Promise(r => setTimeout(r, 100));
}
```

### Zoho API fetch pattern (from export route) — `src/app/api/admin/zoho-export/tasklists/route.ts:30-45`

```ts
const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const token = await getZohoAccessToken();

for (const project of projects) {
  const projectId = String(project.id_string ?? project.id);
  const res = await fetch(`${BASE}/projects/${projectId}/tasklists`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (res.ok) {
    const json = await res.json() as { tasklists?: unknown[] };
    // process json.tasklists
  }
  await sleep(100); // rate limiting
}
```

### pg_cron migration pattern (from migration 012)

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'zoho-tasklists-sync',
  '0 2 * * 0',   -- weekly, Sunday 02:00 UTC
  $job$
  select net.http_post(
    url     := 'https://REPLACE_WITH_APP_URL/api/admin/zoho-sync/tasklists',
    body    := '{}'::jsonb,
    headers := '{"x-digest-secret":"REPLACE_WITH_DIGEST_SECRET","content-type":"application/json"}'::jsonb
  )
  $job$
);
```

### tasklists table schema
```sql
CREATE TABLE public.tasklists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    external_id text,       -- UNIQUE — used as upsert conflict key
    name text NOT NULL,
    position numeric,
    is_default boolean DEFAULT false,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    milestone_id uuid       -- FK → milestones(id) ON DELETE SET NULL
);
```

### Digest auth pattern to reuse — `src/app/api/digest/route.ts:11-22`

```ts
const digestSecret = process.env.DIGEST_SECRET;
const incomingSecret = req.headers.get("x-digest-secret");
const isCronCall = digestSecret && incomingSecret === digestSecret;

if (!isCronCall) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

---

## Implementation Steps

1. **Rewrite import route** (`src/app/api/admin/zoho-import/tasklists/route.ts`):
   - Remove `resolveProjectId` and `resolveMilestoneId` imports (no longer needed per-row)
   - Add upfront `projectMap` and `milestoneMap` pre-build using two `adminClient` queries
   - Build a `rows` array by mapping over all tasklists (skip rows with no externalId, no name, or no projectId match)
   - Push skipped counts for each skip reason
   - Chunk `rows` into groups of 50, upsert each chunk, 100ms delay between chunks
   - Return `{ imported, skipped, errors }` as before

2. **Create sync route** (`src/app/api/admin/zoho-sync/tasklists/route.ts`):
   - Copy digest auth pattern (cron secret OR admin session — require admin role for session calls)
   - Fetch all Hub projects with `zoho_project_id IS NOT NULL` from `adminClient`
   - Call `getZohoAccessToken()` — return 502 if null
   - For each project, fetch `GET BASE/projects/{zoho_project_id}/tasklists` with 100ms sleep between requests; on 429 read `Retry-After` header (default 60s), wait, retry once before logging error
   - Map each raw Zoho tasklist to a DB row using the same field mapping as the import route
   - Batch upsert in chunks of 50 using `onConflict: "external_id"`
   - Return `{ synced, errors }`

3. **Create migration** (`supabase/migrations/041_pg_cron_zoho_tasklists_sync.sql`):
   - `create extension if not exists pg_cron` (idempotent — already enabled, safe to repeat)
   - `create extension if not exists pg_net` (same)
   - `cron.schedule('zoho-tasklists-sync', '0 2 * * 0', ...)` with placeholder URL + secret
   - Include `cron.alter_job()` instructions in comments (same style as migration 012)

---

## Acceptance Criteria

- [ ] Re-running `POST /api/admin/zoho-import/tasklists` completes all 893 rows without timeout
- [ ] Result returns `{ imported: N, skipped: M, errors: [] }` with accurate counts
- [ ] `POST /api/admin/zoho-sync/tasklists` with a valid admin session fetches tasklists from Zoho and upserts them
- [ ] `POST /api/admin/zoho-sync/tasklists` with `x-digest-secret` header also succeeds (cron path)
- [ ] Migration 041 runs without error; `cron.job` table has a `zoho-tasklists-sync` entry
- [ ] Re-running either endpoint is idempotent — no duplicates created
