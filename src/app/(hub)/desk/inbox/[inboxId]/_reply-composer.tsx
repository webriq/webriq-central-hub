"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { RichTextEditor } from "./_rich-text-editor";

export type ReplyRecipients = { to: string[]; cc: string[]; bcc: string[] };

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

// One To/Cc/Bcc row: committed addresses as removable chips plus a free-text input. Enter,
// comma, semicolon, Tab or blur commits; a pasted list ("a@x.com, b@y.com") splits into chips;
// Backspace on an empty input removes the last chip. Invalid text stays in the input with an
// inline error so nothing is silently dropped.
function RecipientRow({
  label,
  emails,
  onChange,
  disabled,
  autoFocus,
}: {
  label: string;
  emails: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);

  function commit(text: string): boolean {
    const parts = text
      .split(/[,;\s]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return true;
    const bad = parts.find((p) => !EMAIL_RE.test(p));
    if (bad) {
      setInvalid(bad);
      return false;
    }
    const existing = new Set(emails.map((e) => e.toLowerCase()));
    const added = parts.filter((p) => {
      const key = p.toLowerCase();
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    });
    if (added.length > 0) onChange([...emails, ...added]);
    setDraft("");
    setInvalid(null);
    return true;
  }

  return (
    <div className="flex items-start gap-2 text-[12px]">
      <span className="w-9 shrink-0 pt-1 font-medium text-[#5F6A88]">{label}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1">
          {emails.map((email) => (
            <span
              key={email}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#D6E4FB] bg-[#EEF4FF] py-0.5 pl-2 pr-1 text-[11px] text-[#0B1533]"
            >
              <span className="truncate">{email}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(emails.filter((e) => e !== email))}
                aria-label={`Remove ${email}`}
                className="rounded-full p-0.5 text-[#5F6A88] transition-colors hover:bg-[#D6E4FB] hover:text-[#0B1533] disabled:opacity-40"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={draft}
            disabled={disabled}
            autoFocus={autoFocus}
            aria-label={`${label} recipients`}
            placeholder={emails.length === 0 ? "Add email address" : ""}
            onChange={(e) => {
              setDraft(e.target.value);
              if (invalid) setInvalid(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "," || e.key === ";" || (e.key === "Tab" && draft.trim())) {
                e.preventDefault();
                commit(draft);
              } else if (e.key === "Backspace" && draft === "" && emails.length > 0) {
                onChange(emails.slice(0, -1));
              }
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (/[,;\s]/.test(text.trim())) {
                e.preventDefault();
                commit(draft + text);
              }
            }}
            onBlur={() => commit(draft)}
            className="min-w-32 flex-1 bg-transparent py-0.5 text-[12px] text-[#3A4565] outline-none placeholder:text-[#9AA3BC] disabled:cursor-not-allowed"
          />
        </div>
        {invalid && <div className="mt-0.5 text-[11px] text-[#C0392B]">Not a valid email: {invalid}</div>}
      </div>
    </div>
  );
}

// Reply composer (task 320; simplified in task 324) — rich-text composer with From and
// editable To/Cc/Bcc rows. To is pre-filled with the resolved ticket contact; POST /reply
// sends exactly what's in these rows. Direct StackShift tickets reply through the outbox, not
// email, so their recipients are read-only. Dynamically imported with ssr:false from
// _ticket-detail.tsx because RichTextEditor (Tiptap) needs `window`.
export default function ReplyComposer({
  fromAddress,
  recipients,
  onRecipientsChange,
  recipientsEditable,
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
  recipients: ReplyRecipients;
  onRecipientsChange: (next: ReplyRecipients) => void;
  recipientsEditable: boolean;
  editorKey: number;
  onChange: (html: string) => void;
  onEmptyChange: (isEmpty: boolean) => void;
  saving: boolean;
  error: string | null;
  sendDisabled: boolean;
  onSend: () => void;
  onCancel: () => void;
}) {
  const [showCc, setShowCc] = useState(recipients.cc.length > 0);
  const [showBcc, setShowBcc] = useState(recipients.bcc.length > 0);

  // Only lock the editor while sending — NOT while empty, otherwise the editor starts disabled
  // (replyEmpty defaults true) and can never become non-empty, since a disabled Tiptap instance
  // can't receive input to fire onUpdate at all. sendDisabled (below) reacts to emptiness and
  // to an empty To list.
  const editorDisabled = saving;

  return (
    <div>
      <div className="rounded-t-[10px] border border-b-0 border-[#E2E7F2] bg-[#FAFBFE] px-3 py-2 space-y-1.5">
        <div className="flex items-center gap-2 text-[12px]">
          <span className="w-9 text-[#5F6A88] font-medium">From</span>
          <span className="text-[#3A4565] truncate">{fromAddress ?? "Not configured"}</span>
        </div>
        {recipientsEditable ? (
          <>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <RecipientRow
                  label="To"
                  emails={recipients.to}
                  onChange={(to) => onRecipientsChange({ ...recipients, to })}
                  disabled={saving}
                />
              </div>
              <div className="flex shrink-0 gap-2 pt-1 text-[11px] font-medium">
                {!showCc && (
                  <button
                    type="button"
                    onClick={() => setShowCc(true)}
                    className="text-[#5F6A88] transition-colors hover:text-[#007BFF]"
                  >
                    Cc
                  </button>
                )}
                {!showBcc && (
                  <button
                    type="button"
                    onClick={() => setShowBcc(true)}
                    className="text-[#5F6A88] transition-colors hover:text-[#007BFF]"
                  >
                    Bcc
                  </button>
                )}
              </div>
            </div>
            {showCc && (
              <RecipientRow
                label="Cc"
                emails={recipients.cc}
                onChange={(cc) => onRecipientsChange({ ...recipients, cc })}
                disabled={saving}
                autoFocus={recipients.cc.length === 0}
              />
            )}
            {showBcc && (
              <RecipientRow
                label="Bcc"
                emails={recipients.bcc}
                onChange={(bcc) => onRecipientsChange({ ...recipients, bcc })}
                disabled={saving}
                autoFocus={recipients.bcc.length === 0}
              />
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 text-[12px]">
            <span className="w-9 text-[#5F6A88] font-medium">To</span>
            <span className="text-[#3A4565] truncate">
              {recipients.to.join(", ") || "No recipient email on file for this ticket"}
            </span>
          </div>
        )}
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
        ) : recipientsEditable && recipients.to.length === 0 ? (
          <span className="text-[11px] text-[#5F6A88]">Add at least one To recipient.</span>
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
