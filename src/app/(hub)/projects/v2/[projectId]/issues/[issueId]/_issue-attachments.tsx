"use client";

import { useEffect, useState } from "react";
import { FileText, FileSpreadsheet, Image as ImageIcon, Paperclip, Video, ExternalLink, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TaskAttachmentViewerModal } from "../../tasks/[taskId]/_task-attachment-viewer-modal";
import { AttachmentDropzone, uploadViaSignedUrl, useUploadQueue } from "@/app/(hub)/projects/_shared/_attachment-dropzone";
import { extensionInfoFor } from "@/config/attachment-types";
import { AttachmentActionsMenu } from "@/app/(hub)/projects/_shared/_attachment-actions-menu";

// Attachments tab for Issue Detail (task 235) — grid/tile presentation adapted from
// `tasks/[taskId]/_task-attachments.tsx`, whose tile layout in turn now matches the Onboarding
// Workspace's `_file-tile.tsx` FileTile (header icon+name+kebab, thumbnail body, size footer —
// task 273 follow-up); the viewer modal is reused directly rather than duplicated, since it's
// already fully generic (only reads `filename` + a caller-supplied `fetchUrl`, already shared by
// both the task attachments grid and task comment attachments). Unlike the task version, this
// one owns upload + delete directly (`canEdit` prop) — Task Detail's tab is read-only because
// uploads there happen at task-creation time via the New Task modal; issues have no equivalent
// creation flow, so this page is the only place to add one. Upload goes through the shared
// AttachmentDropzone in "upload mode" (task 273) — its allowlist/corruption pre-check live in
// src/config/attachment-types.ts, and the realtime subscription below (not a manual list-append)
// is what reflects a successful upload here, matching _attachment-upload-zone.tsx's identical
// pattern. Delete lives in the kebab's "Remove" action now instead of a hover-X button.
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"];
const OFFICE_EXTENSIONS = { word: ["doc", "docx"], excel: ["xls", "xlsx"] };
const VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "webm"];

// Task 257, Requirement F — `source`/`commentId`/`fetchUrl` come from the GET route's merge of
// issue-native + comment-uploaded attachments; comment-sourced rows are read-only here (delete
// happens on the parent comment, not this tab).
type AttachmentRow = {
  id: string; filename: string; size: number | null; created_at: string;
  source: "issue" | "comment"; commentId: string | null; fetchUrl: string;
};

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

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
  if (VIDEO_EXTENSIONS.includes(ext)) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-[#EFE7FD]">
        <Video size={22} className="text-[#6E3FD6]" />
        <span className="text-[9px] font-bold tracking-wide text-[#6E3FD6]">VIDEO</span>
      </div>
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-[#F4F6FB]">
      <FileText size={22} className="text-[#5F6A88]" />
    </div>
  );
}

function AttachmentThumbnail({ file }: { file: AttachmentRow }) {
  const ext = extensionOf(file.filename);
  const isImage = IMAGE_EXTENSIONS.includes(ext);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    fetch(file.fetchUrl)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { url: string }) => { if (!cancelled) setUrl(data.url); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [file.fetchUrl, isImage]);

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

export function IssueAttachments({
  projectId,
  issueId,
  canEdit,
  onCountChange,
}: {
  projectId: string;
  issueId: string;
  canEdit: boolean;
  onCountChange?: (n: number) => void;
}) {
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<AttachmentRow | null>(null);
  const uploadQueue = useUploadQueue((file, onProgress) => {
    const base = `/api/v2/projects/${projectId}/issues/${issueId}/attachments`;
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
    fetch(`/api/v2/projects/${projectId}/issues/${issueId}/attachments`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AttachmentRow[]) => {
        setAttachments(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [projectId, issueId]);

  // Reports the live count to the panel outside of any setState updater — calling onCountChange
  // (which calls the panel's setCounts) from inside a setAttachments updater triggers React's
  // "Cannot update a component while rendering a different component" warning (task 299/301).
  useEffect(() => {
    onCountChange?.(attachments.length);
  }, [attachments.length, onCountChange]);

  // Realtime sync (mirrors _task-attachments.tsx's identical pattern) — patches local state
  // directly from the event payload instead of refetching. Scoped to `entity_id=eq.${issueId}`,
  // so this only ever matches issue-native rows — a comment-uploaded attachment (entity_id is
  // the comment's id, not the issue's) won't live-patch in here; it appears on next mount/tab
  // switch via the merged GET fetch above (task 257, Requirement F).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`issue_attachments_${issueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attachments", filter: `entity_id=eq.${issueId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as { id: string; filename: string; size: number | null; created_at: string; entity_type: string };
            if (row.entity_type !== "issue") return;
            const shaped: AttachmentRow = {
              id: row.id, filename: row.filename, size: row.size, created_at: row.created_at,
              source: "issue", commentId: null,
              fetchUrl: `/api/v2/projects/${projectId}/issues/${issueId}/attachments/${row.id}/file-url`,
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
  }, [issueId, projectId]);

  async function handleDelete(id: string) {
    const res = await fetch(`/api/v2/projects/${projectId}/issues/${issueId}/attachments/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {attachments.map((file) => (
            <div key={file.id} className="relative">
              <button
                type="button"
                onClick={() => setViewing(file)}
                aria-label={`View ${file.filename}`}
                className="w-full aspect-square flex flex-col text-left rounded-[14px] overflow-hidden cursor-pointer border border-[#E2E7F2] bg-white hover:bg-[#F4F8FF] hover:border-[#C7D2E8] transition-colors duration-150"
              >
                <div className="flex items-center gap-2 pl-2.5 pr-8 py-2 shrink-0">
                  <FileText size={13} className="text-[#007BFF] shrink-0" />
                  <span title={file.filename} className="text-[11px] font-medium truncate flex-1 text-[#3A4565]">
                    {file.filename}
                  </span>
                </div>
                <div className="flex-1 min-h-0 mx-2 mb-2 rounded-md overflow-hidden bg-[#F4F6FB]">
                  <AttachmentThumbnail file={file} />
                </div>
                <div className="flex items-center justify-between gap-1 px-2 pb-2 shrink-0">
                  <span className="text-[9.5px] truncate text-[#5F6A88]">{formatFileSize(file.size)}</span>
                  {file.source === "comment" && (
                    <span
                      className="text-[9px] font-medium text-[#5F6A88] bg-[#EDF0F7] px-1.5 py-0.5 rounded-full shrink-0"
                      title="Uploaded on a comment — delete it from the Comments tab"
                    >
                      From comment
                    </span>
                  )}
                </div>
              </button>
              <div className="absolute top-2 right-2">
                <AttachmentActionsMenu
                  actions={[
                    { label: "View", icon: ExternalLink, onClick: () => setViewing(file) },
                    ...(canEdit && file.source === "issue"
                      ? [{ label: "Remove", icon: Trash2, onClick: () => void handleDelete(file.id), danger: true }]
                      : []),
                  ]}
                />
              </div>
            </div>
          ))}
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
