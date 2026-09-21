import Link from "next/link";
import { useRef } from "react";
import { Clock } from "lucide-react";
import {
  STATUS_LABEL, STATUS_STYLE, SEVERITY_STYLE, SEVERITY_OPTS,
  normalizeStatus, normalizeSeverity, decodeHtmlEntities,
  type TaskStatus,
} from "@/app/(hub)/projects-old/_pm-shared";
import { ticketAssigneeIds } from "@/lib/tickets/permissions";
import { AssigneeMultiSelect, type AssigneeMember } from "@/app/(hub)/projects/_shared/_assignee-multi-select";
import { STATUS_FILTER_OPTIONS } from "./_status-filter";
import type { FiledIssueListItem } from "./_filed-issues-index";

// Task 363 — row rendering for the Desk > Tickets tab. Status, assignees, and severity (task 383)
// are editable (PATCH `/api/v2/tickets/[ticketId]`, wired by the parent's `onUpdate`); everything
// else here — origin, responded/due, created, logged hours — is read-only, per the locked
// decision that time-tracking actions stay on the issue detail page / Dev Dashboard.
//
// Follow-up (still task 363) — Ticket ID/Responded/Due Date moved here from the Inbox list table.
// "Owner" (the Desk agent on the email) was dropped rather than moved — this tab already has
// Assignees (who's fixing it), a different concept.
//
// Task 370 — the read-only "Ticket status" column (the origin ticket's own open/on_hold/
// escalated/closed status, distinct from this issue's dev-workflow `status` column above) moved
// back to the Inbox table, now editable there in place, since that's the origin ticket's own row.

// Task 383 — Origin shrank from a full subject-line link to a short "Inbox"/"Manual" label,
// funding just enough width for Severity/Responded/Due date/Created to show a full formatted
// date+time (and Due date the extra "(ND)" overdue badge) without internally clipping. Kept
// close to the original 1540px total on purpose — widening the whole row further only pushes
// Created/Logged further past the viewport edge on real screens (the container's max-width isn't
// the bottleneck; available window width is), trading one visibility problem for another.
const GRID_COLS = "grid-cols-[1fr_90px_130px_150px_130px_110px_120px_145px_150px_90px] min-w-[1565px]";

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

export function FiledIssuesTable({
  issues,
  allMembers,
  onUpdate,
  stickyTop,
}: {
  issues: FiledIssueListItem[];
  allMembers: AssigneeMember[];
  onUpdate: (id: string, patch: { status?: string; assignees?: string[]; severity?: string }) => Promise<boolean>;
  // Pixel offset from the top of the page's own scroll container — the live height of the sticky
  // page header above, so this table's column-header row sticks flush beneath it instead of
  // either overlapping it or scrolling away (task 383 follow-up).
  stickyTop: number;
}) {
  // Task 383 follow-up — a sticky header nested inside the same `overflow-x-auto` wrapper as the
  // rows doesn't actually stick: per the CSS overflow spec, `overflow-x: auto` computes
  // `overflow-y` to a scroll-container value too (confirmed here — even an explicit `overflow-y:
  // clip` gets normalized back to `hidden` once paired with a genuinely-scrolling other axis, so
  // that workaround doesn't hold either), making that wrapper — not the real page-scrolling
  // ancestor — the sticky containing block, so the header just renders at a fixed offset from the
  // wrapper's own (moving) position instead of pinning to the viewport. Fix: split header and
  // rows into their own `overflow-x-auto` regions with `scrollLeft` synced via these refs, so the
  // header's sticky containing-block search walks straight past its own overflow to the real
  // outer scroller (an element's own `overflow` never affects its own sticky positioning, only an
  // ancestor's does), while still tracking the rows' horizontal scroll pixel-for-pixel.
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  function syncScroll(from: HTMLDivElement | null, to: HTMLDivElement | null) {
    if (syncingRef.current || !from || !to) return;
    syncingRef.current = true;
    to.scrollLeft = from.scrollLeft;
    syncingRef.current = false;
  }

  return (
    // No `overflow-hidden` here (rounding is applied directly to the header/rows-wrapper below
    // instead) — it would establish its own clipping/scroll-container box and break the header's
    // `sticky` positioning against the real scrolling ancestor above, same pitfall documented in
    // `_ticket-list-view.tsx`'s identical pattern.
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white">
      {/* `sticky`/`top` live on THIS div (the scroll wrapper itself), not a child inside it — an
          element's sticky containing-block search starts at its PARENT, so a sticky child of an
          `overflow-x-auto` div still resolves against that div (the exact bug this whole
          restructure exists to avoid); putting `sticky` on the div that owns the overflow sidesteps
          it, since the search then starts at ITS parent (the plain, non-scrolling rounded-card
          div) and walks up cleanly to the real page scroller. Own scrollbar hidden
          (`no-scrollbar`) — the rows' scrollbar below is the one visual/draggable scrollbar; this
          one only exists so the header can scroll horizontally in lockstep via JS. Horizontal
          scroll on narrower viewports, per the design system's "wrap in overflow-x: auto for
          mobile" table rule. */}
      <div
        ref={headerScrollRef}
        onScroll={() => syncScroll(headerScrollRef.current, bodyScrollRef.current)}
        style={{ top: stickyTop }}
        className="sticky z-10 overflow-x-auto no-scrollbar bg-[#FAFBFE] rounded-t-[14px]"
      >
        <div className={`grid ${GRID_COLS} items-center gap-3 px-5 py-2.5 border-b border-[#EDF0F7]`}>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Ticket</span>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Origin</span>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Project</span>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Assignees</span>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Status</span>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Severity</span>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Responded</span>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Due date</span>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Created</span>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Logged</span>
        </div>
      </div>
      {/* No `rounded-b-[14px] overflow-hidden` wrapper here on purpose — that clips this div to
          its OWN parent's width instead of letting the wider (min-w-1565px) rows push it out to
          their full intrinsic width, silently defeating horizontal scroll entirely (confirmed via
          scrollWidth === clientWidth after adding it — the rows were being cut off, not scrolled
          to). The outer card's own `rounded-[14px]` already rounds these corners with nothing to
          clip (row content is padded well clear of the edges), so `last:rounded-b-[14px]` below
          is purely a belt-and-suspenders visual nicety, not a functional requirement. */}
      <div
        ref={bodyScrollRef}
        onScroll={() => syncScroll(bodyScrollRef.current, headerScrollRef.current)}
        className="overflow-x-auto"
      >
        {issues.map((issue) => {
          const norm = normalizeStatus(issue.status);
          const ss = STATUS_STYLE[norm] ?? STATUS_STYLE["open"];
          const sev = normalizeSeverity(issue.severity);
          const sv = SEVERITY_STYLE[sev] ?? SEVERITY_STYLE["None"];

          return (
            <div
              key={issue.id}
              className={`grid ${GRID_COLS} items-center gap-3 px-5 py-3 border-b border-[#EDF0F7] last:border-0 last:rounded-b-[14px] hover:bg-[#F0F7FF]/60 transition-colors`}
            >
              {/* Ticket title + display id — links to the filed ticket's own detail page under
                  Projects (legacy/v2-aware, task 369's buildItemHref). */}
              {issue.ticketHref ? (
                <Link href={issue.ticketHref} className="min-w-0 block group/ticket">
                  <div
                    className="text-[13px] font-medium text-[#0B1533] group-hover/ticket:text-[#007BFF] truncate transition-colors"
                    title={decodeHtmlEntities(issue.title)}
                  >
                    {decodeHtmlEntities(issue.title)}
                  </div>
                  {issue.displayId && (
                    <div className="text-[10.5px] font-mono text-[#5F6A88] truncate">{issue.displayId}</div>
                  )}
                </Link>
              ) : (
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[#0B1533] truncate" title={decodeHtmlEntities(issue.title)}>
                    {decodeHtmlEntities(issue.title)}
                  </div>
                  {issue.displayId && (
                    <div className="text-[10.5px] font-mono text-[#5F6A88] truncate">{issue.displayId}</div>
                  )}
                </div>
              )}

              {/* Origin — "Inbox" (linked back to the originating thread) when filed from a
                  message, "Manual" (plain text, no link) when created directly (task 383).
                  Routed by the inbox row's UUID `id`, not `ticket_id` ("TKT-<n>") — task 382
                  moved `/desk/inbox/[ticketId]` off the display id, so the old `ticket_id`-based
                  href 404s. */}
              {!issue.isManual && issue.inboxId ? (
                <Link
                  href={`/desk/inbox/${issue.inboxId}`}
                  className="min-w-0 block text-[12px] font-medium text-[#007BFF] hover:text-[#0063D6] hover:underline transition-colors"
                  title={issue.ticketSubject || undefined}
                >
                  Inbox
                </Link>
              ) : (
                <span className="text-[12px] text-[#5F6A88]">Manual</span>
              )}

              {/* Owning project */}
              {issue.projectHref ? (
                <Link
                  href={issue.projectHref}
                  className="text-[12px] text-[#3A4565] hover:text-[#007BFF] truncate transition-colors"
                  title={issue.projectName}
                >
                  {issue.projectName}
                </Link>
              ) : (
                <span className="text-[12px] text-[#5F6A88]">{issue.projectName}</span>
              )}

              {/* Assignees — editable */}
              <AssigneeMultiSelect
                value={ticketAssigneeIds({ assignees: issue.assignees, assignee_id: issue.assigneeId })}
                members={allMembers}
                editable
                onChange={(ids) => void onUpdate(issue.id, { assignees: ids })}
              />

              {/* Status — editable (dev-workflow status) */}
              <select
                value={norm}
                onChange={(e) => void onUpdate(issue.id, { status: e.target.value })}
                className="text-[11px] font-semibold rounded-full border px-2.5 py-0.5 outline-none cursor-pointer appearance-none w-full truncate"
                style={{ color: ss.text, background: ss.bg, borderColor: ss.border }}
              >
                {STATUS_FILTER_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value} className="bg-white text-[#3A4565]">
                    {STATUS_LABEL[s.value as TaskStatus] ?? s.label}
                  </option>
                ))}
              </select>

              {/* Severity — editable (task 383), same interaction as Status above but plain-text
                  colored (SEVERITY_STYLE has no bg/border like STATUS_STYLE does, so no pill
                  background — matches the plain-select treatment CreateTicketModal already uses
                  for Severity). Dot kept as a static leading indicator outside the select. */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: sv.dot }} />
                <select
                  value={sev}
                  onChange={(e) => void onUpdate(issue.id, { severity: e.target.value })}
                  className="text-[12px] font-medium bg-transparent outline-none cursor-pointer appearance-none w-full truncate"
                  style={{ color: sv.text }}
                >
                  {SEVERITY_OPTS.map((s) => (
                    <option key={s} value={s} className="bg-white text-[#3A4565]">
                      {SEVERITY_STYLE[s].label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Responded — the origin ticket's first response time, read-only */}
              <span className="text-[11px] font-mono text-[#5F6A88] truncate" title={issue.ticketRespondedAt ? formatDateTime(issue.ticketRespondedAt) : undefined}>
                {issue.ticketRespondedAt ? formatDateTime(issue.ticketRespondedAt) : "—"}
              </span>

              {/* Due date — the origin ticket's SLA due time, read-only, overdue in red with a
                  trailing "(ND)" days-overdue badge (task 383). */}
              <span
                className={`text-[11px] font-mono truncate ${issue.ticketOverdue ? "text-[#C0392B] font-semibold" : "text-[#5F6A88]"}`}
                title={issue.ticketDueAt ? formatDateTime(issue.ticketDueAt) : undefined}
              >
                {issue.ticketDueAt ? formatDateTime(issue.ticketDueAt) : "—"}
                {issue.ticketOverdue && issue.ticketOverdueDays != null && ` (${issue.ticketOverdueDays}D)`}
              </span>

              {/* Created date + time — always full, mono (design-system "Data" type role) */}
              <span className="text-[11px] font-mono text-[#5F6A88] truncate" title={formatDateTime(issue.createdAt)}>
                {formatDateTime(issue.createdAt)}
              </span>

              {/* Total logged hours — read-only figure only; no timer/log-time action lives here,
                  that stays on the issue detail page and the Dev Dashboard (locked decision). */}
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#5F6A88]">
                <Clock size={11} className="shrink-0" />
                {issue.totalHours > 0 ? `${issue.totalHours.toFixed(1)}h` : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
