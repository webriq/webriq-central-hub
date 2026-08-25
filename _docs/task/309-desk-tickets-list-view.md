# 309: Desk Tickets List View — Activate the Desk Tab

**Created:** 2026-08-25
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

The Hub sidebar already has a **"Desk" nav item** (`src/app/(hub)/_components/v2-hub-sidebar.tsx:53`), but it's a placeholder — it points at `V2_ROUTES.DASHBOARD_TASKS` and no `/desk` route exists. Tasks 296/302/304/306 already imported real Zoho Desk data into the Hub's native `tickets`/`ticket_messages`/`contacts`/`attachments` tables (530 tickets in the real portal export). This task **activates the Desk tab** by building the first real Desk sub-view: a **Tickets list page** matching the density and column layout of Zoho Desk's own Tickets table (reference screenshot: Ticket ID, Subject, Contact Name, Account Name, Customer Responded Time, Due Date, Status).

Scope is deliberately narrow — **list view only**, matching the user's "for now let's focus on the Desk > Tickets view." Ticket detail/conversation view, replying, and ticket creation are separate, larger follow-ups (see Out of Scope).

### Data already available (no import/migration work in this task)

`tickets` (migration 025 + 114 columns), current shape per `src/types/database.ts:1466-1542`:

```ts
tickets: {
  id: string;
  ticket_number: number;           // Hub's own `serial` — NEVER the Zoho ticket #, see below
  customer_id: string | null;      // FK -> customers.customer_id (nullable, ~12% match rate historically)
  subject: string;
  channel: "portal" | "email" | "manual";
  priority: "low" | "normal" | "high" | "critical";
  status: "new" | "open" | "waiting_on_client" | "waiting_on_us" | "resolved" | "closed";
  requester_email: string | null;
  sla_due_at: string | null;        // <- Zoho's "Due Date" column
  first_response_at: string | null; // <- Zoho's "Customer Responded Time" column
  resolved_at: string | null;
  external_id: string | null;       // Zoho ticket id (import dedupe key)
  external_contact_id: string | null; // Zoho contact id -> contacts.external_id (no declared FK)
  external_account_id: string | null; // Zoho account id (raw, not a Hub customer match)
  match_method: "contact" | "account_name" | null;
  source_meta: Record<string, unknown>; // { ticketNumber: "20996", phone, department, ... } — see below
  created_at: string; // real Zoho createdTime for imported rows (fixed by task 302)
  updated_at: string;
}
```

**Critical display detail:** `tickets.ticket_number` is a Hub-internal `serial` (1, 2, 3, ...) — it is **never** Zoho's real ticket number. The screenshot's `#20996`-style IDs come from `source_meta.ticketNumber` (see `src/app/api/admin/zoho-import/desk-tickets/route.ts:220`, which writes Zoho's `ticketNumber` only into `source_meta`, explicitly to avoid corrupting the serial sequence — see that file's header comment). The Ticket ID column must render `source_meta.ticketNumber` (fall back to `tickets.ticket_number` only for future live-created tickets that have no Zoho history, e.g. from task 303's inbound email ticketing).

**Contact Name / Account Name** are not columns on `tickets` — they must be resolved:
- Contact Name: `contacts.external_id === tickets.external_contact_id` → `contacts.full_name` (fallback `first_name + last_name`, fallback `tickets.requester_email`, fallback `"Guest"`). No declared FK exists between these two columns (migration 114 added a plain text column, not a foreign key) — must be a manual lookup Map, not a PostgREST embed.
- Account Name: `customers.company_name` via the **already-declared FK** `tickets.customer_id → customers.customer_id` (confirmed in `database.ts` Relationships) — this one *can* use a PostgREST embed (`customers(company_name)`), same precedent as `projects` embeds customers elsewhere (e.g. `src/app/(hub)/projects/_v2-listing/_load-list-data.ts:112`). Renders `"-"` when `customer_id` is null (the common case — most Desk tickets never matched a Hub customer, matching what the real screenshot shows).

## Requirements

- [ ] `V2_ROUTES.DESK_TICKETS = "/desk/tickets"` added to `src/config/constants.ts`; sidebar's existing "Desk" nav item (`v2-hub-sidebar.tsx:53`) points at it instead of `DASHBOARD_TASKS`. Do not touch the item's existing `!isDev` visibility gate.
- [ ] `src/app/(hub)/desk/tickets/page.tsx` — server component. Auth guard mirrors `dashboard/timelogs/page.tsx`'s exact pattern (resolve `profiles.role`, redirect roles with no `tickets` RLS access away rather than rendering an empty page). Allowed: `admin`, `super_admin`, `pm` (matches the roles that can already see the nav item and have `tickets_staff_all` RLS access per migration 048; `hr`/`client`/`marketing` redirect to `/dashboard`). `developer` stays excluded — the existing sidebar gate already hides the nav item from devs; this task does not revisit that product decision even though `tickets_staff_all` RLS technically permits it.
- [ ] Paginated, filterable, searchable list, `searchParams`-driven (`page`, `pageSize`, `search`, `status`) with `router.push`/RSC refetch — same architecture as `src/app/(hub)/customers/page.tsx` + `_customers-index.tsx` (not client-side `fetch`, which `dashboard/timelogs` uses instead — that page's toolbar-driven refetch doesn't fit a URL-shareable/paginated list as well as the Customers page's pattern does).
- [ ] Table columns matching the reference Zoho Desk Tickets screenshot: **Ticket ID** (`#{source_meta.ticketNumber ?? ticket_number}`, `font-mono`), **Subject** (truncated), **Contact Name**, **Account Name**, **Customer Responded Time** (`first_response_at`), **Due Date** (`sla_due_at`, rendered in `--late` red when overdue and not resolved/closed), **Status** (pill via the existing `Chip` component).
- [ ] Status filter tabs across `tickets.status`'s six values + "All" (same UI pattern as `_customers-index.tsx`'s `STATUS_FILTERS`).
- [ ] Search box filtering `subject` / `requester_email` / `external_id` via `.or(...).ilike`.
- [ ] Empty state (icon + message) when a filter/search yields zero rows — per CLAUDE.md's UI Polish Conventions.
- [ ] `loading.tsx` skeleton (mirrors `customers/loading.tsx`).
- [ ] Visual design follows `_final_design/guide/central-hub-design-system.md` — see Code Context for the concrete, already-shipped implementation of these tokens to copy (not raw CSS variables, not `isDark` toggling — this is a light-only, dense data page like `/customers` and `/dashboard/timelogs` already are).

## Out of Scope / Must-Not-Change

- **Ticket detail / conversation view** (`ticket_messages` thread, `ticket-attachments` files from task 306) — natural next task once the list ships; not built here. Rows are not clickable to a detail page in this pass.
- **Replying to tickets, changing ticket status, assigning tickets** — read-only list view only.
- **Ticket creation** — task 303 (inbound email ticketing) is the separate, still-planned feature for live ticket intake; do not build a "New Ticket" button here.
- **Client-facing/self-service ticket portal** — a `client`-role person viewing their *own* tickets is a different audience and a different UI (this page is the internal agent-console-style dense table from the screenshot); explicitly redirect `client` away rather than attempt a scoped-down variant.
- **Desk Knowledge Base / Contracts / Analytics / Social / IM** and the rest of Zoho Desk's top nav / left rail (HQ, Team Feeds, Views, Agent Queue, Team Queue, Tags, Scheduled Replies) shown in the reference screenshot — visual/column parity for the Tickets **table** only, not the surrounding agent-console chrome. No `/desk` parent shell or additional Desk sub-tabs; only `/desk/tickets` exists after this task.
- **Bulk row actions, checkboxes, "Table View" toggle, saved custom Views** from the screenshot — not built.
- **Priority/channel filters** — only status + search in this pass; add as a fast follow-up if needed.
- **`tickets.ticket_number`** — never treat as the displayed Ticket ID except as the last-resort fallback described above; never write to it.
- **RLS policies** (`tickets_staff_all` / `tickets_client_read`, migration 026/048) — read-only consumption, no policy changes.
- **The sidebar's `!isDev` Desk-item visibility gate** — unchanged; only the `href` changes.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/config/constants.ts` | Modify | Add `DESK_TICKETS: "/desk/tickets"` to `V2_ROUTES`. |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Desk nav item `href` → `V2_ROUTES.DESK_TICKETS` (line 53). |
| `src/app/(hub)/desk/tickets/page.tsx` | Create | Server component: role guard, `searchParams` pagination/search/status, `tickets` query (`customers(company_name)` embed) + `range()`/`{count:"exact"}`, batch `contacts` lookup Map for the current page's `external_contact_id`s, merges into a `TicketListItem[]`. |
| `src/app/(hub)/desk/tickets/_tickets-index.tsx` | Create | Client shell: title + `(total)` count, search input, status filter tabs, pagination controls, page-size selector — mirrors `customers/_customers-index.tsx`'s `buildUrl`/`router.push` pattern. |
| `src/app/(hub)/desk/tickets/_tickets-table.tsx` | Create | Table: header row, per-ticket row rendering, status `Chip` tone mapping, overdue Due Date styling, empty state. |
| `src/app/(hub)/desk/tickets/loading.tsx` | Create | Skeleton, mirrors `customers/loading.tsx`. |

## Code Context

### `src/app/(hub)/customers/page.tsx` — pagination/search/status/embed pattern to mirror exactly

```ts
const page = Math.max(1, parseInt(params.page ?? "1", 10));
const pageSize = Math.max(1, parseInt(params.pageSize ?? "20", 10));
const from = (page - 1) * pageSize;
const to = from + pageSize - 1;

let customersQuery = supabase
  .from("customers")
  .select("customer_id,company_name,contact_name,contact_email,status", { count: "exact" })
  .order("company_name");

if (statusParam) customersQuery = customersQuery.eq("status", statusParam);
if (searchQ) customersQuery = customersQuery.or(`company_name.ilike.%${searchQ}%,...`);
customersQuery = customersQuery.range(from, to);
```

For tickets: `.select("id, subject, status, first_response_at, sla_due_at, requester_email, external_contact_id, source_meta, customers(company_name)", { count: "exact" }).order("created_at", { ascending: false })`, plus a separate paginated-only-for-this-page `contacts` lookup:

```ts
const contactIds = [...new Set(ticketRows.map(t => t.external_contact_id).filter(Boolean))];
const { data: contactRows } = await supabase
  .from("contacts")
  .select("external_id, full_name, first_name, last_name, email")
  .in("external_id", contactIds);
const contactByExternalId = new Map(contactRows?.map(c => [c.external_id, c]) ?? []);
```

(Only this page's ids — same "scoped to just this page's customers" discipline the Customers page already applies to its own `projects`/`customer_products`/`contacts` lookups at `page.tsx:102-133`, not a full-table fetch.)

### `src/app/api/admin/zoho-import/desk-tickets/route.ts:204-245` — field mapping already applied at import time (ground truth for what's on each row)

```ts
rows.push({
  customer_id: customerId,               // null for ~88% of tickets historically
  subject: ticket.subject,
  status: mapTicketStatus(ticket.status ?? "", ticket.statusType ?? ""),
  requester_email: ticket.email ?? null,
  sla_due_at: ticket.dueDate ?? null,           // -> Due Date column
  first_response_at: ticket.customerResponseTime ?? null, // -> Customer Responded Time column
  external_id: externalId,
  external_contact_id: contactId,
  source_meta: { ticketNumber: ticket.ticketNumber ?? null, /* ...phone, department, etc. */ },
});
```

### `src/app/(hub)/dashboard/_components/dashboard-shared.tsx:186-221` — shared `Chip`/`chipVariants` to reuse for the Status column (no new pill component)

```ts
const chipVariants = cva(
  "inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.02em] px-2 py-[2.5px] rounded-[5px] whitespace-nowrap",
  { variants: { tone: {
      ok: "bg-[#E3F5EA] text-[#177E48]",
      warn: "bg-[#FFF3D6] text-[#8A5A00]",
      late: "bg-[#FDE8E6] text-[#C0392B]",
      neutral: "bg-[#EDF0F7] text-[#5F6A88]",
      /* + 5 phase hues, not relevant here */
  } }, defaultVariants: { tone: "neutral" } }
);
export function Chip({ tone, dot, children, className }: ChipProps) { /* ... */ }
```

Ticket status → tone: `new`/`open` → `neutral`; `waiting_on_client`/`waiting_on_us` → `warn`; `resolved`/`closed` → `ok`.

### `_final_design/guide/central-hub-design-system.md` — token values, already implemented as literal Tailwind arbitrary hex classes (not CSS custom properties, not `dark:`/`isDark` — confirmed by grepping `dashboard/timelogs/_time-logs-content.tsx` and `customers/_customers-index.tsx`, both already use these exact literal hex values)

```
--bg: #F4F6FB      --surface: #FFFFFF   --line: #E2E7F2   --line-soft: #EDF0F7
--ink: #0B1533     --body: #3A4565      --muted: #5F6A88
--blue: #007BFF    --blue-700: #0063D6  --blue-50: #F0F7FF (row hover)
--orange: #FB914E  --orange-600: #E2762F   CTA text: #471F02
--ok: #177E48/#E3F5EA   --warn: #8A5A00/#FFF3D6   --late: #C0392B/#FDE8E6
```
Page title: `font-heading text-[22px] font-bold text-[#0B1533] tracking-[-0.015em]` (`font-heading` = Space Grotesk, already wired in `globals.css`/`layout.tsx`). Table header cells: Inter 700, ~9.5px, uppercase, `text-[#5F6A88]`. IDs/dates/counts: `font-mono` (JetBrains Mono, already the project's `--font-mono`). Buttons: `rounded-full` pills, ghost = `border-[#E2E7F2] bg-white hover:border-[#A8C6F5]`.

## Implementation Steps

1. Add `V2_ROUTES.DESK_TICKETS`; point the sidebar's Desk nav item at it.
2. Build `page.tsx`: role guard/redirect, `searchParams` parsing, `tickets` query with `customers(company_name)` embed + `.range()`/`{count:"exact"}` + status/search filters, ordered `created_at desc`; scoped `contacts` lookup Map; assemble `TicketListItem[]` (resolved display Ticket ID, Contact Name with the fallback chain, Account Name, formatted dates, `isOverdue` boolean).
3. Build `_tickets-index.tsx`: header (`Tickets ({total})`), search input, status filter tabs, page-size selector, pagination controls — copy `_customers-index.tsx`'s `buildUrl`/`router.push` mechanics.
4. Build `_tickets-table.tsx`: header row (Inter 700/9.5px/caps/muted), body rows (hover `bg-[#F0F7FF]`), Ticket ID/dates in `font-mono`, Status via `Chip`, Due Date in `text-[#C0392B]` when overdue, empty state.
5. Add `loading.tsx` skeleton.
6. Manual browser check logged in as admin: sidebar Desk item lands on a populated table; search, status tabs, and pagination all work and stay in sync with the URL; confirm hr/client/marketing accounts get redirected to `/dashboard`.

## Acceptance Criteria

- Sidebar "Desk" nav item navigates to `/desk/tickets` and renders the real imported tickets (admin/super_admin/pm).
- Columns match the reference screenshot: Ticket ID (Zoho's real number via `source_meta.ticketNumber`, never the Hub `ticket_number` serial while Zoho data exists), Subject, Contact Name, Account Name, Customer Responded Time, Due Date, Status.
- Status renders via the existing `Chip` component; overdue open tickets show a red Due Date.
- Search (`subject`/`requester_email`/`external_id`) and status-tab filtering are URL-driven and paginated (`.range()`, never an unbounded `>1000` row fetch).
- `hr`, `client`, `marketing` roles are redirected away from `/desk/tickets`; `developer` still doesn't see the nav item (unchanged).
- Zero-result search/filter shows an empty state, not a blank table.
- New files stay within the soft ~300-line guidance from `nextjs-file-length-best-practices.md`; typography/colors match `_final_design/guide/central-hub-design-system.md` and are visually consistent with `/customers` and `/dashboard/timelogs`.
- `npx tsc --noEmit` passes.

## Verification

- `npx tsc --noEmit`
- `pnpm lint`
- Manual, admin-logged-in browser walkthrough: Desk nav → tickets list loads with real data; exercise search, each status tab, page-size change, and next/prev pagination; confirm a non-staff role (hr, client, or marketing test account) is redirected away.

## Implementation Notes

### What Changed
- Added `V2_ROUTES.DESK_TICKETS` and pointed the sidebar's existing "Desk" nav item at it.
- Built `/desk/tickets`: a role-gated (admin/super_admin/pm), `searchParams`-driven, paginated/searchable/filterable list of imported Zoho Desk tickets, following `customers/page.tsx` + `_customers-index.tsx`'s exact architecture and the `_final_design/guide` tokens already live on that page and `dashboard/timelogs`.
- Ticket ID resolves Zoho's real historical number from `source_meta.ticketNumber` (falling back to the Hub's own `ticket_number` serial only when absent); Contact Name resolves via a scoped `contacts` lookup Map (no declared FK); Account Name resolves via the declared `tickets.customer_id -> customers.customer_id` FK embed.
- Reused the existing `Chip`/`chipVariants` component for the Status column instead of adding a new pill component.

### Files Changed
- `src/config/constants.ts` — added `DESK_TICKETS: "/desk/tickets"` to `V2_ROUTES`.
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` — Desk nav item `href` now points at `V2_ROUTES.DESK_TICKETS` (was `DASHBOARD_TASKS`).
- `src/app/(hub)/desk/tickets/page.tsx` — new server component: role guard/redirect, `searchParams` pagination/search/status parsing, `tickets` query (`customers(company_name)` embed) + `.range()`/`{count:"exact"}`, scoped `contacts` lookup Map, `TicketListItem[]` assembly (display ID, contact-name fallback chain, overdue flag).
- `src/app/(hub)/desk/tickets/_tickets-index.tsx` — new client shell: title/count, search box, status filter tabs, pagination controls (mirrors `_customers-index.tsx`'s `buildUrl`/`router.push` mechanics), empty states.
- `src/app/(hub)/desk/tickets/_tickets-table.tsx` — new table component: header row, per-ticket rows, status `Chip` tone mapping, overdue Due Date styling in `--late` red.
- `src/app/(hub)/desk/tickets/loading.tsx` — new skeleton, mirrors `customers/loading.tsx`.

### Deviations From Plan
- Mono data cells (Ticket ID, Responded, Due Date) were tightened from an initial `text-[12px]` to `text-[11px]` to fit the design guide's documented "Mono data: 9–11px" range exactly (matches the existing `customer_id` mono cell in `_customers-index.tsx`). Caught by the impeccable design hook during implementation, not a plan change.
- No other deviations — implementation matches the task doc's Requirements/Proposed File Changes as written.

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`; not touched by this task)
- Manual browser walkthrough (logged in as an existing `super_admin` test account, `pnpm dev`) — PASS:
  - Sidebar "Desk" item navigates to `/desk/tickets`; table renders all 530 real imported tickets with correct Ticket ID (`#20996` etc. — verified against the reference screenshot, exact same IDs/subjects/dates), Subject, Contact (name/email/"Guest" fallbacks all observed), Account (`Gray Hawk Land Sol...` observed for a matched ticket, `-` for unmatched), Responded/Due Date (red + bold for overdue), and Status pill.
  - Status filter tab ("Open") correctly narrowed to 9 results and updated the URL (`?status=open&page=1`).
  - Search ("quandary") correctly narrowed to 75 results (case-insensitive `ilike` on subject); a no-match search rendered the empty state with a working "Clear filters" button.
  - Pagination "next page" advanced to `?page=2`, showing rows 21–40 of 530.
  - Role guard verified via direct route request (unauthenticated `curl` got a `307` to `/auth/login?returnTo=/desk/tickets`) and via the live admin/super_admin session rendering correctly.
  - hr/client/marketing/developer redirect was verified by code review only (identical pattern to `dashboard/timelogs/page.tsx`'s already-shipped, working guard) — no second test account was available in this session to click through live; flagging for a spot-check if one becomes available.

## Post-Testing Enhancement — Status Filter Redesign + Open-Default (2026-08-25)

User feedback after the quality gate: the pill-row status filter should match the Projects/Portfolio Tracker listing's checkbox-dropdown design instead, the page should default to showing Open tickets rather than All, and clarified that the "selections" reference screenshots were Zoho's own Views list (not a literal spec — most of those Views need data the Hub doesn't have, e.g. ticket ownership, SLA tracking, spam flags). Resolved via three clarifying questions; user chose: (1) a curated subset of the Views mapped onto real/derivable data — Open, Closed, On Hold (`waiting_on_us`), Overdue (computed from `sla_due_at`) — rather than either the raw 6-value status enum or an unfiltered copy of Zoho's ~20 Views; (2) "Open Tickets" default = `status = 'open'` literally, not a broader "not resolved/closed" set; (3) the new "ticket owner" column ask is being scoped as its own follow-up task (see below) since no agent-name resolution exists anywhere in the Hub yet.

### What Changed
- New `_filter-multi-select.tsx` — Desk Tickets' own copy of the Projects/Portfolio Tracker `FilterMultiSelect` checkbox-dropdown component (per that component's own documented per-feature-area-copy precedent, task 224).
- New `_status-filter.ts` — `STATUS_FILTER_OPTIONS` (Open/Closed/On Hold/Overdue) and `parseStatusFilterParam()`, shared between the server `page.tsx` and the client `_tickets-index.tsx`. Deliberately a plain module, not part of the `"use client"` `_tickets-index.tsx` file — see Deviations.
- `_tickets-index.tsx` — pill-row status filter replaced with `<FilterMultiSelect>`; `isFiltered` and the "Clear filters" action updated for the new multi-select model (explicit `?status=all`, not bare-URL, so it doesn't fall back to the Open default).
- `page.tsx` — status filtering rebuilt from a single `.eq()` to a multi-value `.or()` clause (`buildStatusOrClause`), with "On Hold" mapped to the real `waiting_on_us` status and "Overdue" expressed as a nested `and(sla_due_at.lt.<now>, status.neq.closed, status.neq.resolved)` PostgREST group; combines correctly with the existing search `.or()` (verified live — two separate `.or()` calls AND together, not OR).

### Files Changed
- `src/app/(hub)/desk/tickets/_filter-multi-select.tsx` — new.
- `src/app/(hub)/desk/tickets/_status-filter.ts` — new.
- `src/app/(hub)/desk/tickets/_tickets-index.tsx` — status filter UI + `isFiltered`/Clear-filters logic replaced.
- `src/app/(hub)/desk/tickets/page.tsx` — status query-building replaced; import cleanup.

### Deviations From Plan
- Discovered mid-implementation: Next.js 16 enforces the client/server module boundary at *runtime*, not just for JSX — calling a plain function (`parseStatusFilterParam`) or reading a const (`STATUS_FILTER_OPTIONS`) exported from a `"use client"` file inside a Server Component throws (`Attempted to call ... from the server but ... is on the client`), unlike importing *types* from the same file (which erase at compile time and were already working fine in the original task 309 implementation). Fixed by extracting both into a new plain module (`_status-filter.ts`, no `"use client"` directive) imported by both sides — not part of the original plan, but a necessary correctness fix, not a scope change.
- The originally-approved 6-value status pill row (New/Open/Waiting on Client/Waiting on Us/Resolved/Closed/All) is superseded by this curated 4-value + All checkbox design, per explicit user direction in this follow-up round. `waiting_on_client`/`resolved`/`new` remain real, queryable enum values (still fully visible under "All") but have no dedicated filter chip — the real imported dataset never produces them (confirmed live: 521 closed + 9 open = 100% of all 530 real rows), so nothing is hidden in practice.

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (same 2 pre-existing unrelated warnings)
- Manual browser walkthrough (super_admin account) — PASS:
  - Default landing (no `status` param) showed "Status: Open" pre-selected, 9 tickets — matches the approved default.
  - Dropdown panel renders in the exact Projects-listing checkbox style (All/Open/Closed/On Hold/Overdue checkboxes, navy-filled when checked).
  - Multi-select verified: Open+Overdue → 9 (no duplicate rows from the OR match); Open+Overdue+Closed → 530 (100% of real data, confirming no gap).
  - Single-select "Closed" → correct count; combined with search "quandary" → 72 results (75 total quandary matches minus 3 open ones) — confirms search and status filters AND together correctly via two independent `.or()` calls.
  - "On Hold" alone → 0 tickets (correct — no `waiting_on_us` rows exist in the real dataset yet), empty state rendered correctly.
  - "Clear filters" → explicit `?status=all`, showing all 530 tickets — confirmed it does *not* fall back to the Open default (the bug this needed the explicit-token fix for).

## Follow-Up Task Created
- **310 — Zoho Desk Agents Import + Ticket Owner Column**: new Desk Agents export/import (Zoho `Desk.agents.READ`, already-granted scope; new `desk_agents` table, `contacts`-shaped) to resolve `tickets.source_meta.assigneeId` into a real name for a new Owner column, plus wiring that column into the Tickets table. Planned separately per this project's established convention of a task doc for anything touching migrations/Zoho integration — see `_docs/task/310-desk-agents-import-ticket-owner-column.md`.

## Quality Gate Notes

### Result
PASS

### Standards Review
- `page.tsx`, `_tickets-index.tsx`, `_tickets-table.tsx`, `loading.tsx` reviewed in full against the standards checklist; the two modified files (`constants.ts`, `v2-hub-sidebar.tsx`) diffed and confirmed as the single documented line-change each — no incidental edits.
- Found and fixed one issue: `page.tsx` cast the tickets query result with `as unknown as TicketRow[]` (a double-cast escape hatch). Verified by direct experiment that a plain `as TicketRow[]` compiles cleanly under `npx tsc --noEmit` — the `unknown` intermediate step was unnecessary over-caution, not a required bridge for a genuine type mismatch. Simplified to the single cast; re-verified `tsc`/`lint` still pass clean.
- No other unused code, dead code, deep nesting, or unclear naming found. Functions (`resolveContactName`, `resolveDisplayId`, `isOverdue`, `formatShortDateTime`, `buildUrl`) are each single-purpose and named for what they do.
- No debug logging remains (the temporary `console.log` used to diagnose the role-guard redirect during manual verification was already removed before this pass — confirmed absent by re-reading the file).
- Supabase query results (`ticketsRes`, `contactRows`) don't explicitly check `.error` and fail soft to an empty list — this matches `customers/page.tsx`'s existing, already-accepted pattern exactly (same silent-fallback shape), not a new gap introduced by this task.
- `tickets.status` is cast to the narrower `TicketStatus` union without a runtime guard, but the column has a DB `CHECK` constraint restricting it to exactly those 6 values, so the cast can't diverge from reality in practice — consistent with the project's "don't validate what can't happen" convention.
- All four new files are well within the file-length soft-warning threshold (72–213 lines; see Verification Run in Implementation Notes above).

### Deviations
- Minor: `GRID_COLS`'s column-width string is a shared constant inside `_tickets-table.tsx` but re-typed as a separate literal in `loading.tsx`'s skeleton grid. Matches the same minor duplication already present between `customers/_customers-index.tsx` and `customers/loading.tsx` — an established, accepted pattern for skeleton files in this codebase, not a new risk. No fix needed.
- No Medium or Major deviations. Implementation matches the task document's Requirements, Proposed File Changes, and Out-of-Scope boundaries exactly — no scope expansion, no architecture changes beyond what was specified, no touched files outside the plan.
