"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Download, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { WikiPageDetail } from "@/types/wiki";
import { WIKI_EXPORT_FORMATS, type WikiExportFormat } from "./_wiki-export-formats";

// Task 400 — Export ▾ dropdown, lifted out of `_wiki-doc-panel.tsx`. Rows come from the
// `WIKI_EXPORT_FORMATS` registry; while one runs (Word/Markdown lazy-load their library on first
// click) its row spins and the others are disabled.

export function WikiExportMenu({ detail, triggerClassName }: { detail: WikiPageDetail; triggerClassName: string }) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<WikiExportFormat["id"] | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function runExport(format: WikiExportFormat) {
    setBusyId(format.id);
    try {
      await format.run(detail);
      setOpen(false);
    } catch (err) {
      console.error(`[wiki-export] ${format.id} failed`, err);
      toast.error(`Couldn't export as ${format.label}. Please try again.`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={triggerClassName}
      >
        <Download size={12} /> Export <ChevronDown size={11} />
      </button>
      {open && (
        <>
          <div aria-hidden className="fixed inset-0 z-40" onClick={() => !busyId && setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[180px] bg-white border border-[#E2E7F2] rounded-[10px] shadow-[0_8px_24px_rgba(7,17,51,.10)] p-1.5"
          >
            {WIKI_EXPORT_FORMATS.map((format) => (
              <button
                key={format.id}
                type="button"
                role="menuitem"
                disabled={busyId !== null}
                onClick={() => runExport(format)}
                className={cn(
                  "w-full flex items-center gap-2 text-left text-[12.5px] text-[#3A4565] rounded-[7px] px-2.5 py-2 cursor-pointer transition-colors hover:bg-[#F4F6FB]",
                  "disabled:cursor-not-allowed disabled:hover:bg-transparent",
                  busyId !== null && busyId !== format.id && "opacity-45"
                )}
              >
                {busyId === format.id ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
                Export as {format.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
