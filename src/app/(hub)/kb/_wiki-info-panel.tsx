"use client";

import { cn } from "@/lib/utils";
import type { WikiPageDetail } from "@/types/wiki";
import { WikiAvatar } from "./_wiki-avatar";

// Task 395 — Panel 3: On This Page TOC, Page Info, Contributors, Related Pages. Structure from
// the mockup's `.panel-info`, restyled to the real design tokens. Task 399 (Owner-avatar
// follow-up) — Owner is now an avatar + tooltip (via `_wiki-avatar.tsx`), not raw name text,
// since a long/combined `full_name` value was wrapping into an ugly two-line block.

export type TocEntry = { id: string; level: 2 | 3; text: string };

export function WikiInfoPanel({
  detail,
  toc,
  activeTocId,
  onTocClick,
  onSelectRelated,
}: {
  detail: WikiPageDetail;
  toc: TocEntry[];
  activeTocId: string | null;
  onTocClick: (id: string) => void;
  onSelectRelated: (pageId: string, product: WikiPageDetail["product"]) => void;
}) {
  return (
    <div className="w-[236px] shrink-0 border-l border-[#E2E7F2] overflow-y-auto px-4 py-5">
      {toc.length > 0 && (
        <div className="mb-6">
          <div className="text-[10.5px] font-bold tracking-[0.03em] text-[#5F6A88] mb-2.5">ON THIS PAGE</div>
          {toc.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onTocClick(entry.id)}
              className={cn(
                "block w-full text-left border-l-2 py-1 text-[12.5px] transition-colors cursor-pointer",
                entry.level === 3 ? "pl-5" : "pl-2.5",
                entry.id === activeTocId
                  ? "border-[#FB914E] text-[#B85512] font-semibold"
                  : "border-transparent text-[#5F6A88] hover:text-[#0B1533]"
              )}
            >
              {entry.text}
            </button>
          ))}
        </div>
      )}

      <div className="mb-6">
        <div className="text-[10.5px] font-bold tracking-[0.03em] text-[#5F6A88] mb-2.5">PAGE INFO</div>
        <div className="flex items-center justify-between py-1 text-[12.5px]">
          <span className="text-[#5F6A88]">Owner</span>
          {detail.createdBy ? (
            <WikiAvatar contributor={detail.createdBy} />
          ) : (
            <span className="text-[#0B1533] font-semibold">Unassigned</span>
          )}
        </div>
        <InfoRow label="Status" value={STATUS_LABEL[detail.status]} />
        <InfoRow label="Version" value={`v${detail.version}`} mono />
        {detail.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {detail.tags.map((tag) => (
              <span key={tag} className="text-[11px] bg-[#F4F6FB] border border-[#E2E7F2] text-[#5F6A88] rounded-full px-2 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {detail.contributors.length > 0 && (
        <div className="mb-6">
          <div className="text-[10.5px] font-bold tracking-[0.03em] text-[#5F6A88] mb-2.5">CONTRIBUTORS</div>
          <div className="flex">
            {detail.contributors.slice(0, 6).map((c) => (
              <WikiAvatar key={c.id} contributor={c} overlap />
            ))}
          </div>
        </div>
      )}

      {detail.relatedPages.length > 0 && (
        <div>
          <div className="text-[10.5px] font-bold tracking-[0.03em] text-[#5F6A88] mb-2.5">RELATED PAGES</div>
          {detail.relatedPages.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectRelated(p.id, p.product)}
              className="block w-full text-left text-[12.5px] text-[#007BFF] hover:text-[#0063D6] transition-colors py-1 cursor-pointer truncate"
            >
              {p.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<WikiPageDetail["status"], string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 text-[12.5px]">
      <span className="text-[#5F6A88]">{label}</span>
      <span className={cn("text-[#0B1533] font-semibold", mono && "font-mono text-[11px]")}>{value}</span>
    </div>
  );
}
