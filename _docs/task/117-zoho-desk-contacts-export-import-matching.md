# 117: Zoho Desk Contacts — Export, Import & Customer Matching

**Created:** 2026-07-08
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

The Hub has no Zoho Desk integration at all today — `src/lib/zoho/index.ts` only talks to the Zoho Projects API. The `customers` table has a single `contact_name`/`contact_email` pair per customer, and Zoho Desk's data model is Account (company) → many Contacts (people), so "all Desk contacts" cannot be squeezed into the existing fields. `customers.zoho_account_id` was added in migration 001 specifically for Desk linkage and then dropped in migration 010 ("Zoho Desk ticket → customer linking not yet implemented") — nothing has filled that gap since.

Decisions made with the user before writing this spec (see `/understand` investigation + follow-up clarification):
- **One-time import**, not a recurring live sync — matches migration 035's stated "Zoho Decommission Schema" direction and every recent Zoho task (093, 107–114), which use a paired `zoho-export` (dev/admin-gated, dumps JSON to `_from_zoho/`) + `zoho-import` (reads that JSON, upserts to Supabase) route pattern.
- **New `contacts` table**, one row per Desk contact, nullable FK to `customers.customer_id` — Desk contacts are one-to-many per account; the existing `contact_name`/`contact_email` fields on `customers` stay untouched.
- **Matching via Desk Account name → `customers.company_name`**, which requires the `Desk.accounts.READ` OAuth scope. The user's current API client scope (`Desk.tickets.READ Desk.tickets.UPDATE Desk.contacts.READ Desk.agents.READ`) does **not** include it — see Prerequisite below.
- **Data only** — no Customers tab UI changes in this task. Once real matched/unmatched data exists, a follow-up task designs the display (and a manual-assignment view for unmatched contacts).

### Zoho Desk API facts confirmed for this task (from `https://desk.zoho.com/DeskAPIDocument`)
- API root: `https://desk.zoho.com/api/v1`. Every call except org-related ones requires an `orgId: {organization_id}` header (in addition to the existing `Authorization: Zoho-oauthtoken {token}` header) — the Projects client never needed this.
- `GET /api/v1/contacts` — scope `Desk.contacts.READ` (already granted). Query params: `from` (offset, default 1), `limit` (1–100, default 10), `sortBy`, `fields`. Response: `{ "data": [ {...} ] }`.
  - Contact attributes relevant here: `id`, `firstName`, `lastName`, `email`, `secondaryEmail`, `phone`, `mobile`, `title`, `accountId` (long — which Account/company this contact belongs to), plus `city`/`country`/`state`/`street`/`zip`/`type`/`facebook`/`twitter`/`ownerId`/`description`/`cf` (custom fields) with no first-class Hub equivalent.
  - **A contact has no plain company-name field** — only the numeric `accountId`. Resolving it to a name requires a separate Accounts call.
- `GET /api/v1/accounts` — scope `Desk.accounts.READ` (**not currently granted** — see Prerequisite). Same `from`/`limit` pagination. Response includes `accountName`, `phone`, `website`, `webUrl`, `id`.
- Pagination cap is 100 per page for both endpoints; loop `from` until a short page returns.
- Rate limiting: `X-Rate-Limit-Remaining-v3` response header tracks remaining daily credits; `429` responses include `Retry-After` (seconds) — same shape `fetchZohoWithRetry` already handles for Zoho Projects.

### Prerequisite (outside this codebase, blocks the accounts export)
The user must add `Desk.accounts.READ` to their Zoho API client's scope in the Zoho API console, **then regenerate `ZOHO_REFRESH_TOKEN`** (Zoho refresh tokens are scope-locked at creation — adding a scope in the console does not retroactively grant it to an existing refresh token). Until that's done, `GET /api/admin/zoho-export/desk-accounts` will fail with a 403 from Zoho — the import route must surface that clearly rather than silently matching nothing (see Acceptance Criteria).

## Requirements

- [x] `ZOHO_DESK_ORG_ID` env var documented in `env.example` (numeric Desk organization ID — found in Zoho Desk → Setup → Developer Space).
- [x] `GET /api/admin/zoho-export/desk-accounts` — admin-gated, paginates all Zoho Desk accounts, writes `_from_zoho/desk-accounts.json`. Confirmed: 6,143 real accounts exported.
- [x] `GET /api/admin/zoho-export/desk-contacts` — admin-gated, paginates all Zoho Desk contacts, writes `_from_zoho/desk-contacts.json`. Confirmed: 1,627 real contacts exported.
- [x] New `contacts` table (migration) with RLS, nullable FK to `customers.customer_id`, unique `external_id` dedupe key (renamed from `zoho_desk_contact_id` post-review — see Implementation Notes).
- [x] `POST /api/admin/zoho-import/desk-contacts` — admin-gated, reads both JSON files, resolves each contact's `accountId` → Desk account name → normalized match against `customers.company_name`, upserts into `contacts` (idempotent re-run via `onConflict: "external_id"`). Confirmed against real data: 1627 imported, 200 matched, 0 errors.
- [x] Contacts that can't be matched import anyway with `customer_id: null`, `match_method: null` (not dropped/skipped) — they're the review queue for a future manual-assignment UI. Confirmed: 1,427 such rows exist.
- [x] `src/types/database.ts` gets the `contacts` table type entry.

## Out of Scope / Must-Not-Change

- Any UI to browse, search, or manually assign contacts (follow-up task once real data exists).
- Recurring/live sync (`zoho-sync/*`, `pg_cron`) — one-time import only.
- Zoho Desk **tickets** — `Desk.tickets.READ`/`Desk.tickets.UPDATE` scopes were granted but are unrelated to this task's goal (contacts/accounts only); do not build ticket fetching here.
- `customers.contact_name` / `customers.contact_email` — untouched. Do not repurpose or backfill them from Desk data.
- `src/app/api/webhooks/route.ts`'s `resolveCustomerId()` `zoho_desk` branch (still returns `null`) — wiring live Desk webhooks to customer resolution is a separate concern from this batch import.
- `src/lib/zoho/index.ts`'s existing Zoho Projects functions (`createZohoProject`, etc.) and `ZOHO_PROJECTSAPI_BASE` — do not touch; Desk uses a different base URL and auth header shape, kept in its own module.
- `extractZohoCustomerName()` in `src/lib/migrate/zoho-import.ts` — do not reuse or modify it for this task; it strips Zoho *Projects* project-name suffixes ("- Content Site", "- Ecommerce", etc.) which is a different problem from normalizing a Desk *Account* name. Write a separate, smaller `normalizeCompanyName()` helper instead.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/056_contacts_table.sql` | Create | New `contacts` table, RLS policies, indexes. |
| `env.example` | Modify | Document `ZOHO_DESK_ORG_ID`. |
| `src/lib/zoho/index.ts` | Modify | Extend `fetchZohoWithRetry` to accept optional extra request headers (needed for Desk's `orgId` header); no change to existing callers' behavior. |
| `src/lib/zoho/desk.ts` | Create | Desk API base URL, `orgId` header builder, thin `fetchDeskPage()` wrapper reused by both export routes. |
| `src/lib/migrate/zoho-import.ts` | Modify | Add `normalizeCompanyName()` helper (lowercase, trim, strip common suffixes like Inc/LLC/Ltd/Co/Corp, collapse whitespace) used to compare Desk account names against `customers.company_name`. |
| `src/app/api/admin/zoho-export/desk-accounts/route.ts` | Create | Admin-gated, paginate `GET /api/v1/accounts`, write `_from_zoho/desk-accounts.json`. |
| `src/app/api/admin/zoho-export/desk-contacts/route.ts` | Create | Admin-gated, paginate `GET /api/v1/contacts`, write `_from_zoho/desk-contacts.json`. |
| `src/app/api/admin/zoho-import/desk-contacts/route.ts` | Create | Admin-gated, reads both JSON files, matches, upserts `contacts`. |
| `src/types/database.ts` | Modify | Add `contacts` table `Row`/`Insert`/`Update`/`Relationships` entry. |

## Code Context

### `src/lib/zoho/index.ts:82-135` — `fetchZohoWithRetry` (extend, don't replace)

Current signature only sets the `Authorization` header. Desk needs an additional `orgId` header on every call. Extend `options` with an optional `headers` map merged into the existing header object; every current call site (Projects export/import/sync routes) omits it and is unaffected:

```ts
export async function fetchZohoWithRetry(
  url: string,
  token: string,
  options?: { label?: string; maxRollingRetries?: number; headers?: Record<string, string> }
): Promise<ZohoFetchResult> {
  const label = options?.label ?? "zoho";
  const maxRollingRetries = options?.maxRollingRetries ?? 3;
  let currentToken = token;

  const doFetch = () =>
    fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${currentToken}`, ...options?.headers },
    });
  // ...rest unchanged (429 / rolling-throttle / 401 handling already generic)
}
```

### `src/lib/zoho/desk.ts` (new file — shape)

```ts
import { fetchZohoWithRetry } from "@/lib/zoho";

const DESK_API_BASE = "https://desk.zoho.com/api/v1";

export function deskHeaders(): Record<string, string> {
  const orgId = process.env.ZOHO_DESK_ORG_ID;
  if (!orgId) throw new Error("ZOHO_DESK_ORG_ID not configured");
  return { orgId };
}

export async function fetchDeskPage(
  path: string,
  token: string,
  params: Record<string, string>,
  label: string
) {
  const url = `${DESK_API_BASE}${path}?${new URLSearchParams(params)}`;
  return fetchZohoWithRetry(url, token, { label, headers: deskHeaders() });
}
```

### Admin gate (copy exactly — every `zoho-export`/`zoho-import` route repeats this), e.g. `src/app/api/admin/zoho-export/issues/route.ts:14-19`

```ts
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
if (profile?.role !== "admin" && profile?.role !== "super_admin") return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
```

### Pagination shape for both Desk list endpoints (confirmed from Zoho docs)

```ts
let from = 1; // Desk's `from` is 1-indexed by default, unlike Projects
const perPage = 100; // Desk's hard max per page
const all: Record<string, unknown>[] = [];
while (true) {
  const { res } = await fetchDeskPage("/contacts", token, { from: String(from), limit: String(perPage) }, "desk-contacts");
  if (!res.ok) throw new Error(`Desk contacts fetch failed: ${res.status}`);
  const json = (await res.json()) as { data?: Record<string, unknown>[] };
  const page = json.data ?? [];
  all.push(...page);
  if (page.length < perPage) break;
  from += perPage;
}
```

### `customers` table today (`supabase/migrations/001_initial_schema.sql:8-18`, status constraint updated in `010_completed_onboarding_status.sql:6-7`)

```sql
create table if not exists customers (
  id              uuid primary key default gen_random_uuid(),
  customer_id     text unique not null,
  company_name    text not null,
  contact_name    text,
  contact_email   text,
  status          text not null default 'active'
                  check (status in ('active', 'inactive', 'onboarding', 'completed_onboarding')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```

`customer_id` (text, `WRQ-CUST-XXXX`/`WRQ-CLIENT-XXXX`) is the universal cross-system key — the new `contacts.customer_id` FK targets `customers(customer_id)`, not `customers(id)`, matching `customer_products` and `projects`.

### New migration — `supabase/migrations/056_contacts_table.sql` (mirrors `051_issues_table.sql`'s shape/RLS exactly)

```sql
-- Migration 056: Zoho Desk Contacts Table (task 117)
-- Receives imported Zoho Desk contacts, matched to `customers` by normalized
-- Desk account name -> customers.company_name comparison where possible.
--
--   zoho_desk_contact_id  text unique — Desk contact ID, the import dedupe key
--   zoho_desk_account_id  text nullable — raw Desk accountId, kept even after a
--                          successful match for audit/debugging
--   customer_id            text nullable FK -> customers — null means unmatched,
--                          awaiting manual assignment; no assignment UI exists yet
--   match_method            'account_name' (auto) | 'manual' (reserved for a future
--                          assignment UI) | null (unmatched)
--   source_meta            jsonb — Desk fields with no first-class Hub equivalent
--                          (city, country, state, street, zip, type, facebook,
--                          twitter, ownerId, description, cf/custom fields)

create table contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id text references customers(customer_id) on delete set null,
  zoho_desk_contact_id text unique not null,
  zoho_desk_account_id text,
  first_name text,
  last_name text,
  email text,
  secondary_email text,
  phone text,
  mobile text,
  title text,
  match_method text check (match_method in ('account_name', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_meta jsonb default '{}'
);

alter table contacts enable row level security;

create policy "contacts_staff_read"
  on contacts for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create policy "contacts_pm_write"
  on contacts for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

create index contacts_customer_id_idx on contacts(customer_id) where customer_id is not null;
create index contacts_email_idx on contacts(email) where email is not null;
```

`get_my_role()` is the existing `security definer` helper from migration 026 — never replicate its logic inline.

### `src/types/database.ts` entry (mirror `issues:` block at `src/types/database.ts:679-747`)

```ts
contacts: {
  Row: {
    id: string;
    customer_id: string | null;
    zoho_desk_contact_id: string;
    zoho_desk_account_id: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    secondary_email: string | null;
    phone: string | null;
    mobile: string | null;
    title: string | null;
    match_method: string | null;
    created_at: string;
    updated_at: string;
    source_meta: Record<string, unknown>;
  };
  Insert: { /* same fields, all but zoho_desk_contact_id optional-with-default where applicable */ };
  Update: { /* same fields, all optional */ };
  Relationships: [
    {
      foreignKeyName: "contacts_customer_id_fkey";
      columns: ["customer_id"];
      isOneToOne: false;
      referencedRelation: "customers";
      referencedColumns: ["customer_id"];
    }
  ];
};
```

### `>1000 rows` pagination rule applies to the customers lookup map

Per the project's established fix pattern (`CLAUDE.md`, canonical example `zoho-import/timelogs/route.ts:104-119`), the import route's `customers` lookup (built once to match against) must paginate with `.range()` even though today's customer count is well under 1000 — this has caused two prior silent-truncation bugs (tasks 103, 110).

## Implementation Steps

1. Write and apply `supabase/migrations/056_contacts_table.sql`.
2. Add `ZOHO_DESK_ORG_ID` to `env.example` with a comment on where to find it (Zoho Desk → Setup → Developer Space); note in the PR/summary that the user still needs to add `Desk.accounts.READ` scope + regenerate `ZOHO_REFRESH_TOKEN` before the accounts export will succeed.
3. Extend `fetchZohoWithRetry` in `src/lib/zoho/index.ts` to accept `options?.headers`, merged into the request headers.
4. Create `src/lib/zoho/desk.ts` with `DESK_API_BASE`, `deskHeaders()`, `fetchDeskPage()`.
5. Create `GET /api/admin/zoho-export/desk-accounts/route.ts` — admin gate, `getZohoAccessToken()`, paginate `/accounts` via `fetchDeskPage`, write `_from_zoho/desk-accounts.json`. Return a clear error if Zoho responds 403 (missing scope), not a silent empty file.
6. Create `GET /api/admin/zoho-export/desk-contacts/route.ts` — same shape, paginate `/contacts`, write `_from_zoho/desk-contacts.json`.
7. Add `normalizeCompanyName()` to `src/lib/migrate/zoho-import.ts`.
8. Create `POST /api/admin/zoho-import/desk-contacts/route.ts`:
   - Read both JSON files (error clearly if either is missing — tell the caller which export to run first).
   - Build `accountId -> accountName` map from `desk-accounts.json`.
   - Build `customer_id -> normalizedCompanyName` map from `customers` via paginated `.range()` lookup.
   - For each Desk contact: resolve `accountId` → account name → normalize → find matching customer; upsert into `contacts` on conflict `zoho_desk_contact_id`, setting `customer_id`/`match_method: 'account_name'` on a hit, else `customer_id: null, match_method: null`.
   - Return `{ imported, updated, matched, unmatched, errors }`.
9. Add the `contacts` entry to `src/types/database.ts`.
10. `npx tsc --noEmit` and `pnpm lint`.
11. Manual verification per Acceptance Criteria (requires the user to have completed the `Desk.accounts.READ` scope prerequisite for the matching to actually resolve any accounts — contacts import still works and imports unmatched rows without it).

## Acceptance Criteria

- [x] `npx tsc --noEmit` and `pnpm lint` pass with no new errors.
- [x] As an authenticated admin, hitting `GET /api/admin/zoho-export/desk-contacts` writes `_from_zoho/desk-contacts.json` containing every Desk contact. Confirmed 1,627 rows; not separately cross-checked against Zoho Desk's own UI count.
- [x] `GET /api/admin/zoho-export/desk-accounts` either writes `_from_zoho/desk-accounts.json`, or fails with a clear error naming the missing scope. Confirmed: succeeded (6,143 accounts) — `Desk.accounts.READ` scope was already granted.
- [ ] `POST /api/admin/zoho-import/desk-contacts` is idempotent: running it twice does not create duplicate `contacts` rows (upsert on `external_id`). Only run once so far (1627 imported, 0 errors) — logic guarantees idempotency (`onConflict: "external_id"`) but a second run hasn't been empirically confirmed yet.
- [x] Contacts whose Desk account name normalizes to match an existing `customers.company_name` land with `customer_id` set and `match_method = 'account_name'`. Confirmed via direct read + spot-checked rows.
- [x] Contacts with no resolvable/matching account still import, with `customer_id = null` and `match_method = null`. Confirmed: 1,427 rows via direct `content-range` count.
- [ ] Non-admin/non-super_admin users get 401/403 from all three new routes. Not empirically tested with a non-admin session — same gate pattern as every other admin route in the codebase, but not independently verified for this task.
- [ ] `contacts` RLS: a `pm`/`admin`/`developer`-role session can read all rows; a `client`-role session cannot. Not empirically tested with a client-role session.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# As an admin session:
curl -s http://localhost:3000/api/admin/zoho-export/desk-accounts -H "Cookie: <admin session>"
curl -s http://localhost:3000/api/admin/zoho-export/desk-contacts -H "Cookie: <admin session>"
curl -s -X POST http://localhost:3000/api/admin/zoho-import/desk-contacts -H "Cookie: <admin session>"
# Then in Supabase SQL editor:
select match_method, count(*) from contacts group by match_method;
select * from contacts where customer_id is null limit 20;
```

## Compatibility Touchpoints

- New env var (`ZOHO_DESK_ORG_ID`) — document in `env.example` only; actual value goes in `.env.local`, never committed.
- No packaging/docs/install-surface impact — admin-only dev-migration routes, same pattern as every prior `zoho-export`/`zoho-import` task.

## Implementation Notes

### What Changed
- New `contacts` table (migration 056) with RLS (staff read, admin/pm write), nullable FK to `customers.customer_id`, unique `zoho_desk_contact_id`.
- New Zoho Desk API client (`src/lib/zoho/desk.ts`): base URL, `orgId` header builder, and a `fetchAllDeskPages()` helper that paginates any Desk list endpoint (`from`/`limit`, 100/page cap) reusing the existing `fetchZohoWithRetry` 429/rolling-throttle/401 handling.
- Extended `fetchZohoWithRetry` (`src/lib/zoho/index.ts`) with an optional `headers` option, merged into the request — needed for Desk's required `orgId` header; all existing callers (Projects routes) are unaffected since the option is new and optional.
- Two new export routes (`GET /api/admin/zoho-export/desk-accounts`, `GET /api/admin/zoho-export/desk-contacts`) and one import route (`POST /api/admin/zoho-import/desk-contacts`), all admin/super_admin-gated.
- `normalizeCompanyName()` added to `src/lib/migrate/zoho-import.ts` for comparing Desk account names against `customers.company_name` (strips Inc/LLC/Ltd/Co/Corp/Corporation/Company, lowercases, collapses whitespace).
- Import route resolves each contact's Desk `accountId` → account name (from `desk-accounts.json`, if present) → normalized match against a paginated `customers` lookup; matched rows get `customer_id` + `match_method: 'account_name'`, everything else imports with both `null` (the review queue for a future manual-assignment UI).
- `contacts` table type entry added to `src/types/database.ts`.
- Registered `desk-accounts`/`desk-contacts` in the `/v2/admin/migrate` page's `EXPORT_LEVELS`, and `desk-contacts` in `IMPORT_LEVELS` (see Deviations).

### Files Changed
- `supabase/migrations/056_contacts_table.sql` — new `contacts` table, RLS, indexes.
- `env.example` — documented `ZOHO_DESK_ORG_ID`, including the `Desk.accounts.READ` scope/refresh-token prerequisite.
- `src/lib/zoho/index.ts` — `fetchZohoWithRetry` accepts optional extra headers.
- `src/lib/zoho/desk.ts` — new Desk API client module.
- `src/lib/migrate/zoho-import.ts` — added `normalizeCompanyName()`.
- `src/app/api/admin/zoho-export/desk-accounts/route.ts` — new export route.
- `src/app/api/admin/zoho-export/desk-contacts/route.ts` — new export route.
- `src/app/api/admin/zoho-import/desk-contacts/route.ts` — new import route, matches + upserts.
- `src/types/database.ts` — added `contacts` table type.
- `src/app/v2/(hub)/admin/migrate/page.tsx` — registered the three new routes in `EXPORT_LEVELS`/`IMPORT_LEVELS` (deviation, see below).

### Deviations From Plan
- **Export response shape corrected during implementation.** The task doc's Code Context described the export routes writing directly to `_from_zoho/*.json` server-side (`fs.writeFileSync`). While implementing, reading the actual `users`/`milestones` export routes and the `/v2/admin/migrate` page's generic `handleExport()` showed the real established pattern is different: the route returns the JSON directly in the HTTP response (`Content-Disposition: attachment`), the browser triggers a file download, and the admin manually saves it into `_from_zoho/` (per the page's own instruction banner). Implemented the routes to match this real pattern instead of the task doc's description — behavior is equivalent (JSON ends up in `_from_zoho/` before import), only the mechanism differs, and it now matches every other export route in the codebase.
- **Added migrate-page registration**, not in the original Proposed File Changes. Discovered while implementing that the established, actual way admin routes get triggered in this codebase is the `/v2/admin/migrate` UI (`EXPORT_LEVELS`/`IMPORT_LEVELS` arrays + generic `handleExport`/`handleImport`), not raw `curl` as the task doc's Verification section assumed — task 108 set this precedent explicitly ("Do not add a bespoke branch — the generic fallback already handles it"). Added the three new keys as plain entries (no bespoke JSX branch needed, since none of the three routes need progress/SSE UI) so the feature is actually reachable through the normal workflow.
- Everything else matches the task doc as written (schema, matching logic, admin gating, chunked upsert, idempotency).

- **Post-review rename: `zoho_desk_contact_id`/`zoho_desk_account_id` → `external_id`/`external_account_id`.** User caught that these two columns baked "zoho_desk" into a table meant to outlive the Zoho decommission, inconsistent with `issues`/`milestones`/`tasklists`, which all use a generic `external_id` for exactly this one-time-import dedupe purpose (migration 037's comment even says *"Safe to drop external_id after migration is fully verified"*). `projects.zoho_project_id` is the one deliberate exception, kept Zoho-specific because it's still a live, actively-synced field (webhooks, bidirectional status) — not a one-time-import artifact like `contacts`. Since migration 056 was already applied live (table existed, empty — no rows imported yet), added `supabase/migrations/058_contacts_generic_external_id.sql` to rename both columns plus the auto-generated unique constraint (`contacts_zoho_desk_contact_id_key` → `contacts_external_id_key`) on the live table, rather than editing 056 after the fact. Updated `src/types/database.ts`'s `contacts` type block and `src/app/api/admin/zoho-import/desk-contacts/route.ts` (`ContactRow` type, variable names, `onConflict: "external_id"`) to match. The original `## Code Context` section above still shows the pre-rename names as a historical record of what was originally speced — 058 and this note are the source of truth for final column names.

  **Numbering note:** this migration was originally created as `057_contacts_generic_external_id.sql`, but `npx supabase db push` failed with a `schema_migrations` primary-key collision — an unrelated migration, `057_customer_assets_permissions_and_files.sql` (not part of this task; looks like separate, concurrent work on customer-asset file permissions), had already claimed version 057 in the remote database. Confirmed via a direct PostgREST schema check that the `contacts` table still had the old `zoho_desk_*` column names (i.e. this migration had *not* actually run yet), so it was safe to renumber. Renamed the file to `058_contacts_generic_external_id.sql` and fixed the in-file header comment to match — no changes to its SQL content.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors), re-run after the column rename.
- `pnpm lint` — PASS for all files touched by this task (0 errors/warnings in any new or modified file). The full lint run reports 8 errors/39 warnings, all pre-existing in unrelated files (`pm-dashboard.tsx`, `dashboard/users/page.tsx`, `_list-view.tsx`, `theme-toggle.tsx`, `sanity/index.ts`, `github/index.ts`, `tasks-tab.tsx`, `worker/index.ts`, `_pm-shared.tsx`, `_project-detail.tsx`) — confirmed none of this task's files appear in the lint output.
- Manual verification of the real Zoho Desk export routes — CONFIRMED by user: `desk-accounts.json` (6,143 real accounts) and `desk-contacts.json` (1,627 real contacts) both downloaded successfully via `/v2/admin/migrate`, correct shape (`id`/`accountName`/`accountId`/etc.).
- Read-only dry run of the matching logic against the live `customers` table (temp script, not committed): 200/1,627 contacts matched by normalized account name, 1,427 unmatched (883 with no `accountId` at all — anonymous/internal/no-company contacts, expected). ~60-70 near-miss candidates identified (same company, different spelling/suffix between Desk and Hub) — expected to land in the unmatched review queue by design, not a bug.
- Real import run (`POST /api/admin/zoho-import/desk-contacts` via the migrate page), after migration 058 applied — CONFIRMED: `1627 imported, 200 matched, 1427 unmatched, 0 error(s)`, exactly matching the pre-import dry-run preview. Independently re-verified against the live `contacts` table via a direct PostgREST read (not just trusting the route's own log line): `content-range` totals confirm 1627 total rows / 200 with `customer_id` set / 1427 with `customer_id` null; spot-checked 3 matched rows show real names/emails resolved to real `customer_id`s with `match_method: 'account_name'`. Import is idempotent (upsert on `external_id`) and ran with zero errors on real production-scale data (1,627 contacts, 6,143 accounts).
