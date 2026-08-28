"use client";

import { RichTextEditor } from "./_rich-text-editor";

// Reply composer (task 320; simplified in task 324) — rich-text composer with read-only
// From/To rows. The reply threads natively off the latest message in the conversation via
// POST /reply's replyToMessageId, and only the typed body is sent — no quoted copy of the
// prior thread (the customer's mail client already carries the history). Dynamically
// imported with ssr:false from _ticket-detail.tsx because RichTextEditor (Tiptap) needs
// `window`. No editable To/CC/BCC — recipient stays the single resolved ticket.contactEmail,
// matching POST /reply.
export default function ReplyComposer({
  fromAddress,
  toEmail,
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
  editorKey: number;
  onChange: (html: string) => void;
  onEmptyChange: (isEmpty: boolean) => void;
  saving: boolean;
  error: string | null;
  sendDisabled: boolean;
  onSend: () => void;
  onCancel: () => void;
}) {
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

      <div className="flex items-center justify-between mt-2 gap-3">
        {error ? (
          <span className="text-[11px] text-[#C0392B]">{error}</span>
        ) : (
          <span className="text-[11px] text-[#5F6A88]">
            Threads onto the latest message — the customer receives it as a reply.
          </span>
        )}
        <div className="flex items-center gap-2 shrink-0">
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
