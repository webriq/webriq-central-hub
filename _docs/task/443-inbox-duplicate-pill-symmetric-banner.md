# 443: Inbox list duplicate pill + symmetric duplicate banner (stage 0)

**Created:** 2026-10-08
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Task 441 added `source_meta.duplicateOf = { inboxId, ticketNumber }` and a detail-page banner ("Duplicate of the email ticket #n"). The Inbox **list** shows nothing, so duplicates are easy to work twice, and the banner wording assumes a Mail ticket. This is stage 0 of the StackShift direct-to-Hub rollout (design §6/§9): make duplicates visible in the list and make the banner correct for every pairing (Desk copy ↔ Mail ticket today; direct ↔ Desk copy once task 445 lands). Independent of the rest — ships first.

Part of the StackShift Support → Hub direct rollout: design `_docs/plan/stackshift-hub-direct-support-design.md`, contract `_docs/plan/stackshift-hub-support-api-contract.md`, hand-off `_docs/plan/stackshift-hub-support-handoff.md` (parent task 442).

## Requirements

- [ ] Inbox list rows show a small **Duplicate · #n** pill linking to the other ticket when `source_meta.duplicateOf` is present (lucide icon, no emoji; existing hex-token style of the table; visible hover state; `aria-label`).
- [ ] List query selects only the one JSON path it needs (e.g. `duplicate_of:source_meta->duplicateOf`) — **not** the whole `source_meta` (task 363 deliberately stopped selecting it); verify PostgREST accepts the alias on this table.
- [ ] Detail banner wording is symmetric and generic: "Duplicate of ticket #n" plus a qualifier from `duplicateOf.via` (`desk_ticket_id` → "same StackShift ticket", absent/heuristic → "same email conversation"); link target stays `/desk/inbox/<inboxId>`.
- [ ] `duplicateOf.via` is an optional field: absent on existing 441 data, which must still render correctly (no migration, no backfill).
- [ ] A row's pill never hides or reorders it.

## Out of Scope / Must-Not-Change

- No change to how `duplicateOf` is computed (poll/webhook logic is task 445). No new filter. No DB migration.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/desk/inbox/page.tsx` | Modify | Select `duplicate_of` JSON path; map into the list item |
| `src/app/(hub)/desk/inbox/_inbox-index.tsx` | Modify | Add `duplicateOf` to `TicketListItem` |
| `src/app/(hub)/desk/inbox/_inbox-table.tsx` | Modify | Render the pill in the subject cell |
| `src/app/(hub)/desk/inbox/[inboxId]/_ticket-detail.tsx` | Modify | Generic banner wording + `via` qualifier |
| `src/app/(hub)/desk/inbox/[inboxId]/page.tsx` | Modify | Pass `via` through `duplicateOf` |

## Code Context

`_inbox-table.tsx` subject cell (line ~75): `<span className="text-[13px] text-[#0B1533] truncate block" title={t.subject}>{t.subject}</span>` inside a `Link` — add the pill beside it without breaking `truncate`. List select today: `"id, subject, requester_email, external_contact_id, status, created_at, customers(company_name)"`. Detail banner added in task 441 in `_ticket-detail.tsx` under the `<h1>`; data built in `[inboxId]/page.tsx` from `t.source_meta?.duplicateOf`. The inbox UI uses hard-coded light hex tokens (no `isDark` here).

## Implementation Steps

1. Add `duplicate_of` to the list select and `TicketListItem`.
2. Render the pill; keep the row link behaviour.
3. Generalise the banner text and add the `via` qualifier; extend the type.
4. Check empty/absent data, long subjects, and a ticket that points at itself is impossible (guard).
5. `npx tsc --noEmit`, eslint, then browser-check #21086 and #21037.

## Acceptance Criteria

- [ ] Both #21086 and a Mail ticket show the pill in the list; clicking it opens the other ticket.
- [ ] Tickets without `duplicateOf` look unchanged.
- [ ] Banner reads correctly for a record with and without `via`.
- [ ] No new `any`, no `style={{}}`, `tsc` and eslint clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Browser: /desk/inbox — pill on #21086; detail banner on #21086
```

## Compatibility Touchpoints

No API/DB change. Task 441 data renders unchanged.

## Implementation Notes

### What Changed
- Inbox list rows now show an amber **Duplicate · #n** pill (lucide `Copy` icon, `aria-label` + title with the qualifier, hover/focus states) linking to the other ticket, next to the subject. The pill is a sibling of the subject link, not nested inside it, so there are no nested anchors and `truncate` still works.
- The list query selects only the JSON path via alias (`duplicate_of:source_meta->duplicateOf`), not all of `source_meta` (task 363 stopped selecting it).
- The detail banner is now generic ("Duplicate of ticket #n — {qualifier}; open it to see the other copy") and uses the same shared helper. Qualifier: `via === "desk_ticket_id"` → "same StackShift ticket", otherwise "same email conversation" (task-441 data has no `via`).
- New shared helper `_duplicate.ts` (`parseDuplicateOf`, `duplicateQualifier`); malformed JSON or a self-pointing record is treated as "not a duplicate".

### Files Changed
- `src/app/(hub)/desk/inbox/_duplicate.ts` (new) — parse + qualifier, shared by list and detail
- `src/app/(hub)/desk/inbox/page.tsx` — select alias, row type, map to `duplicateOf`
- `src/app/(hub)/desk/inbox/_inbox-index.tsx` — `TicketListItem.duplicateOf`
- `src/app/(hub)/desk/inbox/_inbox-table.tsx` — pill
- `src/app/(hub)/desk/inbox/[inboxId]/page.tsx` — use `parseDuplicateOf`
- `src/app/(hub)/desk/inbox/[inboxId]/_ticket-detail.tsx` — generic banner + type

### Deviations From Plan
- None. A shared helper file was added (the task listed only the existing files) so list and detail don't duplicate the parsing/wording.

### Verification Run
- `npx tsc --noEmit` - PASS
- `npx eslint "src/app/(hub)/desk/inbox"` - PASS
- Browser check of /desk/inbox and #21086 - SKIPPED (needs a live session). **Please confirm the list still loads**: the aliased JSON-path select (`duplicate_of:source_meta->duplicateOf`) is standard PostgREST syntax but was not run against the live DB, and this page ignores query errors (a bad select would show an empty list).

## Quality Gate Notes

### Result
PASS

### Standards Review
- Fixed during review: the detail banner's link was a plain `<a>` (full page load, copied from task 441); switched to the already-imported `next/link` `Link` for client-side navigation. The list page swallowed query errors silently, so a bad select would have shown an empty list with no trace; added a one-line `console.error` on `ticketsRes.error` (error logging, no behaviour change).
- `tsc` and eslint clean after both edits. No new `any`, no new `style={{}}` (the status select's existing inline style is untouched), no nested anchors, icon is lucide only, pill has `aria-label`, hover and focus-visible states.
- Shared helper `_duplicate.ts` has one responsibility and removes duplicated parsing/wording between list and detail.

### Deviations
- Minor: new shared helper file not in the task's file list (recorded in Implementation Notes).
- Minor: added the query-error log line to the list page (beyond the listed scope, but strictly diagnostic).
- Open (not a code issue): browser verification that the aliased `source_meta->duplicateOf` select loads against the live DB is still pending the user.

### Required Fixes
- None.
