"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { downloadAttachment } from "@/app/(hub)/projects/_shared/_attachment-grid-tile";

// In-app file viewer, shared by the Attachments grid (task 211) and comment attachments (task
// 212) — reduced port of ../../../portfolio-tracker/[projectId]/_onboarding-wizard.tsx's
// FileViewerModal/FilePreview. Renders inline for image/pdf/office/video; every other type the
// task 273 MIME widening now allows (HTML/CSS/JS/TS/JSON/MD/TXT/ZIP/RAR) falls to "other" with no
// dedicated preview — those still fetch a signed URL (force-download, task 273 Requirement G) so
// "View" downloads them instead of failing silently. Only `filename` is read here — the caller
// supplies `fetchUrl` directly, so this component doesn't need to know the attachment's id,
// size, or which entity it belongs to (task 212 Decision #8).
//
// Task 368 follow-up — the "other" kind's Download control used a plain `<a href download>`,
// which the browser silently ignores for a cross-origin URL (the signed Supabase Storage URL is
// always cross-origin), so it just opened a new tab instead of downloading. Routed through the
// same `downloadAttachment()` helper the kebab's "Download" action uses — it re-fetches
// `fetchUrl` with `?download=1` for a URL that actually carries `Content-Disposition: attachment`.
type AttachmentRow = { filename: string };

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"];
const OFFICE_EXTENSIONS = ["doc", "docx", "xls", "xlsx"];
const VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "webm"];

type FileKind = "image" | "pdf" | "office" | "video" | "other";

function fileKindFromFilename(filename: string): FileKind {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (OFFICE_EXTENSIONS.includes(ext)) return "office";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  return "other";
}

export function TaskAttachmentViewerModal({
  attachment,
  fetchUrl,
  onClose,
}: {
  attachment: AttachmentRow;
  fetchUrl: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // `cancelled` guards against a superseded effect run's response overwriting current state —
    // mirrors AttachmentThumbnail's identical pattern in ../../_task-attachments.tsx. Without it,
    // React's dev-only Strict Mode mount/cleanup/remount cycle fires this effect twice for a
    // single "View" click; if the first (stale) invocation's request resolves after the second's
    // (e.g. a transient dev-server hiccup on one of the two), its result would otherwise still
    // overwrite the correct, current one — `setUrl`/`setError`/`setLoading` on an aborted-but-
    // still-resolving fetch is not itself an error worth surfacing.
    let cancelled = false;
    const ctrl = new AbortController();
    fetch(fetchUrl, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { url: string }) => { if (!cancelled) setUrl(data.url); })
      .catch(() => { if (!cancelled) setError("Failed to load file preview."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; ctrl.abort(); };
  }, [fetchUrl]);

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
              {kind === "video" && (
                <div className="w-full h-full flex items-center justify-center p-4">
                  <video src={url} controls className="max-w-full max-h-full" />
                </div>
              )}
              {kind === "other" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                  <span className="text-[12.5px] text-[#5F6A88]">Preview not available for this file type.</span>
                  <button
                    type="button"
                    onClick={() => void downloadAttachment(fetchUrl)}
                    className="text-[12.5px] font-semibold text-[#0063D6] hover:underline cursor-pointer border-none bg-transparent"
                  >
                    Download {attachment.filename}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
