"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, Download, Link2 } from "lucide-react";
import { Chip } from "../../../dashboard/_components/dashboard-shared";
import { cn } from "@/lib/utils";
import { initialsFrom, colorForName } from "../_resolve";
import { sanitizeMessageHtml } from "./_message-html";
import { ThreadMessageActions } from "./_thread-message-actions";
import { AttachmentAction } from "@/app/(hub)/projects/_shared/_attachment-actions-menu";
import {
  AttachmentGridTile,
  AttachmentThumbnail,
  CommentAttachmentGrid,
  downloadAttachment,
} from "@/app/(hub)/projects/_shared/_attachment-grid-tile";
import { TaskAttachmentViewerModal } from "@/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-attachment-viewer-modal";

export type MessageAttachment = { id: string; filename: string; size: number | null };

export type MessageItem = {
  id: string;
  authorType: "client" | "staff" | "system" | "llm_draft";
  authorName: string;
  // Task 328 — a matched Hub profile's re-hosted avatar (public user-avatars bucket), or null
  // to fall back to a two-initial monogram. Never a raw Zoho photoURL (auth-gated).
  avatarUrl: string | null;
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

// Task 394 — inline per-message attachment grid, replacing the old pill-style AttachmentChip.
// Reuses the exact grid-tile + kebab + viewer-modal combo task 393 already built for the
// Attachments tab, and the CommentAttachmentGrid layout task 368 already built for Task/Ticket
// Comments — first Desk Inbox use of that component.
type FlatAttachment = MessageAttachment & { fetchUrl: string };

function MessageAttachments({
  inboxId,
  messageId,
  attachments,
  copyAttachmentUrl,
}: {
  inboxId: string;
  messageId: string;
  attachments: MessageAttachment[];
  copyAttachmentUrl: (attachmentId: string) => void;
}) {
  const [viewing, setViewing] = useState<FlatAttachment | null>(null);
  if (attachments.length === 0) return null;

  const items: FlatAttachment[] = attachments.map((a) => ({
    ...a,
    fetchUrl: `/api/desk/tickets/${inboxId}/messages/${messageId}/attachments/${a.id}/file-url`,
  }));

  return (
    <>
      <CommentAttachmentGrid
        items={items}
        renderItem={(file) => {
          const actions: AttachmentAction[] = [
            { label: "View", icon: ExternalLink, onClick: () => setViewing(file) },
            { label: "Download", icon: Download, onClick: () => void downloadAttachment(file.fetchUrl) },
            { label: "Copy URL", icon: Link2, onClick: () => copyAttachmentUrl(file.id) },
          ];
          return (
            <AttachmentGridTile
              key={file.id}
              filename={file.filename}
              size={file.size}
              thumbnail={<AttachmentThumbnail filename={file.filename} fetchUrl={file.fetchUrl} />}
              actions={actions}
              onClick={() => setViewing(file)}
            />
          );
        }}
      />
      {viewing && (
        <TaskAttachmentViewerModal attachment={viewing} fetchUrl={viewing.fetchUrl} onClose={() => setViewing(null)} />
      )}
    </>
  );
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

// Task 328 — round avatar for a conversation row: the matched Hub profile photo when we have
// one, otherwise a deterministic two-initial monogram (colour keyed off the name).
function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return (
      <span className="w-7 h-7 rounded-full overflow-hidden bg-[#EDF0F7] shrink-0 inline-flex">
        {/* eslint-disable-next-line @next/next/no-img-element -- Supabase user-avatars bucket URL, not a static/optimizable asset */}
        <img src={url} alt={name} className="w-full h-full object-cover" />
      </span>
    );
  }
  return (
    <span
      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
      style={{ background: colorForName(name) }}
    >
      {initialsFrom(name)}
    </span>
  );
}

function MessageCard({
  inboxId,
  ticketDbId,
  subject,
  message,
  open,
  onToggle,
  copyAttachmentUrl,
}: {
  inboxId: string;
  ticketDbId: string;
  subject: string;
  message: MessageItem;
  open: boolean;
  onToggle: () => void;
  copyAttachmentUrl: (attachmentId: string) => void;
}) {
  const m = message;
  const tint = isOutboundReply(m)
    ? "bg-[#F4F8FF]"
    : m.visibility === "internal"
      ? "bg-[#FEFCF6]"
      : "bg-white";

  return (
    <div className={cn("px-5 py-3", tint)}>
      {/* Toggle is its own <button>; "File a ticket" (task 333/364) is a sibling — never nest buttons. */}
      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Avatar name={m.authorName} url={m.avatarUrl} />
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
        {m.authorType === "client" && (
          <ThreadMessageActions subject={subject} message={m} ticketDbId={ticketDbId} />
        )}
      </div>

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
            <div className="mt-2.5">
              <MessageAttachments
                inboxId={inboxId}
                messageId={m.id}
                attachments={m.attachments}
                copyAttachmentUrl={copyAttachmentUrl}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ConversationThread({
  inboxId,
  ticketDbId,
  subject,
  messages,
  copyAttachmentUrl,
}: {
  inboxId: string;
  ticketDbId: string;
  subject: string;
  messages: MessageItem[];
  copyAttachmentUrl: (attachmentId: string) => void;
}) {
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
            inboxId={inboxId}
            ticketDbId={ticketDbId}
            subject={subject}
            message={m}
            open={expandedIds.has(m.id)}
            onToggle={() => toggle(m.id)}
            copyAttachmentUrl={copyAttachmentUrl}
          />
        ))}
      </div>
    </div>
  );
}
