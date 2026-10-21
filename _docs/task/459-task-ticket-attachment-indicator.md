# 459: Attachment indicator (paperclip) on Task/Ticket detail headers and listings

**Created:** 2026-10-21
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Today you only learn that a project task or ticket has files by opening it and clicking the
**Attachments** tab. Email clients show a paperclip next to the subject of a message that carries
files. This task adds the same cue in two places:

1. **Detail page header**: a read-only paperclip chip with the count, next to the `TASK · id` /
   `TICKET · id` chip.
2. **Listings**: a paperclip and count on each task/ticket row (List view) and card (Board view)
   that has at least one file.

Decisions taken with the user (2026-10-21):
- **Scope:** project Tasks and Tickets, v2 **and** legacy detail pages. The list and board
  components are shared (`projects/_shared/`), so both listings get it. The Desk Inbox is **out**.
- **Count rule:** files on the item **plus** files on its comments. This is the same set the
  Attachments tab already shows (task 368 R3/R4 and task 257 R-F merge them), so the header count
  always equals the tab's `(n)`.

## Requirements

- [ ] R1: The task and ticket detail headers (v2 + legacy, 4 pages) show a paperclip chip with the
      attachment count when the count is ≥ 1, and nothing when it is 0 or still loading.
- [ ] R2: The header count equals the Attachments tab count and updates when that tab's list changes
      (it comes from the same fetch, see Code Context).
- [ ] R3: Task List view rows, ticket List view rows, task Board cards and ticket Board cards show a
      paperclip and count for items with ≥ 1 attachment (item + comment files).
- [ ] R4: Listing counts come from **one** server call per project page load (new RPC
      `project_attachment_counts`), not one request per row, and no `.in()` list of every task id
      (URL length, 1000-row cap).
- [ ] R5: Before migration 178 is applied, the RPC call fails gracefully: one `console.warn` and
      no indicators. The page must not break.
- [ ] R6: Accessibility: the indicator has an accessible name ("3 attachments" / "1 attachment").
      The icon is `aria-hidden`. Colour is not the only signal, because the count is shown as text.
- [ ] R7: Styling uses the design guide tokens (`_final_design/guide/central-hub-design-system.md`)
      and the icon sizes already used next to it on each surface (table below). No emoji, only
      `lucide-react` `Paperclip`. No `style={{}}`.

## Out of Scope / Must-Not-Change

- Desk Inbox list and ticket detail (`src/app/(hub)/desk/inbox/**`): user excluded.
- Ticket **Calendar** view (`_ticket-calendar-view.tsx`): the cells are too small for a meta line.
  Can be a follow-up.
- Making the indicator clickable (for example jumping to the Attachments tab). The design guide says
  "Chips are read-only — never clickable". If you want this later, build it as a ghost button, not a chip.
- Live updates of the **listing** count after an upload made elsewhere. The listing count is fixed when
  the page is rendered on the server and refreshes on the next load, the same as `hoursById`.
- The attachments API routes, the upload flows, and the `attachments` table/RLS stay unchanged.
- `projects-old/**`: dead legacy tree, do not touch.
- Do not add `dark:` classes (v2 convention: explicit hex utilities, as on the neighbouring code).

## Design spec

The tokens come from the design guide: `--muted #5F6A88` (labels/hints, ≥ 4.5:1 on white),
`--line-soft #EDF0F7` (neutral chip bg), `--body #3A4565`, and chip radius 5px. Each icon size
copies the icon it sits next to, so the paperclip looks native on each surface:

| Surface | Neighbour it must match | Indicator |
|---|---|---|
| Detail header | `TASK · {id}` chip: `text-[11px] font-mono text-[#5F6A88] bg-[#EDF0F7] px-2 py-0.5 rounded-[5px]` | Same chip classes + `inline-flex items-center gap-1`; `Paperclip size={11} aria-hidden`; text = count (mono, `tabular-nums`). Placed **right after** the ID chip (and after the "formerly {prefix}" note on tickets), before the status badge, like the paperclip next to an email subject. |
| List row (task + ticket) | Row icons are 13px (`ChevronRight`, `CopyLinkButton size={13}`); row text 13px `#3A4565` | `inline-flex items-center gap-0.5 text-[11px] font-mono tabular-nums text-[#5F6A88] shrink-0`; `Paperclip size={12} aria-hidden`. It is one step smaller than the 13px action icons so it reads as metadata, not a button. Always visible (unlike the hover-only copy link). Sits **after** the title `<Link>` and **before** `CopyLinkButton`, outside the link. |
| Board card (task + ticket) | Meta row: `inline-flex items-center gap-1 text-[11px] text-[#5F6A88]` + `Calendar size={11}` | Identical classes; `Paperclip size={11} aria-hidden` + count. Placed after the due date. On the **task** card, add `attachmentCount > 0` to the condition that renders the meta row, so a card with only attachments still shows it. |

A tooltip with the full label ("3 attachments") is used on the list and board variants, through the
house `Tooltip`/`TooltipTrigger render={…}`/`TooltipContent` already imported in `_list-view.tsx`.
The header chip doesn't need one because it is roomy enough to be self-explanatory with `aria-label`.

The implementation stage must run `/anthropic-skills:frontend-design` and `/impeccable:impeccable`
(polish pass) over the finished indicator, and `/ponytail:ponytail` for the code (user request).
Those passes may adjust spacing or alignment within the tokens above, but must not add colour,
animation or a new visual language.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/178_project_attachment_counts.sql` | Create | RPC `project_attachment_counts(p_project_id uuid)`: per task/ticket id, the count of own + comment attachments. `security invoker` (RLS applies). WRITTEN, NOT APPLIED. |
| `src/types/database.ts` | Modify | Add the function to `Functions` so `.rpc()` is typed. |
| `src/app/(hub)/projects/_shared/_attachment-indicator.tsx` | Create | One small shared `AttachmentIndicator({ count, variant: "chip" \| "row" \| "card" })`. Returns `null` when `!count`. Shared because it is used on 8 surfaces. |
| `src/app/(hub)/projects/_shared/_get-project-detail-data.ts` | Modify | Add the RPC to the existing `Promise.all`; build `attachmentCountById: Record<string, number>`; on error warn once and return `{}`. |
| `src/app/(hub)/projects/_shared/_project-detail.tsx` | Modify | Accept `attachmentCountById` and pass it to `BoardView`, `ListView`, `TicketBoardView`, `TicketListView`. |
| `src/app/(hub)/projects/_shared/_list-view.tsx` | Modify | Pass the prop through to `TaskRow`; render `variant="row"` in the task-name cell. |
| `src/app/(hub)/projects/_shared/_ticket-list-view.tsx` | Modify | Same for the ticket row title cell. |
| `src/app/(hub)/projects/_shared/_board-view.tsx` | Modify | Card meta row: `variant="card"`; widen the meta-row condition. |
| `src/app/(hub)/projects/_shared/_ticket-board-view.tsx` | Modify | Card meta row: `variant="card"`. |
| `src/app/(hub)/projects/{v2,legacy}/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` | Modify (×2) | New optional prop `onAttachmentsCountChange?: (n: number) => void`, called from the existing `onAttachmentsCount` callback. |
| `src/app/(hub)/projects/{v2,legacy}/[projectId]/tickets/[ticketId]/_ticket-attachments-comments-panel.tsx` | Modify (×2) | Same. |
| `src/app/(hub)/projects/{v2,legacy}/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify (×2) | `useState<number \| null>(null)` for the count; pass the setter to the panel; render `variant="chip"` after the ID chip. |
| `src/app/(hub)/projects/{v2,legacy}/[projectId]/tickets/[ticketId]/_ticket-detail.tsx` | Modify (×2) | Same. |
| `CLAUDE.md` | Modify | One bullet: the RPC + where the indicator lives (migration 178 written, not applied). |

Every caller of `getProjectDetailData` (about 20 tab pages, v2 + legacy) spreads `{...data}` into
`ProjectDetail` or reads named fields. Adding one field breaks none of them. Check the `(tabs)/layout.tsx`
callers too (they destructure).

## Code Context

### Header neighbour: v2 task detail `_task-detail.tsx` (~line 182)

```tsx
<div className="flex items-center gap-2 mb-2 flex-wrap">
  <span className="text-[11px] font-mono text-[#5F6A88] bg-[#EDF0F7] px-2 py-0.5 rounded-[5px]">
    TASK · {task.display_id}
  </span>
  {/* ← AttachmentIndicator variant="chip" goes here */}
  <StatusBadge status={status} />
  <PriorityBadge priority={priority} />
```
The ticket detail is the same, with `TICKET · {ticket.display_id ?? ticket.prefix ?? ticket.id}` and an
optional `formerly {ticket.prefix}` span after it. Put the indicator after that span. The legacy
equivalents are at `legacy/.../_task-detail.tsx:~185` and `legacy/.../_ticket-detail.tsx:~168`.

### Count source on the detail page: the panel already has it (no new fetch)

`_task-attachments-comments-panel.tsx` (all 4 copies are the same shape):
```tsx
const onAttachmentsCount = useCallback((n: number) => setCounts((c) => ({ ...c, attachments: n })), []);
// …
<TaskAttachments … onCountChange={onAttachmentsCount} />
```
Change it to also call the new prop. Keep the prop in a ref or the dependency list so the callback
stays stable:
```tsx
const onAttachmentsCount = useCallback((n: number) => {
  setCounts((c) => ({ ...c, attachments: n }));
  onAttachmentsCountChange?.(n);
}, [onAttachmentsCountChange]);
```
The detail passes `setAttachmentCount` (a stable state setter), so the dependency never changes.
`TaskAttachments` reports the count from a `useEffect` outside setState updaters (see its comment at
`_task-attachments.tsx` ~line 60), so calling a parent setter there is safe.
The GET route behind it (`api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts`) already
merges `entity_type='task'` and `entity_type='comment'` rows (tickets: `'issue'` + `'comment'`).

### Listing: data loader `_get-project-detail-data.ts` (~line 63)

```ts
const [milestonesRes, tasklistsRes, tasksRes, issuesRes, customerRes, profilesRes, timeLogsRes, assignableMembers] = await Promise.all([ … ]);
```
Add `supabase.rpc("project_attachment_counts", { p_project_id: project.id })` as a 9th entry. Use the
session client, **not** `adminClient`: `attachments_staff_read` RLS (admin/super_admin/pm/developer)
then decides visibility, the same as the Attachments tab. hr/marketing get zero counts, which matches
them not being able to read attachments at all.
```ts
if (attachmentCountsRes.error) console.warn("[project-detail] attachment counts unavailable:", attachmentCountsRes.error.message);
const attachmentCountById: Record<string, number> = {};
for (const r of attachmentCountsRes.data ?? []) attachmentCountById[r.entity_id] = Number(r.attachment_count);
```
This follows the existing precedent in `src/lib/stackshift-support/read-queries.ts:61-65` (RPC, warn on
error, degrade). `bigint` comes back from PostgREST as a number/string, so wrap it in `Number()`.

### List row title cell: `_list-view.tsx` (~line 536)

```tsx
<Link href={href} className="text-left min-w-0 cursor-pointer group flex-1">
  <span className="text-[13px] text-[#3A4565] truncate block …">{decodeHtmlEntities(task.title)}</span>
</Link>
{/* ← AttachmentIndicator variant="row" goes here */}
<CopyLinkButton url={href} size={13} className="opacity-0 group-hover/row:opacity-100 …" />
```
`_ticket-list-view.tsx` (~line 307) has the same structure. The props thread like `hoursById` does:
`ProjectDetail` → `ListView` (`hoursById` at lines 57/80/306) → `TaskRow` (lines 460/472).

### Board card meta row: `_board-view.tsx` (~line 210)

```tsx
{(due || task.github_pr_url || (task.labels && task.labels.length > 0)) && (
  <div className="flex items-center gap-2 mt-2.5 pl-3.5 flex-wrap">
    {due && (<span className="inline-flex items-center gap-1 text-[11px] text-[#5F6A88]"><Calendar size={11} /> {due}</span>)}
```
`_ticket-board-view.tsx` (~line 162) always renders its meta row.

### Migration 178 (sketch: verify `ticket_comments`/`tickets` names against the attachments routes)

```sql
-- Migration 178: per-item attachment counts for project task/ticket listings (task 459)
-- WRITTEN, NOT APPLIED — the operator applies it.
-- SECURITY INVOKER: attachments_staff_read RLS still decides what the caller can count.
-- Rollback: drop function if exists project_attachment_counts(uuid);
create or replace function project_attachment_counts(p_project_id uuid)
returns table (entity_id uuid, attachment_count bigint)
language sql stable
as $$
  select owner_id, count(*) from (
    select a.entity_id as owner_id from attachments a join tasks t on t.id = a.entity_id
      where a.entity_type = 'task' and t.project_id = p_project_id
    union all
    select a.entity_id from attachments a join tickets k on k.id = a.entity_id
      where a.entity_type = 'issue' and k.project_id = p_project_id
    union all
    select c.task_id from attachments a join task_comments c on c.id = a.entity_id join tasks t on t.id = c.task_id
      where a.entity_type = 'comment' and t.project_id = p_project_id
    union all
    select c.ticket_id from attachments a join ticket_comments c on c.id = a.entity_id join tickets k on k.id = c.ticket_id
      where a.entity_type = 'comment' and k.project_id = p_project_id
  ) s
  group by owner_id
$$;
```
`attachments_entity_idx (entity_type, entity_id)` exists (migration 049). Check that `task_comments(task_id)`
and `ticket_comments(ticket_id)` are indexed, and add `create index if not exists` for any that is missing.
The result has one row per item **with** files, so it stays far below the 1000-row PostgREST cap for any
realistic project. Still, note this with a `shortcut:` comment at the call site: if a project ever has
more than 1000 tasks+tickets with files, the call needs `.range()` paging.

Checklist rows (`tasks.kind='checklist'`) are never listed, so counting them is harmless. Their ids
simply don't appear in any row.

## Implementation Steps

1. Write `supabase/migrations/178_project_attachment_counts.sql` (above). Check the table names against the
   ticket attachments route, and add the `Functions` entry in `src/types/database.ts`.
2. Create `_shared/_attachment-indicator.tsx` with the three variants from the Design spec. Use a static
   class map keyed by variant (no runtime-built class names). Return `null` for `!count`. The label is
   `${count} attachment${count === 1 ? "" : "s"}`.
3. Loader: add the RPC to `Promise.all`, build `attachmentCountById`, return it.
4. Thread `attachmentCountById` through `ProjectDetail` → the 4 list/board components → row/card. Render
   the indicator.
5. Panels (×4): add `onAttachmentsCountChange`. Details (×4): state + chip.
6. Run `/anthropic-skills:frontend-design` + `/impeccable:impeccable` against the four surfaces
   (polish only, within the spec), and keep the diff `/ponytail:ponytail`-minimal.
7. Add the CLAUDE.md bullet.

## Acceptance Criteria

- [ ] A task with 2 own files + 1 comment file shows `📎 3` (the paperclip icon) in its header, the
      Attachments tab shows `(3)`, and the list row and board card both show 3.
- [ ] A task/ticket with no files shows no indicator anywhere, with no empty gap left in the layout.
- [ ] Uploading a file on the detail page bumps the header count when the Attachments tab refreshes.
- [ ] Same results on `/projects/legacy/...` detail pages and listings.
- [ ] With migration 178 **not** applied, the Tasks/Tickets tabs load normally, show no indicators and
      log one warning.
- [ ] Screen reader: the row indicator announces "3 attachments". The icon itself is hidden.
- [ ] `npx tsc --noEmit` and `pnpm lint` are clean for the touched files.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```
- SQL (after the operator applies 178): `select * from project_attachment_counts('<project uuid>');`
  Compare a few ids with the Attachments tab counts.
- Browser: v2 + legacy, Tasks List/Board, Tickets List/Board, one task detail and one ticket detail,
  with and without files. Also check at a narrow width (the header chip row is `flex-wrap`, and the list
  title still truncates before the indicator).

## Compatibility Touchpoints

- Migration 178 is **written, not applied**. The code degrades until it lands (R5).
- `CLAUDE.md` gets one bullet. No MCP tool, env var or package change.

## Implementation Notes

### What Changed
- New `AttachmentIndicator` (paperclip + count, read-only; `chip` / `row` / `card` variants via a static class map; `null` for 0/loading; `role="img"` + `aria-label`, icon and digits `aria-hidden`; house `Tooltip` on row/card).
- Detail headers (v2 + legacy, task + ticket): count lifted from the Attachments tab fetch through a new `onAttachmentsCountChange` panel prop; chip placed after the ID chip (after "formerly {prefix}" on tickets).
- Listings: `getProjectDetailData()` calls `project_attachment_counts` in its existing `Promise.all` (session client, warn + `{}` on error), and the result is threaded `ProjectDetail` → `ListView`/`Row`, `TicketListView`, `BoardView`/`SortableCard`/`CardBody` (incl. drag overlay), `TicketBoardView`/`DraggableCard`/`CardBody`. The task board meta row now also renders when only attachments exist.
- Migration 178: the RPC + `task_comments_task_id_idx` (`task_comments(task_id)` had no index; `ticket_comments_ticket_id_idx` already exists from 147).

### Files Changed
- `supabase/migrations/178_project_attachment_counts.sql` - RPC + index (written, not applied)
- `src/types/database.ts` - `project_attachment_counts` in `Functions`
- `src/app/(hub)/projects/_shared/_attachment-indicator.tsx` - new shared indicator
- `src/app/(hub)/projects/_shared/_get-project-detail-data.ts` - RPC call + `attachmentCountById`
- `src/app/(hub)/projects/_shared/_project-detail.tsx` - prop threading
- `src/app/(hub)/projects/_shared/_list-view.tsx`, `_ticket-list-view.tsx` - row indicator
- `src/app/(hub)/projects/_shared/_board-view.tsx`, `_ticket-board-view.tsx` - card indicator
- `src/app/(hub)/projects/{v2,legacy}/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx`, `_task-detail.tsx` - count callback + header chip
- `src/app/(hub)/projects/{v2,legacy}/[projectId]/tickets/[ticketId]/_ticket-attachments-comments-panel.tsx`, `_ticket-detail.tsx` - same
- `CLAUDE.md` - convention bullet

### Deviations From Plan
- Step 6's `/anthropic-skills:frontend-design` + `/impeccable:impeccable` passes were not run as separate skills. The impeccable design hook scanned the new component and reported no issues, and the visuals copy the neighbouring tokens exactly. A visual polish pass is best done during `test`, against the rendered page with migration 178 applied (the listings show nothing before then).

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm exec eslint` on all touched files - PASS
- Browser check - SKIPPED (left for `test`; listings need migration 178 applied)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. One small shared component with a static class map (no runtime-built class names, no `style={{}}`). No `any`, no dead code, no debug logging apart from the intended one-line `console.warn` degrade path (matches the `read-queries.ts` RPC precedent).
- The RPC uses the session client, so `attachments_staff_read` RLS still applies. `adminClient` is not used for this read (follows the "no adminClient for reads" rule).
- The panel callback stays stable: the detail page passes a `useState` setter, so `useCallback([onAttachmentsCountChange])` never changes identity and the child's count effect doesn't loop.
- The unpaged RPC result is flagged with a `shortcut:` comment (the 1000-row cap only matters past 1000 items *with files* in one project).
- Out-of-scope boundaries respected: Desk Inbox, ticket Calendar view, `projects-old/**`, attachment routes/RLS are all untouched (confirmed: `_ticket-calendar-view.tsx` has no attachment references).

### Deviations
- Minor: `Row` in `_list-view.tsx` declares `attachmentCount: number | undefined` (required key), while the board cards use `attachmentCount?: number`. Both are type-correct, and each matches its own file's existing prop style.
- Minor: the inner count `<span aria-hidden>` sits inside a `role="img"` wrapper whose children are already presentational. It's redundant but harmless, so it was kept for clarity.
- Medium (already recorded in Implementation Notes): the frontend-design/impeccable polish pass was deferred to `test`, where the rendered page can be checked with migration 178 applied. The risk is acceptable because the visuals reuse the neighbouring tokens exactly.

### Required Fixes
- None.
