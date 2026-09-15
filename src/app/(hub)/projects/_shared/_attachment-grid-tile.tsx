"use client";

import { useEffect, useState } from "react";
import { FileText, FileSpreadsheet, Image as ImageIcon, Video } from "lucide-react";
import { AttachmentAction, AttachmentActionsMenu } from "./_attachment-actions-menu";

// Task 368 — shared grid-tile card for task/ticket attachments, factored out of the near-
// identical JSX that used to live separately in `_task-attachments.tsx` and
// `_ticket-attachments.tsx` (tile layout itself traces back to the Onboarding Workspace's
// `_file-tile.tsx` FileTile, grid mode — task 273 follow-up). Now also used by both Comments
// components (task/ticket) to render comment-uploaded attachments the same way, replacing their
// old single-column list row.
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"];
const OFFICE_EXTENSIONS = { word: ["doc", "docx"], excel: ["xls", "xlsx"] };
const VIDEO_EXTENSIONS = ["mp4", "m4v", "mov", "webm"];

export function formatFileSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function isImageExtension(ext: string): boolean {
  return IMAGE_EXTENSIONS.includes(ext);
}

// Task-198-style color-coded fallback tile, reduced to the fixed extension set the attachment
// upload routes allow-list.
function AttachmentFileTypeTile({ ext }: { ext: string }) {
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

// Lazy per-tile signed-URL fetch for image thumbnails only — mirrors the Onboarding Workspace's
// FileThumbnail, scoped to images since PDFs/Office files aren't worth a live-rendered tile.
// `fetchUrl` is the caller-resolved file-url endpoint for this specific attachment (task-native,
// ticket-native, or comment-sourced all resolve to a different route, but all return `{ url }`).
export function AttachmentThumbnail({ filename, fetchUrl }: { filename: string; fetchUrl: string }) {
  const ext = extensionOf(filename);
  const isImage = isImageExtension(ext);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    fetch(fetchUrl)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { url: string }) => { if (!cancelled) setUrl(data.url); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [fetchUrl, isImage]);

  if (isImage && url && !failed) {
    // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived Supabase Storage URL
    return <img src={url} alt={filename} className="w-full h-full object-cover" onError={() => setFailed(true)} />;
  }
  if (isImage && !failed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#F4F6FB]">
        <ImageIcon size={20} className="text-[#C7CEDD]" />
      </div>
    );
  }
  return <AttachmentFileTypeTile ext={ext} />;
}

// Fetches a fresh signed URL forcing `Content-Disposition: attachment` (task 368, R6 — every
// attachment file-url route accepts `?download=1`), then triggers the browser save via a
// temporary same-tab-opening <a>. Not the `download` HTML attribute: the signed URL is
// cross-origin (Supabase Storage), where browsers ignore that attribute entirely.
export async function downloadAttachment(fetchUrl: string): Promise<void> {
  try {
    const sep = fetchUrl.includes("?") ? "&" : "?";
    const res = await fetch(`${fetchUrl}${sep}download=1`);
    if (!res.ok) return;
    const data: { url: string } = await res.json();
    const a = document.createElement("a");
    a.href = data.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    // Non-fatal — no dedicated error UI for a menu-triggered download action.
  }
}

export function AttachmentGridTile({
  filename,
  size,
  thumbnail,
  actions,
  footerRight,
  onClick,
}: {
  filename: string;
  size: number | null;
  thumbnail: React.ReactNode;
  actions: AttachmentAction[];
  footerRight?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        aria-label={`View ${filename}`}
        className="w-full aspect-square flex flex-col text-left rounded-[14px] overflow-hidden cursor-pointer border border-[#E2E7F2] bg-white hover:bg-[#F4F8FF] hover:border-[#C7D2E8] transition-colors duration-150"
      >
        <div className="flex items-center gap-2 pl-2.5 pr-8 py-2 shrink-0">
          <FileText size={13} className="text-[#007BFF] shrink-0" />
          <span title={filename} className="text-[11px] font-medium truncate flex-1 text-[#3A4565]">
            {filename}
          </span>
        </div>
        <div className="flex-1 min-h-0 mx-2 mb-2 rounded-md overflow-hidden bg-[#F4F6FB]">
          {thumbnail}
        </div>
        <div className="flex items-center justify-between gap-1 px-2 pb-2 shrink-0">
          <span className="text-[9.5px] truncate text-[#5F6A88]">{formatFileSize(size)}</span>
          {footerRight}
        </div>
      </button>
      <div className="absolute top-2 right-2">
        <AttachmentActionsMenu actions={actions} />
      </div>
    </div>
  );
}

// Task 368 follow-up — comment attachments render 4-up (full comment width) instead of the
// narrower Attachments-tab grid; a comment with more than `INITIAL_VISIBLE` files collapses to
// that count by default with a "Show N more" toggle, so a heavily-attached comment doesn't push
// the rest of the thread far down the page. Generic over the caller's attachment row shape —
// `TaskComments` and `TicketComments` each pass their own `CommentAttachment` type.
const INITIAL_VISIBLE = 8;

export function CommentAttachmentGrid<T extends { id: string }>({
  items,
  renderItem,
}: {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, INITIAL_VISIBLE);
  const hiddenCount = items.length - visible.length;

  return (
    <div className="mt-1.5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {visible.map(renderItem)}
      </div>
      {items.length > INITIAL_VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[11.5px] font-semibold text-[#0063D6] hover:underline cursor-pointer"
        >
          {expanded ? "Show less" : `Show ${hiddenCount} more`}
        </button>
      )}
    </div>
  );
}
