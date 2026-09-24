"use client";

import { useMemo, useState } from "react";
import { Search, FileText, Plus, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WikiPageSummary, WikiProduct } from "@/types/wiki";
import { useWikiSpaceOrder } from "@/hooks/use-wiki-space-order";
import type { WikiTagCount } from "@/lib/wiki/tags";
import { WikiSpaceList } from "./_wiki-space-list";
import { WikiTreeFilter } from "./_wiki-tree-filter";
import { EditingIndicator, type EditingPages } from "./_wiki-tree-panel-rows";

// Task 395 — Panel 1: space switcher + page tree. Structure/placement from
// `_final_design/wiki/wiki-mockup.html`'s `.panel-tree`, restyled to the real design tokens
// (`_final_design/guide/central-hub-design-system.md`) rather than the mockup's own navy/paper
// preview palette. Task 399 — space switcher is now drag-reorderable (`_wiki-space-list.tsx`)
// and every page row shows a version badge instead of the old draft-only pill. Task 401 — Filter
// (Spaces / Tags) beside the search. Search is "locked in" to the filtered set and always matches
// title OR tag. A Spaces-only filter keeps the tree (hiding other spaces); a tag filter or any
// search text switches to the flat result list.

export function WikiTreePanel({
  pages,
  tagCatalog,
  selectedProduct,
  selectedPageId,
  onSelectSpace,
  onSelectPage,
  onNewPage,
  onImport,
  canWrite,
  editingPages,
}: {
  pages: WikiPageSummary[];
  tagCatalog: WikiTagCount[];
  selectedProduct: WikiProduct;
  selectedPageId: string | null;
  onSelectSpace: (product: WikiProduct) => void;
  onSelectPage: (pageId: string, product: WikiProduct) => void;
  onNewPage: () => void;
  onImport: () => void;
  canWrite: boolean;
  editingPages?: EditingPages;
}) {
  const [search, setSearch] = useState("");
  const [filterSpaces, setFilterSpaces] = useState<WikiProduct[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const filterActive = filterSpaces.length > 0 || filterTags.length > 0;
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

  // `null` → render the tree. Tag keys compare lowercase so a page whose tag casing differs from
  // the catalog's (pre-task-401 data) still matches.
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q && filterTags.length === 0) return null;
    const tagKeys = new Set(filterTags.map((t) => t.toLowerCase()));
    return pages
      .filter((p) => p.status !== "archived")
      .filter((p) => filterSpaces.length === 0 || filterSpaces.includes(p.product))
      .filter((p) => tagKeys.size === 0 || p.tags.some((t) => tagKeys.has(t.toLowerCase())))
      .flatMap((p) => {
        if (!q) return [{ page: p, matchedTags: p.tags.filter((t) => tagKeys.has(t.toLowerCase())) }];
        const tagHits = p.tags.filter((t) => t.toLowerCase().includes(q));
        if (!p.title.toLowerCase().includes(q) && tagHits.length === 0) return [];
        return [{ page: p, matchedTags: tagHits }];
      });
  }, [pages, search, filterSpaces, filterTags]);

  const visibleSpaces = useMemo(
    () => (filterSpaces.length > 0 ? new Set(filterSpaces) : undefined),
    [filterSpaces]
  );

  function clearFilters() {
    setFilterSpaces([]);
    setFilterTags([]);
  }

  return (
    <div className="w-[264px] shrink-0 bg-white border-r border-[#E2E7F2] flex flex-col min-h-0">
      <div className="p-3.5 pb-2.5 flex items-center gap-1.5">
        <div className="flex-1 min-w-0 flex items-center gap-2 bg-[#F4F6FB] border border-[#E2E7F2] rounded-[8px] px-2.5 py-1.5">
          <Search size={13} className="text-[#94A3B8] shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={filterActive ? "Search in filtered pages…" : "Search wiki…"}
            aria-label="Search wiki"
            className="w-full bg-transparent outline-none text-[12.5px] text-[#3A4565] placeholder:text-[#94A3B8]"
          />
        </div>
        <WikiTreeFilter
          tagCatalog={tagCatalog}
          selectedSpaces={filterSpaces}
          selectedTags={filterTags}
          onSpacesChange={setFilterSpaces}
          onTagsChange={setFilterTags}
        />
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
              className="flex items-center gap-1 text-[11px] font-semibold bg-[#FB914E] text-[#471F02] rounded-[7px] px-2 py-1 cursor-pointer transition-colors hover:bg-[#E2762F] hover:text-white"
            >
              <Plus size={11} /> New page
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-4 min-h-0">
        {results ? (
          results.length === 0 ? (
            <div className="px-2.5 py-3 flex flex-col items-start gap-2">
              <p className="text-[12px] text-[#94A3B8]">
                {search.trim() ? <>No pages match &ldquo;{search}&rdquo;.</> : "No pages match these filters."}
              </p>
              {filterActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-[11px] font-semibold text-[#5F6A88] border border-[#E2E7F2] bg-white rounded-[7px] px-2 py-1 cursor-pointer transition-colors hover:border-[#A8C6F5]"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            results.map(({ page: p, matchedTags }) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPage(p.id, p.product)}
                className={cn(
                  "w-full flex items-center gap-1.5 rounded-[6px] px-2.5 py-1.5 text-[12.5px] cursor-pointer transition-colors text-left",
                  p.id === selectedPageId ? "bg-[#FDEEE6] text-[#B85512] font-semibold" : "text-[#5F6A88] hover:bg-[#F4F6FB]"
                )}
              >
                <FileText size={12} className="shrink-0 opacity-75 self-start mt-0.5" />
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{p.title}</span>
                  {matchedTags.length > 0 && (
                    <span className="flex flex-wrap gap-1 mt-1">
                      {matchedTags.map((tag) => (
                        <span key={tag} className="text-[10px] font-normal bg-[#F4F6FB] border border-[#E2E7F2] text-[#5F6A88] rounded-full px-1.5 py-px">
                          {tag}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <EditingIndicator names={editingPages?.get(p.id)} />
                <span className="shrink-0 self-start text-[9px] font-mono text-[#94A3B8] bg-[#F4F6FB] border border-[#E2E7F2] rounded-full px-1.5 py-0.5">
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
            visibleSpaces={visibleSpaces}
            editingPages={editingPages}
          />
        )}
      </div>
    </div>
  );
}
