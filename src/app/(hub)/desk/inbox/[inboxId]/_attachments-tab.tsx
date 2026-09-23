"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, ExternalLink, Download, Link2 } from "lucide-react";
import type { MessageItem } from "./_conversation-thread";
import { AttachmentAction } from "@/app/(hub)/projects/_shared/_attachment-actions-menu";
import { AttachmentGridTile, AttachmentThumbnail, downloadAttachment } from "@/app/(hub)/projects/_shared/_attachment-grid-tile";
import { TaskAttachmentViewerModal } from "@/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-attachment-viewer-modal";

// Ticket-wide Attachments tab (task 320) — aggregates attachments across every message on the
// ticket rather than showing them per-message (that's what the Conversations/Threads/Comments
// tabs already do inline). Task 393 — grid-tile presentation reusing the same shared components
// `_ticket-attachments.tsx` (project Tickets domain) already uses, rather than the old
// single-column list rows: `AttachmentGridTile`/`AttachmentThumbnail`/`downloadAttachment` from
// `projects/_shared/_attachment-grid-tile.tsx`, and `TaskAttachmentViewerModal` cross-imported
// the same way `_ticket-attachments.tsx` already does. View/Download/Copy URL only — no
// Remove/upload, since Desk Inbox attachments are read-only data synced from Zoho Desk (tasks
// 390/392), not something Hub users create here.
type FlatAttachment = {
  id: string;
  filename: string;
  size: number | null;
  fetchUrl: string;
};

export default function AttachmentsTab({
  inboxId,
  messages,
  copyAttachmentUrl,
  autoOpenAttachmentId,
}: {
  inboxId: string;
  messages: MessageItem[];
  copyAttachmentUrl: (attachmentId: string) => void;
  // Task 393 — a `?attachment=<id>` deep link (see projects/_shared/_use-attachment-deeplink.ts)
  // lands the panel on this tab and opens this attachment's preview once it's found below.
  autoOpenAttachmentId?: string | null;
}) {
  const [viewing, setViewing] = useState<FlatAttachment | null>(null);

  const attachments: FlatAttachment[] = messages.flatMap((m) =>
    m.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      size: a.size,
      fetchUrl: `/api/desk/tickets/${inboxId}/messages/${m.id}/attachments/${a.id}/file-url`,
    }))
  );

  // Same ref-guarded deferred-setState pattern as `_ticket-attachments.tsx` — closing the modal
  // doesn't immediately reopen it while the deep-link param is still present, and the deferred
  // (`Promise.resolve().then(...)`) update satisfies react-hooks/set-state-in-effect the same
  // way every fetch-driven effect elsewhere in this codebase already does.
  const didAutoOpen = useRef(false);
  useEffect(() => {
    if (!autoOpenAttachmentId || didAutoOpen.current) return;
    const match = attachments.find((a) => a.id === autoOpenAttachmentId);
    if (!match) return;
    didAutoOpen.current = true;
    Promise.resolve().then(() => setViewing(match));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attachments is derived fresh every render from `messages`; only autoOpenAttachmentId should re-trigger this
  }, [autoOpenAttachmentId]);

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
    <div className="px-5 py-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {attachments.map((file) => {
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
        })}
      </div>

      {viewing && (
        <TaskAttachmentViewerModal attachment={viewing} fetchUrl={viewing.fetchUrl} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}
