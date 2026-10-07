"use client";

import { useEffect, useState } from "react";
import { X, Music, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { isDriveMedia } from "@/lib/drive/constants";
import type { DriveFile } from "@/lib/drive/types";
import { FilePreviewModal, textMuted, textPrimary } from "./_reuse";
import { fetchDriveFileUrl } from "./_drive-upload";

// Task 436 — preview for a Drive file. Documents/images/PDF/etc. delegate to the Project Files
// modal (it only needs a name, MIME type and URL); audio/video recordings get a native player
// shell here, since that modal has no media branch and isn't edited.
export function DrivePreview({ file, onClose }: { file: DriveFile; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mime = file.file_mime_type ?? "";

  useEffect(() => {
    let cancelled = false;
    fetchDriveFileUrl(file.id)
      .then((u) => { if (!cancelled) setUrl(u); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [file.id]);

  if (!isDriveMedia(mime)) {
    return <FilePreviewModal fileName={file.file_name} mimeType={mime} url={url} loading={!url && !error} error={error} onClose={onClose} />;
  }
  return <MediaModal name={file.file_name} mime={mime} url={url} error={error} onClose={onClose} />;
}

function MediaModal({ name, mime, url, error, onClose }: { name: string; mime: string; url: string | null; error: string | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const isVideo = mime.startsWith("video/");
  const Icon = isVideo ? Film : Music;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071133]/60 p-4" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={`Preview ${name}`}
        className="w-full max-w-[880px] overflow-hidden rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#EDF0F7] px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Icon size={14} className="shrink-0 text-[#007BFF]" />
            <h2 className={cn("truncate text-[13.5px] font-semibold", textPrimary)}>{name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close preview" className={cn("shrink-0 cursor-pointer rounded-md border-none bg-transparent p-2 transition-colors hover:bg-[#5F6A88]/10", textMuted)}>
            <X size={18} />
          </button>
        </div>
        <div className="flex min-h-48 items-center justify-center bg-[#EDF0F7] p-4">
          {error ? <p className="text-[12.5px] text-[#C0392B]">{error}</p>
            : !url ? <p className={cn("text-[12.5px]", textMuted)}>Loading recording…</p>
            : isVideo ? <video src={url} controls autoPlay className="max-h-[70vh] w-full rounded-lg bg-black" />
            : <audio src={url} controls autoPlay className="w-full" />}
        </div>
      </div>
    </div>
  );
}
