import Link from "next/link";
import type { TicketListItem } from "./_inbox-index";

// Task 363 (follow-up) — Ticket ID/Owner/Responded/Due Date moved to the Tickets tab
// (`desk/tickets/_filed-issues-table.tsx`); this table keeps what's still Inbox-specific
// (Subject/Contact/Account/Received) plus a new "Linked Ticket" reverse-lookup column.
//
// Task 370 — "Status" moved back here from the Tickets tab's read-only "Ticket status" mirror,
// now editable in place (this is the origin ticket's own row). Same status vocabulary/colors the
// Tickets tab used, plus the ticket detail page's existing `PATCH .../status` endpoint.
//
// Task 371 — Contact reordered before Subject, and `px-5 py-3` moved from ad-hoc per-cell padding
// onto the row container (both header and data rows), matching `_filed-issues-table.tsx`'s
// pattern. Previously only the first/last cell carried horizontal padding and the header row
// alone carried container padding, so header and data-row column boundaries didn't line up
// (header shifted right relative to data — the "tabbed" misalignment).

type TicketStatus = TicketListItem["status"];

const STATUS_OPTIONS: TicketStatus[] = ["open", "on_hold", "escalated", "closed"];

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open", on_hold: "On Hold", escalated: "Escalated", closed: "Closed",
};
const STATUS_STYLE: Record<TicketStatus, { text: string; bg: string }> = {
  open: { text: "#5F6A88", bg: "#EDF0F7" },
  on_hold: { text: "#8A5A00", bg: "#FFF3D6" },
  escalated: { text: "#8A5A00", bg: "#FFF3D6" },
  closed: { text: "#177E48", bg: "#E3F5EA" },
};

// Full date + time, always — matches the design-system "Data" type role (mono, never abbreviated
// to a bare time) for the one column that answers "when did this email actually arrive."
function formatFullDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

const GRID_COLS = "grid-cols-[170px_1fr_150px_150px_120px_130px]";

export function InboxTable({
  tickets,
  onUpdateStatus,
}: {
  tickets: TicketListItem[];
  onUpdateStatus: (ticketId: string, status: TicketStatus) => void;
}) {
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">
      <div className={`grid ${GRID_COLS} items-center gap-3 px-5 py-2.5 border-b border-[#EDF0F7] bg-[#FAFBFE]`}>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Contact</span>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Subject</span>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Account</span>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Received</span>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Status</span>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Linked ticket</span>
      </div>
      {tickets.map((t) => (
        <div
          key={t.id}
          className={`grid ${GRID_COLS} items-center gap-3 px-5 py-3 border-b border-[#EDF0F7] last:border-0 hover:bg-[#F0F7FF] transition-colors`}
        >
          <Link href={`/desk/inbox/${t.ticketId}`} className="min-w-0">
            <span className="text-[13px] text-[#3A4565] truncate block">{t.contactName}</span>
          </Link>
          <Link href={`/desk/inbox/${t.ticketId}`} className="min-w-0">
            <span className="text-[13px] text-[#0B1533] truncate block" title={t.subject}>{t.subject}</span>
          </Link>
          <Link href={`/desk/inbox/${t.ticketId}`} className="min-w-0">
            <span className="text-[13px] text-[#3A4565] truncate block">{t.accountName ?? "-"}</span>
          </Link>
          <Link href={`/desk/inbox/${t.ticketId}`} className="min-w-0">
            <span className="text-[11px] font-mono text-[#5F6A88] truncate block" title={formatFullDateTime(t.receivedAt)}>
              {formatFullDateTime(t.receivedAt)}
            </span>
          </Link>
          {/* Status — editable, the ticket's own open/on_hold/escalated/closed status. */}
          <select
            value={t.status}
            onChange={(e) => onUpdateStatus(t.ticketId, e.target.value as TicketStatus)}
            className="text-[11px] font-semibold rounded-full px-2.5 py-0.5 outline-none cursor-pointer appearance-none w-fit truncate"
            style={{ color: STATUS_STYLE[t.status].text, background: STATUS_STYLE[t.status].bg }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s} className="bg-white text-[#3A4565]">
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {/* Linked Ticket — reverse of the Tickets tab's "Origin" column. Links straight to the
              filed issue's detail page under Projects (no dedicated Desk-side ticket detail page
              exists); a dash when no issue has been filed from this thread yet. */}
          {t.linkedIssue ? (
            <Link
              href={t.linkedIssue.href}
              className="block text-[11px] font-mono text-[#007BFF] hover:text-[#0063D6] hover:underline truncate"
            >
              {t.linkedIssue.issueDisplayId}
            </Link>
          ) : (
            <span className="block text-[12px] text-[#5F6A88]">—</span>
          )}
        </div>
      ))}
    </div>
  );
}
