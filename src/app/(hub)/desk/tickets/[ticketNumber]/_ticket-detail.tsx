"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Chip } from "../../../dashboard/_components/dashboard-shared";
import { V2_ROUTES } from "@/config/constants";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "./_rich-text-editor";
import type { MessageItem } from "./_conversation-thread";

// ConversationThread uses DOMPurify to render inbound HTML message bodies, which requires a
// DOM — same reason recharts is dynamically imported with ssr:false elsewhere in this codebase
// (CLAUDE.md: "Always import via next/dynamic with ssr: false since [it] uses browser APIs").
const ConversationThread = dynamic(() => import("./_conversation-thread"), {
  ssr: false,
  loading: () => <div className="px-5 py-10 text-center text-[13px] text-[#5F6A88]">Loading conversation…</div>,
});

// Same DOMPurify constraint as ConversationThread (renders the quoted message's HTML body) —
// see _reply-composer.tsx header comment.
const ReplyComposer = dynamic(() => import("./_reply-composer"), {
  ssr: false,
  loading: () => <div className="px-3 py-6 text-center text-[12px] text-[#5F6A88]">Loading composer…</div>,
});

const AttachmentsTab = dynamic(() => import("./_attachments-tab"), { ssr: false });

export type TicketDetailData = {
  id: string;
  ticketNumber: number;
  displayId: string;
  subject: string;
  status: "new" | "open" | "waiting_on_client" | "waiting_on_us" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "critical";
  channel: string;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  accountName: string | null;
  owner: string;
  createdAt: string;
  resolvedAt: string | null;
  firstResponseAt: string | null;
  slaDueAt: string | null;
  zohoTicketNumber: string | null;
};

const STATUS_OPTIONS: TicketDetailData["status"][] = [
  "new",
  "open",
  "waiting_on_client",
  "waiting_on_us",
  "resolved",
  "closed",
];

const STATUS_LABELS: Record<TicketDetailData["status"], string> = {
  new: "New",
  open: "Open",
  waiting_on_client: "Waiting on Client",
  waiting_on_us: "Waiting on Us",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_TONE: Record<TicketDetailData["status"], "ok" | "warn" | "neutral"> = {
  new: "neutral",
  open: "neutral",
  waiting_on_client: "warn",
  waiting_on_us: "warn",
  resolved: "ok",
  closed: "ok",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

type TabId = "conversations" | "threads" | "comments" | "attachments";

export default function TicketDetail({
  ticket,
  messages,
  fromAddress,
}: {
  ticket: TicketDetailData;
  messages: MessageItem[];
  fromAddress: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(ticket.status);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabId>("conversations");
  const [composeMode, setComposeMode] = useState<"note" | "reply">("note");

  const [noteBody, setNoteBody] = useState("");
  const [noteEmpty, setNoteEmpty] = useState(true);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteEditorKey, setNoteEditorKey] = useState(0);

  const [replyBody, setReplyBody] = useState("");
  const [replyEmpty, setReplyEmpty] = useState(true);
  const [replySaving, setReplySaving] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyEditorKey, setReplyEditorKey] = useState(0);

  const publicMessages = messages.filter((m) => m.visibility === "public");
  const internalMessages = messages.filter((m) => m.visibility === "internal");
  const attachmentCount = messages.reduce((sum, m) => sum + m.attachments.length, 0);

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "conversations", label: "Conversations", count: messages.length },
    { id: "threads", label: "Threads", count: publicMessages.length },
    { id: "comments", label: "Comments", count: internalMessages.length },
    { id: "attachments", label: "Attachments", count: attachmentCount },
  ];

  const threadMessages =
    activeTab === "threads" ? publicMessages : activeTab === "comments" ? internalMessages : messages;

  async function handleStatusChange(next: TicketDetailData["status"]) {
    const prev = status;
    setStatus(next);
    setStatusSaving(true);
    setStatusError(null);
    try {
      const res = await fetch(`/api/desk/tickets/${ticket.ticketNumber}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (e) {
      setStatus(prev);
      setStatusError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setStatusSaving(false);
    }
  }

  async function handleAddNote() {
    if (noteEmpty) return;
    setNoteSaving(true);
    setNoteError(null);
    try {
      const res = await fetch(`/api/desk/tickets/${ticket.ticketNumber}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteBody }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setNoteBody("");
      setNoteEmpty(true);
      setNoteEditorKey((k) => k + 1);
      router.refresh();
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : "Failed to add note");
    } finally {
      setNoteSaving(false);
    }
  }

  async function handleSendReply() {
    if (replyEmpty) return;
    setReplySaving(true);
    setReplyError(null);
    try {
      const res = await fetch(`/api/desk/tickets/${ticket.ticketNumber}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyBody }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setReplyBody("");
      setReplyEmpty(true);
      setReplyEditorKey((k) => k + 1);
      router.refresh();
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : "Failed to send reply");
    } finally {
      setReplySaving(false);
    }
  }

  function handleCancelReply() {
    setReplyBody("");
    setReplyEmpty(true);
    setReplyError(null);
    setReplyEditorKey((k) => k + 1);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1400px] mx-auto px-8 py-6">
        <div className="mb-5">
          <Link
            href={V2_ROUTES.DESK_TICKETS}
            className="inline-flex items-center gap-1.5 text-[12px] text-[#5F6A88] hover:text-[#0B1533] transition-colors mb-3"
          >
            <ArrowLeft size={13} /> Back to Tickets
          </Link>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono text-[#5F6A88]">{ticket.displayId}</span>
            <Chip tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Chip>
          </div>
          <h1 className="font-heading text-[20px] font-bold tracking-[-0.02em] text-[#0B1533]">{ticket.subject}</h1>
          <p className="text-[13px] text-[#5F6A88] mt-0.5">
            {ticket.contactName} · {formatDateTime(ticket.createdAt)}
          </p>
        </div>

        <div className="grid grid-cols-[280px_1fr] gap-5 items-start">
          {/* Left: Ticket Properties */}
          <div className="space-y-4">
            <div className="rounded-[14px] border border-[#E2E7F2] bg-white p-4">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#5F6A88] mb-3">Contact Info</h2>
              <div className="space-y-1.5 text-[13px] text-[#3A4565]">
                <div className="font-semibold text-[#0B1533]">{ticket.contactName}</div>
                {ticket.accountName && <div className="text-[12px] text-[#5F6A88]">{ticket.accountName}</div>}
                {ticket.contactEmail && <div className="truncate">{ticket.contactEmail}</div>}
                {ticket.contactPhone && <div>{ticket.contactPhone}</div>}
              </div>
            </div>

            <div className="rounded-[14px] border border-[#E2E7F2] bg-white p-4">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#5F6A88] mb-3">Key Information</h2>
              <div className="space-y-3 text-[13px]">
                <div>
                  <div className="text-[11px] text-[#5F6A88] mb-0.5">Owner</div>
                  <div className="text-[#0B1533]">{ticket.owner}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#5F6A88] mb-0.5">Status</div>
                  <select
                    value={status}
                    onChange={(e) => handleStatusChange(e.target.value as TicketDetailData["status"])}
                    disabled={statusSaving}
                    className="w-full h-8 px-2 rounded-[8px] border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] outline-none focus:border-[#007BFF] disabled:opacity-60 cursor-pointer"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  {statusError && <div className="text-[11px] text-[#C0392B] mt-1">{statusError}</div>}
                </div>
                <div>
                  <div className="text-[11px] text-[#5F6A88] mb-0.5">Created</div>
                  <div className="text-[#0B1533]">{formatDateTime(ticket.createdAt)}</div>
                </div>
                {ticket.resolvedAt && (
                  <div>
                    <div className="text-[11px] text-[#5F6A88] mb-0.5">Resolved</div>
                    <div className="text-[#0B1533]">{formatDateTime(ticket.resolvedAt)}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[14px] border border-[#E2E7F2] bg-white p-4">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#5F6A88] mb-3">Ticket Information</h2>
              <div className="space-y-3 text-[13px]">
                <div>
                  <div className="text-[11px] text-[#5F6A88] mb-0.5">Priority</div>
                  <div className="text-[#0B1533] capitalize">{ticket.priority}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#5F6A88] mb-0.5">Channel</div>
                  <div className="text-[#0B1533] capitalize">{ticket.channel}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#5F6A88] mb-0.5">SLA Due</div>
                  <div className="text-[#0B1533]">{formatDateTime(ticket.slaDueAt)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#5F6A88] mb-0.5">First Response</div>
                  <div className="text-[#0B1533]">{formatDateTime(ticket.firstResponseAt)}</div>
                </div>
                {ticket.zohoTicketNumber && (
                  <div>
                    <div className="text-[11px] text-[#5F6A88] mb-0.5">Zoho Ticket #</div>
                    <div className="text-[#0B1533]">{ticket.zohoTicketNumber}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Conversation */}
          <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">
            <div className="px-5 border-b border-[#EDF0F7] flex items-center gap-5 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "py-3 text-[13px] font-medium border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap transition-colors",
                    activeTab === tab.id
                      ? "border-[#007BFF] text-[#0B1533]"
                      : "border-transparent text-[#5F6A88] hover:text-[#0B1533]"
                  )}
                >
                  {tab.label}
                  <span className="font-mono text-[11px] opacity-60">{tab.count}</span>
                </button>
              ))}
            </div>

            {activeTab === "attachments" ? (
              <AttachmentsTab ticketNumber={ticket.ticketNumber} messages={messages} />
            ) : (
              <ConversationThread ticketNumber={ticket.ticketNumber} messages={threadMessages} />
            )}

            {activeTab !== "attachments" && (
              <div className="px-5 py-4 border-t border-[#EDF0F7] bg-[#FAFBFE]">
                <div className="flex items-center gap-1 mb-2.5">
                  <button
                    onClick={() => setComposeMode("note")}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                      composeMode === "note" ? "bg-[#8A5A00] text-white" : "text-[#5F6A88] hover:bg-[#EDF0F7]"
                    }`}
                  >
                    Internal Note
                  </button>
                  <button
                    onClick={() => setComposeMode("reply")}
                    className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                      composeMode === "reply" ? "bg-[#007BFF] text-white" : "text-[#5F6A88] hover:bg-[#EDF0F7]"
                    }`}
                  >
                    Reply to Customer
                  </button>
                </div>

                {composeMode === "note" ? (
                  <>
                    <div className="text-[11px] font-semibold text-[#8A5A00] mb-1.5">
                      Add internal note (staff only — not sent to the customer)
                    </div>
                    <RichTextEditor
                      key={noteEditorKey}
                      onChange={setNoteBody}
                      onEmptyChange={setNoteEmpty}
                      placeholder="Write a note visible only to staff…"
                      disabled={noteSaving}
                    />
                    <div className="flex items-center justify-between mt-2">
                      {noteError ? <span className="text-[11px] text-[#C0392B]">{noteError}</span> : <span />}
                      <button
                        onClick={handleAddNote}
                        disabled={noteSaving || noteEmpty}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0B1533] text-white text-[12px] font-medium hover:bg-[#1a2547] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {noteSaving ? "Adding…" : "Add Note"}
                      </button>
                    </div>
                  </>
                ) : (
                  <ReplyComposer
                    fromAddress={fromAddress}
                    toEmail={ticket.contactEmail}
                    messages={messages}
                    editorKey={replyEditorKey}
                    onChange={setReplyBody}
                    onEmptyChange={setReplyEmpty}
                    saving={replySaving}
                    error={replyError}
                    sendDisabled={replySaving || replyEmpty || !ticket.contactEmail}
                    onSend={handleSendReply}
                    onCancel={handleCancelReply}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
