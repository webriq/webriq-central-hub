# 336: Zoho Desk Knowledge Base — Export + Import

**Created:** 2026-08-28
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced

**Status:** Planned

---

## Overview

The Hub captures Zoho Desk **tickets**, **threads/comments**, **agents**, **contacts**, and
**accounts** ahead of the Zoho decommission. The **Knowledge Base** (Desk → Knowledge Base →
Articles — the "WebriQ" section, ~17 published articles plus drafts/unpublished/expired) is
**not captured anywhere**. There is no one-click KB export in the Desk UI, but the Desk
**Knowledge Base API** covers it fully.

This task adds a **`desk-kb`** export/import pair to `/admin/migrate` → Zoho Desk tab,
following the **`desk-accounts` (task 335)** pattern exactly:

1. **Export** — `GET /api/admin/zoho-export/desk-kb` → downloads `desk-kb.json`
   (`{ articles: [...], categories: [...] }`). List Articles omits the HTML `answer` body,
   so each article gets a per-article **Get Article** enrichment pass (same shape as
   `enrichTicketsWithCf()`, task 329). `permission=all` includes drafts/unpublished.
2. **Import** — `POST /api/admin/zoho-import/desk-kb` → `importDeskKb()` in
   `src/lib/migrate/desk-kb-import.ts` upserts into a new **`kb_articles`** table
   (`onConflict: "external_id"`).
3. **New migration `126_kb_articles_table.sql`** — `kb_articles` table, RLS mirrors
   `accounts` (migration 125). A `kb_categories` table is **optional / deferred** — each
   article already carries its category name+id inline (see Open Questions).
4. **New OAuth scopes** — `Desk.articles.READ` (required) and `Desk.settings.READ` (only for
   the category list). `ZOHO_REFRESH_TOKEN` must be regenerated with these added; the export
   route surfaces the `403 SCOPE_MISMATCH` hint the way `desk-accounts` does.

No KB browsing UI is in scope — data capture only, same as the `desk-contacts` (task 117)
and initial `desk-accounts` steps. A `/kb` or `/desk/kb` reader is a separate follow-up.

---

## Requirements

1. **Shared Desk API helpers** (`src/lib/zoho/desk.ts`):
   - Extend `fetchAllDeskPages(path, token, label, extraParams?)` with an **optional 4th
     arg** `extraParams: Record<string, string>` merged into the query string alongside
     `from`/`limit` (backwards-compatible — all existing 3-arg callers unaffected). Used to
     pass `permission=all` (and optionally `include=category`) to `/articles`.
   - Add **`enrichArticlesWithBody(stubs, token, label, cb?)`** — mirrors
     `enrichTicketsWithCf()`: per-article `GET /articles/{id}`, grafts the full detail object
     (`answer`, `latestVersionStatus`, `category`, …) onto each list stub; per-article fault
     isolation (a failed Get Article still yields `{ ...stub, answer: null }` and its id lands
     in `failedArticleIds`); refreshed token always carries forward. No callbacks required
     (the export takes the returned array — the set is small, no SSE needed).
2. **Export route** `src/app/api/admin/zoho-export/desk-kb/route.ts` — `GET`, mirrors
   `zoho-export/desk-accounts/route.ts`:
   - Session + `profile.role in ('admin','super_admin')` gate.
   - `getZohoAccessToken()` (502 if none); `ZOHO_DESK_ORG_ID` check (500 if unset).
   - `fetchAllDeskPages("/articles", token, "zoho-export/desk-kb", { permission: "all" })`
     → article stubs.
   - `enrichArticlesWithBody(stubs, token, "zoho-export/desk-kb")` → full articles.
   - `fetchAllDeskPages("/kbRootCategories", token, ...)` → categories (best-effort: if it
     throws on a missing `Desk.settings.READ` scope, log + return `categories: []`, don't
     fail the whole export).
   - `catch` on the articles fetch: if the message contains `403`, append
     `" — likely missing the Desk.articles.READ OAuth scope on your Zoho API client (see env.example)"`.
   - Respond with `Content-Disposition: attachment; filename="desk-kb.json"`, body
     `JSON.stringify({ articles, categories }, null, 2)`.
3. **Import helper** `src/lib/migrate/desk-kb-import.ts`:
   - `DeskKbArticleRaw` type (typed fields we columnize + `[key: string]: unknown`) and
     `DeskKbFile = { articles: DeskKbArticleRaw[]; categories?: DeskKbCategoryRaw[] }`.
   - `importDeskKb(file: DeskKbFile): Promise<ImportResult>` — **no customer matching** (KB
     is global content), so simpler than `importDeskAccounts`:
     - Map each raw article → `KbArticleRow` (see column list below); skip rows with no `id`
       or no `title` (`result.skipped++`).
     - Dedupe by `external_id` (`new Map(rows.map(r => [r.external_id, r])).values()`) — last
       wins; log dropped dupes.
     - `CHUNK_SIZE = 50` chunked `adminClient.from("kb_articles").upsert(chunk, { onConflict: "external_id" })`.
     - `console.log` progress prefixed `[import/desk-kb]`.
     - Return plain `ImportResult` (`ResultChip` renders `imported`/`skipped`/`errors`).
   - If `kb_categories` is included in this task, do the same map+upsert for categories and
     fold the counts into `imported`.
4. **Import route** `src/app/api/admin/zoho-import/desk-kb/route.ts` — `POST`, mirrors
   `zoho-import/desk-accounts/route.ts`: session + `admin/super_admin` gate,
   `readFromZoho<...>("desk-kb.json")` wrapped so a non-array file still works
   (`readFromZoho` returns `[]` for an object — read the raw file here instead, or add a
   sibling `readFromZohoObject<T>()` helper; see Code Context), 400 if the file is missing,
   400 if `articles` is empty, call `importDeskKb`, return the result JSON.
5. **`kb_articles` in `src/types/database.ts`** — `Row`/`Insert`/`Update`. No
   `Relationships[]` entry (no FKs). Insert near the existing `issue_comments` / `issues`
   block alphabetically.
6. **Migrate tab** (`src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx`):
   - Add to **`EXPORT_LEVELS`**:
     `{ key: "desk-kb", label: "Desk Knowledge Base", desc: "All KB articles (published + drafts/unpublished/expired via permission=all) with a per-article Get Article pass for the HTML body, plus root categories. Requires the Desk.articles.READ (+ Desk.settings.READ for categories) OAuth scope" }`
   - Add to **`IMPORT_LEVELS`**:
     `{ key: "desk-kb", label: "Desk Knowledge Base", desc: "Imports desk-kb.json into the kb_articles table (upsert on external_id) — full article HTML in kb_articles.answer, no customer matching" }`
   - The generic `handleExport` (blob download as `${level}.json`) and `handleImport`
     (`POST /api/admin/zoho-import/${level}`, renders `ResultChip`) paths already handle any
     key — **no per-level handler, no new state interface**.
7. **`env.example`** — add under the Desk scope block (after line 47):
   `#   Desk.articles.READ, Desk.settings.READ    — Knowledge Base export (task 336)`
8. **`CLAUDE.md`** — one bullet under Key Conventions noting the `kb_articles` table +
   `desk-kb` export/import level + the two new scopes.
9. `npx tsc --noEmit` and `pnpm lint` clean.

---

## Out of Scope / Must-Not-Change

- **No KB reader/browsing UI** — no `/kb` or `/desk/kb` route, no sidebar entry, no detail
  page. Data capture only.
- **No `fetchAllDeskPages` behaviour change for existing callers** — the 4th arg is optional
  and defaults to `{}`; the merged query string must still emit `from`/`limit` first.
- **No live Zoho sync, no article create/edit/publish, no HTML rewriting** — `answer` is
  stored verbatim. Inline images / attachments inside article HTML stay as Zoho-hosted URLs
  (same unsolved problem as ticket attachments, task 306) — a separate follow-up.
- **No changes to any other export/import level.**
- **`kb_categories` table is optional** — if it adds meaningful scope risk, ship articles
  only (category name+id are already on each article row) and file the table as a follow-up.

---

## Proposed File Changes

### New

| File | Purpose |
|------|---------|
| `supabase/migrations/126_kb_articles_table.sql` | `kb_articles` table + RLS + indexes (optionally `kb_categories`) |
| `src/lib/migrate/desk-kb-import.ts` | `importDeskKb()` + `DeskKbArticleRaw` / `DeskKbFile` types |
| `src/app/api/admin/zoho-export/desk-kb/route.ts` | `GET` export endpoint |
| `src/app/api/admin/zoho-import/desk-kb/route.ts` | `POST` import endpoint |

### Modified

| File | Change |
|------|--------|
| `src/lib/zoho/desk.ts` | optional `extraParams` on `fetchAllDeskPages`; new `enrichArticlesWithBody()` |
| `src/types/database.ts` | add `kb_articles` (and `kb_categories` if included) table types |
| `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` | `desk-kb` entry in `EXPORT_LEVELS` + `IMPORT_LEVELS` |
| `src/lib/migrate/zoho-import.ts` | *(if needed)* `readFromZohoObject<T>()` for the non-array `desk-kb.json` |
| `env.example` | new scope line |
| `CLAUDE.md` | `kb_articles` / `desk-kb` convention bullet |

### `kb_articles` table (draft DDL)

```sql
-- Migration 126: Zoho Desk Knowledge Base articles (task 336)
-- Imported from _from_zoho/desk-kb.json (the { articles, categories } file produced by
-- GET /api/admin/zoho-export/desk-kb). Global content — no customer_id, no matching.
create table kb_articles (
  id                  uuid primary key default gen_random_uuid(),
  external_id         text unique not null,          -- Zoho article id
  title               text not null,
  permalink           text,
  answer              text,                           -- full HTML body (from Get Article)
  summary             text,
  status              text,                           -- Published | Draft | Review | Unpublished | ...
  latest_version_status text,
  category_name       text,
  category_id         text,
  root_category_id    text,
  tags               text[],
  author_id           text,
  author_name         text,
  permission          text,                           -- Zoho article `permission` (ALL/REGISTERED/...)
  view_count          integer,
  like_count          integer,
  dislike_count       integer,
  web_url             text,                           -- Zoho Desk deep link if present
  created_time        timestamptz,
  modified_time       timestamptz,
  source_meta         jsonb not null default '{}'::jsonb,   -- full raw article object
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table kb_articles enable row level security;

-- RLS mirrors `accounts` (migration 125) exactly — staff read, pm write (writes actually
-- go through the service-role adminClient and bypass RLS; the write policy is parity only).
create policy "kb_articles_staff_read"
  on kb_articles for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create policy "kb_articles_pm_write"
  on kb_articles for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

create index kb_articles_status_idx on kb_articles(status);
create index kb_articles_category_id_idx on kb_articles(category_id) where category_id is not null;
```

> Confirm the RLS helper/policy shape against migration 125 (`accounts`) before writing —
> match it verbatim, do not re-derive the role list.

---

## Code Context

### `src/lib/zoho/desk.ts` — `fetchAllDeskPages` (lines 29–60)

Paginates `{ data: [...] }` endpoints with `{ from, limit }`, 100/page, stops on a short
page, returns `{ items, token }`. Add an optional `extraParams` merged into the
`URLSearchParams` in `fetchDeskPage` (or passed through). All current callers pass 3 args.

### `src/lib/zoho/desk.ts` — `enrichTicketsWithCf` (lines 305–367) — the enrichment template

Per-item `GET /tickets/{id}`, `{ ...stub, cf: detail.cf ?? null }`, `failedTicketIds[]`,
token carry-forward, optional `cb.onEnriched`/`cb.onProgress`. `enrichArticlesWithBody`
is the same loop against `GET /articles/{id}`, merging the whole detail object and defaulting
`answer` to `null` on failure.

### `src/app/api/admin/zoho-export/desk-accounts/route.ts` — export route template

Session → `profiles.role` (`admin`/`super_admin`) → `getZohoAccessToken()` →
`ZOHO_DESK_ORG_ID` check → `fetchAllDeskPages("/accounts", ...)` in a `try/catch` that adds
a `403` → scope hint → `new NextResponse(JSON.stringify(...), { headers: { Content-Disposition } })`.

### `src/lib/migrate/desk-accounts-import.ts` — import helper template

`importDeskAccounts()`: per-row map, `external_id` dedupe via `Map`, `CHUNK_SIZE = 50`
`.upsert(chunk, { onConflict: "external_id" })`, `[import/desk-accounts]` logs, returns
`ImportResult & {...}`. `importDeskKb` is this minus the paginated `customers` lookup and
the match/unmatched bookkeeping.

### `src/lib/migrate/zoho-import.ts` — `readFromZoho` (lines 6–13)

```ts
export function readFromZoho<T>(filename: string): T[] {
  const raw = fs.readFileSync(path.join(process.cwd(), "_from_zoho", filename), "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : (parsed?.projects ?? parsed?.tasks ?? parsed?.tasklists ?? []);
}
```

`desk-kb.json` is an **object** (`{ articles, categories }`), not an array — `readFromZoho`
would return `[]`. Either read/parse the file directly in the import route, or add
`readFromZohoObject<T>(filename): T` alongside it.

### `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx`

`EXPORT_LEVELS` (line 70) and `IMPORT_LEVELS` (line 82) are `as const` arrays. `handleExport`
(line 242) blob-downloads `${level}.json`; `handleImport` (line 823) POSTs and stores
`{ state: "done", result: data }` rendered by `ResultChip` (`_shared.tsx` — needs only
`imported`/`updated`/`skipped`/`errors`). No new interface or handler needed for `desk-kb`.

### Zoho Desk KB API (verify against `desk.zoho.com/DeskAPIDocument` before implementing)

- `GET /api/v1/articles` — list; params `from`, `limit` (≤ 100), `permission` (`all` for
  drafts/unpublished), `categoryId`, `sortBy`, `include=category`. Returns article stubs
  **without** the `answer` HTML body.
- `GET /api/v1/articles/{articleId}` — full article incl. `answer`, `latestVersionStatus`,
  `category`, `tags`, counts.
- `GET /api/v1/kbRootCategories` — root KB categories (needs `Desk.settings.READ`).
- All calls require the `orgId` header (`deskHeaders()`).

---

## Implementation Steps

1. **desk.ts** — add optional `extraParams` to `fetchAllDeskPages`; add
   `enrichArticlesWithBody()`.
2. **Migration** — write `126_kb_articles_table.sql` (RLS copied from migration 125). Apply
   locally; **do not** push to remote until the user approves (per task 335 precedent). Add
   `kb_articles` to `src/types/database.ts`.
3. **Import helper** — `src/lib/migrate/desk-kb-import.ts` (`importDeskKb`, types). Add
   `readFromZohoObject` to `zoho-import.ts` if that route is chosen.
4. **Export route** — `src/app/api/admin/zoho-export/desk-kb/route.ts`.
5. **Import route** — `src/app/api/admin/zoho-import/desk-kb/route.ts`.
6. **Migrate tab** — `desk-kb` in `EXPORT_LEVELS` + `IMPORT_LEVELS`.
7. **env.example** + **CLAUDE.md** bullets.
8. `npx tsc --noEmit` + `pnpm lint`.
9. **Live export** — regenerate `ZOHO_REFRESH_TOKEN` with `Desk.articles.READ` +
   `Desk.settings.READ` added, then `/admin/migrate` → Zoho Desk → Export → Desk Knowledge
   Base. Confirm `desk-kb.json` downloads with `articles[].answer` populated and a
   `categories` array. Commit the file to `_from_zoho/`.
10. **Live import** — Import → Desk Knowledge Base. Confirm ~17+ rows in `kb_articles`;
    re-run and confirm idempotent (counts stable, upsert on `external_id`).

---

## Acceptance Criteria

- [ ] `fetchAllDeskPages` accepts an optional `extraParams` and all existing 3-arg callers
      still compile and behave identically.
- [ ] `GET /api/admin/zoho-export/desk-kb` (as admin) downloads `desk-kb.json` =
      `{ articles: [...], categories: [...] }`; every article has a non-null `answer` HTML
      body (from the Get Article pass); drafts/unpublished are included.
- [ ] A missing `Desk.articles.READ` scope produces a 502 whose message names the scope and
      `env.example` (mirrors `desk-accounts`); a missing `Desk.settings.READ` degrades to
      `categories: []` without failing the export.
- [ ] `kb_articles` table exists; `external_id` unique; RLS policies identical to `accounts`.
- [ ] `POST /api/admin/zoho-import/desk-kb` imports all articles into `kb_articles` with the
      full HTML in `answer`; re-running is idempotent (upsert on `external_id`).
- [ ] The migrate tab shows **Desk Knowledge Base** under both Export and Import; the import
      card renders the `ResultChip` counts.
- [ ] `env.example` and `CLAUDE.md` document the table, the level, and the two scopes.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

**Live (needs `ZOHO_REFRESH_TOKEN` regenerated with `Desk.articles.READ` + `Desk.settings.READ`)**

- `/admin/migrate` → Zoho Desk → Export → **Desk Knowledge Base** → `desk-kb.json`
  downloads; open it: `articles` count matches the Desk UI (published + drafts), each
  `answer` is populated HTML, `categories` non-empty.
- Import → **Desk Knowledge Base** → `ResultChip` shows `imported` ≈ article count,
  `skipped` 0, no errors. Run twice → second run counts identical.
- Supabase: spot-check a `kb_articles` row — `answer` HTML present, `status`, `tags`,
  `created_time`/`modified_time` sane, `source_meta` holds the full raw object.
- Negative: temporarily point at a token without `Desk.articles.READ` → export returns the
  scope-hint 502.

---

## Open Questions / Risks

- **`kb_categories` table** — each article already carries `category` (name + id) inline, so
  a flat article import loses nothing structural. Recommend **articles-only** for this task
  and a `kb_categories` follow-up if a reader UI later needs the tree. Decide before step 2.
- **List Articles returning `answer`** — the task assumes it does not (hence the enrichment
  pass). Verify against the live API first; if the list already returns `answer`, keep the
  enrichment pass anyway only for articles where `answer` is empty (same defensive pattern
  as `exportThreadsForTickets`), or drop it.
- **`permission=all` semantics** — confirm it returns drafts/unpublished/expired and not
  just published. If a separate `status` filter is needed per state, loop the known states.
- **Article HTML assets** — inline images/attachments in `answer` are Zoho-hosted URLs that
  will 404 after decommission. Out of scope here; note it as a follow-up like task 306.
- **`readFromZoho` vs object file** — `desk-kb.json` is not an array; the import route must
  not go through the array-only `readFromZoho` unchanged (it would silently yield `[]`).
- **Scope regen is a shared secret** — regenerating `ZOHO_REFRESH_TOKEN` re-scopes every
  Desk feature at once; include the *full* existing scope list + the two new ones (per the
  `env.example` note), don't regenerate with only the KB scopes.

---

## Compatibility Touchpoints

- `fetchAllDeskPages` is used by many Desk export routes — the new arg must be purely
  additive (default `{}`), regression-check one existing export (e.g. Desk Accounts).
- New migration is additive (new table, no alters).
- New `V2_ROUTES` keys: none (no UI).
- `_from_zoho/desk-kb.json` is a new artifact committed to the repo like the other
  `_from_zoho/*.json` exports.
- `_docs/mcp-tools.md`: not affected (no new `registerTool`).

---

## Implementation Notes

### What Changed

- **`src/lib/zoho/desk.ts`**
  - `fetchAllDeskPages()` gained an optional 4th arg `extraParams: Record<string, string> = {}`
    merged into the query string after `from`/`limit` (fully backwards-compatible — every
    existing 3-arg caller is unchanged). Used to pass `permission=all` to `/articles`.
  - New `enrichArticlesWithBody(stubs, token, label, cb?)` — the `enrichTicketsWithCf()`
    twin for KB: per-article `GET /articles/{id}`, merges the full detail object onto each
    list stub, `answer` forced to `null` when absent. Per-article fault isolation
    (`failedArticleIds[]`), token carry-forward, optional `onEnriched`/`onProgress`
    callbacks (unused by the export — the article set is tiny, no SSE).
- **`supabase/migrations/126_kb_articles_table.sql`** (new) — `kb_articles` table
  (columns per the plan's DDL), `external_id` unique, RLS copied verbatim from `accounts`
  (migration 125): `kb_articles_staff_read` (`admin/super_admin/pm/developer`) +
  `kb_articles_pm_write` (`admin/super_admin/pm`, parity only). Indexes on `status` and
  partial `category_id`. **Local-only** — `supabase migration list` shows 126 not yet on
  Remote; needs `supabase db push` (user-approved) before the live import — same posture as
  task 335's migration 125.
- **`src/types/database.ts`** — `kb_articles` `Row`/`Insert`/`Update` added (before
  `kb_entries`); `Relationships: []` (no FKs).
- **`src/lib/migrate/zoho-import.ts`** — new `readFromZohoObject<T>(filename): T` for
  `_from_zoho/` files that are a JSON object rather than an array (`readFromZoho()` only
  ever returns an array and would silently yield `[]` for `desk-kb.json`).
- **`src/lib/migrate/desk-kb-import.ts`** (new) — `importDeskKb(file: DeskKbFile)`:
  per-article map (defensive `toInt`/`toStr`/`normalizeTags` helpers — Zoho `tags` seen as
  both `string[]` and `{name}[]`), `external_id` dedupe via `Map`, `CHUNK_SIZE=50` upsert
  `onConflict: "external_id"` into `kb_articles`, `[import/desk-kb]` progress logs, returns
  plain `ImportResult`. No customers lookup / matching (KB is global content). `categories`
  in the file are parsed into the type but not persisted (kb_categories deferred).
- **`src/app/api/admin/zoho-export/desk-kb/route.ts`** (new) — `GET`, session +
  `admin/super_admin` gate, `getZohoAccessToken()` + `ZOHO_DESK_ORG_ID` checks, then:
  `fetchAllDeskPages("/articles", …, { permission: "all" })` (403 → `Desk.articles.READ`
  scope hint, mirrors `desk-accounts`) → `enrichArticlesWithBody()` →
  `fetchAllDeskPages("/kbRootCategories", …)` **best-effort** (any error → logs + returns
  `categories: []`, export still succeeds) → `desk-kb.json` attachment
  (`{ articles, categories }`).
- **`src/app/api/admin/zoho-import/desk-kb/route.ts`** (new) — `POST`, session +
  `admin/super_admin` gate, `readFromZohoObject<DeskKbFile>("desk-kb.json")` (400 if
  missing), 400 if `articles` empty, `importDeskKb()`, return the `ImportResult`.
- **`src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx`** — `desk-kb` added to `EXPORT_LEVELS`
  (after archived-ticket-comments) and `IMPORT_LEVELS` (after ticket-attachments). The
  generic `handleExport` (blob download `desk-kb.json`) and `handleImport`
  (`POST /api/admin/zoho-import/desk-kb`, `ResultChip`) paths handle it — no new state,
  no per-level handler.
- **`env.example`** — `Desk.articles.READ, Desk.settings.READ` added to the Desk scope block.
- **`CLAUDE.md`** — new `kb_articles` bullet under Key Conventions (before the
  `tickets.source_meta.cf` bullet).

### Files Changed

- `src/lib/zoho/desk.ts` — `extraParams` on `fetchAllDeskPages`; new `enrichArticlesWithBody()`
- `supabase/migrations/126_kb_articles_table.sql` — new table + RLS + indexes
- `src/types/database.ts` — `kb_articles` table type
- `src/lib/migrate/zoho-import.ts` — new `readFromZohoObject()`
- `src/lib/migrate/desk-kb-import.ts` — new import helper
- `src/app/api/admin/zoho-export/desk-kb/route.ts` — new export route
- `src/app/api/admin/zoho-import/desk-kb/route.ts` — new import route
- `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` — `EXPORT_LEVELS` + `IMPORT_LEVELS` entries
- `env.example` — new scope line
- `CLAUDE.md` — `kb_articles` convention bullet

### Deviations From Plan

- **`kb_categories` table** — deferred as the plan's Open Questions recommended. The export
  still writes `categories` into `desk-kb.json` (cheap, forward-compat); the import parses
  but does not persist them. Article rows carry `category_name`/`category_id`/`root_category_id`
  inline.
- **`permission=all` unverified against the live API** — implemented exactly as the plan
  specifies via the new `extraParams`. If Zoho ignores/rejects it, the export degrades to
  published-only (no crash) and the param is adjusted during the live-export step. The
  plan's Open Question already flags this.
- **`enrichArticlesWithBody` merges the whole detail object** (`{ ...stub, ...detail }`),
  not just `answer` — the plan allowed this ("grafts the full detail object"). Get Article
  is the authoritative record; List Article fields are a strict subset.
- No `readFromZohoObject` vs inline-read ambiguity — went with the shared helper (one line,
  reusable, keeps the route thin), as the plan's Code Context offered.

### Verification Run

- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (2 pre-existing unrelated warnings in
  `onboarding-workspace/_checklist-tab.tsx`)
- `supabase migration list` — 126 present Local, **absent Remote** (awaiting user-approved
  `supabase db push`)
- Live export (`GET /api/admin/zoho-export/desk-kb`) — **PASS** after two fixes (below).
  `desk-kb.json`: **19 articles** (17 Published + 2 Draft — matches the portal), every one
  with a non-empty HTML `answer` (54–31,010 chars, from the Get Article pass), **1**
  category. The `Desk.articles.READ` scope was already on the token (the 422s below prove
  the calls reached Zoho and were processed). Categories returned via `/kbRootCategories`
  without needing a re-scope — the token also already carries `Desk.settings.READ` (or the
  endpoint doesn't require it for this portal).
- `importDeskKb()` mapping **dry-run against the real `desk-kb.json`** — 19 rows mapped, 0
  skipped, 19 unique `external_id`, string counts (`viewCount: "1355"`) parse to ints,
  `category`/`author` objects flatten correctly, empty `tags` → `null`, no empty `answer`.
- Live import (`POST /api/admin/zoho-import/desk-kb`) — **NOT RUN** — blocked on migration
  126 reaching Remote.
- Browser acceptance (migrate tab Export/Import cards) — export path exercised directly via
  the route; card UI not yet clicked.

### Post-Testing Fixes

The first live export hit two Zoho `/articles` quirks (both surfaced as `422
UNPROCESSABLE_ENTITY`, caught during this session):

1. **`limit` caps at 50 on `/articles`** (not 100). `fetchAllDeskPages` hardcoded
   `perPage = 100` → hard 422. Changed its 4th param from `extraParams: Record<string,string>`
   to `opts: { params?: Record<string, string>; perPage?: number }` (default `perPage` 100,
   so every existing 3-arg caller is unchanged). The desk-kb route passes `perPage: 50` for
   both `/articles` and `/kbRootCategories`.
2. **`permission=all` is not a valid `/articles` value** ("does not match the allowed
   values"). Replaced with a **per-`status` loop** over
   `["Published","Draft","Review","Unpublished","Expired"]`, merged by article id: each
   status is fetched independently, a per-status non-403 error is logged and skipped, a
   `403` still returns the scope-hint 502, and if *no* status call succeeds the route falls
   back to a bare List Articles so the export always returns at least the published set.
   Live result: `Published` + `Draft` returned data, the other three returned nothing (empty
   or skipped) — 19 total, correct.
3. **`handleExport` in `_zoho-desk-tab.tsx`** now reads the JSON `{ error }` body on a
   non-OK response and throws *that* (was `HTTP ${res.status}` only) — so a failed export
   logs the real Zoho message instead of a bare `HTTP 502`. Purely additive, no state/render
   change; benefits every export level. (A richer in-card error message for the generic
   export cards — they only show a status icon today — is a pre-existing gap left as a
   follow-up.)

`npx tsc --noEmit` + `pnpm lint` re-run after all three — PASS.

### Follow-ups

- **Migration 126 → Remote** — `supabase db push` (user-approved) before the live import.
- **`_from_zoho/desk-kb.json`** — commit the exported file (19 articles) like the other
  `_from_zoho/*.json` artifacts, once satisfied with it.
- **Generic export-card error text** — surface `handleExport`'s caught message in the card
  (needs a `CardState` shape change), not just the console.

---

## Quality Gate Notes

### Result
PASS

### Standards Review

- **Pattern fidelity** — the export route mirrors `zoho-export/desk-accounts/route.ts`
  (session → `admin/super_admin` gate → token/org checks → `fetchAllDeskPages` in a
  `try/catch` with a `403` → scope hint → `Content-Disposition` attachment). The import
  route mirrors `zoho-import/desk-accounts/route.ts`. `importDeskKb()` mirrors
  `importDeskAccounts()` (external_id `Map` dedupe, `CHUNK_SIZE=50` upsert
  `onConflict: "external_id"`, `[import/desk-kb]` log prefix) minus the customers lookup —
  correct, KB is global content. `enrichArticlesWithBody()` is a faithful sibling of
  `enrichTicketsWithCf()` (per-item detail fetch, fault isolation via `failedArticleIds`,
  token carry-forward, optional callbacks).
- **RLS** — `kb_articles` policies copied verbatim from `accounts` (migration 125):
  `get_my_role()` helper, `to authenticated`, no inline role logic. No FK, so
  `Relationships: []` — correct.
- **Types** — no `any`. `DeskKbArticleRaw` types the columnized fields + an index
  signature; `toIntOrNull`/`toStrOrNull`/`normalizeTags` are all used and each guards a
  real shape ambiguity (`tags` seen as `string[]` and `{name}[]` across Zoho API
  versions). `kb_articles` `Row`/`Insert`/`Update` added to `database.ts`.
- **Generic migrate-tab wiring verified** — `desk-kb` is not special-cased in either the
  `EXPORT_LEVELS` or `IMPORT_LEVELS` render branches, so it falls through to the generic
  `handleExport(key)` (blob-downloads `desk-kb.json`) / `handleImport(key)`
  (`POST /api/admin/zoho-import/desk-kb`, renders `ResultChip` from the returned
  `ImportResult`). No new state interface or handler needed — matches the plan.
- **Error handling** — articles fetch failure → 502 with scope hint; categories fetch
  failure → logged + `categories: []`, export still succeeds (deliberate, documented);
  missing/!unreadable `desk-kb.json` → 400; empty `articles` → 400; per-chunk upsert error
  → collected into `result.errors`, loop continues.
- **Logging** — `console.log` progress lines are server-side in a dev-only admin route,
  following the existing `[import/desk-*]` / `[zoho-export/desk-*]` convention. No secrets.
- **Cleanup applied during this gate** — `enrichArticlesWithBody` had a no-op
  `if (row.answer == null) row.answer = null;`; replaced with an explicit
  `answer: detail.answer ?? stub.answer ?? null` in the spread. `npx tsc --noEmit` re-run
  PASS.
- **Impeccable design-hook flags** on `_zoho-desk-tab.tsx` (17× `text-[11/12/13px]`) are
  all pre-existing literal sizes the entire migrate UI already uses — the two new lines are
  data-only entries in `as const` arrays, no markup. Left unchanged, consistent with task
  335's gate decision.

### Deviations

- **`kb_categories` table deferred** (Minor) — the plan's recommended option. Export still
  writes `categories` to the JSON (cheap, forward-compat); import parses but does not
  persist. Article rows carry `category_name`/`category_id`/`root_category_id` inline.
- **`permission=all` unverified against the live API** (Minor) — implemented per the plan
  via the new `extraParams`. Wrong value degrades to published-only (no crash); confirmed
  during the live-export step. Flagged in the plan's Open Questions.
- **`fetchAllDeskPages` `perPage` hardcoded to 100** (Minor) — if Zoho's `/articles`
  endpoint caps `limit` below 100, a capped first page reads as a short page and
  pagination stops early. Moot for this portal (~17 articles); revisit only if a portal
  ever exceeds one page of articles.
- **`enrichArticlesWithBody` merges the whole Get Article object** (`{ ...stub, ...detail }`)
  rather than grafting only `answer` (Minor) — the plan permitted this; Get Article is the
  authoritative superset of the list fields.

No Medium or Major deviations.

### Required Fixes
- None.
