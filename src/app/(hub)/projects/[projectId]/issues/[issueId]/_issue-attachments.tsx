"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, FileSpreadsheet, Image as ImageIcon, Paperclip, Loader2, X, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TaskAttachmentViewerModal } from "../../tasks/[taskId]/_task-attachment-viewer-modal";

// Attachments tab for Issue Detail (task 235) — grid/tile presentation adapted from
// `tasks/[taskId]/_task-attachments.tsx`; the viewer modal is reused directly rather than
// duplicated, since it's already fully generic (only reads `filename` + a caller-supplied
// `fetchUrl`, already shared by both the task attachments grid and task comment attachments).
// Unlike the task version, this one owns upload + delete directly (`canEdit` prop) — Task
// Detail's tab is read-only because uploads there happen at task-creation time via the New Task
// modal; issues have no equivalent creation flow, so this page is the only place to add one.
const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
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

function AttachmentThumbnail({
  file, projectId, issueId,
}: { file: AttachmentRow; projectId: string; issueId: string }) {
  const ext = extensionOf(file.filename);
  const isImage = IMAGE_EXTENSIONS.includes(ext);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    fetch(`/api/v2/projects/${projectId}/issues/${issueId}/attachments/${file.id}/file-url`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { url: string }) => { if (!cancelled) setUrl(data.url); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [file.id, isImage, projectId, issueId]);

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
}: {
  projectId: string;
  issueId: string;
  canEdit: boolean;
}) {
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<AttachmentRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/v2/projects/${projectId}/issues/${issueId}/attachments`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AttachmentRow[]) => setAttachments(data))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [projectId, issueId]);

  // Realtime sync (mirrors _task-attachments.tsx's identical pattern) — patches local state
  // directly from the event payload instead of refetching.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`issue_attachments_${issueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attachments", filter: `entity_id=eq.${issueId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as AttachmentRow & { entity_type: string };
            if (row.entity_type !== "issue") return;
            setAttachments((prev) => (prev.some((a) => a.id === row.id) ? prev : [...prev, row]));
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as { id: string; entity_type?: string };
            if (old.entity_type && old.entity_type !== "issue") return;
            setAttachments((prev) => prev.filter((a) => a.id !== old.id));
          }
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [issueId]);

  async function handleUpload(file: File) {
    setError(null);
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError("Unsupported file type. Only images, PDF, Word, and Excel files are supported.");
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/v2/projects/${projectId}/issues/${issueId}/attachments`, {
      method: "POST",
      body: fd,
    });
    setUploading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to upload file.");
      return;
    }
    const data: AttachmentRow = await res.json();
    setAttachments((prev) => (prev.some((a) => a.id === data.id) ? prev : [...prev, data]));
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/v2/projects/${projectId}/issues/${issueId}/attachments/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) setAttachments((prev) => prev.filter((a) => a.id !== id));
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
      {canEdit && (
        <div className="flex items-center justify-between gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#0063D6] hover:underline cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            {uploading ? "Uploading…" : "Add file"}
          </button>
        </div>
      )}
      {error && <p className="text-[11.5px] text-[#C0392B]">{error}</p>}

      {attachments.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <Paperclip size={18} className="text-[#C7CEDD]" />
          <p className="text-[12px] text-[#5F6A88]">No attachments yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {attachments.map((file) => (
            <div
              key={file.id}
              className="relative flex flex-col rounded-[10px] border border-[#E2E7F2] bg-white overflow-hidden"
            >
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void handleDelete(file.id)}
                  disabled={deletingId === file.id}
                  aria-label={`Delete ${file.filename}`}
                  className="absolute top-1.5 right-1.5 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-white/90 text-[#5F6A88] hover:text-[#C0392B] hover:bg-white cursor-pointer transition-colors disabled:opacity-60"
                >
                  {deletingId === file.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                </button>
              )}
              <div className="aspect-square">
                <AttachmentThumbnail file={file} projectId={projectId} issueId={issueId} />
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
      )}

      {viewing && (
        <TaskAttachmentViewerModal
          attachment={viewing}
          fetchUrl={`/api/v2/projects/${projectId}/issues/${issueId}/attachments/${viewing.id}/file-url`}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
