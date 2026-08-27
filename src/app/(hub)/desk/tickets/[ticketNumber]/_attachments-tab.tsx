"use client";

import { useState } from "react";
import { Paperclip, Download } from "lucide-react";
import type { MessageItem } from "./_conversation-thread";

// Ticket-wide Attachments tab (task 320) — aggregates attachments across every message on the
// ticket rather than showing them per-message (that's what the Conversations/Threads/Comments
// tabs already do inline). View/download only — no upload UI, matching task 306's scope
// (import + download only; no upload endpoint exists for ticket_message attachments).
function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(iso)
  );
}

type FlatAttachment = {
  id: string;
  filename: string;
  size: number | null;
  messageId: string;
  authorName: string;
  createdAt: string;
};

function AttachmentRow({ ticketNumber, attachment }: { ticketNumber: number; attachment: FlatAttachment }) {
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleDownload() {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(
        `/api/desk/tickets/${ticketNumber}/messages/${attachment.messageId}/attachments/${attachment.id}/file-url`
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
    <div className="flex items-center gap-3 px-5 py-3 border-b border-[#EDF0F7] last:border-b-0 hover:bg-[#F0F7FF] transition-colors">
      <div className="w-8 h-8 rounded-[8px] bg-[#EDF0F7] flex items-center justify-center shrink-0">
        <Paperclip size={14} className="text-[#5F6A88]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-[#0B1533] truncate">{attachment.filename}</div>
        <div className="text-[11px] text-[#5F6A88]">
          {attachment.authorName} · {formatDateTime(attachment.createdAt)}
          {attachment.size != null && ` · ${formatSize(attachment.size)}`}
        </div>
      </div>
      <button
        onClick={handleDownload}
        disabled={loading}
        title={failed ? "Failed to open — try again" : "Download"}
        aria-label={`Download ${attachment.filename}`}
        className="w-7 h-7 rounded-full flex items-center justify-center text-[#5F6A88] hover:bg-white hover:text-[#007BFF] disabled:opacity-50 transition-colors shrink-0"
      >
        {failed ? <span className="text-[11px] text-[#C0392B]">!</span> : <Download size={14} />}
      </button>
    </div>
  );
}

export default function AttachmentsTab({ ticketNumber, messages }: { ticketNumber: number; messages: MessageItem[] }) {
  const attachments: FlatAttachment[] = messages.flatMap((m) =>
    m.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      size: a.size,
      messageId: m.id,
      authorName: m.authorName,
      createdAt: m.createdAt,
    }))
  );

  if (attachments.length === 0) {
    return (
      <div className="px-5 py-14 text-center">
        <div className="w-12 h-12 rounded-full bg-[#EDF0F7] flex items-center justify-center mx-auto mb-3">
          <Paperclip size={18} className="text-[#5F6A88]" />
        </div>
        <div className="text-[13px] font-semibold text-[#0B1533] mb-1">No attachments on this ticket</div>
        <p className="text-[13px] text-[#5F6A88]">Files sent by the customer or attached to a reply will show up here.</p>
      </div>
    );
  }

  return (
    <div>
      {attachments.map((a) => (
        <AttachmentRow key={a.id} ticketNumber={ticketNumber} attachment={a} />
      ))}
    </div>
  );
}
