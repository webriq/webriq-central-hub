// Task 379 — revealed-state rendering for the public ticket view, split out of client.tsx per
// nextjs-file-length-best-practices.md. Pure presentational, no fetching of its own.

export type PublicTicketMessage = {
  id: string;
  authorType: "client" | "staff" | "system" | "llm_draft";
  body: string;
  createdAt: string;
};

export type PublicTicketData = {
  ticketNumber: number;
  subject: string;
  status: "open" | "on_hold" | "escalated" | "closed";
  createdAt: string;
};

const STATUS_LABEL: Record<PublicTicketData["status"], string> = {
  open: "Open",
  on_hold: "On Hold",
  escalated: "Escalated",
  closed: "Closed",
};

const STATUS_TONE: Record<PublicTicketData["status"], { fg: string; bg: string }> = {
  open: { fg: "#5F6A88", bg: "#EDF0F7" },
  on_hold: { fg: "#8A5A00", bg: "#FFF3D6" },
  escalated: { fg: "#8A5A00", bg: "#FFF3D6" },
  closed: { fg: "#177E48", bg: "#E3F5EA" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function messageAuthorLabel(authorType: PublicTicketMessage["authorType"]): string {
  return authorType === "client" ? "You" : "WebriQ Support Team";
}

export function TicketSummary({
  ticket,
  messages,
}: {
  ticket: PublicTicketData;
  messages: PublicTicketMessage[];
}) {
  const tone = STATUS_TONE[ticket.status];

  return (
    <div className="w-full max-w-[560px]">
      <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,.05)] overflow-hidden">
        <div className="px-6 py-5 border-b border-[#EDF0F7] bg-[#FAFBFE]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-mono font-semibold text-[#5F6A88] mb-1">
                #{ticket.ticketNumber}
              </p>
              <h1 className="font-heading text-[15px] font-semibold tracking-[-0.01em] text-[#0B1533] break-words">
                {ticket.subject}
              </h1>
            </div>
            <span
              className="shrink-0 inline-flex items-center rounded-[5px] px-2 py-1 text-[10px] font-bold"
              style={{ color: tone.fg, background: tone.bg }}
            >
              {STATUS_LABEL[ticket.status]}
            </span>
          </div>
          <p className="text-[11px] text-[#5F6A88] mt-2">Opened {formatDate(ticket.createdAt)}</p>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          {messages.length === 0 ? (
            <p className="text-[13px] text-[#5F6A88]">No messages yet.</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="rounded-[10px] border border-[#E2E7F2] bg-[#F4F6FB] px-4 py-3">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span className="text-[11px] font-semibold text-[#0B1533]">
                    {messageAuthorLabel(m.authorType)}
                  </span>
                  <span className="text-[11px] text-[#5F6A88]">{formatDate(m.createdAt)}</span>
                </div>
                <p className="text-[13px] text-[#3A4565] leading-relaxed whitespace-pre-wrap break-words">
                  {m.body}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
