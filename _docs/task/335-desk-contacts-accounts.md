# 335: Desk Contacts & Accounts — Import + UI under Desk

**Created:** 2026-08-28
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

The Hub already imports Zoho Desk **tickets** (`tickets`), **threads/comments**
(`ticket_messages`), **agents** (`desk_agents`), and **contacts** (`contacts`, task 117 —
data-only, ~1,627 rows, soft-matched to `customers` by normalized account name). There is
**no UI** for contacts, and Desk **accounts** (companies) are read from
`_from_zoho/desk-accounts.json` only as a lookup file by the ticket/contact importers —
they are never persisted or shown.

This task:

1. Adds an **`accounts`** table + a **`desk-accounts` import level** (the *export* level
   already exists in the migrate tab), soft-matched to `customers` the same way contacts are.
2. Makes the sidebar **"Desk"** item a **collapsible parent** (like "Projects") with
   children **Tickets** and **Contacts**.
3. Adds **`/desk/contacts`** — a two-tab page (**Contacts** | **Accounts**) with
   Tickets-style server-paginated tables (search, page-size selector, empty states).
4. Adds **detail pages**: `/desk/contacts/[id]` and `/desk/accounts/[id]`, each showing all
   fields plus related records.

`desk-accounts.json` in the repo today: **6,143 rows, 6,058 unique names**. Populated
fields (verified): `accountName` 100%, `website` 95%, `phone` 88%, `email` **0.1%** (6 rows),
`zohoCRMAccount.id` 99%, `webUrl` 100% (Zoho Desk deep link), `customerHappiness` 100% (an
object of `badPercentage`/`okPercentage`/`goodPercentage` **string** values, almost all
`"0"`), `createdTime` 100%.

### Not in this task

- Contacts are **not** re-imported — task 117's data is assumed present. If it turns out
  stale, re-run the existing **Desk Contacts** import level; no code change needed here.
- No editing, no live Zoho sync, no create.

---

## Requirements

1. **`accounts` table** (new migration) with the columns in *Proposed File Changes* below.
   `external_id` unique (Zoho Desk account id, the upsert conflict key). `customer_id`
   nullable FK to `customers(customer_id)`. RLS mirrors `contacts`/`tickets` (admin + pm
   read; service-role writes).
2. **`accounts` added to `src/types/database.ts`** — `Row`/`Insert`/`Update` + a
   `Relationships[]` entry for `accounts_customer_id_fkey` → `customers`.
3. **`importDeskAccounts(rows)`** in `src/lib/migrate/desk-accounts-import.ts`:
   - Paginated `customers` lookup (`PAGE = 1000`, `.range()` loop) → `Map<normalizeCompanyName(company_name), customer_id>` (per CLAUDE.md's >1000-row rule).
   - Map each raw row → `AccountRow`; `customer_id` + `match_method: "account_name"` when
     the normalized `accountName` hits the map, else `null`/`null` (row still imports).
   - Dedupe by `external_id` before upsert (same guard as `importDeskTickets` — a paginator
     can't produce dupes here, but the source file could; last one wins).
   - Chunked upsert (`CHUNK_SIZE = 50`) `onConflict: "external_id"` into `accounts`.
   - Return `ImportResult & { matched: number; unmatched: number }`.
4. **`POST /api/admin/zoho-import/desk-accounts`** — session + `role in (admin, super_admin)`
   gate, `readFromZoho<DeskAccountRaw>("desk-accounts.json")` (400 if missing), call
   `importDeskAccounts`, return the result JSON. Mirrors `zoho-import/desk-tickets/route.ts`.
5. **Register the import level** in `IMPORT_LEVELS` in
   `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx`:
   `{ key: "desk-accounts", label: "Desk Accounts", desc: "Imports desk-accounts.json into the accounts table, soft-matched to customers by normalized account name; unmatched rows import anyway" }`.
   The generic `fetch(\`/api/admin/zoho-import/${level}\`, { method: "POST" })` path
   (line ~827) already handles it — no per-level handler needed.
6. **`V2_ROUTES`** gains `DESK_CONTACTS: "/desk/contacts"` and
   `DESK_ACCOUNTS: "/desk/accounts"`.
7. **Sidebar** (`src/app/(hub)/_components/v2-hub-sidebar.tsx`):
   - Generalize the single `projectsExpanded: boolean | null` state to
     `expanded: Record<string, boolean | null>` keyed by `item.label` (two collapsible
     items now: "Projects" and "Desk"). Update the `hasChildren` branch to read/write
     `expanded[item.label]` (fallback `pathname.startsWith(item.href)`), and the toggle to
     `setExpanded(e => ({ ...e, [item.label]: !isExpanded }))`.
   - Change the `Desk` entry in `getNavGroups` to:
     ```ts
     { label: "Desk", icon: <Inbox size={18} />, href: V2_ROUTES.DESK_TICKETS, children: [
         { label: "Tickets",  href: V2_ROUTES.DESK_TICKETS },
         { label: "Contacts", href: V2_ROUTES.DESK_CONTACTS },
     ] }
     ```
8. **`/desk/contacts` page** — server component (`page.tsx`) + client index
   (`_contacts-index.tsx`), styled after `/desk/tickets` (`_tickets-index.tsx`): sticky
   header, search input, `?tab=contacts|accounts` (default `contacts`), `?page`/`?pageSize`
   (20/50/100), `?search`, server pagination via `.range()` + `{ count: "exact" }`,
   per-tab empty states (icon + line + no action needed).
   - **Contacts tab** — columns: Name (`full_name` ?? `first_name last_name`) · Email ·
     Phone (`phone` ?? `mobile`) · Account (resolved from `external_account_id` →
     `accounts.account_name`, scoped lookup Map) · Customer (`customers.company_name` via
     the `contacts_customer_id_fkey` embed). Search: `full_name`/`first_name`/`last_name`/
     `email` ilike. Row → `/desk/contacts/[id]`.
   - **Accounts tab** — columns: Account · Website · Email · Phone · Happiness
     (`good%`, small pill; `–` when all zero) · Customer. Search:
     `account_name`/`website`/`email` ilike. Row → `/desk/accounts/[id]`.
9. **`/desk/contacts/[id]`** — contact detail (UUID route param, standard rule). All fields;
   linked account (name + link to `/desk/accounts/[account.id]`); linked customer; **related
   tickets** where `tickets.external_contact_id = contact.external_id` (subject, status,
   `ticket_id` link to `/desk/tickets/[ticket_id]`). `notFound()` on bad id.
10. **`/desk/accounts/[id]`** — account detail (UUID route param). All fields; Zoho Desk
    deep link (`web_url`, opens new tab); matched customer (link to customer profile);
    **contacts at this account** (`contacts.external_account_id = account.external_id`);
    **tickets** where `tickets.external_account_id = account.external_id`. `notFound()` on
    bad id.
11. **Role gate on all four routes**: same as ticket detail — `getClaims()` →
    `role in (admin, super_admin, pm)` else redirect `DASHBOARD`; `export const dynamic = "force-dynamic"`.
12. `npx tsc --noEmit` and `pnpm lint` clean.

---

## Out of Scope / Must-Not-Change

- **`importDeskTickets()` / `desk-contacts` import** — both read `desk-accounts.json`
  directly for name lookup. Do **not** repoint them at the new `accounts` table in this
  task (keeps the change small and the imports independently runnable).
- **`contacts` table / task 117 import** — no schema change, no re-run baked in.
- **Backfilling `contacts.customer_id`** from newly-matched accounts — out of scope.
- **`desk-accounts` export route** (`zoho-export/desk-accounts/route.ts`) — unchanged.
- No new OAuth scope (the export already needs `Desk.accounts.READ`; the import reads the
  local file).
- Keep the UUID-as-routing-key rule — no human-readable id for contacts/accounts.

---

## Proposed File Changes

### New

| File | Purpose |
|------|---------|
| `supabase/migrations/1XX_accounts_table.sql` | `accounts` table + indexes + RLS |
| `src/lib/migrate/desk-accounts-import.ts` | `importDeskAccounts()` + `DeskAccountRaw`/`AccountRow` types |
| `src/app/api/admin/zoho-import/desk-accounts/route.ts` | `POST` import endpoint |
| `src/app/(hub)/desk/contacts/page.tsx` | server: role gate, tab dispatch, paginated query |
| `src/app/(hub)/desk/contacts/_contacts-index.tsx` | client: tabs, search, table, pagination |
| `src/app/(hub)/desk/contacts/loading.tsx` | skeleton (copy `desk/tickets/loading.tsx`) |
| `src/app/(hub)/desk/contacts/[id]/page.tsx` | contact detail |
| `src/app/(hub)/desk/accounts/[id]/page.tsx` | account detail |

### Modified

| File | Change |
|------|--------|
| `src/types/database.ts` | add `accounts` table type + relationship |
| `src/config/constants.ts` | `V2_ROUTES.DESK_CONTACTS`, `V2_ROUTES.DESK_ACCOUNTS` |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | `expanded` map state; `Desk` → parent w/ children |
| `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` | add `desk-accounts` to `IMPORT_LEVELS` |
| `CLAUDE.md` | note the new `accounts` table + `/desk/contacts` tabs under Key Conventions |

### `accounts` table (draft DDL)

```sql
-- Migration 1XX: accounts — Zoho Desk accounts (companies), imported from desk-accounts.json
create table if not exists accounts (
  id                   uuid primary key default gen_random_uuid(),
  external_id          text not null unique,
  account_name         text not null,
  email                text,
  website              text,
  phone                text,
  web_url              text,
  customer_happiness   jsonb,
  zoho_crm_account_id  text,
  customer_id          text references customers(customer_id) on delete set null,
  match_method         text,
  created_time         timestamptz,
  source_meta          jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists accounts_customer_id_idx on accounts (customer_id);
create index if not exists accounts_account_name_lower_idx on accounts (lower(account_name));

alter table accounts enable row level security;

-- read: admin + pm (mirror contacts/tickets policy vocabulary in the repo)
create policy "accounts_read" on accounts for select
  using (get_my_role() in ('admin', 'pm'));
-- writes go through adminClient (service role bypasses RLS) — no insert/update/delete policy
```

> Confirm the exact RLS helper/policy shape against the newest `contacts`/`tickets`
> migration before writing this — match whatever they actually use (`get_my_role()` per
> CLAUDE.md).

---

## Code Context

### `src/lib/migrate/desk-tickets-import.ts` — the import helper shape to mirror

`importDeskTickets()` is the template: paginated lookup-map build, per-row mapping,
`external_id` dedupe via `new Map(rows.map(r => [r.external_id, r])).values()`, chunked
`adminClient.from(...).upsert(chunk, { onConflict: "external_id" })`, `ImportResult`
accumulation, `console.log` progress lines prefixed `[import/desk-accounts]`.

### `src/lib/migrate/zoho-import.ts` — shared helpers

`readFromZoho<T>(filename)`, `normalizeCompanyName(s)`, `ImportResult` type, `adminClient`
re-export. Use all of these.

### `src/app/api/admin/zoho-import/desk-tickets/route.ts` — route wrapper to mirror

Session → `profiles.role` check (`admin` / `super_admin`) → `readFromZoho` (400 on miss) →
call helper → `NextResponse.json(result)`.

### `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx`

`EXPORT_LEVELS` already has `{ key: "desk-accounts", ... }`. `IMPORT_LEVELS` (array near
top) is where the new entry goes. Import cards POST to
`/api/admin/zoho-import/${level.key}` generically (~line 827) and render
`result.imported` / `.matched` / `.unmatched` / `.errors` — the returned shape already fits.

### `src/app/(hub)/_components/v2-hub-sidebar.tsx`

- `NavItem` type (line ~23) already has `children?: { label: string; href: string }[]`.
- State: `const [projectsExpanded, setProjectsExpanded] = useState<boolean | null>(null)`
  (line ~114) → replace with `expanded` map.
- `hasChildren` branch: lines ~181–276. `isExpanded` currently
  `projectsExpanded ?? pathname.startsWith(item.href)`; the `AnimatePresence` +
  `motion.div` child list renders below. Only the state accessor changes.

### `src/app/(hub)/desk/tickets/_tickets-index.tsx` + `page.tsx` — UI template

`page.tsx`: `.from("tickets").select("...", { count: "exact" }).order(...).range(from, to)`,
scoped lookup Maps for FK-less relations (Contact name, Owner). `_tickets-index.tsx`: sticky
header, `FilterMultiSelect`, search box with `buildUrl` search-param helper, `PAGE_SIZES`,
pagination controls, `Inbox` empty state. The Contacts/Accounts page reuses this skeleton
minus the status filter, plus a two-tab switcher (`?tab=`).

### `src/app/(hub)/desk/tickets/[ticketId]/page.tsx` — detail template

Role gate via `getClaims()` + `profiles.role`, `dynamic = "force-dynamic"`,
`generateMetadata`, `notFound()` on bad param, scoped lookup Maps for related records.

### Raw account row shape (`_from_zoho/desk-accounts.json`)

```json
{
  "id": "300063000000089214",
  "accountName": "Zoho",
  "email": "support@zohodesk.com",
  "website": "https://www.zoho.com/",
  "phone": "1 888 900 9646",
  "createdTime": "2018-07-12T08:22:39.000Z",
  "zohoCRMAccount": { "id": "3371756000000212001" },
  "webUrl": "https://helpdesk.webriq.services/support/webriqgoesmad/ShowHomePage.do#Accounts/dv/300063000000089214",
  "customerHappiness": { "badPercentage": "0", "okPercentage": "0", "goodPercentage": "0" }
}
```

Map: `id`→`external_id`, `accountName`→`account_name`, `zohoCRMAccount?.id`→
`zoho_crm_account_id`, `webUrl`→`web_url`, `createdTime`→`created_time`,
`customerHappiness`→`customer_happiness` (store the object as-is). Everything not columnized
also goes into `source_meta` verbatim for forward-compat.

---

## Implementation Steps

1. **Migration** — write `1XX_accounts_table.sql` (check the latest migration number and the
   current `contacts`/`tickets` RLS pattern first). Apply it. Regenerate / hand-edit
   `src/types/database.ts` to add `accounts`.
2. **`V2_ROUTES`** — add `DESK_CONTACTS`, `DESK_ACCOUNTS`.
3. **Import helper** — `src/lib/migrate/desk-accounts-import.ts` (`importDeskAccounts`).
4. **Import route** — `src/app/api/admin/zoho-import/desk-accounts/route.ts`.
5. **Migrate tab** — add the `desk-accounts` `IMPORT_LEVELS` entry.
6. **Run the import** locally from `/admin/migrate` → Zoho Desk tab → Import → Desk Accounts.
   Expect ~6,143 imported, some matched / most unmatched. Note the counts.
7. **Sidebar** — `expanded` map refactor + `Desk` parent entry. Verify Projects still
   expands/collapses and Desk now does too.
8. **List page** — `/desk/contacts` `page.tsx` + `_contacts-index.tsx` + `loading.tsx`.
   Both tabs, search, pagination, empty states.
9. **Detail pages** — `/desk/contacts/[id]` and `/desk/accounts/[id]`.
10. **`CLAUDE.md`** — document the `accounts` table + `/desk/contacts` tabs.
11. `npx tsc --noEmit` + `pnpm lint`.
12. Browser acceptance (see Verification).

---

## Acceptance Criteria

- [ ] `accounts` table exists with the columns above; `external_id` unique; `customer_id`
      FK to `customers`.
- [ ] `POST /api/admin/zoho-import/desk-accounts` imports all rows from
      `desk-accounts.json`; re-running it is idempotent (upsert on `external_id`), counts
      stable.
- [ ] Import result JSON reports `imported`, `matched`, `unmatched`, `errors` and the
      migrate-tab card renders them.
- [ ] Sidebar "Desk" is collapsible with children **Tickets** and **Contacts**; clicking
      "Desk" while collapsed navigates to Tickets; "Projects" still works.
- [ ] `/desk/contacts` shows the **Contacts** tab by default; `?tab=accounts` shows
      **Accounts**. Both paginate, search, and show an empty state when a search matches
      nothing.
- [ ] Contacts rows link to `/desk/contacts/[id]`; Accounts rows to `/desk/accounts/[id]`.
- [ ] Contact detail shows the contact's account, customer, and related tickets
      (by `external_contact_id`).
- [ ] Account detail shows fields, the Zoho Desk deep link, matched customer, contacts at
      the account, and tickets (by `external_account_id`).
- [ ] All four routes redirect non-(admin/super_admin/pm) users to the dashboard.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

---

## Verification

**TypeScript / lint**

```bash
npx tsc --noEmit
pnpm lint
```

**Import (local dev, needs `_from_zoho/desk-accounts.json` present — it is)**

- `/admin/migrate` → Zoho Desk → Import → **Desk Accounts**. Confirm ~6,143 imported,
  record matched/unmatched. Run it twice; confirm the second run doesn't inflate counts.
- Spot-check a matched row in Supabase (`customer_id` + `match_method = 'account_name'`)
  and an unmatched row (`null`/`null`).

**Browser (acceptance)**

- Sidebar: Desk expands/collapses; children route correctly; Projects unaffected;
  collapsed-sidebar click on Desk goes to Tickets.
- `/desk/contacts`: default tab, tab switch via URL and click, search on each tab,
  page-size change, pagination next/prev, empty-search state.
- Row → detail for one contact and one account; verify related-record sections populate
  (pick a contact/account that actually has tickets).
- Log in as a `developer`/`client` user (or simulate) → all four routes redirect.

---

## Open Questions / Risks

- **RLS policy vocabulary** — confirm against the newest `contacts`/`tickets` migration
  whether reads are gated by `get_my_role() in (...)` or a different helper, and whether
  `pm` (not `developer`) is the right second role. Match exactly.
- **`customerHappiness` display** — values are strings and almost universally `"0"`.
  Rendering `–` when `good/ok/bad` are all `"0"` avoids a wall of meaningless `0%` pills.
- **Account ↔ ticket linkage** — depends on `tickets.external_account_id` being populated
  by the ticket import. It is written by `importDeskTickets` (`external_account_id` on
  `TicketRow`), but coverage may be partial for tickets with no `accountId`. Account detail
  "related tickets" is best-effort, not guaranteed complete.
- **6,143-row Accounts tab** — always query with `.range()` + `count: "exact"`; never an
  unbounded select (CLAUDE.md rule).
- **Name-match quality** — 6,058 unique account names vs a much smaller customer set; the
  large majority will be `unmatched` and that's expected (CRM noise). Not a defect.

---

## Compatibility Touchpoints

- `importDeskTickets()` and the `desk-contacts` import keep reading `desk-accounts.json`
  directly — untouched, still work with or without the new table.
- Sidebar `expanded`-map refactor touches the existing "Projects" collapsible — regression
  check it.
- New `V2_ROUTES` keys are additive.
- New migration is additive (new table, no alters to existing tables).

---

## Implementation Notes

### What Changed

- **Migration `125_accounts_table.sql`** — new `accounts` table (columns per the plan),
  `external_id` unique, `customer_id` FK → `customers(customer_id) on delete set null`,
  `match_method` check `('account_name','manual')`, indexes on `customer_id` (partial) and
  `lower(account_name)`. RLS mirrors `contacts` (migration 056) exactly:
  `accounts_staff_read` for `get_my_role() in ('admin','super_admin','pm','developer')`
  and `accounts_pm_write` `for all` to `('admin','super_admin','pm')` — **deviation from
  the plan's guessed `('admin','pm')`**, corrected after reading migration 056.
  **Not yet pushed to the linked remote DB** — `supabase migration list` shows 125 as
  Local-only. Needs `supabase db push` (or dashboard apply) before the import/UI work
  against live data — see Verification.
- **`src/types/database.ts`** — added the `accounts` `Row`/`Insert`/`Update` +
  `accounts_customer_id_fkey` relationship (inserted before `contacts`).
- **`src/config/constants.ts`** — `V2_ROUTES.DESK_CONTACTS` (`/desk/contacts`),
  `V2_ROUTES.DESK_ACCOUNTS` (`/desk/accounts`).
- **`src/lib/migrate/desk-accounts-import.ts`** (new) — `importDeskAccounts(rows)`:
  paginated `customers` lookup → normalized-name map, per-row map, `external_id` dedupe,
  `CHUNK_SIZE=50` upsert `onConflict: "external_id"`. Returns
  `ImportResult & { matched, unmatched }`. Whole raw Desk object stashed in `source_meta`.
- **`src/app/api/admin/zoho-import/desk-accounts/route.ts`** (new) — thin `POST` wrapper:
  session + `admin/super_admin` gate, `readFromZoho("desk-accounts.json")`, call helper.
- **`_zoho-desk-tab.tsx`** — added `desk-accounts` as the first `IMPORT_LEVELS` entry; the
  generic `handleImport` + import-card render already handle any key.
- **`v2-hub-sidebar.tsx`** — `projectsExpanded: boolean | null` → `expanded:
  Record<string, boolean>` keyed by `item.label`; the `hasChildren` branch reads
  `expanded[item.label] ?? pathname.startsWith(item.href)` and toggles via
  `setExpanded(e => ({ ...e, [item.label]: !isExpanded }))`. `Desk` nav item converted to a
  parent with `children: [Tickets, Contacts]`.
- **`/desk/contacts/page.tsx`** (new) — server component: role gate, `?tab=` dispatch,
  per-tab `.select(..., { count: "exact" })` + `.range()` pagination + `.or(...ilike)`
  search. Contacts tab resolves account names via a scoped `accounts` lookup Map.
- **`/desk/contacts/_contacts-index.tsx`** (new) — client: tab bar, debounced search,
  page-size + pagination controls, filtered / empty states. Mirrors `_tickets-index.tsx`.
- **`/desk/contacts/_contacts-table.tsx`** (new) — `ContactsTable` + `AccountsTable`
  (grid rows, `Chip` for the happiness pill).
- **`/desk/contacts/loading.tsx`** (new) — skeleton.
- **`src/app/(hub)/desk/_detail-ui.tsx`** (new) — shared detail primitives (`DetailShell`,
  `Card`, `FieldGrid`, `Field`, `RelatedTickets`, `RelatedContacts`) for both detail pages.
- **`/desk/contacts/[id]/page.tsx`** (new) — contact detail, UUID-routed, `notFound()` on
  non-UUID / missing; fields + linked account + linked customer + related tickets
  (`external_contact_id`).
- **`/desk/accounts/[id]/page.tsx`** (new) — account detail, UUID-routed; fields + Zoho
  Desk deep link + matched customer + contacts at the account + tickets
  (`external_account_id`).
- **`CLAUDE.md`** — added the `accounts` table bullet under Key Conventions.

### Files Changed

- `supabase/migrations/125_accounts_table.sql` — new table + RLS + indexes
- `src/types/database.ts` — `accounts` table type
- `src/config/constants.ts` — 2 new `V2_ROUTES` keys
- `src/lib/migrate/desk-accounts-import.ts` — new import helper
- `src/app/api/admin/zoho-import/desk-accounts/route.ts` — new import route
- `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` — `IMPORT_LEVELS` entry
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` — collapsible-item state generalization + Desk children
- `src/app/(hub)/desk/contacts/page.tsx` — new list page (server)
- `src/app/(hub)/desk/contacts/_contacts-index.tsx` — new list UI (client)
- `src/app/(hub)/desk/contacts/_contacts-table.tsx` — new tables
- `src/app/(hub)/desk/contacts/loading.tsx` — new skeleton
- `src/app/(hub)/desk/_detail-ui.tsx` — new shared detail primitives
- `src/app/(hub)/desk/contacts/[id]/page.tsx` — new contact detail
- `src/app/(hub)/desk/accounts/[id]/page.tsx` — new account detail
- `CLAUDE.md` — `accounts` table convention

### Deviations From Plan

- **RLS roles**: plan guessed `get_my_role() in ('admin','pm')`; implemented the exact
  `contacts` policy pair instead (`admin/super_admin/pm/developer` read,
  `admin/super_admin/pm` write). More correct and consistent.
- **Sidebar state**: plan said `Record<string, boolean | null>`; used
  `Record<string, boolean>` (absent key = follow-route, same 3-state behaviour without the
  explicit `null`).
- **Contacts ordering**: plan implied alphabetical by name; `contacts.full_name` is `null`
  for every task-117 Desk contact (the import sets `first_name`/`last_name` only), so the
  list orders by `last_name` then `first_name` (`nullsFirst: false`).
- **Impeccable design-hook findings** on `v2-hub-sidebar.tsx` / `_zoho-desk-tab.tsx` /
  `_contacts-index.tsx` / `_detail-ui.tsx` are all pre-existing literal hex colors and
  `text-[11/12/13/15px]` sizes that the entire Desk UI and the dark sidebar already use
  (documented pattern — CLAUDE.md "v2 uses explicit paired classes, not tokens"). New code
  matches its siblings deliberately; left unchanged.

### Verification Run

- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (2 pre-existing unrelated warnings in `onboarding-workspace/_checklist-tab.tsx`)
- `supabase db push` (apply migration 125 to remote) — **DONE** (user-approved) —
  `supabase migration list` now shows 125 on Local + Remote
- Desk Accounts import via `/admin/migrate` — **NOT RUN** — needs a browser session as an
  admin user (`_from_zoho/desk-accounts.json` is present)
- Browser acceptance (sidebar collapse, tabs, search, pagination, both detail pages,
  role redirect) — **NOT RUN**

---

## Quality Gate Notes

### Result
PASS

### Standards Review

- **Pattern fidelity** — the list page (server component + `_contacts-index` client +
  `_contacts-table` split), scoped lookup Maps for FK-less relations
  (`contacts.external_account_id` → `accounts`), `.range()` + `{ count: "exact" }`
  pagination, and `.or(...ilike)` search with `%,()` escaping all mirror
  `desk/tickets/page.tsx` + `_tickets-index.tsx`. The import helper mirrors
  `importDeskTickets()` (conflict-key dedupe, `CHUNK_SIZE=50` chunked upsert,
  `[import/desk-accounts]` log prefix).
- **RLS** — `accounts` policies copied verbatim from `contacts` (migration 056):
  `get_my_role()` helper, no inline role logic. Import-route auth gate
  (`admin`/`super_admin`) matches the sibling `desk-tickets` / `desk-contacts` routes.
- **Types** — no `any`; `accounts` `Row`/`Insert`/`Update` + relationship added to
  `database.ts`; ticket-status values flow through the DB enum into
  `RelatedTicket.status`.
- **Cleanup applied during this gate** — removed an unused `createdAt` field from
  `RelatedTicket` (+ both detail-page mappers) and a speculative
  `metaStr("accountName")` fallback in the contact detail (contacts' `source_meta` never
  carries `accountName`).
- **No debug logging in production paths** — the import `console.log`s are server-side in
  a dev-only admin route and follow the existing `[import/desk-*]` convention.
- **Impeccable design-hook flags** on `v2-hub-sidebar.tsx` / `_zoho-desk-tab.tsx` /
  `_contacts-index.tsx` / `_detail-ui.tsx` / the detail pages are all literal hex colors
  and `text-[11/12/13/15px]` sizes that the Desk UI and the dark sidebar already use
  pervasively (CLAUDE.md: v2 uses explicit paired classes, not tokens). New code matches
  its siblings deliberately — not blocking.
- `npx tsc --noEmit` PASS · `pnpm lint` PASS (2 pre-existing unrelated warnings).

### Deviations

- **RLS roles** (Minor) — plan guessed `get_my_role() in ('admin','pm')`; implemented the
  exact `contacts` policy pair. More correct, no risk.
- **Sidebar state type** (Minor) — `Record<string, boolean>` instead of the plan's
  `Record<string, boolean | null>`; absent key = follow-route, same 3-state behaviour.
- **Contacts ordering** (Minor) — `last_name` then `first_name` (`nullsFirst: false`)
  rather than by display name, because `contacts.full_name` is `null` for every task-117
  Desk contact.
- **`accounts.source_meta`** (Minor) — stores the full raw Desk object (vs `contacts`,
  which stores a curated subset); forward-compat, ~small rows, matches the plan's
  "verbatim" note.
- **`loading.tsx`** (Minor) — one skeleton column-shape for both tabs (loading flash
  only; same approach as `desk/tickets/loading.tsx`).

No Medium or Major deviations.

### Required Fixes
- None.
