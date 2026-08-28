# 330: Ticket Detail — Show Business Name & StackShift Site in Ticket Information

**Created:** 2026-08-28
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Task 329 captured the two populated Zoho Desk ticket custom fields into `tickets.source_meta`
— `whiteLabel` (from `cf_white_label`, 289 tickets — actually holds the client/business
name) and `stackShiftSite` (224). They are not shown anywhere yet.

Surface both in the ticket detail view's left **Ticket Properties** column, inside the
existing **Ticket Information** card (`_ticket-detail.tsx`). `source_meta.whiteLabel` is
shown under the label **"Business Name"** (the `whiteLabel` key name mirrors Zoho's slug;
the human label is "Business Name"). When `stackShiftSite` carries Zoho's unselected-picklist
placeholder text `"Select StackShift Site"` (leaked in as a literal value on some tickets,
e.g. #20564), render `-` instead.

## Requirements

- [ ] "Business Name" row in the **Ticket Information** card, showing `source_meta.whiteLabel`
      (or `-` when absent).
- [ ] "StackShift Site" row in the same card, showing `source_meta.stackShiftSite` (or `-`
      when absent).
- [ ] `stackShiftSite === "Select StackShift Site"` (trimmed, case-insensitive) is treated
      as empty → the row shows `-`.
- [ ] Normalization happens once, server-side in `page.tsx`, so `TicketDetailData` already
      carries clean `string | null` values and the component just does `?? "-"`.
- [ ] Rows always render (with `-` fallback), matching the card's Priority / Channel / SLA
      Due rows — not the conditional pattern used for "Zoho Ticket #".
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Out of Scope / Must-Not-Change

- No change to task 329's export/import contract — `source_meta.whiteLabel` /
  `.stackShiftSite` are already populated. This is display-only. (Task 329's own docs/copy
  were touched only to note the "Business Name" display label.)
- Do not rename the `source_meta.whiteLabel` key — it stays as Zoho's slug name; only the
  UI label is "Business Name".
- Do not add editing of these fields (read-only display).
- Do not filter the `"Select ..."` placeholder at import time — `source_meta.cf` and
  `source_meta.stackShiftSite` stay faithful to the source; the placeholder is handled only
  at render.
- Do not touch `whiteLabel` for placeholder handling — real data shows it is always a real
  value; only `stackShiftSite` leaks the placeholder.
- No new card, no layout/grid changes to the left column.
- Do not change the `v2` `isDark` theming approach — this page uses hard-coded hex tokens
  (`text-[#0B1533]`, `text-[#5F6A88]`, …); match that, do not introduce `isDark` or `dark:`.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/desk/tickets/[ticketId]/_ticket-detail.tsx` | Modify | Add `whiteLabel` + `stackShiftSite` to `TicketDetailData`; render two rows ("Business Name", "StackShift Site") in the Ticket Information card. |
| `src/app/(hub)/desk/tickets/[ticketId]/page.tsx` | Modify | Read + narrow `source_meta.whiteLabel` / `.stackShiftSite`, apply the `"Select StackShift Site"` → `null` rule, pass into `ticket`. |

## Code Context

### `_ticket-detail.tsx` — type

```ts
export type TicketDetailData = {
  // ...existing...
  zohoTicketNumber: string | null;
  whiteLabel: string | null; // Zoho cf_white_label — shown in the UI as "Business Name"
  stackShiftSite: string | null;
};
```

### `_ticket-detail.tsx` — Ticket Information card, after the "Channel" row

```tsx
<div>
  <div className="text-[11px] text-[#5F6A88] mb-0.5">Business Name</div>
  <div className="text-[#0B1533]">{ticket.whiteLabel ?? "-"}</div>
</div>
<div>
  <div className="text-[11px] text-[#5F6A88] mb-0.5">StackShift Site</div>
  <div className="text-[#0B1533]">{ticket.stackShiftSite ?? "-"}</div>
</div>
```

### `page.tsx` — module scope + building `ticket`

```ts
const STACKSHIFT_PLACEHOLDER = "select stackshift site"; // Zoho unselected-picklist text

function cfString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

// ...inside the handler, near phoneMeta / zohoNumberMeta:
const whiteLabel = cfString(t.source_meta?.whiteLabel);
const stackShiftRaw = cfString(t.source_meta?.stackShiftSite);
const stackShiftSite =
  stackShiftRaw && stackShiftRaw.toLowerCase() === STACKSHIFT_PLACEHOLDER ? null : stackShiftRaw;
```

Then add `whiteLabel` + `stackShiftSite` to the `ticket: TicketDetailData` literal.
`t.source_meta` is `Record<string, unknown> | null` → `t.source_meta?.whiteLabel` is
`unknown`; `cfString` is the narrow. `TicketDetailRow.source_meta` type needs no change.

## Implementation Steps

1. `_ticket-detail.tsx`: add `whiteLabel` / `stackShiftSite` (`string | null`) to
   `TicketDetailData`.
2. `_ticket-detail.tsx`: add the two rows to the **Ticket Information** card right after the
   Channel row, using the existing row markup, `?? "-"` fallback.
3. `page.tsx`: add `STACKSHIFT_PLACEHOLDER` + `cfString` at module scope, compute
   `whiteLabel` / `stackShiftSite`, add both to the `ticket` object.
4. `npx tsc --noEmit` && `pnpm lint`.
5. Browser check: a ticket with a real StackShift Site (#20899 → `jvpc-ikce`), one with the
   placeholder (#20564 → `-`), one with neither (both `-`).

## Acceptance Criteria

- [ ] Ticket Information card shows "Business Name" and "StackShift Site" rows on every ticket.
- [ ] #20899 shows Business Name `JVPC`, StackShift Site `jvpc-ikce`.
- [ ] #20564 shows Business Name `WSC Group`, StackShift Site `-` (placeholder suppressed).
- [ ] A ticket with no `cf` (e.g. an archived-import row) shows `-` for both, no crash.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Browser: /desk/tickets/TKT-20899, TKT-20564, and one archived-import ticket
```

## Compatibility Touchpoints

- Display-only; no DB, API, migration, or env changes.
- Depends on task 329's import having run (populates `source_meta.whiteLabel` /
  `.stackShiftSite`). Tickets imported before that show `-` until re-imported — acceptable,
  not a regression.

## Implementation Notes

### What Changed
- `_ticket-detail.tsx`: `TicketDetailData` gains `whiteLabel` / `stackShiftSite`
  (`string | null`); two rows added to the **Ticket Information** card right after the
  Channel row — **"Business Name"** (renders `ticket.whiteLabel`) and **"StackShift Site"**
  (renders `ticket.stackShiftSite`) — using the card's existing row markup, `?? "-"`
  fallback, always rendered.
- `page.tsx`: module-scope `STACKSHIFT_PLACEHOLDER` const + `cfString()` narrowing helper;
  reads `source_meta.whiteLabel` / `.stackShiftSite`, nulls `stackShiftSite` when it
  case-insensitively equals `"select stackshift site"`, passes both into `ticket`.

### Deviations From Plan
- **UI label.** `source_meta.whiteLabel` (Zoho's `cf_white_label` slug) is displayed under
  the human label **"Business Name"** per user direction — the slug is a misnomer, the value
  is the client/business name ("Quandary Consulting Group", "JVPC", …). The `source_meta`
  key and the `TicketDetailData` field both stay named `whiteLabel`; only the visible label
  differs. (An earlier pass in this session briefly renamed the data key to `businessName`
  across task 329 too, then reverted on user clarification — net: task 329's `whiteLabel`
  key is unchanged; task 329 docs/`desc` copy + the CLAUDE.md bullet only gained a note that
  the UI label is "Business Name".)

### Files Changed
- `src/app/(hub)/desk/tickets/[ticketId]/_ticket-detail.tsx` — type + two display rows.
- `src/app/(hub)/desk/tickets/[ticketId]/page.tsx` — `cfString` helper, `STACKSHIFT_PLACEHOLDER`,
  placeholder rule, `ticket` fields.
- `src/lib/migrate/desk-tickets-import.ts` (task 329) — comment note that `whiteLabel` shows
  as "Business Name"; `CF_TARGETS` unchanged (`{ whiteLabel, stackShiftSite }`).
- `src/app/(hub)/admin/migrate/_zoho-desk-tab.tsx` (task 329) — `desc` copy unchanged from
  its post-testing state (still "White Label" in the export step description).
- `CLAUDE.md` (task 329) — `source_meta` bullet gained the "shown as Business Name" note.

### Verification Run
- `npx tsc --noEmit` — PASS (clean).
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in an unrelated file
  `projects/v2/[projectId]/onboarding-workspace/_checklist-tab.tsx`).
- impeccable design hook flagged pre-existing `design-system-font-size` (`text-[NNpx]`)
  findings on `_ticket-detail.tsx` — the file's established convention (hard-coded hex +
  `text-[NNpx]` throughout, tasks 320/323/324); new rows copy the sibling row markup
  verbatim. Not changed, not suppressed.
- Browser check NOT run in this session (needs the dev server). `source_meta.whiteLabel` /
  `.stackShiftSite` are already populated from task 329's import run, so no re-import is
  needed. Verify on `TKT-20899` (Business Name `JVPC`, StackShift Site `jvpc-ikce`),
  `TKT-20564` (StackShift Site `-`), and an archived-import ticket (both `-`).

## Quality Gate Notes

### Result
PASS

### Standards Review
- **`_ticket-detail.tsx`**: two new rows copy the sibling row markup in the same card
  exactly (Priority / Channel / SLA); `?? "-"` fallback matches the file's `formatDateTime`
  null convention. `TicketDetailData.whiteLabel` carries an inline comment explaining the
  "Business Name" label. Clean.
- **`page.tsx`**: `cfString()` returns `string | null` (not `any`) — a reasonable
  generalization of the file's existing `typeof … === "string" ? … : null` narrowing for
  `phoneMeta` / `zohoNumberMeta`, adding trim + empty-string handling. `STACKSHIFT_PLACEHOLDER`
  is a lowercase module const compared via `.toLowerCase()`. The placeholder ternary is a
  single expression, no nesting. No secrets, no debug logging.
- **`desk-tickets-import.ts` / `_zoho-desk-tab.tsx` / `CLAUDE.md`**: comment/copy only this
  turn — `CF_TARGETS` and `source_meta` output are byte-identical to task 329's
  post-testing (gate-passed) state. A stray "Task 326:" comment line-break introduced during
  the edits was folded back.
- `normalizeCfKey`'s `/[^a-z0-9]/gi` remains slightly subtle (carried over from task 329,
  already noted there) — not blocking.
- No blocking issues.

### Deviations
- **Minor — field name vs. label.** `source_meta.whiteLabel` / `TicketDetailData.whiteLabel`
  keep Zoho's slug name; the visible label is **"Business Name"** per explicit user
  direction. Documented with an inline comment and in the task doc.
- **Minor — task-329 files touched.** `desk-tickets-import.ts`, `_zoho-desk-tab.tsx`,
  `CLAUDE.md` received comment/copy notes that `whiteLabel` displays as "Business Name". No
  behavior change; task 329 needs no re-verification.
- **Implementation churn (not a final-artifact deviation).** The data key was briefly
  renamed `whiteLabel` → `businessName` across tasks 329 + 330 mid-session, then fully
  reverted on user clarification ("whiteLabel on source_meta will be displayed as Business
  Name"). Net diff is clean; `grep businessName src/` returns nothing.

### Required Fixes
- None.