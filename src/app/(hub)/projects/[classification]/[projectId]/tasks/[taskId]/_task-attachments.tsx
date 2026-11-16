"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, ExternalLink, Download, Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TaskAttachmentViewerModal } from "./_task-attachment-viewer-modal";
import { AttachmentAction } from "@/app/(hub)/projects/_shared/_attachment-actions-menu";
import { AttachmentGridTile, AttachmentThumbnail, downloadAttachment } from "@/app/(hub)/projects/_shared/_attachment-grid-tile";

// Grid viewer for files staged via the New Task modal's Attachments picker (task 205) — tile
// layout matches the Onboarding Workspace's storage-file grid (task 273 follow-up), factored
// into the shared `AttachmentGridTile` (task 368). "View" opens TaskAttachmentViewerModal in-app
// instead of window.open (task 211); the whole tile is clickable (no multi-select here, unlike
// the reference, so click=View directly rather than click=select+kebab=View). Signed URLs are
// still minted on-demand (task 206 Decision #4) — the list endpoint returns metadata only.
//
// Task 368, R3/R4 — the GET route now merges in attachments uploaded on this task's comments
// (`source: "comment"`) alongside the task's own (`source: "task"`), so this tab shows every
// attachment regardless of where it was uploaded, matching the equivalent merge Tickets already
// had (task 257, Requirement F). Comment-sourced rows are read-only here (no delete action for
// either source — the Task Attachments tab has always been upload-at-creation-only).
type AttachmentRow = {
  id: string; filename: string; size: number | null; created_at: string;
  source: "task" | "comment"; commentId: string | null; fetchUrl: string;
};

export function TaskAttachments({
  projectId,
  taskId,
  onCountChange,
  autoOpenAttachmentId,
  copyAttachmentUrl,
}: {
  projectId: string;
  taskId: string;
  // Task 270 — lifted up to the panel so its tab label can show a live count, mirroring
  // `_issue-attachments.tsx`'s identical `onCountChange` prop (task 257, Requirement G).
  onCountChange?: (n: number) => void;
  // Task 368, R8 — a `?attachment=<id>` deep link (see _shared/_use-attachment-deeplink.ts) lands
  // the panel on this tab and opens this attachment's preview once it's found in the loaded list.
  autoOpenAttachmentId?: string | null;
  copyAttachmentUrl: (attachmentId: string) => void;
}) {
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<AttachmentRow | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/v2/projects/${projectId}/tasks/${taskId}/attachments`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AttachmentRow[]) => {
        setAttachments(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [projectId, taskId]);

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

  // Realtime sync (task 213) — patches local state directly from the event payload
  // instead of refetching, mirroring ../../_project-detail.tsx's tasks/issues subscriptions.
  // `attachments` is polymorphic (entity_type/entity_id); Realtime's `filter` only supports
  // one equality clause, so this filters on entity_id and double-checks entity_type in the
  // handler (a task's UUID won't collide with a project/issue/comment UUID in practice).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`task_attachments_${taskId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attachments", filter: `entity_id=eq.${taskId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as { id: string; filename: string; size: number | null; created_at: string; entity_type: string };
            if (row.entity_type !== "task") return;
            const shaped: AttachmentRow = {
              id: row.id, filename: row.filename, size: row.size, created_at: row.created_at,
              source: "task", commentId: null,
              fetchUrl: `/api/v2/projects/${projectId}/tasks/${taskId}/attachments/${row.id}/file-url`,
            };
            setAttachments((prev) => (prev.some((a) => a.id === shaped.id) ? prev : [...prev, shaped]));
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as { id: string; entity_type?: string };
            if (old.entity_type && old.entity_type !== "task") return;
            setAttachments((prev) => prev.filter((a) => a.id !== old.id));
          }
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [projectId, taskId]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="aspect-square rounded-[10px] bg-[#F4F6FB] animate-pulse" />
        ))}
      </div>
    );
  }

  if (attachments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-4 text-center">
        <Paperclip size={18} className="text-[#C7CEDD]" />
        <p className="text-[12px] text-[#5F6A88]">No attachments yet</p>
      </div>
    );
  }

  return (
    <>
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
        <TaskAttachmentViewerModal
          attachment={viewing}
          fetchUrl={viewing.fetchUrl}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}
