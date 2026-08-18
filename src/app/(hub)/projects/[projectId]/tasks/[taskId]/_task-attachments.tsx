"use client";

import { useEffect, useState } from "react";
import { FileText, FileSpreadsheet, Image as ImageIcon, Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TaskAttachmentViewerModal } from "./_task-attachment-viewer-modal";

// Grid viewer for files staged via the New Task modal's Attachments picker (task 205) —
// mirrors the onboarding wizard's storage-file grid (task 198/_file-tile.tsx) instead of the
// original flat file-chip-row list; "View" opens TaskAttachmentViewerModal in-app instead of
// window.open (task 211). Signed URLs are still minted on-demand (task 206 Decision #4) — the
// list endpoint returns metadata only.
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"];
const OFFICE_EXTENSIONS = { word: ["doc", "docx"], excel: ["xls", "xlsx"] };

type AttachmentRow = { id: string; filename: string; size: number | null; created_at: string };

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

// Task-198-style color-coded fallback tile (_file-previews.tsx's FileTypeTile), reduced to the
// fixed extension set this table's upload route allow-lists.
function FileTypeTile({ ext }: { ext: string }) {
  if (OFFICE_EXTENSIONS.word.includes(ext)) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-[#E5F1FF]">
        <FileText size={22} className="text-[#007BFF]" />
        <span className="text-[9px] font-bold tracking-wide text-[#007BFF]">DOC</span>
      </div>
    );
  }
  if (OFFICE_EXTENSIONS.excel.includes(ext)) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-[#E3F6EA]">
        <FileSpreadsheet size={22} className="text-[#177E48]" />
        <span className="text-[9px] font-bold tracking-wide text-[#177E48]">XLS</span>
      </div>
    );
  }
  if (ext === "pdf") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-[#FDE8E6]">
        <FileText size={22} className="text-[#C0392B]" />
        <span className="text-[9px] font-bold tracking-wide text-[#C0392B]">PDF</span>
      </div>
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-[#F4F6FB]">
      <FileText size={22} className="text-[#5F6A88]" />
    </div>
  );
}

// Lazy per-tile signed-URL fetch for image thumbnails only — mirrors _file-tile.tsx's
// FileThumbnail, scoped to images since PDFs/Office files aren't worth a live-rendered tile.
function AttachmentThumbnail({
  file, projectId, taskId,
}: { file: AttachmentRow; projectId: string; taskId: string }) {
  const ext = extensionOf(file.filename);
  const isImage = IMAGE_EXTENSIONS.includes(ext);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    fetch(`/api/v2/projects/${projectId}/tasks/${taskId}/attachments/${file.id}/file-url`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { url: string }) => { if (!cancelled) setUrl(data.url); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [file.id, isImage, projectId, taskId]);

  if (isImage && url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived Supabase Storage URL
      <img src={url} alt={file.filename} className="w-full h-full object-cover" onError={() => setFailed(true)} />
    );
  }
  if (isImage && !failed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#F4F6FB]">
        <ImageIcon size={20} className="text-[#C7CEDD]" />
      </div>
    );
  }
  return <FileTypeTile ext={ext} />;
}

export function TaskAttachments({
  projectId,
  taskId,
  onCountChange,
}: {
  projectId: string;
  taskId: string;
  // Task 270 — lifted up to the panel so its tab label can show a live count, mirroring
  // `_issue-attachments.tsx`'s identical `onCountChange` prop (task 257, Requirement G).
  onCountChange?: (n: number) => void;
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
        onCountChange?.(data.length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCountChange is a stable useCallback from the panel; including it would refire this fetch on every parent render
  }, [projectId, taskId]);

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
            const row = payload.new as AttachmentRow & { entity_type: string };
            if (row.entity_type !== "task") return;
            setAttachments((prev) => {
              const next = prev.some((a) => a.id === row.id) ? prev : [...prev, row];
              onCountChange?.(next.length);
              return next;
            });
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as { id: string; entity_type?: string };
            if (old.entity_type && old.entity_type !== "task") return;
            setAttachments((prev) => {
              const next = prev.filter((a) => a.id !== old.id);
              onCountChange?.(next.length);
              return next;
            });
          }
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCountChange is a stable useCallback from the panel
  }, [taskId]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {attachments.map((file) => (
          <div
            key={file.id}
            className="flex flex-col rounded-[10px] border border-[#E2E7F2] bg-white overflow-hidden"
          >
            <div className="aspect-square">
              <AttachmentThumbnail file={file} projectId={projectId} taskId={taskId} />
            </div>
            <div className="flex flex-col gap-1 px-2.5 py-2">
              <span className="text-[11.5px] font-medium text-[#3A4565] truncate" title={file.filename}>
                {file.filename}
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-[#5F6A88] shrink-0">{formatFileSize(file.size)}</span>
                <button
                  type="button"
                  onClick={() => setViewing(file)}
                  className="text-[11px] font-semibold text-[#0063D6] hover:underline cursor-pointer shrink-0"
                >
                  View
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {viewing && (
        <TaskAttachmentViewerModal
          attachment={viewing}
          fetchUrl={`/api/v2/projects/${projectId}/tasks/${taskId}/attachments/${viewing.id}/file-url`}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
}
