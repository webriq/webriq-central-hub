import Link from "next/link";
import { Chip } from "../../dashboard/_components/dashboard-shared";
import type { TicketListItem, TicketStatus } from "./_tickets-index";

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  on_hold: "On Hold",
  escalated: "Escalated",
  closed: "Closed",
};

const STATUS_TONE: Record<TicketStatus, "ok" | "warn" | "neutral"> = {
  open: "neutral",
  on_hold: "warn",
  escalated: "warn",
  closed: "ok",
};

function StatusBadge({ status }: { status: TicketStatus }) {
  return <Chip tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Chip>;
}

// Compact date-time to match the reference Zoho Desk Tickets screenshot: bare time for today
// ("04:57 AM"), day + month + time otherwise ("24 Aug 10:55 PM").
function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
  }
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }).format(d);
}

const GRID_COLS = "grid-cols-[84px_1fr_150px_140px_130px_120px_120px_112px]";

export function TicketsTable({ tickets }: { tickets: TicketListItem[] }) {
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">
      <div className={`grid ${GRID_COLS} items-center gap-3 px-5 py-2.5 border-b border-[#EDF0F7] bg-[#FAFBFE]`}>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Ticket ID</span>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Subject</span>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Contact</span>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Account</span>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Owner</span>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Responded</span>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Due Date</span>
        <span className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Status</span>
      </div>
      {tickets.map((t) => (
        <Link
          key={t.id}
          href={`/desk/tickets/${t.ticketId}`}
          className={`grid ${GRID_COLS} items-center gap-3 px-5 py-3 border-b border-[#EDF0F7] last:border-0 hover:bg-[#F0F7FF] transition-colors`}
        >
          <span className="text-[11px] font-mono text-[#5F6A88] truncate">{t.displayId}</span>
          <span className="text-[13px] text-[#0B1533] truncate" title={t.subject}>{t.subject}</span>
          <span className="text-[13px] text-[#3A4565] truncate">{t.contactName}</span>
          <span className="text-[13px] text-[#3A4565] truncate">{t.accountName ?? "-"}</span>
          <span className="text-[13px] text-[#3A4565] truncate">{t.owner}</span>
          <span className="text-[11px] font-mono text-[#5F6A88] truncate">
            {t.respondedAt ? formatShortDateTime(t.respondedAt) : "-"}
          </span>
          <span className={`text-[11px] font-mono truncate ${t.isOverdue ? "text-[#C0392B] font-semibold" : "text-[#5F6A88]"}`}>
            {t.dueAt ? formatShortDateTime(t.dueAt) : "-"}
          </span>
          <StatusBadge status={t.status} />
        </Link>
      ))}
    </div>
  );
}
