"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { marked } from "marked";
import { FileText, FileSpreadsheet, FileCode2, Image as ImageIcon, Table, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { cardCls, textPrimary, textMuted } from "./_shared-ui";

const WORD_MIME_TYPES = ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const EXCEL_MIME_TYPES = ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];

// Drive-style color-coded fallback — the loading state and the permanent result for anything
// this sandbox doesn't live-render (Office formats — same reasoning task 198 already used:
// rendering those needs the external Office Online viewer, too costly to load per grid card).
// Task 219 — also the single source of truth for the Notes card's small type icon badge
// (`getFileTypeMeta`), so the two never drift out of sync with each other.
const FILE_TYPE_TILES: { test: (mime: string) => boolean; Icon: typeof FileText; bg: string; fg: string; label: string }[] = [
  { test: (m) => WORD_MIME_TYPES.includes(m), Icon: FileText, bg: "bg-[#E5F1FF]", fg: "text-[#007BFF]", label: "DOC" },
  { test: (m) => EXCEL_MIME_TYPES.includes(m), Icon: FileSpreadsheet, bg: "bg-[#E3F6EA]", fg: "text-[#177E48]", label: "XLS" },
  { test: (m) => m === "application/pdf", Icon: FileText, bg: "bg-[#FDE8E6]", fg: "text-[#C0392B]", label: "PDF" },
  { test: (m) => m === "text/html", Icon: FileCode2, bg: "bg-[#FDF0E3]", fg: "text-[#E2762F]", label: "HTML" },
  { test: (m) => m === "text/markdown", Icon: FileCode2, bg: "bg-[#F4F6FB]", fg: "text-[#5F6A88]", label: "MD" },
  { test: (m) => m === "text/csv", Icon: Table, bg: "bg-[#E3F6EA]", fg: "text-[#177E48]", label: "CSV" },
  { test: (m) => m.startsWith("image/"), Icon: ImageIcon, bg: "bg-[#F0E9FB]", fg: "text-[#6A48E0]", label: "IMG" },
];

export function getFileTypeMeta(mime: string) {
  const match = FILE_TYPE_TILES.find((t) => t.test(mime));
  return { Icon: match?.Icon ?? FileText, bg: match?.bg ?? "bg-[#F4F6FB]", fg: match?.fg ?? "text-[#5F6A88]", label: match?.label ?? null };
}

export function FileTypeTile({ mime }: { mime: string }) {
  const { Icon, bg, fg, label } = getFileTypeMeta(mime);
  return (
    <div className={cn("w-full h-full flex flex-col items-center justify-center gap-1", bg)}>
      <Icon size={18} className={fg} />
      {label && <span className={cn("text-[9px] font-bold tracking-wide", fg)}>{label}</span>}
    </div>
  );
}

function useTextContent(url: string | null) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then((res) => (res.ok ? res.text() : Promise.reject()))
      .then((t) => { if (!cancelled) setText(t); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [url]);
  return { text, failed };
}

function PreviewLoading() {
  return <div className="w-full h-full flex items-center justify-center bg-[#F4F6FB]"><FileCode2 size={18} className="text-[#C7CEDD] animate-pulse" /></div>;
}

// Scale-to-fit — same technique as ../_onboarding-wizard.tsx's HtmlFilePreview: render the
// iframe at a real design width (1280px, matching a desktop viewport) so the page's own
// responsive breakpoints render normally, then measure this wrapper's actual box via
// ResizeObserver and visually shrink the whole rendered page down with a CSS transform, instead
// of a naive 1:1 iframe that would just show a cramped top-left corner with a native scrollbar.
export function HtmlPreview({ url, interactive }: { url: string; interactive?: boolean }) {
  const { text, failed } = useTextContent(url);
  const paneRef = useRef<HTMLDivElement>(null);
  const [paneSize, setPaneSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0) setPaneSize({ width: rect.width, height: rect.height });
    const observer = new ResizeObserver((entries) => {
      const observedRect = entries[0]?.contentRect;
      if (observedRect) setPaneSize({ width: observedRect.width, height: observedRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (failed) return <FileTypeTile mime="text/html" />;

  const virtualWidth = 1280;
  const scale = paneSize.width > 0 ? Math.min(1, paneSize.width / virtualWidth) : 1;
  const virtualHeight = paneSize.height > 0 && scale > 0 ? paneSize.height / scale : paneSize.height;

  return (
    <div ref={paneRef} className="w-full h-full relative overflow-hidden bg-white">
      {text === null ? (
        <PreviewLoading />
      ) : paneSize.width > 0 ? (
        // Empty sandbox = no script execution, no same-origin, no forms/popups/top-nav —
        // renders unreviewed client HTML visually inert. pointer-events-none stays the default
        // (grid/list thumbnail use, e.g. _file-tile.tsx's FileThumbnail) since a tiny scaled
        // preview shouldn't intercept clicks meant for the tile underneath it; `interactive`
        // opts back in for the full FilePreviewModal, where scrolling/selecting is expected.
        <iframe
          srcDoc={text}
          title="HTML preview"
          sandbox=""
          className={cn("block border-0 bg-white absolute top-0 left-0", !interactive && "pointer-events-none")}
          style={{ width: virtualWidth, height: virtualHeight, transform: `scale(${scale})`, transformOrigin: "top left" }}
        />
      ) : null}
    </div>
  );
}

function markdownDocument(bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" /><style>
    body { margin: 0; padding: 12px; font: 400 13px/1.5 -apple-system, BlinkMacSystemFont, "Inter", sans-serif; color: #0B1533; }
    h1, h2, h3 { font-weight: 700; margin: 0.6em 0 0.3em; line-height: 1.25; }
    h1 { font-size: 16px; } h2 { font-size: 14px; } h3 { font-size: 13px; }
    p, li { margin: 0.35em 0; }
    code { background: #F4F6FB; padding: 1px 4px; border-radius: 4px; font-size: 0.9em; }
  </style></head><body>${bodyHtml}</body></html>`;
}

export function MarkdownPreview({ url, interactive }: { url: string; interactive?: boolean }) {
  const { text, failed } = useTextContent(url);
  if (failed) return <FileTypeTile mime="text/markdown" />;
  if (!text) return <PreviewLoading />;
  const doc = markdownDocument(marked.parse(text, { async: false }) as string);
  return (
    <iframe
      srcDoc={doc}
      sandbox=""
      title="Markdown preview"
      className={cn("w-full h-full border-0 bg-white", !interactive && "pointer-events-none")}
    />
  );
}

// Real, unscaled table (not an artificially shrunk mini-table) inside a clipped, scrollable
// box — matches ../_onboarding-wizard.tsx's CsvFilePreview exactly: naive split on
// newlines/commas (no quoted-field handling, a reasonable tradeoff for a preview), styled
// header row, striped body rows, natural font size so it reads as a real spreadsheet snippet
// rather than a doll's-house table lost in empty space.
export function CsvPreview({ url }: { url: string }) {
  const { text, failed } = useTextContent(url);
  if (failed) return <FileTypeTile mime="text/csv" />;
  if (!text) return <PreviewLoading />;
  const rows = text.split(/\r\n|\n/).filter((line) => line.length > 0).map((line) => line.split(","));
  const [header, ...body] = rows;
  return (
    <div className="w-full h-full overflow-auto bg-white">
      <table className="min-w-full text-[10.5px] border-collapse">
        <thead>
          <tr>
            {header?.map((cell, i) => (
              <th key={i} className="text-left font-semibold text-[#3A4565] px-2 py-1.5 border-b-2 border-[#E2E7F2] bg-[#F4F6FB] whitespace-nowrap">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#F4F6FB]/50"}>
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-1 border-b border-[#EDF0F7] text-[#3A4565] whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Task 219 follow-up — in-app preview modal for the Business Info Notes card's eye button,
// rebuilt to match ../_onboarding-wizard.tsx's existing FileViewerModal exactly (shell, sizing,
// motion, Office Online embed for Word/Excel) instead of a smaller bespoke one. Reported "lag"
// on the eye button was this component waiting for the signed-URL fetch to resolve before
// rendering anything — the original opens the modal immediately with a loading state and fetches
// after, which this now mirrors (see NoteFileCard's handlePreview, which no longer awaits before
// opening). Cannot literally import FileViewerModal — that file is off-limits to edit per task
// 217's boundary and doesn't export it — so this replicates its markup/behavior instead.
function officePreviewUrl(url: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
}

function PreviewBody({ mime, fileName, url }: { mime: string; fileName: string; url: string }) {
  if (mime.startsWith("image/")) {
    return (
      <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived Supabase Storage URL, same precedent as FileThumbnail in _file-tile.tsx */}
        <img src={url} alt={fileName} className="max-w-full max-h-full object-contain" />
      </div>
    );
  }
  if (mime === "application/pdf") return <iframe src={url} title={fileName} className="w-full h-full border-0" />;
  if (WORD_MIME_TYPES.includes(mime) || EXCEL_MIME_TYPES.includes(mime)) {
    return <iframe src={officePreviewUrl(url)} title={fileName} className="w-full h-full border-0" />;
  }
  if (mime === "text/html") return <HtmlPreview url={url} interactive />;
  if (mime === "text/csv") return <CsvPreview url={url} />;
  if (mime === "text/markdown") return <MarkdownPreview url={url} interactive />;
  if (mime === "text/plain") return <iframe src={url} title={fileName} sandbox="" className="w-full h-full border-0 bg-white" />;
  return (
    <div className="w-full h-full flex items-center justify-center px-6 text-center">
      <span className={cn("text-[12.5px]", textMuted)}>Preview not available for this file type.</span>
    </div>
  );
}

export function FilePreviewModal({
  fileName, mimeType, url, loading, error, onClose,
}: {
  fileName: string; mimeType: string; url: string | null; loading: boolean; error: string | null; onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#071133]/60 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-file-viewer-title"
        className={cn(cardCls, "w-[1360px] max-w-[96vw] h-[94vh] shadow-xl overflow-hidden flex flex-col")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#EDF0F7] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={14} className="text-[#007BFF] shrink-0" />
            <h2 id="note-file-viewer-title" className={cn("text-[13.5px] font-semibold truncate", textPrimary)}>{fileName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className={cn("p-2 rounded-md cursor-pointer border-none bg-transparent hover:bg-[#5F6A88]/10 transition-colors shrink-0", textMuted)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 min-w-0 relative bg-[#EDF0F7]">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={cn("text-[12.5px]", textMuted)}>Loading preview…</span>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
              <span className="text-[12.5px] text-[#C0392B]">{error}</span>
            </div>
          )}
          {url && !loading && !error && <PreviewBody mime={mimeType} fileName={fileName} url={url} />}
        </div>
      </motion.div>
    </motion.div>
  );
}
