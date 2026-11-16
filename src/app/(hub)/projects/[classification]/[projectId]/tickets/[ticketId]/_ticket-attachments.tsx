"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, ExternalLink, Trash2, Download, Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TaskAttachmentViewerModal } from "../../tasks/[taskId]/_task-attachment-viewer-modal";
import { AttachmentDropzone, uploadViaSignedUrl, useUploadQueue } from "@/app/(hub)/projects/_shared/_attachment-dropzone";
import { extensionInfoFor } from "@/config/attachment-types";
import { AttachmentAction } from "@/app/(hub)/projects/_shared/_attachment-actions-menu";
import { AttachmentGridTile, AttachmentThumbnail, downloadAttachment } from "@/app/(hub)/projects/_shared/_attachment-grid-tile";

// Attachments tab for Ticket Detail (task 235) — grid/tile presentation shared with
// `tasks/[taskId]/_task-attachments.tsx` via `_shared/_attachment-grid-tile.tsx` (task 368); the
// viewer modal is reused directly rather than duplicated, since it's already fully generic (only
// reads `filename` + a caller-supplied `fetchUrl`, already shared by both the task attachments
// grid and task comment attachments). Unlike the task version, this one owns upload + delete
// directly (`canEdit` prop) — Task Detail's tab is read-only because uploads there happen at
// task-creation time via the New Task modal; tickets have no equivalent creation flow, so this
// page is the only place to add one. Upload goes through the shared AttachmentDropzone in
// "upload mode" (task 273) — its allowlist/corruption pre-check live in
// src/config/attachment-types.ts, and the realtime subscription below (not a manual list-append)
// is what reflects a successful upload here, matching _attachment-upload-zone.tsx's identical
// pattern. Delete lives in the kebab's "Remove" action, preserved as-is by task 368 (R5) — the
// "only View/Download/Copy URL" trim there targets the new comment-attachment tiles and the
// previously View-only Task tab, not this tab's existing delete capability.
//
// Task 257, Requirement F — `source`/`commentId`/`fetchUrl` come from the GET route's merge of
// ticket-native + comment-uploaded attachments; comment-sourced rows are read-only here (delete
// happens on the parent comment, not this tab).
type AttachmentRow = {
  id: string; filename: string; size: number | null; created_at: string;
  source: "ticket" | "comment"; commentId: string | null; fetchUrl: string;
};

export function TicketAttachments({
  projectId,
  ticketId,
  canEdit,
  onCountChange,
  autoOpenAttachmentId,
  copyAttachmentUrl,
}: {
  projectId: string;
  ticketId: string;
  canEdit: boolean;
  onCountChange?: (n: number) => void;
  // Task 368, R8 — a `?attachment=<id>` deep link (see _shared/_use-attachment-deeplink.ts) lands
  // the panel on this tab and opens this attachment's preview once it's found in the loaded list.
  autoOpenAttachmentId?: string | null;
  copyAttachmentUrl: (attachmentId: string) => void;
}) {
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<AttachmentRow | null>(null);
  const uploadQueue = useUploadQueue((file, onProgress) => {
    const base = `/api/v2/projects/${projectId}/tickets/${ticketId}/attachments`;
    return uploadViaSignedUrl({
      signUrl: `${base}/sign`,
      registerUrl: base,
      file,
      mime: extensionInfoFor(file.name)?.mime ?? "application/octet-stream",
      onProgress,
    }).then(() => undefined);
  });

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/v2/projects/${projectId}/tickets/${ticketId}/attachments`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AttachmentRow[]) => {
        setAttachments(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [projectId, ticketId]);

  // Reports the live count to the panel outside of any setState updater — calling onCountChange
  // (which calls the panel's setCounts) from inside a setAttachments updater triggers React's
  // "Cannot update a component while rendering a different component" warning (task 299/301).
  useEffect(() => {
    onCountChange?.(attachments.length);
  }, [attachments.length, onCountChange]);

  // Task 368, R8 — ref-guarded so closing the modal doesn't immediately reopen it while the deep
  // link param is still present, mirroring the Files tab's `autoPreview` pattern (_file-tile.tsx).
  // The state update is deferred a microtask (`Promise.resolve().then(...)`) rather than called
  // synchronously in the effect body, satisfying react-hooks/set-state-in-effect the same way
  // every fetch-driven effect elsewhere in this codebase already does (setState inside a `.then`).
  const didAutoOpen = useRef(false);
  useEffect(() => {
    if (!autoOpenAttachmentId || didAutoOpen.current || loading) return;
    const match = attachments.find((a) => a.id === autoOpenAttachmentId);
    if (!match) return;
    didAutoOpen.current = true;
    Promise.resolve().then(() => setViewing(match));
  }, [autoOpenAttachmentId, attachments, loading]);

  // Realtime sync (mirrors _task-attachments.tsx's identical pattern) — patches local state
  // directly from the event payload instead of refetching. Scoped to `entity_id=eq.${ticketId}`,
  // so this only ever matches ticket-native rows — a comment-uploaded attachment (entity_id is
  // the comment's id, not the ticket's) won't live-patch in here; it appears on next mount/tab
  // switch via the merged GET fetch above (task 257, Requirement F).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`ticket_attachments_${ticketId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attachments", filter: `entity_id=eq.${ticketId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as { id: string; filename: string; size: number | null; created_at: string; entity_type: string };
            if (row.entity_type !== "issue") return;
            const shaped: AttachmentRow = {
              id: row.id, filename: row.filename, size: row.size, created_at: row.created_at,
              source: "ticket", commentId: null,
              fetchUrl: `/api/v2/projects/${projectId}/tickets/${ticketId}/attachments/${row.id}/file-url`,
            };
            setAttachments((prev) => (prev.some((a) => a.id === shaped.id) ? prev : [...prev, shaped]));
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as { id: string; entity_type?: string };
            if (old.entity_type && old.entity_type !== "issue") return;
            setAttachments((prev) => prev.filter((a) => a.id !== old.id));
          }
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [ticketId, projectId]);

  async function handleDelete(id: string) {
    const res = await fetch(`/api/v2/projects/${projectId}/tickets/${ticketId}/attachments/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="aspect-square rounded-[10px] bg-[#F4F6FB] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {canEdit && <AttachmentDropzone queue={uploadQueue} />}

      {attachments.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <Paperclip size={18} className="text-[#C7CEDD]" />
          <p className="text-[12px] text-[#5F6A88]">No attachments yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {attachments.map((file) => {
            const actions: AttachmentAction[] = [
              { label: "View", icon: ExternalLink, onClick: () => setViewing(file) },
              { label: "Download", icon: Download, onClick: () => void downloadAttachment(file.fetchUrl) },
              { label: "Copy URL", icon: Link2, onClick: () => copyAttachmentUrl(file.id) },
              ...(canEdit && file.source === "ticket"
                ? [{ label: "Remove", icon: Trash2, onClick: () => void handleDelete(file.id), danger: true }]
                : []),
            ];
            return (
              <AttachmentGridTile
                key={file.id}
                filename={file.filename}
                size={file.size}
                thumbnail={<AttachmentThumbnail filename={file.filename} fetchUrl={file.fetchUrl} />}
                actions={actions}
                onClick={() => setViewing(file)}
                footerRight={
                  file.source === "comment" ? (
                    <span
                      className="text-[9px] font-medium text-[#5F6A88] bg-[#EDF0F7] px-1.5 py-0.5 rounded-full shrink-0"
                      title="Uploaded on a comment — delete it from the Comments tab"
                    >
                      From comment
                    </span>
                  ) : undefined
                }
              />
            );
          })}
        </div>
      )}

      {viewing && (
        <TaskAttachmentViewerModal
          attachment={viewing}
          fetchUrl={viewing.fetchUrl}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
