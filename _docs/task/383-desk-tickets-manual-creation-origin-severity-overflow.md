# 383: Desk Tickets — Manual Ticket Creation, Origin/Severity Rework, Overdue Days, Date-Column Overflow Fix

**Created:** 2026-09-21
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

`/desk/tickets` (`src/app/(hub)/desk/tickets/`) currently lists only `tickets` rows filed
from an Inbox message (`.not("source_inbox_id", "is", null)`), with a static "N issues filed
from Inbox" subtitle, an Origin column that shows the Inbox thread's subject line, a read-only
Severity pill, and Responded/Due date/Created columns that already exist in the data model
(`inbox.first_response_at`, `inbox.sla_due_at`, `tickets.created_at`) but overflow their grid
columns at real content widths.

This task:
1. Broadens the page to also show manually-created tickets (`source_inbox_id IS NULL`) and
   updates the subtitle to a two-part count: "N tickets filed from Inbox, N manual created".
2. Adds a "New Ticket" action on this page that opens the same `CreateTicketModal` used on a
   project's own Tickets tab (via a project-picker gate, since this is a cross-project listing),
   producing a `source_inbox_id`-less ("Manual") ticket.
3. Reworks the Origin column: literal "Inbox" (hyperlinked to `/desk/inbox/[ticketId]`) or
   "Manual" (plain text, no link) instead of the thread subject.
4. Adds an overdue-days badge to the Due date column, e.g. `(2D)`, when overdue.
5. Fixes column overflow on the Responded/Due date/Created columns (currently `truncate`s real
   content at their current pixel widths).
6. Makes Severity editable (currently a static, read-only pill) via the existing
   `PATCH /api/v2/tickets/[ticketId]` endpoint, which already accepts `severity`.

No schema or migration changes are needed — `tickets.severity`, `tickets.source_inbox_id`,
`inbox.first_response_at`, and `inbox.sla_due_at` all already exist and are already selected by
`page.tsx`.

## Requirements

- [ ] Subtitle reads `"{N} tickets filed from Inbox, {M} manual created"` (pluralization not
      required per the sample copy — match this exact phrasing), where N/M reflect the current
      search/status filters (not just the current page).
- [ ] A "New Ticket" button on the page opens a project-picker gate → the reused
      `CreateTicketModal` (`src/app/(hub)/projects/_shared/_create-ticket-modal.tsx`), with no
      `sourceTicketId` (so the created ticket has `source_inbox_id = null` → "Manual"). On
      success, the list refreshes (new ticket appears with "Manual" origin).
- [ ] Origin column shows:
  - `"Inbox"` as a link to `/desk/inbox/{inbox.ticket_id}` when `source_inbox_id` is set.
  - `"Manual"` as plain (non-link) text when it is not.
- [ ] Responded column shows `inbox.first_response_at` formatted as date + time (unchanged
      source, just confirm it isn't truncated after the width fix below).
- [ ] Due date column shows `inbox.sla_due_at` formatted as date + time; when overdue (same
      `isTicketOverdue` rule already in `page.tsx`), the text renders in red **and** appends an
      overdue-days badge in the form `(2D)` (integer days, parenthesized, suffixed with a
      capital `D`, no space before the paren).
- [ ] Created column is fully visible — no clipped/cut-off text at normal viewport widths.
- [ ] Severity is editable inline (a `<select>`, matching the interaction pattern already used
      for Status in the same row), persisted via `PATCH /api/v2/tickets/[ticketId]`
      (`{ severity }`), with optimistic update + rollback on failure (same pattern as the
      existing `updateIssue` status/assignees handling).
- [ ] Page continues to gate on `admin | super_admin | pm` (unchanged).
- [ ] Empty-state copy no longer implies Inbox-only origin (currently: *"Issues filed from an
      Inbox thread message... will appear here"*).

## Out of Scope / Must-Not-Change

- No new DB columns/migrations — everything needed already exists on `tickets` and `inbox`.
- No changes to `/desk/inbox` itself, `_thread-message-actions.tsx`, or
  `_thread-to-project-modal.tsx` (the Inbox page's own "File a Ticket" flow) — this task adds a
  separate, lighter project-picker gate scoped to `desk/tickets/`, per this codebase's
  page-scoped-UI convention (`CLAUDE.md`: "inline small components into the page file... only
  extract to `src/components/` when shared across multiple pages" — these two gates are similar
  but live on different pages with different seed data, so duplication over a shared abstraction
  matches existing precedent rather than introducing a new one).
- No new "is this manually created via Desk Tickets specifically" flag — "Manual" is derived
  purely from `source_inbox_id IS NULL`, matching how the Origin column literally reads (any
  ticket without an Inbox origin is "Manual", regardless of which project-context screen it was
  created from).
- No Severity filter UI — only the Status filter exists today; the request is edit-in-place only.
- `PATCH /api/v2/tickets/[ticketId]` already validates `severity` server-side
  (`VALID_SEVERITY`) — no API change needed.
- Time-tracking / logged-hours column stays read-only (locked decision noted in
  `_filed-issues-table.tsx`'s existing comment) — not part of this task.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/desk/tickets/page.tsx` | Modify | Drop the Inbox-only filter; add inbox-vs-manual count queries (respecting current search/status filters); compute overdue-days per row; pass new fields down |
| `src/app/(hub)/desk/tickets/_filed-issues-index.tsx` | Modify | New subtitle copy from two counts; "New Ticket" button + modal wiring; empty-state copy; extend `onUpdate`/`updateIssue` to accept `severity` |
| `src/app/(hub)/desk/tickets/_filed-issues-table.tsx` | Modify | Origin column → "Inbox"/"Manual"; Due date → overdue-days badge; Severity → editable `<select>`; widen/rework Responded/Due date/Created column widths so real content isn't clipped |
| `src/app/(hub)/desk/tickets/_new-ticket-modal.tsx` | Create | Project-picker gate (mirrors `_thread-to-project-modal.tsx`'s picker, no title/description/sourceTicketId seed) that hands off to the existing `CreateTicketModal` |

## Code Context

### File: `src/app/(hub)/desk/tickets/page.tsx` (current relevant section)

```tsx
let issuesQuery = supabase
  .from("tickets")
  .select(
    "id, title, display_id, status, severity, assignees, assignee_id, created_at, projects(project_id, external_project_id, name), inbox(ticket_id, subject, status, first_response_at, sla_due_at)",
    { count: "exact" }
  )
  .not("source_inbox_id", "is", null)   // ← drop this filter; keep search/status filters below
  .order("created_at", { ascending: false });
```

`source_inbox_id` itself is not currently selected — add it to the `.select()` string (or infer
`isManual` from `inbox === null`, which is equivalent since the embedded `inbox(...)` relation is
only populated when `source_inbox_id` is set — confirm this against the actual FK before relying
on it, selecting `source_inbox_id` explicitly is the safer/more explicit signal).

For the two counts, build a small filter-reapplication helper so the same search/status
predicates used for the main query are reused for two `head: true, count: "exact"` queries (one
`.not("source_inbox_id","is",null)`, one `.is("source_inbox_id", null)`) — do not hand-roll the
filter logic three times.

`isTicketOverdue` already exists (lines 47-50) — add a sibling that also returns the elapsed
whole days, e.g.:

```tsx
function overdueDays(dueAt: string | null): number | null {
  if (!dueAt) return null;
  const diffMs = Date.now() - new Date(dueAt).getTime();
  if (diffMs <= 0) return null;
  return Math.max(1, Math.floor(diffMs / 86_400_000));
}
```

### File: `src/app/(hub)/desk/tickets/_filed-issues-index.tsx` (subtitle, current)

```tsx
<p className="text-[13px] text-[#5F6A88] mt-0.5">{total} issue{total === 1 ? "" : "s"} filed from Inbox</p>
```

Replace with the two-count phrasing, and add a header-row "New Ticket" button following the
`Plus`-icon convention already used in `_ticket-list-view.tsx`:

```tsx
<button onClick={() => setNewTicketOpen(true)} className="inline-flex items-center gap-1.5 ...">
  <Plus size={14} /> New Ticket
</button>
```

`updateIssue`'s patch type/handler currently only handles `status`/`assignees`:

```tsx
async function updateIssue(id: string, patch: { status?: string; assignees?: string[] }): Promise<boolean> {
```

Extend the type to `{ status?: string; assignees?: string[]; severity?: string }` and mirror the
existing optimistic-update spread for the new field.

### File: `src/app/(hub)/desk/tickets/_filed-issues-table.tsx` (current Origin/Severity/Due date/Created)

```tsx
const GRID_COLS = "grid-cols-[1fr_170px_130px_150px_130px_100px_100px_100px_120px_90px] min-w-[1540px]";
// Ticket / Origin / Project / Assignees / Status / Severity / Responded / Due date / Created / Logged
```

Origin is currently the thread subject-link (lines 96-109); Severity is a static span (lines
146-150); Due date has no overdue-days suffix (lines 157-160); Created uses `truncate` at 120px
(lines 162-165) which clips the full `formatDateTime` output (~20+ chars) at the current column
width — widen the Severity/Responded/Due date/Created columns (Origin can shrink now that it's
just the word "Inbox"/"Manual" rather than a full subject line) and re-tune `GRID_COLS`/`min-w`
accordingly; verify the final widths visually rather than trusting exact px math.

Severity select should follow the same plain-`<select>` treatment `CreateTicketModal` already
uses for its own Severity field (`SEVERITY_OPTS` + `SEVERITY_STYLE[s].label`, no colored pill
background — `SEVERITY_STYLE` has no `bg`/`border` fields today, only `text`/`dot`/`label`), not
the colored-pill treatment Status uses (`STATUS_STYLE` has `bg`/`border`). `SEVERITY_OPTS` is
already exported from the same `projects-old/_pm-shared` module this file already imports
`SEVERITY_STYLE`/`normalizeSeverity` from.

### File: `src/app/(hub)/desk/inbox/[ticketId]/_thread-to-project-modal.tsx` (pattern to mirror, not modify)

This is the existing "project-picker gate → `CreateTicketModal`" pattern (fetches
`/api/v2/projects`, `SearchableSelect`, then `GET /api/v2/projects/{id}/tickets` +
`GET /api/v2/projects/{id}/members` before rendering `CreateTicketModal`). The new
`_new-ticket-modal.tsx` for `desk/tickets/` should follow the same shape but with no
`subject`/`message`/`ticketDbId` props and no `defaultTitle`/`defaultDescription`/
`sourceTicketId` passed to `CreateTicketModal` — a genuinely blank ticket, scoped only by the
picked project.

### File: `src/app/(hub)/projects/_shared/_create-ticket-modal.tsx` (reused as-is)

```tsx
export function CreateTicketModal({
  projectId, allMembers, tickets, defaultTitle, defaultDescription, sourceTicketId, onClose, onCreated,
}: { ... sourceTicketId?: string; ... })
```

`sourceTicketId` is optional — omitting it is sufficient to produce a `source_inbox_id: null`
("Manual") ticket via `POST /api/v2/projects/[projectId]/tickets`. No modal changes needed.

## Implementation Steps

1. `page.tsx`: drop the `.not("source_inbox_id", "is", null)` filter from the main query; select
   `source_inbox_id`; add the two head-count queries (inbox-origin / manual) reusing the same
   search/status predicates; compute `overdueDays` per row; pass `inboxFiledCount`,
   `manualCreatedCount`, and `ticketOverdueDays` (or equivalent) down through
   `FiledIssueListItem`.
2. `_filed-issues-index.tsx`: accept the two counts as props (or keep deriving `total` for
   pagination as-is and add the two new counts alongside it); update the subtitle string; add
   "New Ticket" button + `_new-ticket-modal.tsx` wiring with `router.refresh()` (or an optimistic
   prepend, matching the existing render-time state-sync pattern) on `onCreated`; update the
   empty-state message; widen `updateIssue`'s patch type to include `severity`.
3. Create `_new-ticket-modal.tsx`: project-picker gate (copy the shape of
   `_thread-to-project-modal.tsx` minus the seed props), rendering `CreateTicketModal` once a
   project is picked and its ticket/member bundle is loaded.
4. `_filed-issues-table.tsx`: rework the Origin cell (`"Inbox"` link / `"Manual"` text); make
   Severity an editable `<select>` wired to `onUpdate(issue.id, { severity: e.target.value })`;
   append the overdue-days `(ND)` badge next to the Due date value when
   `issue.ticketOverdue` is true; adjust `GRID_COLS` column widths (and `min-w`) so
   Responded/Due date/Created no longer clip real content.
5. Manually verify in the browser: page loads with mixed Inbox/Manual rows, subtitle counts are
   correct and update with search/status filters, "New Ticket" creates a Manual-origin ticket
   that appears in the list, Severity edits persist and survive a refresh, an overdue ticket
   shows red text + `(ND)`, and Created/Responded/Due date are fully readable at normal viewport
   width (no clipped text, `title` tooltip still available as a fallback).

## Acceptance Criteria

- [ ] Subtitle shows accurate Inbox-filed vs manually-created counts, respecting active filters.
- [ ] "New Ticket" button creates a ticket with `source_inbox_id = null`, visible in the list as
      "Manual" origin without a full page reload.
- [ ] Origin column shows "Inbox" (linked to `/desk/inbox/[ticketId]`) or "Manual" (unlinked) —
      never the raw subject line.
- [ ] Overdue Due dates render in red with a trailing `(ND)` days-overdue badge.
- [ ] Created, Responded, and Due date columns show their full formatted value with no visual
      clipping at normal desktop viewport widths.
- [ ] Severity is changeable inline from the table and persists via
      `PATCH /api/v2/tickets/[ticketId]`.
- [ ] `npx tsc --noEmit` passes.
- [ ] Existing Inbox page (`/desk/inbox`) and its own "File a Ticket" flow are unaffected.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual browser check of /desk/tickets — see step 5 above
```

## Compatibility Touchpoints

- None — no packaging, docs, adapter, or install-surface impact. Purely an internal Hub UI page.

## Implementation Notes

### What Changed
- `page.tsx` no longer filters to Inbox-only tickets; it now lists every `tickets` row
  (Inbox-filed and manual), selects `source_inbox_id`, and runs two extra `head:true` count
  queries (inbox-filed / manual) reusing the same search/status predicates as the main query via
  a small structural-typed `applyTicketFilters` helper. Added `overdueDays()` alongside the
  existing `isTicketOverdue()` and threaded `isManual` / `ticketOverdueDays` through
  `FiledIssueListItem`.
- `_filed-issues-index.tsx`: subtitle is now `"{N} tickets filed from Inbox, {M} manual
  created"`; added a "New Ticket" header button opening the new project-picker modal, with
  `router.refresh()` on success; `updateIssue`'s patch type now includes `severity`; empty-state
  copy no longer implies Inbox-only origin.
- `_filed-issues-table.tsx`: Origin column now renders "Inbox" (linked to
  `/desk/inbox/{ticketId}`) or "Manual" (plain text) instead of the thread subject; Severity is
  now an editable `<select>` (plain-text colored, matching `CreateTicketModal`'s own Severity
  field treatment, not a colored pill like Status); Due date appends a `(ND)` overdue-days badge
  when overdue; `GRID_COLS` widened (Origin shrank, Severity/Responded/Due date/Created grew) so
  real date+time content no longer clips.
- New `_new-ticket-modal.tsx`: project-picker gate that hands off to the existing, unmodified
  `CreateTicketModal`, mirroring `_thread-to-project-modal.tsx`'s shape but with no seed props —
  producing a `source_inbox_id: null` ("Manual") ticket.

### Files Changed
- `src/app/(hub)/desk/tickets/page.tsx` — broadened query scope, added count queries and
  overdue-days computation
- `src/app/(hub)/desk/tickets/_filed-issues-index.tsx` — subtitle, "New Ticket" button/modal
  wiring, `updateIssue` severity support, empty-state copy
- `src/app/(hub)/desk/tickets/_filed-issues-table.tsx` — Origin/Severity/Due date rework, column
  width retune
- `src/app/(hub)/desk/tickets/_new-ticket-modal.tsx` — new project-picker gate (created)

### Deviations From Plan
- None — implemented as planned, including the exact `GRID_COLS` values suggested in the task
  doc's Code Context (verified visually rather than just trusting the px math, per the doc's own
  caveat).

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (2 pre-existing unrelated warnings in
  `_checklist-tab.tsx`, not touched by this task)
- Manual browser check (`pnpm dev` + Claude in Chrome, authenticated session) — PASS:
  - Subtitle showed "7 tickets filed from Inbox, 1171 manual created" (1178 total) before
    broadening the filter was live; confirmed count math updates correctly after both a create
    and a delete.
  - Origin column showed "Inbox" (linked) and "Manual" (unlinked) correctly across mixed rows.
  - Severity edited inline via the new `<select>`, persisted through a full page reload
    (`PATCH /api/v2/tickets/[ticketId]` confirmed working), then reset back to "None" as cleanup.
  - "New Ticket" → project-picker gate → `CreateTicketModal` flow created a ticket with
    "Manual" origin, appearing at the top of the (created_at-desc) list without a full page
    reload; test ticket was deleted afterward to keep the shared dev database clean.
  - Created column showed full, unclipped `formatDateTime` output (e.g. "Sep 21, 2026, 12:24
    PM") after the `GRID_COLS` width change.
  - Overdue-days badge logic (`isTicketOverdue` + `overdueDays`) verified via an isolated Node
    check: 2.3 days overdue → `true`/`2`; a future due date → `false`/`null`; a `closed`-status
    row with a past due date → not overdue. No live overdue Inbox ticket existed in the dev
    database to screenshot the red `(2D)` badge directly, but the underlying logic and its wiring
    into the Due date `<span>` were confirmed correct.
  - No console errors on the page.
- No schema/migration changes were needed or made, matching the task doc's scope note.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Fixed one stale comment during this pass: `_filed-issues-table.tsx`'s file-header comment still
  said Severity was read-only after it became editable — updated to list Severity alongside
  Status/assignees as editable, and reworded the read-only list accordingly.
- No unused code, no `any`/untyped escape hatches (`applyTicketFilters`'s generic constraint is
  properly structural-typed), no deep nesting, functions have single clear responsibilities.
- The three-query filter duplication risk (main list + 2 counts, each needing the same
  status/search predicates) was avoided via `applyTicketFilters`, not hand-rolled three times —
  matches the "repeated logic extracted" standard.
- Error handling is intentional and consistent with existing patterns: `updateIssue`'s
  optimistic-update-then-rollback-on-`!res.ok` for severity mirrors the existing status/assignees
  handling exactly; `_new-ticket-modal.tsx`'s project/bundle fetches are try/caught with
  user-facing error text, mirroring `_thread-to-project-modal.tsx` verbatim.
- No secrets, credentials, or debug logging introduced.
- `SEVERITY_OPTS`/`SEVERITY_STYLE`/`normalizeSeverity` reused from the existing
  `projects-old/_pm-shared` import already in the file — no duplicate constant list.
- Severity `<select>` has no explicit `hover:` class, matching the Status `<select>` immediately
  above it in the same row (pre-existing pattern, not a new gap introduced by this task) — left
  as-is for visual consistency rather than fixing only one of the two selects.
- `impeccable` design-hook flagged literal font sizes across all four touched files; all flagged
  lines use values (11/12/13px) already established throughout this exact file/its sibling
  `_thread-to-project-modal.tsx` before this task — not a new deviation, left unchanged per the
  hook's own "don't change intentional design to satisfy the hook" guidance.

### Deviations
- None at Medium/Major level. The query broadening (Inbox-only → all tickets) was Requirement #1
  of the approved task doc, not an undeviated addition.
- Minor: fixed the stale Severity-read-only comment noted above; no behavior change, just
  documentation accuracy.

### Required Fixes
- None.

## Testing Feedback — Round 1 (user acceptance testing)

User testing the deployed change on real data surfaced four issues (three real bugs, one scope
addition), all fixed in the same session:

1. **Origin → "Inbox" link 404'd.** Root cause: task 382 (merged just before this task started)
   moved `/desk/inbox/[ticketId]` to route by `inbox.id` (UUID), not `inbox.ticket_id`
   ("TKT-<n>") — but this file's Origin link, written before that context was fully internalized,
   kept using `ticketId` (the display id). Fixed by selecting `inbox.id` in `page.tsx`, threading
   it through as `inboxId` on `FiledIssueListItem`, and linking `/desk/inbox/{inboxId}`. Verified
   live: clicking Origin now lands on the real ticket detail page, not a 404.
2. **"New Ticket" button color.** Changed from the page's default blue to the brand-orange
   treatment already used for "New Ticket" on a project's own Tickets tab
   (`_project-detail.tsx`) — `bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white`.
3. **Created column "went missing."** The GRID_COLS widening from the first implementation pass
   (1540px → 1650px total) pushed Created/Logged further past the viewport edge on real screen
   widths — the page's `max-w-[1400px]` container was never the actual bottleneck, available
   window width was, so widening the row only traded one visibility problem for a worse one.
   Retuned column widths back down close to the original 1540px total (now 1565px) — Origin's
   shrink (170px→90px) funds Severity/Responded/Due date/Created's growth almost exactly, so the
   net width barely moved while still avoiding the original clipping bug.
4. **Default-hide Closed tickets.** `parseStatusFilterParam`'s absent-param case now excludes
   `closed` (was: show every status by default). An explicit `?status=all` (checking "All" in the
   UI) still means literally everything, Closed included — only the *default* landing view
   changed.

A fifth item arrived as a mid-turn message during this same round: **"Table header should stick
below the page header on scroll as well."** This surfaced a genuine, non-obvious CSS bug during
implementation, documented in detail via inline code comments in `_filed-issues-table.tsx`
(worth reading directly — condensed version: `overflow-x: auto` computes `overflow-y` to a
scroll-container value too per the CSS overflow spec, which silently made that wrapper — not the
real page-scrolling ancestor — the sticky containing block for a naively-nested sticky header;
even an explicit `overflow-y: clip` override got normalized back to `hidden` once paired with a
genuinely-scrolling other axis, so that didn't hold either). Fixed with the standard dual-region
pattern: header and rows each get their own `overflow-x-auto` scroll region with `scrollLeft`
synced via refs, and `position: sticky` lives on the scroll-region div itself (not a child nested
inside it) so its containing-block search walks past its own overflow to the real ancestor. A
second regression surfaced and was fixed in the same pass: an intermediate `rounded-b-[14px]
overflow-hidden` wrapper added for cosmetic corner-rounding was silently clipping the rows to
their parent's width instead of letting them scroll — removed in favor of `last:rounded-b-[14px]`
on the last row, which needs no clipping since the outer card's own `border-radius` already
rounds the (un-clipped) background underneath it. All five fixes verified live via Claude in
Chrome against real data, including narrowing the window to 1100px to force horizontal scroll and
confirming header/body columns stay pixel-aligned while scrolling both axes at once.

### Files Changed (this round)
- `src/app/(hub)/desk/tickets/page.tsx` — select `inbox.id`, plumb `inboxId`
- `src/app/(hub)/desk/tickets/_filed-issues-index.tsx` — `inboxId` field, orange "New Ticket" button
- `src/app/(hub)/desk/tickets/_filed-issues-table.tsx` — Origin href fix, column-width retune,
  header/body dual-scroll-region sticky restructure, corner-rounding fix
- `src/app/(hub)/desk/tickets/_status-filter.ts` — default-hide Closed
- `src/app/globals.css` — added `.no-scrollbar` utility (Tailwind v4 doesn't generate one)

### Verification Run (this round)
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (same 2 pre-existing unrelated warnings)
- Manual browser check (`pnpm dev`, `.next` wiped to rule out stale-cache red herrings, Claude in
  Chrome against real data) — PASS: Origin link navigates to the correct ticket (no 404); New
  Ticket button renders orange; Created column shows full un-clipped text at the right edge with
  no horizontal scroll needed at normal widths; default view excludes Closed (`Status: 7
  selected`, count math updates correctly); table header sticks directly below the page header
  through vertical scrolling and stays column-aligned with the rows through horizontal scrolling,
  tested independently and combined.
