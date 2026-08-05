"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

// In-app file viewer for the Attachments grid (task 211) — reduced port of
// ../../../portfolio-tracker/[projectId]/_onboarding-wizard.tsx's FileViewerModal/FilePreview,
// scoped to the fixed set of mime types the upload route allow-lists (images, PDF, Word, Excel;
// no HTML/CSV/Markdown branches, since a task attachment can never be those types).
type AttachmentRow = { id: string; filename: string; size: number | null; created_at: string };

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"];
const OFFICE_EXTENSIONS = ["doc", "docx", "xls", "xlsx"];

type FileKind = "image" | "pdf" | "office" | "other";

function fileKindFromFilename(filename: string): FileKind {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (OFFICE_EXTENSIONS.includes(ext)) return "office";
  return "other";
}

export function TaskAttachmentViewerModal({
  attachment,
  projectId,
  taskId,
  onClose,
}: {
  attachment: AttachmentRow;
  projectId: string;
  taskId: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/v2/projects/${projectId}/tasks/${taskId}/attachments/${attachment.id}/file-url`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { url: string }) => setUrl(data.url))
      .catch(() => setError("Failed to load file preview."))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [projectId, taskId, attachment.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const kind = fileKindFromFilename(attachment.filename);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#071133]/60 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-attachment-viewer-title"
        className="w-[1100px] max-w-[96vw] h-[88vh] bg-white border border-[#E2E7F2] rounded-xl shadow-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#EDF0F7] shrink-0">
          <h2 id="task-attachment-viewer-title" className="text-[13.5px] font-semibold text-[#0B1533] truncate">
            {attachment.filename}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="p-2 rounded-md text-[#5F6A88] hover:bg-[#5F6A88]/10 cursor-pointer border-none bg-transparent transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 min-w-0 relative bg-[#EDF0F7]">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[12.5px] text-[#5F6A88]">Loading preview…</span>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
              <span className="text-[12.5px] text-[#C0392B]">{error}</span>
            </div>
          )}
          {url && !loading && !error && (
            <>
              {kind === "image" && (
                <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived Supabase Storage URL; not a static/optimizable src next/image can allowlist */}
                  <img src={url} alt={attachment.filename} className="max-w-full max-h-full object-contain" />
                </div>
              )}
              {kind === "pdf" && <iframe src={url} title={attachment.filename} className="w-full h-full border-0" />}
              {kind === "office" && (
                <iframe
                  src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
                  title={attachment.filename}
                  className="w-full h-full border-0"
                />
              )}
              {kind === "other" && (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                  <span className="text-[12.5px] text-[#5F6A88]">Preview not available for this file type.</span>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
