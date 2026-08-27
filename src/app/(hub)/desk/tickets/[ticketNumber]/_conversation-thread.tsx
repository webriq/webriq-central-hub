"use client";

import { useState } from "react";
import DOMPurify from "dompurify";
import { Paperclip } from "lucide-react";
import { Chip } from "../../../dashboard/_components/dashboard-shared";

export type MessageAttachment = { id: string; filename: string; size: number | null };

export type MessageItem = {
  id: string;
  authorType: "client" | "staff" | "system" | "llm_draft";
  authorName: string;
  body: string;
  isHtml: boolean;
  visibility: "public" | "internal";
  createdAt: string;
  attachments: MessageAttachment[];
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

// dangerouslySetInnerHTML below only ever receives DOMPurify.sanitize() output — message
// bodies come from arbitrary external senders (anyone can email helpdesk@webriq.us), so
// this is a real untrusted-content boundary, unlike the Zoho-authored descriptions elsewhere
// in this codebase that reuse normalizeZohoDescriptionHtml (no sanitization, semi-trusted
// staff-authored source — not appropriate to reuse here).
export default function ConversationThread({ ticketNumber, messages }: { ticketNumber: number; messages: MessageItem[] }) {
  if (messages.length === 0) {
    return <div className="px-5 py-10 text-center text-[13px] text-[#5F6A88]">No messages yet.</div>;
  }

  return (
    <div className="divide-y divide-[#EDF0F7]">
      {messages.map((m) => (
        <div key={m.id} className="px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-[#EDF0F7] flex items-center justify-center text-[11px] font-semibold text-[#5F6A88] shrink-0">
              {m.authorName.slice(0, 1).toUpperCase()}
            </div>
            <span className="text-[13px] font-semibold text-[#0B1533]">{m.authorName}</span>
            <Chip tone={m.visibility === "internal" ? "warn" : "neutral"}>
              {m.visibility === "internal" ? "Private" : "Public"}
            </Chip>
            <span className="text-[11px] text-[#5F6A88] ml-auto">{formatDateTime(m.createdAt)}</span>
          </div>
          {m.isHtml ? (
            <div
              className="text-[13px] text-[#3A4565] leading-relaxed [&_a]:text-[#007BFF] [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(m.body, { USE_PROFILES: { html: true } }) }}
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
      ))}
    </div>
  );
}
