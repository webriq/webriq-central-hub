// Shared presentational primitives for the Desk directory detail pages
// (`/desk/contacts/[id]`, `/desk/accounts/[id]` — task 335). Pure, server-safe.
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Chip } from "../dashboard/_components/dashboard-shared";

type TicketStatus = "open" | "on_hold" | "escalated" | "closed";

const STATUS_LABEL: Record<TicketStatus, string> = {
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

export function DetailShell({
  backHref,
  backLabel,
  title,
  subtitle,
  actions,
  children,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: string | null;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[960px] mx-auto px-8 py-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-[12px] text-[#5F6A88] hover:text-[#0B1533] transition-colors mb-4"
        >
          <ArrowLeft size={14} /> {backLabel}
        </Link>
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#0B1533] truncate">{title}</h1>
            {subtitle ? <p className="text-[13px] text-[#5F6A88] mt-0.5 truncate">{subtitle}</p> : null}
          </div>
          {actions ? <div className="shrink-0 flex items-center gap-2">{actions}</div> : null}
        </div>
        <div className="flex flex-col gap-6">{children}</div>
      </div>
    </div>
  );
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-[#EDF0F7] bg-[#FAFBFE]">
        <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function FieldGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">{children}</dl>;
}

export function Field({
  label,
  value,
  href,
  external,
}: {
  label: string;
  value: string | null | undefined;
  href?: string;
  external?: boolean;
}) {
  const display = value && value.trim() !== "" ? value : "—";
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8A93AB] mb-1">{label}</dt>
      <dd className="text-[13px] text-[#0B1533] truncate">
        {href && value ? (
          <Link
            href={href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="inline-flex items-center gap-1 text-[#0063D6] hover:underline"
          >
            {display}
            {external ? <ExternalLink size={12} /> : null}
          </Link>
        ) : (
          display
        )}
      </dd>
    </div>
  );
}

export type RelatedTicket = {
  id: string;
  ticketId: string;
  ticketNumber: number;
  subject: string;
  status: TicketStatus;
};

export function RelatedTickets({ tickets }: { tickets: RelatedTicket[] }) {
  if (tickets.length === 0) {
    return <p className="text-[13px] text-[#5F6A88]">No tickets.</p>;
  }
  return (
    <div className="flex flex-col -my-1">
      {tickets.map((t) => (
        <Link
          key={t.id}
          href={`/desk/tickets/${t.ticketId}`}
          className="flex items-center gap-3 py-2 border-b border-[#EDF0F7] last:border-0 hover:bg-[#F0F7FF] -mx-2 px-2 rounded-md transition-colors"
        >
          <span className="text-[11px] font-mono text-[#5F6A88] shrink-0 w-14">#{t.ticketNumber}</span>
          <span className="text-[13px] text-[#0B1533] truncate flex-1" title={t.subject}>{t.subject}</span>
          <Chip tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Chip>
        </Link>
      ))}
    </div>
  );
}

export function RelatedContacts({
  contacts,
}: {
  contacts: { id: string; name: string; email: string | null; phone: string | null }[];
}) {
  if (contacts.length === 0) {
    return <p className="text-[13px] text-[#5F6A88]">No contacts.</p>;
  }
  return (
    <div className="flex flex-col -my-1">
      {contacts.map((c) => (
        <Link
          key={c.id}
          href={`/desk/contacts/${c.id}`}
          className="flex items-center gap-3 py-2 border-b border-[#EDF0F7] last:border-0 hover:bg-[#F0F7FF] -mx-2 px-2 rounded-md transition-colors"
        >
          <span className="text-[13px] text-[#0B1533] truncate flex-1" title={c.name}>{c.name}</span>
          <span className="text-[12px] text-[#5F6A88] truncate max-w-[45%]">{c.email ?? c.phone ?? ""}</span>
        </Link>
      ))}
    </div>
  );
}
