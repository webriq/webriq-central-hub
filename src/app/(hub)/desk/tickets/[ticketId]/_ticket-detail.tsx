"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, MessageSquare, Reply } from "lucide-react";
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

// RichTextEditor (Tiptap) inside the composer needs `window` — same ssr:false reason as
// ConversationThread. See _reply-composer.tsx header comment.
const ReplyComposer = dynamic(() => import("./_reply-composer"), {
  ssr: false,
  loading: () => <div className="px-3 py-6 text-center text-[12px] text-[#5F6A88]">Loading composer…</div>,
});

const AttachmentsTab = dynamic(() => import("./_attachments-tab"), { ssr: false });

export type TicketDetailData = {
  id: string;
  ticketId: string;
  displayId: string;
  subject: string;
  status: "open" | "on_hold" | "escalated" | "closed";
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

const STATUS_OPTIONS: TicketDetailData["status"][] = ["open", "on_hold", "escalated", "closed"];

const STATUS_LABELS: Record<TicketDetailData["status"], string> = {
  open: "Open",
  on_hold: "On Hold",
  escalated: "Escalated",
  closed: "Closed",
};

const STATUS_TONE: Record<TicketDetailData["status"], "ok" | "warn" | "neutral"> = {
  open: "neutral",
  on_hold: "warn",
  escalated: "warn",
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

const newestFirst = (a: MessageItem, b: MessageItem) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

const TAB_BASE =
  "py-3 text-[13px] font-medium border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap transition-colors";
const TAB_ACTIVE = "border-[#007BFF] text-[#0B1533]";
const TAB_INACTIVE = "border-transparent text-[#5F6A88] hover:text-[#0B1533]";

// Reply / Comment header actions (task 324) — shared shape; only the accent colors differ.
const ACTION_BTN_BASE =
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors";
const ACTION_BTN_IDLE = "border border-[#E2E7F2] text-[#3A4565] hover:text-[#0B1533]";

// Which conversation stream is showing on the right-hand card. "conversations" is the merged
// feed (threads + comments); "threads" / "comments" are the split streams reached by expanding
// the view switcher (task 323 — mirrors Zoho Desk's Conversations <-> Threads toggle).
type ConvView = "conversations" | "threads" | "comments";

// The count-labelled tab that carries the Conversations <-> Threads switcher caret. Only one
// instance renders at a time (Conversations in merged view, Threads in split view).
function ViewSwitchTab({
  count,
  label,
  active,
  onSelect,
  menuLabel,
  menuCount,
  onMenuSelect,
}: {
  count: number;
  label: string;
  active: boolean;
  onSelect: () => void;
  menuLabel: string;
  menuCount: number;
  onMenuSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    // One continuous bottom border under the whole [count · label · caret] unit — the
    // border lives on this wrapper (not the two inner buttons) so the blue active
    // underline never looks "cut" between the label and the caret. -mb-px matches the
    // plain tabs so it sits flush on the tab strip's own border.
    <div
      ref={ref}
      className={cn(
        "relative flex items-center border-b-2 -mb-px transition-colors",
        active ? "border-[#007BFF]" : "border-transparent"
      )}
    >
      <button
        onClick={onSelect}
        className={cn(
          "py-3 pr-1 text-[13px] font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors",
          active ? "text-[#0B1533]" : "text-[#5F6A88] hover:text-[#0B1533]"
        )}
      >
        <span className="font-mono text-[11px] opacity-60">{count}</span>
        {label}
      </button>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Switch conversation view — currently ${label}`}
        aria-expanded={open}
        className="py-3 pl-0.5 pr-1 text-[#5F6A88] hover:text-[#0B1533] transition-colors"
      >
        <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-30 min-w-[200px] overflow-hidden rounded-[12px] border border-[#E2E7F2] bg-white shadow-[0_16px_40px_-12px_rgba(11,21,51,0.28)] ring-1 ring-[#0B1533]/[0.04]">
          <button
            onClick={() => {
              setOpen(false);
              onMenuSelect();
            }}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] font-medium text-[#3A4565] hover:bg-[#F0F6FF] hover:text-[#0B1533] transition-colors"
          >
            <span className="font-mono text-[11px] text-[#5F6A88]">{menuCount}</span>
            {menuLabel}
          </button>
        </div>
      )}
    </div>
  );
}

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

  const [convView, setConvView] = useState<ConvView>("conversations");
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  // Task 324 — the compose surface. "reply" replaces the message list with a full email
  // composer; "comment" shows the internal-note editor above the list. Auto-set to
  // "comment" when the Comments view is opened.
  const [composerMode, setComposerMode] = useState<"none" | "reply" | "comment">("none");

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

  const threads = messages.filter((m) => m.kind === "thread");
  const comments = messages.filter((m) => m.kind === "comment");
  const attachmentCount = messages.reduce((sum, m) => sum + m.attachments.length, 0);

  // In "conversations" the switcher tab reads "N Conversations"; in the split views it reads
  // "N Threads" and a plain "N Comments" tab appears alongside it.
  const splitView = convView !== "conversations";

  const shownMessages = [
    ...(convView === "conversations" ? messages : convView === "threads" ? threads : comments),
  ].sort(newestFirst);

  // Switching the message view also resets the composer: the Comments view opens the
  // note editor by default (Zoho parity), every other view closes any open composer.
  function goToView(view: ConvView) {
    setConvView(view);
    setAttachmentsOpen(false);
    setComposerMode(view === "comments" ? "comment" : "none");
  }

  function goToAttachments() {
    setAttachmentsOpen(true);
    setComposerMode("none");
  }

  function handleCancelNote() {
    setNoteBody("");
    setNoteEmpty(true);
    setNoteError(null);
    setNoteEditorKey((k) => k + 1);
  }

  async function handleStatusChange(next: TicketDetailData["status"]) {
    const prev = status;
    setStatus(next);
    setStatusSaving(true);
    setStatusError(null);
    try {
      const res = await fetch(`/api/desk/tickets/${ticket.ticketId}/status`, {
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
      const res = await fetch(`/api/desk/tickets/${ticket.ticketId}/notes`, {
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
      // Stay open on the Comments view (it's the default surface there); collapse elsewhere.
      if (convView !== "comments") setComposerMode("none");
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
      const res = await fetch(`/api/desk/tickets/${ticket.ticketId}/reply`, {
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
      setComposerMode("none");
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
        <Link
          href={V2_ROUTES.DESK_TICKETS}
          className="inline-flex items-center gap-1.5 text-[12px] text-[#5F6A88] hover:text-[#0B1533] transition-colors mb-5"
        >
          <ArrowLeft size={13} /> Back to Tickets
        </Link>

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

          {/* Right: Subject + Conversation */}
          <div className="space-y-4 min-w-0">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-mono text-[#5F6A88]">{ticket.displayId}</span>
                <Chip tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Chip>
              </div>
              <h1 className="font-heading text-[20px] font-bold tracking-[-0.02em] text-[#0B1533]">{ticket.subject}</h1>
              <p className="text-[13px] text-[#5F6A88] mt-0.5">
                {ticket.contactName} · {formatDateTime(ticket.createdAt)}
              </p>
            </div>

            <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">
              {/* No overflow-x here: it would create a clipping context that hides the
                  view-switcher dropdown (task 323). The tab set is small (max 3). */}
              <div className="px-5 border-b border-[#EDF0F7] flex items-center gap-5 flex-wrap">
                {splitView ? (
                  <>
                    <ViewSwitchTab
                      count={threads.length}
                      label="Threads"
                      active={!attachmentsOpen && convView === "threads"}
                      onSelect={() => goToView("threads")}
                      menuLabel="Conversations"
                      menuCount={messages.length}
                      onMenuSelect={() => goToView("conversations")}
                    />
                    <button
                      onClick={() => goToView("comments")}
                      className={cn(TAB_BASE, !attachmentsOpen && convView === "comments" ? TAB_ACTIVE : TAB_INACTIVE)}
                    >
                      <span className="font-mono text-[11px] opacity-60">{comments.length}</span>
                      Comments
                    </button>
                  </>
                ) : (
                  <ViewSwitchTab
                    count={messages.length}
                    label="Conversations"
                    active={!attachmentsOpen}
                    onSelect={() => goToView("conversations")}
                    menuLabel="Threads"
                    menuCount={threads.length}
                    onMenuSelect={() => goToView("threads")}
                  />
                )}
                <button
                  onClick={goToAttachments}
                  className={cn(TAB_BASE, attachmentsOpen ? TAB_ACTIVE : TAB_INACTIVE)}
                >
                  <span className="font-mono text-[11px] opacity-60">{attachmentCount}</span>
                  Attachments
                </button>

                {!attachmentsOpen && (
                  <div className="ml-auto flex items-center gap-2 py-1.5">
                    {(convView === "conversations" || convView === "threads") && (
                      <button
                        onClick={() => setComposerMode("reply")}
                        aria-label="Reply to the customer"
                        className={cn(
                          ACTION_BTN_BASE,
                          composerMode === "reply"
                            ? "bg-[#007BFF] text-white"
                            : cn(ACTION_BTN_IDLE, "hover:border-[#A8C6F5]")
                        )}
                      >
                        <Reply size={13} /> Reply
                      </button>
                    )}
                    {(convView === "conversations" || convView === "comments") && (
                      <button
                        onClick={() => setComposerMode("comment")}
                        aria-label="Add an internal comment"
                        className={cn(
                          ACTION_BTN_BASE,
                          composerMode === "comment"
                            ? "bg-[#8A5A00] text-white"
                            : cn(ACTION_BTN_IDLE, "hover:border-[#E0C088]")
                        )}
                      >
                        <MessageSquare size={13} /> Comment
                      </button>
                    )}
                  </div>
                )}
              </div>

              {attachmentsOpen ? (
                <AttachmentsTab ticketId={ticket.ticketId} messages={messages} />
              ) : composerMode === "reply" ? (
                <div className="px-5 py-4">
                  <div className="mb-3 text-[13px] font-semibold text-[#0B1533]">
                    Replying to {ticket.contactName}
                  </div>
                  <ReplyComposer
                    fromAddress={fromAddress}
                    toEmail={ticket.contactEmail}
                    editorKey={replyEditorKey}
                    onChange={setReplyBody}
                    onEmptyChange={setReplyEmpty}
                    saving={replySaving}
                    error={replyError}
                    sendDisabled={replySaving || replyEmpty || !ticket.contactEmail}
                    onSend={handleSendReply}
                    onCancel={() => {
                      handleCancelReply();
                      setComposerMode("none");
                    }}
                  />
                </div>
              ) : (
                <>
                  {composerMode === "comment" && (
                    <div className="px-5 py-4 border-b border-[#EDF0F7] bg-[#FEFCF6]">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-[11px] font-semibold text-[#8A5A00]">
                          Add internal note (staff only — not sent to the customer)
                        </div>
                        {convView !== "comments" && (
                          <button
                            onClick={() => {
                              handleCancelNote();
                              setComposerMode("none");
                            }}
                            className="text-[11px] text-[#5F6A88] hover:text-[#0B1533] transition-colors"
                          >
                            Cancel
                          </button>
                        )}
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
                    </div>
                  )}
                  <ConversationThread
                    key={convView}
                    ticketId={ticket.ticketId}
                    messages={shownMessages}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
