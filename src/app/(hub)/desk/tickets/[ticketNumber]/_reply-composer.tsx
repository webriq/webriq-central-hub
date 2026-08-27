"use client";

import { RichTextEditor } from "./_rich-text-editor";
import { sanitizeMessageHtml, type MessageItem } from "./_conversation-thread";

// Reply composer (task 320) — upgraded from a plain <textarea> to a rich-text composer with
// From/To display rows and a quoted preview of the message the reply actually threads off of.
// sanitizeMessageHtml() (shared with ConversationThread) needs `window`, so this module is
// dynamically imported with ssr:false from _ticket-detail.tsx — same reason
// _conversation-thread.tsx is (see its header comment). No signature block (no email-template
// system in this codebase) and no editable To/CC/BCC — recipient stays the single resolved
// ticket.contactEmail, matching POST /reply.
function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(iso)
  );
}

// Mirrors the "latest message with an email_message_id" selection in
// src/app/api/desk/tickets/[ticketNumber]/reply/route.ts — POST /reply threads off exactly this
// message via replyToMessageId, so the quoted preview must match, not guess independently.
function findQuotedMessage(messages: MessageItem[]): MessageItem | null {
  const withEmailId = messages.filter((m) => m.emailMessageId);
  if (withEmailId.length === 0) return null;
  return [...withEmailId].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

export default function ReplyComposer({
  fromAddress,
  toEmail,
  messages,
  editorKey,
  onChange,
  onEmptyChange,
  saving,
  error,
  sendDisabled,
  onSend,
  onCancel,
}: {
  fromAddress: string | null;
  toEmail: string | null;
  messages: MessageItem[];
  editorKey: number;
  onChange: (html: string) => void;
  onEmptyChange: (isEmpty: boolean) => void;
  saving: boolean;
  error: string | null;
  sendDisabled: boolean;
  onSend: () => void;
  onCancel: () => void;
}) {
  const quoted = findQuotedMessage(messages);
  // Only lock the editor while sending or when there's nowhere to send to — NOT while empty,
  // otherwise the editor starts disabled (replyEmpty defaults true) and can never become
  // non-empty, since a disabled Tiptap instance can't receive input to fire onUpdate at all.
  // sendDisabled (below) is the one that reacts to emptiness.
  const editorDisabled = saving || !toEmail;

  return (
    <div>
      <div className="rounded-t-[10px] border border-b-0 border-[#E2E7F2] bg-[#FAFBFE] px-3 py-2 space-y-1">
        <div className="flex items-center gap-2 text-[12px]">
          <span className="w-9 text-[#5F6A88] font-medium">From</span>
          <span className="text-[#3A4565] truncate">{fromAddress ?? "Not configured"}</span>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="w-9 text-[#5F6A88] font-medium">To</span>
          <span className="text-[#3A4565] truncate">{toEmail ?? "No recipient email on file for this ticket"}</span>
        </div>
      </div>

      <RichTextEditor
        key={editorKey}
        onChange={onChange}
        onEmptyChange={onEmptyChange}
        placeholder="Write a reply to send to the customer…"
        disabled={editorDisabled}
      />

      {quoted && (
        <div className="mt-3 pl-3 border-l-2 border-[#E2E7F2]">
          <div className="text-[11px] text-[#5F6A88] mb-1">
            On {formatDateTime(quoted.createdAt)}, {quoted.authorName} wrote:
          </div>
          {quoted.isHtml ? (
            <div
              className="text-[12px] text-[#5F6A88] leading-relaxed [&_a]:text-[#007BFF] [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: sanitizeMessageHtml(quoted.body) }}
            />
          ) : (
            <div className="text-[12px] text-[#5F6A88] leading-relaxed whitespace-pre-wrap">{quoted.body}</div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        {error ? <span className="text-[11px] text-[#C0392B]">{error}</span> : <span />}
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[#3A4565] text-[12px] font-medium hover:border-[#A8C6F5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSend}
            disabled={sendDisabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#007BFF] text-white text-[12px] font-medium hover:bg-[#0066D6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
