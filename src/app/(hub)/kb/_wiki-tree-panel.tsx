"use client";

import { useMemo, useState } from "react";
import { Search, FileText, Plus, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WikiPageSummary, WikiProduct } from "@/types/wiki";
import { useWikiSpaceOrder } from "@/hooks/use-wiki-space-order";
import { WikiSpaceList } from "./_wiki-space-list";

// Task 395 — Panel 1: space switcher + page tree. Structure/placement from
// `_final_design/wiki/wiki-mockup.html`'s `.panel-tree`, restyled to the real design tokens
// (`_final_design/guide/central-hub-design-system.md`) rather than the mockup's own navy/paper
// preview palette. Task 399 — space switcher is now drag-reorderable (`_wiki-space-list.tsx`)
// and every page row shows a version badge instead of the old draft-only pill.

export function WikiTreePanel({
  pages,
  selectedProduct,
  selectedPageId,
  onSelectSpace,
  onSelectPage,
  onNewPage,
  onImport,
  canWrite,
}: {
  pages: WikiPageSummary[];
  selectedProduct: WikiProduct;
  selectedPageId: string | null;
  onSelectSpace: (product: WikiProduct) => void;
  onSelectPage: (pageId: string, product: WikiProduct) => void;
  onNewPage: () => void;
  onImport: () => void;
  canWrite: boolean;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<WikiProduct>>(new Set([selectedProduct]));
  const { order, setOrder } = useWikiSpaceOrder();

  function toggleSpace(product: WikiProduct) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(product)) next.delete(product); else next.add(product);
      return next;
    });
    onSelectSpace(product);
  }

  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return pages.filter((p) => p.status !== "archived" && p.title.toLowerCase().includes(q));
  }, [pages, search]);

  return (
    <div className="w-[264px] shrink-0 bg-white border-r border-[#E2E7F2] flex flex-col min-h-0">
      <div className="p-3.5 pb-2.5">
        <div className="flex items-center gap-2 bg-[#F4F6FB] border border-[#E2E7F2] rounded-[8px] px-2.5 py-1.5">
          <Search size={13} className="text-[#94A3B8] shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search wiki…"
            className="w-full bg-transparent outline-none text-[12.5px] text-[#3A4565] placeholder:text-[#94A3B8]"
          />
        </div>
      </div>

      {canWrite && (
        <div className="flex items-center justify-between px-3.5 pb-2">
          <span className="text-[10.5px] font-bold tracking-[0.06em] text-[#5F6A88]">SPACES</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onImport}
              className="flex items-center gap-1 text-[11px] font-semibold text-[#5F6A88] border border-[#E2E7F2] bg-white rounded-[7px] px-2 py-1 cursor-pointer transition-colors hover:border-[#A8C6F5]"
            >
              <Upload size={11} /> Import
            </button>
            <button
              type="button"
              onClick={onNewPage}
              className="flex items-center gap-1 text-[11px] font-semibold text-white bg-[#FB914E] rounded-[7px] px-2 py-1 cursor-pointer transition-colors hover:bg-[#E2762F]"
            >
              <Plus size={11} /> New page
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-4 min-h-0">
        {searchMatches ? (
          searchMatches.length === 0 ? (
            <p className="px-2.5 py-3 text-[12px] text-[#94A3B8]">No pages match &ldquo;{search}&rdquo;.</p>
          ) : (
            searchMatches.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPage(p.id, p.product)}
                className={cn(
                  "w-full flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[12.5px] cursor-pointer transition-colors text-left",
                  p.id === selectedPageId ? "bg-[#FDEEE6] text-[#B85512] font-semibold" : "text-[#5F6A88] hover:bg-[#F4F6FB]"
                )}
              >
                <FileText size={12} className="shrink-0 opacity-75" />
                <span className="truncate flex-1">{p.title}</span>
                <span className="shrink-0 text-[9px] font-mono text-[#94A3B8] bg-[#F4F6FB] border border-[#E2E7F2] rounded-full px-1.5 py-0.5">
                  v{p.version}
                </span>
              </button>
            ))
          )
        ) : (
          <WikiSpaceList
            order={order}
            onReorder={setOrder}
            pages={pages}
            expanded={expanded}
            onToggleSpace={toggleSpace}
            selectedPageId={selectedPageId}
            onSelectPage={onSelectPage}
          />
        )}
      </div>
    </div>
  );
}
