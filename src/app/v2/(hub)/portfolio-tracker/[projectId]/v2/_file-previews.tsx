"use client";

import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import { FileText, FileSpreadsheet, FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";

const WORD_MIME_TYPES = ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const EXCEL_MIME_TYPES = ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];

// Drive-style color-coded fallback — the loading state and the permanent result for anything
// this sandbox doesn't live-render (Office formats — same reasoning task 198 already used:
// rendering those needs the external Office Online viewer, too costly to load per grid card).
const FILE_TYPE_TILES: { test: (mime: string) => boolean; Icon: typeof FileText; bg: string; fg: string; label: string }[] = [
  { test: (m) => WORD_MIME_TYPES.includes(m), Icon: FileText, bg: "bg-[#E5F1FF]", fg: "text-[#007BFF]", label: "DOC" },
  { test: (m) => EXCEL_MIME_TYPES.includes(m), Icon: FileSpreadsheet, bg: "bg-[#E3F6EA]", fg: "text-[#177E48]", label: "XLS" },
  { test: (m) => m === "application/pdf", Icon: FileText, bg: "bg-[#FDE8E6]", fg: "text-[#C0392B]", label: "PDF" },
];

export function FileTypeTile({ mime }: { mime: string }) {
  const match = FILE_TYPE_TILES.find((t) => t.test(mime));
  const Icon = match?.Icon ?? FileText;
  return (
    <div className={cn("w-full h-full flex flex-col items-center justify-center gap-1", match?.bg ?? "bg-[#F4F6FB]")}>
      <Icon size={24} className={match?.fg ?? "text-[#5F6A88]"} />
      {match && <span className={cn("text-[9px] font-bold tracking-wide", match.fg)}>{match.label}</span>}
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
export function HtmlPreview({ url }: { url: string }) {
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
        // renders unreviewed client HTML visually inert; pointer-events-none since this is a
        // preview tile, not the real page (View/FileViewerModal is where interaction belongs).
        <iframe
          srcDoc={text}
          title="HTML preview"
          sandbox=""
          className="block border-0 bg-white absolute top-0 left-0 pointer-events-none"
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

export function MarkdownPreview({ url }: { url: string }) {
  const { text, failed } = useTextContent(url);
  if (failed) return <FileTypeTile mime="text/markdown" />;
  if (!text) return <PreviewLoading />;
  const doc = markdownDocument(marked.parse(text, { async: false }) as string);
  return <iframe srcDoc={doc} sandbox="" title="Markdown preview" className="w-full h-full border-0 bg-white pointer-events-none" />;
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
