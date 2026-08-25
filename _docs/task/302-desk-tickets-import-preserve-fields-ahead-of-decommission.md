# 302: Fix Zoho Desk Tickets Import — Preserve Historical Fields Ahead of Zoho Decommission

**Created:** 2026-08-25
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

Task 296 built the Desk Tickets import (`src/app/api/admin/zoho-import/desk-tickets/route.ts`) against Zoho Desk API *documentation examples*, which showed tickets returning nested `contact: {..., account: {accountName}}`, `department: {id, name}`, `team: {id, name}`, and `assignee: {...}` objects. **This assumption was wrong against the real exported data.**

A field-by-field review of the actual `_from_zoho/desk-tickets.json` export (530 real tickets from the live portal) against `fetchAllDeskPages()` (`src/lib/zoho/desk.ts:29-60`, which calls `GET /tickets` with only `from`/`limit` — no `include` param to expand relations) confirms the real payload only ever contains **flat IDs**: `departmentId`, `teamId`, `contactId`, `assigneeId`, `accountId`. The nested `contact`/`department`/`team`/`assignee` objects the import code reads from never exist on any of the 530 real records.

Because the Hub is moving toward decommissioning Zoho entirely, this exported JSON (plus whatever lands in Supabase from it) will become the **only remaining historical record** of these tickets. Fields dropped now are gone forever — there's no re-export once Zoho access ends. This task fixes the import to capture what's actually recoverable from the real payload before that happens.

### Confirmed field presence across all 530 real records

| Field | Present / non-null | Currently captured? |
|---|---|---|
| `departmentId` | 530/530 non-null | **No** — code reads `ticket.department` (undefined) |
| `teamId` | 530/530 present, 0 non-null in this export | **No** — code reads `ticket.team` (undefined) |
| `accountId` | 94/530 non-null | Yes, written to `external_account_id` — but never used for a fallback match |
| `contact.account.accountName` (nested) | Never present (0/530) | Fallback match reads this — dead code |
| `createdTime` | 530/530 non-null | Only in `source_meta`, never written to `tickets.created_at` |
| `customerResponseTime` | 530/530 non-null | Only in `source_meta`, never written to `tickets.first_response_at` |
| `sentiment` (e.g. `"NEGATIVE"`) | 528/530 non-null | **No** |
| `phone` | 38/530 non-null | **No** |
| `isArchived` | 530/530 present | **No** |
| `lastThread` (`channel`/`isDraft`/`isForward`/`direction`) | 511/530 non-null | **No** |

Fields confirmed null/absent across all 530 records in the current export — **not in scope**, nothing to fix: `category`, `subCategory`, `language`, `productId`, `channelCode`, `responseDueDate`, `onholdTime`, `sharedCount`, `isRead`.

## Requirements

- [ ] `tickets.created_at` is set from the real `ticket.createdTime` on import/upsert, not left to the `now()` default.
- [ ] `tickets.first_response_at` is set from `ticket.customerResponseTime` on import.
- [ ] `source_meta` additionally captures: `departmentId`, `teamId`, `sentiment`, `phone`, `isArchived`, `lastThread` (raw object). Remove the dead `department`/`team`/`contact`/`assignee` object reads from `source_meta` since they never resolve to anything (keep `assigneeId`, which is a real flat ID and already correctly captured).
- [ ] The account-name fallback match is fixed to use data that actually exists: read `_from_zoho/desk-accounts.json` (same file the desk-contacts importer already reads) into an `accountId → accountName` map, and resolve `ticket.accountId` (already captured, 94/530 non-null) through it, then through `normalizeCompanyName()` against `customers.company_name` — mirroring the exact pattern in `src/app/api/admin/zoho-import/desk-contacts/route.ts:78-91`.
- [ ] `desk-accounts.json` being missing must **not** hard-fail the import (same graceful-degradation precedent as `desk-contacts/route.ts:81-86`) — log a `console.warn` and continue with contact-only matching.
- [ ] `DeskTicketRaw` type no longer implies `contact`/`department`/`team`/`assignee` are objects that reliably exist — either remove those unused nested-object fields from the type or mark them clearly as "documentation-only, not present in real exports" so a future maintainer doesn't reintroduce the same wrong assumption.
- [ ] Re-running the import stays idempotent (`upsert` on `external_id`, unchanged).

## Out of Scope / Must-Not-Change

- No new Supabase migration — every target column (`created_at`, `first_response_at`, `source_meta`, `external_account_id`) already exists per migration 025/114.
- `tickets.ticket_number` — still never written from Zoho's `ticketNumber` (unchanged `serial` precedent from task 296).
- The `contact`-based primary match path (`contactId` → `contacts.external_id` → `contacts.customer_id`) — unchanged, already correct.
- `mapPriority()` / `mapTicketStatus()` — unchanged, already correct against real `status`/`statusType`/`priority` values.
- The fields confirmed null/absent in the current export (`category`, `subCategory`, `language`, `productId`, `channelCode`, `responseDueDate`, `onholdTime`, `sharedCount`, `isRead`) — do not add handling for these speculatively; if a future export from a different portal populates them, handle it then.
- Desk Ticket Comments import (`desk-ticket-comments/route.ts`) — separate route, not touched by this task.
- The Desk Accounts export route itself, and the desk-contacts importer that already reads it — both already correct, used here only as a read-only reference pattern.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/admin/zoho-import/desk-tickets/route.ts` | Modify | Fix account-name fallback to use `desk-accounts.json` + `accountId`; set `created_at`/`first_response_at`; expand `source_meta`; correct `DeskTicketRaw` type. |

## Code Context

### Current state — `src/app/api/admin/zoho-import/desk-tickets/route.ts`

Type assumes nested objects that don't exist in real data:

```ts
type DeskTicketRaw = {
  // ...
  accountId?: string | number | null;
  email?: string | null;
  contact?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    account?: { id?: string | number; accountName?: string } | null;
    [key: string]: unknown;
  } | null;
  assigneeId?: string | number | null;
  assignee?: Record<string, unknown> | null;
  source?: Record<string, unknown> | null;
  [key: string]: unknown;
};
```

Dead fallback match (reads `ticket.contact?.account?.accountName`, which is always `undefined` against real data):

```ts
const accountId = ticket.accountId != null ? String(ticket.accountId) : (ticket.contact?.account?.id != null ? String(ticket.contact.account.id) : null);
const accountName = ticket.contact?.account?.accountName ?? null;

let customerId: string | null = null;
let matchMethod: "contact" | "account_name" | null = null;
if (contactId && customerIdByContactExternalId.has(contactId)) {
  customerId = customerIdByContactExternalId.get(contactId)!;
  matchMethod = "contact";
} else if (accountName) {
  const viaAccountName = customerByNormalizedName.get(normalizeCompanyName(accountName)) ?? null;
  if (viaAccountName) {
    customerId = viaAccountName;
    matchMethod = "account_name";
  }
}
```

`source_meta` currently reads fields that don't exist (`ticket.department`, `ticket.team`), always resolving to `null`, while real fields (`departmentId`, `teamId`, `sentiment`, `phone`, `isArchived`, `lastThread`) are dropped entirely:

```ts
source_meta: {
  ticketNumber: ticket.ticketNumber ?? null,
  statusType: ticket.statusType ?? null,
  channel: ticket.channel ?? null,
  channelCode: ticket.channelCode ?? null,
  department: ticket.department ?? null,   // always null — remove
  team: ticket.team ?? null,                // always null — remove
  source: ticket.source ?? null,
  isSpam: ticket.isSpam ?? null,
  isRead: ticket.isRead ?? null,
  threadCount: ticket.threadCount ?? null,
  commentCount: ticket.commentCount ?? null,
  webUrl: ticket.webUrl ?? null,
  language: ticket.language ?? null,
  productId: ticket.productId ?? null,
  responseDueDate: ticket.responseDueDate ?? null,
  onholdTime: ticket.onholdTime ?? null,
  sharedCount: ticket.sharedCount ?? null,
  customerResponseTime: ticket.customerResponseTime ?? null,
  createdTime: ticket.createdTime ?? null,
  contact: ticket.contact ?? null,          // always null — remove
  assigneeId: ticket.assigneeId ?? null,
  assignee: ticket.assignee ?? null,        // always null — remove
},
```

`TicketRow` type has no `created_at`/`first_response_at` fields, and the upsert never sets them — `tickets.created_at` (`default now()`) silently takes the import timestamp instead of the real historical date:

```ts
type TicketRow = {
  customer_id: string | null;
  subject: string;
  channel: "portal" | "email" | "manual";
  priority: "low" | "normal" | "high" | "critical";
  status: "new" | "open" | "waiting_on_client" | "waiting_on_us" | "resolved" | "closed";
  requester_email: string | null;
  sla_due_at: string | null;
  resolved_at: string | null;
  external_id: string;
  external_contact_id: string | null;
  external_account_id: string | null;
  match_method: "contact" | "account_name" | null;
  source_meta: Record<string, unknown>;
};
```

### Reference pattern — `src/app/api/admin/zoho-import/desk-contacts/route.ts:9-13,78-91`

The exact pattern to mirror for reading `desk-accounts.json` with graceful degradation:

```ts
type DeskAccountRaw = {
  id?: string | number;
  accountName?: string;
  [key: string]: unknown;
};

// ...

let deskAccounts: DeskAccountRaw[] = [];
try {
  deskAccounts = readFromZoho<DeskAccountRaw>("desk-accounts.json");
} catch {
  console.warn(
    "[import/desk-contacts] _from_zoho/desk-accounts.json not found — importing contacts unmatched " +
    "(run the Desk Accounts export for account-name matching; requires the Desk.accounts.READ scope)"
  );
}

const accountNameById = new Map<string, string>();
for (const a of deskAccounts) {
  if (a.id != null && a.accountName) accountNameById.set(String(a.id), a.accountName);
}
```

`readFromZoho<T>()` signature (`src/lib/migrate/zoho-import.ts:6`) — throws if the file is missing, hence the `try/catch` around it.

### Real raw record shape (from `_from_zoho/desk-tickets.json`, confirming the flat-ID structure)

```json
{
  "id": "300063000090673197",
  "accountId": null,
  "departmentId": "300063000000006907",
  "contactId": "300063000085409001",
  "assigneeId": "300063000000089033",
  "teamId": null,
  "sentiment": "NEGATIVE",
  "createdTime": "2026-08-24T20:57:16.000Z",
  "customerResponseTime": "2026-08-24T20:57:15.000Z",
  "isArchived": false,
  "lastThread": { "channel": "EMAIL", "isDraft": false, "isForward": false, "direction": "in" }
}
```

No `contact`, `department`, `team`, or `assignee` keys appear on this or any of the other 529 records.

## Implementation Steps

1. Update `DeskTicketRaw` to reflect the real payload shape — drop the nested `contact`/`department`/`team`/`assignee` object assumptions (or comment them as doc-only/unreliable), keep flat `accountId`/`departmentId`/`teamId`/`assigneeId`/`sentiment`/`phone`/`isArchived`/`lastThread` as typed fields.
2. Add the `desk-accounts.json` read (mirroring `desk-contacts/route.ts:78-91` exactly, including the `console.warn`-on-missing fallback) and build the `accountId → accountName` map.
3. Replace the dead `ticket.contact?.account?.accountName` fallback logic with: resolve `ticket.accountId` through `accountNameById`, then `normalizeCompanyName()` against `customerByNormalizedName` — same two-step resolution `desk-contacts` already does.
4. Extend `TicketRow` with `created_at: string | null` and `first_response_at: string | null`; populate both from `ticket.createdTime` / `ticket.customerResponseTime` when building each row.
5. Update the `source_meta` object: remove `department`, `team`, `contact`, `assignee` (all always-null dead reads); add `departmentId`, `teamId`, `sentiment`, `phone`, `isArchived`, `lastThread`.
6. Confirm the `adminClient.from("tickets").upsert(chunk, { onConflict: "external_id" })` call correctly writes the new `created_at`/`first_response_at` values (Supabase upsert writes all provided columns, so no special handling needed beyond including them in `TicketRow`).
7. Update the `console.log` summary line to also report accounts-map size, mirroring `desk-contacts`' `${deskAccounts.length} accounts` logging style.

## Acceptance Criteria

- [ ] Re-importing the existing `_from_zoho/desk-tickets.json` + `_from_zoho/desk-accounts.json` populates `tickets.created_at` with each ticket's real `createdTime` (not the import timestamp) and `tickets.first_response_at` with `customerResponseTime`.
- [ ] At least some of the 94 tickets with non-null `accountId` (that don't already match via `contactId`) now resolve via `match_method: "account_name"` using the fixed accountId → desk-accounts.json → customers path.
- [ ] `source_meta` on newly-imported/updated rows contains `departmentId`, `teamId`, `sentiment`, `phone`, `isArchived`, `lastThread` where present in the source data, and no longer contains the always-null `department`/`team`/`contact`/`assignee` keys.
- [ ] Import still succeeds and behaves the same (contact-only matching, no crash) when `_from_zoho/desk-accounts.json` is absent.
- [ ] Re-running the import is still idempotent — no duplicate rows, existing `external_id` rows get updated in place.
- [ ] `npx tsc --noEmit` passes.
- [ ] `pnpm lint` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual, admin-logged-in: run the Desk Tickets import against the existing `_from_zoho/desk-tickets.json` (530 records) with `_from_zoho/desk-accounts.json` present, then spot-check a handful of rows in Supabase for `created_at`, `first_response_at`, and the new `source_meta` keys. Re-run once more to confirm idempotency (no duplicate `external_id` rows, `matched`/`unmatched` counts stable or improved).

## Compatibility Touchpoints

- No schema/migration changes — all target columns already exist (migration 025 for `created_at`/`first_response_at`, migration 114 for `source_meta`/`external_account_id`).
- No changes to the export route, the Desk Ticket Comments import, or any UI in `_zoho-desk-tab.tsx` — this is an import-route-only data-fidelity fix.
- Does not affect `list_tickets` (MCP tool or ops AI chat tool) behavior beyond richer `source_meta` and more accurate `created_at`/`first_response_at`/`match_method` on affected rows.

## Implementation Notes

### What Changed
- `DeskTicketRaw` corrected to match the real Desk API payload shape: removed the `contact`/`department`/`team`/`assignee` nested-object fields (never present on any real ticket — confirmed against the export's full 530 records), added the real flat fields that were previously untyped/uncaptured: `isArchived`, `sentiment`, `phone`, `teamId`, `lastThread`.
- Added a `DeskAccountRaw` type and a `_from_zoho/desk-accounts.json` read (identical `readFromZoho` + `try/catch` + `console.warn`-on-missing pattern already used by `desk-contacts/route.ts`), building an `accountId → accountName` map.
- Account-name fallback match rewritten: resolves `ticket.accountId` (already-captured, previously unused for matching) through the new `accountNameById` map, then through `normalizeCompanyName()` against `customers.company_name` — replacing the dead `ticket.contact?.account?.accountName` read, which never resolved against real data (0/530 records ever had a `contact` object).
- `TicketRow` extended with `created_at` and `first_response_at`; both are now populated from `ticket.createdTime` / `ticket.customerResponseTime` on every upserted row, so historical ticket dates survive independently of Supabase's `now()` default.
- `source_meta` updated: removed the always-null `department`/`team`/`contact`/`assignee` object reads; added `departmentId`, `teamId`, `sentiment`, `phone`, `isArchived`, `lastThread` (all real, previously-dropped fields).
- `requester_email` fallback simplified from `ticket.email ?? ticket.contact?.email ?? null` to `ticket.email ?? null` — the `contact.email` fallback was dead code for the same structural reason as the account-name match.
- Log line now also reports the loaded accounts-map size, matching `desk-contacts`' logging style.

### Files Changed
- `src/app/api/admin/zoho-import/desk-tickets/route.ts` — all changes described above; no other files touched.

### Deviations From Plan
- `created_at` was typed as `string | undefined` rather than `string | null` as originally sketched in the task doc's Code Context — `tsc` caught that `tickets.created_at` is a `not null` column (Supabase's generated Insert type rejects `null` for it), so the value is now `ticket.createdTime ?? undefined` (omitting the key falls back to the column's `now()` default) instead of writing an explicit `null`, which would have failed the type check and, if bypassed, the DB's `not null` constraint. `first_response_at` is nullable, so `string | null` was fine as originally planned.

### Verification Run
- `npx tsc --noEmit` - PASS (zero errors)
- `pnpm lint` - PASS (0 errors; 2 pre-existing warnings in an unrelated file, untouched by this task)
- Offline sanity check against the real `_from_zoho/desk-tickets.json` (530 records) + `_from_zoho/desk-accounts.json` (6,143 records): confirmed all 94 tickets with a non-null `accountId` now resolve to a real account name via the new `accountNameById` map (0 resolved under the old logic, since `contact` never appears in any record).
- Manual, admin-logged-in run of the import against the live Supabase database — **SKIPPED**, per this project's established pattern of leaving live-data migration runs to the user (same precedent as task 296/293). The route is ready to run; someone needs to execute the Desk Tickets import via `/admin/migrate` and spot-check a few rows for `created_at`, `first_response_at`, and the new `source_meta` keys before this task can be marked fully verified.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Grepped the changed file for leftover references to the removed `ticket.contact`/`ticket.department`/`ticket.team`/`ticket.assignee` reads — none found. The only remaining `contact`/`department` matches are `ticket.contactId` and `ticket.departmentId` (legitimate flat-ID fields), confirming the dead nested-object reads were fully removed, not just partially.
- `DeskTicketRaw`'s field list matches exactly what's used downstream (row-building + `source_meta`) — no unused declared fields, no fields referenced that aren't declared.
- No new `any`/untyped escape hatches — the pre-existing `[key: string]: unknown` index signature on `DeskTicketRaw` is untouched, same convention as every sibling Zoho import route.
- Naming matches precedent exactly: `DeskAccountRaw`, `accountNameById` are copied verbatim (same names, same shape) from `desk-contacts/route.ts`, not reinvented.
- `console.warn`/`console.log`/`console.error` usage matches the established convention for these admin-only migration routes (same as `desk-contacts`, `issues`, `issue-comments`) — not debug logging left behind.
- No secrets, no dead code, no commented-out implementation.

### Deviations
- **Minor** — the `desk-accounts.json` read + `accountNameById`-building block (~15 lines) is now duplicated verbatim between `desk-contacts/route.ts` and this file, rather than extracted into a shared helper in `zoho-import.ts`. Accepted: the task doc's own Requirements explicitly called for "mirroring the exact pattern" rather than sharing it, consistent with this codebase's established precedent (task 296's Quality Gate Notes accepted the same kind of two-call-site duplication in the migrate-tab UI handlers on the same grounds — extracting a shared abstraction for two call sites is the premature abstraction the project's conventions warn against).
- **Minor** — `created_at` ended up typed `string | undefined` rather than `string | null` as the task doc's Code Context originally sketched, because Supabase's generated Insert type rejects `null` for the `not null` column. Already documented in Implementation Notes' Deviations From Plan with the exact reasoning; not a scope or behavior deviation, just a type-correctness adjustment caught by `tsc`.
- **Medium, user-visible** — the live Supabase import run and row spot-check called for in Acceptance Criteria/Verification were not executed; only an offline sanity check against the raw JSON files was run. Already flagged in Implementation Notes and reflected in `TASKS.md`. Same category of pre-existing, already-documented handoff gap as task 296 (which shipped through Testing with the identical caveat) — not a code-quality defect, the code is ready to run.

### Required Fixes
None — no Major deviations.
