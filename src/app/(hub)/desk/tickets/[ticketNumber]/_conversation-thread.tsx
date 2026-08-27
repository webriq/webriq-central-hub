"use client";

import { useState } from "react";
import DOMPurify from "dompurify";
import { ChevronDown, Paperclip } from "lucide-react";
import { Chip } from "../../../dashboard/_components/dashboard-shared";
import { cn } from "@/lib/utils";

export type MessageAttachment = { id: string; filename: string; size: number | null };

export type MessageItem = {
  id: string;
  authorType: "client" | "staff" | "system" | "llm_draft";
  authorName: string;
  body: string;
  isHtml: boolean;
  visibility: "public" | "internal";
  // Task 323 — which conversation stream this message belongs to. Derived server-side from
  // source_meta.zohoSource (imported rows) / visibility (Hub-native rows). "thread" = the
  // real customer<->agent conversation (incl. our outbound replies); "comment" = internal
  // notes + Zoho agent comments + status-change lines. Drives the Threads/Comments tabs.
  kind: "thread" | "comment";
  createdAt: string;
  attachments: MessageAttachment[];
  // Which email this message threads off (task 320) — used to find the message that
  // POST /reply actually replies to, so the reply composer's quoted preview matches it.
  emailMessageId: string | null;
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }).format(
    new Date(iso)
  );
}

function AttachmentChip({
  ticketNumber,
  messageId,
  attachment,
}: {
  ticketNumber: number;
  messageId: string;
  attachment: MessageAttachment;
}) {
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleDownload() {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(
        `/api/desk/tickets/${ticketNumber}/messages/${messageId}/attachments/${attachment.id}/file-url`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { url } = await res.json();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      title={failed ? "Failed to open — try again" : attachment.filename}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#E2E7F2] bg-[#FAFBFE] text-[11px] text-[#3A4565] hover:bg-[#F0F7FF] disabled:opacity-50 disabled:cursor-default transition-colors"
    >
      <Paperclip size={11} />
      <span className="truncate max-w-40">{attachment.filename}</span>
      {failed && <span className="text-[#C0392B]">!</span>}
    </button>
  );
}

// Zoho Desk's imported thread inline images are host-relative
// (`/supportapi/api/v1/threads/{id}/inlineImages/{id}?...`) with no origin, so they 404 rendered
// as-is — same class of problem as Zoho Projects' portal-relative description images
// (absolutizeZohoInlineImages in projects-old/_pm-shared.tsx), just a different Zoho product's
// API path. Prepend the same crmplus.zoho.com host those imported threads were served from.
function absolutizeZohoDeskInlineImages(html: string): string {
  return html.replace(
    /\bsrc=(["'])(\/supportapi\/api\/v1[^"']*)\1/gi,
    (_match, quote: string, path: string) => `src=${quote}https://crmplus.zoho.com${path}${quote}`
  );
}

// dangerouslySetInnerHTML below only ever receives sanitizeMessageHtml() output — message
// bodies come from arbitrary external senders (anyone can email helpdesk@webriq.us), so
// this is a real untrusted-content boundary, unlike the Zoho-authored descriptions elsewhere
// in this codebase that reuse normalizeZohoDescriptionHtml (no sanitization, semi-trusted
// staff-authored source — not appropriate to reuse here). Exported so _reply-composer.tsx's
// quoted-message preview (same body shape) renders identically.
export function sanitizeMessageHtml(body: string): string {
  return DOMPurify.sanitize(absolutizeZohoDeskInlineImages(body), { USE_PROFILES: { html: true } });
}

// One-line snippet for a collapsed message (task 323). Strips tags/entities/quoted-reply
// noise so the collapsed row reads like Zoho Desk's preview line.
function previewText(body: string, isHtml: boolean): string {
  const text = isHtml ? body.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ") : body;
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

// Is this message one of our outbound replies to the customer? (vs. an inbound customer
// message or an internal note). Used to tint the card so "the reply from us" is obvious.
function isOutboundReply(m: MessageItem): boolean {
  return m.authorType === "staff" && m.visibility === "public";
}

function MessageCard({
  ticketNumber,
  message,
  open,
  onToggle,
}: {
  ticketNumber: number;
  message: MessageItem;
  open: boolean;
  onToggle: () => void;
}) {
  const m = message;
  const tint = isOutboundReply(m)
    ? "bg-[#F4F8FF]"
    : m.visibility === "internal"
      ? "bg-[#FEFCF6]"
      : "bg-white";

  return (
    <div className={cn("px-5 py-3", tint)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <div className="w-7 h-7 rounded-full bg-[#EDF0F7] flex items-center justify-center text-[11px] font-semibold text-[#5F6A88] shrink-0">
          {m.authorName.slice(0, 1).toUpperCase()}
        </div>
        <span className="text-[13px] font-semibold text-[#0B1533] shrink-0">{m.authorName}</span>
        {isOutboundReply(m) && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#007BFF] shrink-0">
            Reply from us
          </span>
        )}
        <Chip tone={m.visibility === "internal" ? "warn" : "neutral"}>
          {m.visibility === "internal" ? "Private" : "Public"}
        </Chip>
        {!open && (
          <span className="text-[13px] text-[#5F6A88] truncate min-w-0 flex-1">
            {previewText(m.body, m.isHtml)}
          </span>
        )}
        <span className="text-[11px] text-[#5F6A88] ml-auto shrink-0">{formatDateTime(m.createdAt)}</span>
        <ChevronDown
          size={14}
          className={cn("text-[#5F6A88] shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="mt-2 pl-9">
          {m.isHtml ? (
            <div
              className="text-[13px] text-[#3A4565] leading-relaxed [&_a]:text-[#007BFF] [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: sanitizeMessageHtml(m.body) }}
            />
          ) : (
            <div className="text-[13px] text-[#3A4565] leading-relaxed whitespace-pre-wrap">{m.body}</div>
          )}
          {m.attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {m.attachments.map((a) => (
                <AttachmentChip key={a.id} ticketNumber={ticketNumber} messageId={m.id} attachment={a} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ConversationThread({ ticketNumber, messages }: { ticketNumber: number; messages: MessageItem[] }) {
  // Collapsed by default like Zoho Desk (task 323) — only the newest message (index 0,
  // since the parent passes newest-first) starts expanded. The parent keys this component
  // on the active view, so switching Conversations/Threads/Comments remounts it and
  // re-seeds this from scratch.
  const newestId = messages[0]?.id;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => (newestId ? new Set([newestId]) : new Set()));

  function toggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (messages.length === 0) {
    return <div className="px-5 py-10 text-center text-[13px] text-[#5F6A88]">No messages yet.</div>;
  }

  const allExpanded = messages.every((m) => expandedIds.has(m.id));

  return (
    <div>
      <div className="flex justify-end px-5 pt-3">
        <button
          type="button"
          onClick={() =>
            setExpandedIds(allExpanded ? new Set() : new Set(messages.map((m) => m.id)))
          }
          className="text-[11px] font-medium text-[#5F6A88] hover:text-[#0B1533] transition-colors"
        >
          {allExpanded ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <div className="divide-y divide-[#EDF0F7]">
        {messages.map((m) => (
          <MessageCard
            key={m.id}
            ticketNumber={ticketNumber}
            message={m}
            open={expandedIds.has(m.id)}
            onToggle={() => toggle(m.id)}
          />
        ))}
      </div>
    </div>
  );
}
