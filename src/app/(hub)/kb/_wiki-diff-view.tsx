"use client";

import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { Columns2, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { diffHtml, diffTags, diffText } from "@/lib/wiki/diff";
import { WIKI_PROSE_CLASS } from "./_wiki-prose";

// Task 402 — renders a revision diff (title, tags, body) inline or side-by-side. Shared by the
// history panel, the save-conflict dialog and the stale-draft compare dialog. Only ever
// mounted after a user interaction, so the DOMParser/DOMPurify work never runs during SSR.

export type WikiDiffSide = { title: string; contentHtml: string; tags: string[] };

type Layout = "inline" | "split";

const DIFF_MARKS = cn(
  "[&_ins]:bg-[#E3F5EA] [&_ins]:text-[#177E48] [&_ins]:underline [&_ins]:decoration-[#177E48]/40 [&_ins]:rounded-[3px] [&_ins]:px-0.5",
  "[&_del]:bg-[#FDE8E6] [&_del]:text-[#C0392B] [&_del]:line-through [&_del]:rounded-[3px] [&_del]:px-0.5",
  "[&_.wiki-diff-added]:border-l-[3px] [&_.wiki-diff-added]:border-[#177E48] [&_.wiki-diff-added]:bg-[#F1FAF4] [&_.wiki-diff-added]:pl-3 [&_.wiki-diff-added]:py-0.5 [&_.wiki-diff-added]:my-1.5 [&_.wiki-diff-added]:rounded-r-[6px]",
  "[&_.wiki-diff-removed]:border-l-[3px] [&_.wiki-diff-removed]:border-[#C0392B] [&_.wiki-diff-removed]:bg-[#FEF4F3] [&_.wiki-diff-removed]:pl-3 [&_.wiki-diff-removed]:py-0.5 [&_.wiki-diff-removed]:my-1.5 [&_.wiki-diff-removed]:rounded-r-[6px] [&_.wiki-diff-removed]:line-through [&_.wiki-diff-removed]:opacity-70",
  "[&_.wiki-diff-modified]:border-l-[3px] [&_.wiki-diff-modified]:border-[#E0A526] [&_.wiki-diff-modified]:pl-3 [&_.wiki-diff-modified]:my-1.5",
  "[&_.wiki-diff-format]:border-l-[3px] [&_.wiki-diff-format]:border-dashed [&_.wiki-diff-format]:border-[#007BFF] [&_.wiki-diff-format]:pl-3 [&_.wiki-diff-format]:my-1.5"
);

function clean(html: string): string {
  return DOMPurify.sanitize(html);
}

export function WikiDiffView({
  oldSide,
  newSide,
  oldLabel,
  newLabel,
}: {
  oldSide: WikiDiffSide;
  newSide: WikiDiffSide;
  oldLabel: string;
  newLabel: string;
}) {
  const [layout, setLayout] = useState<Layout>("inline");

  // Keyed on the fields, not the side objects: callers often build `{title, contentHtml, tags}`
  // inline, and a fresh object each render would re-run the (DOM-parsing) diff every time.
  const { title: oldTitle, contentHtml: oldHtml, tags: oldTags } = oldSide;
  const { title: newTitle, contentHtml: newHtml, tags: newTags } = newSide;
  const diff = useMemo(() => {
    const body = diffHtml(oldHtml, newHtml);
    return {
      body,
      rows: body.rows.map((row) => ({
        type: row.type,
        inline: clean(row.inline),
        left: row.left === null ? null : clean(row.left),
        right: row.right === null ? null : clean(row.right),
      })),
      title: oldTitle === newTitle ? null : diffText(oldTitle, newTitle),
      tags: diffTags(oldTags, newTags),
    };
  }, [oldTitle, oldHtml, oldTags, newTitle, newHtml, newTags]);

  const tagsChanged = diff.tags.added.length > 0 || diff.tags.removed.length > 0;
  const bodyChanged = diff.body.added + diff.body.removed + diff.body.modified > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[11.5px] text-[#5F6A88]">
          <span className="font-semibold text-[#0B1533]">{oldLabel}</span>
          <span aria-hidden>→</span>
          <span className="font-semibold text-[#0B1533]">{newLabel}</span>
          <span className="ml-2 font-mono text-[10.5px]">
            <span className="text-[#177E48]">+{diff.body.added}</span>{" "}
            <span className="text-[#C0392B]">−{diff.body.removed}</span>{" "}
            <span className="text-[#8A5A00]">~{diff.body.modified}</span>
          </span>
        </div>
        <div className="flex items-center rounded-full border border-[#E2E7F2] bg-white p-0.5" role="group" aria-label="Diff layout">
          {(["inline", "split"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setLayout(value)}
              aria-pressed={layout === value}
              className={cn(
                "flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1 cursor-pointer transition-colors",
                layout === value ? "bg-[#0B1533] text-white" : "text-[#5F6A88] hover:text-[#0B1533]"
              )}
            >
              {value === "inline" ? <Rows3 size={11} /> : <Columns2 size={11} />}
              {value === "inline" ? "Inline" : "Side by side"}
            </button>
          ))}
        </div>
      </div>

      {diff.title && (
        <div className={cn("font-heading text-[15px] font-bold text-[#0B1533]", DIFF_MARKS)}>
          <span className="block text-[10.5px] font-sans font-bold tracking-[0.03em] text-[#5F6A88] mb-1">TITLE</span>
          <span dangerouslySetInnerHTML={{ __html: clean(diff.title.inline) }} />
        </div>
      )}

      {tagsChanged && (
        <div>
          <span className="block text-[10.5px] font-bold tracking-[0.03em] text-[#5F6A88] mb-1.5">TAGS</span>
          <div className="flex flex-wrap gap-1.5">
            {diff.tags.kept.map((tag) => (
              <span key={`k-${tag}`} className="text-[11px] bg-[#F4F6FB] border border-[#E2E7F2] text-[#5F6A88] rounded-full px-2 py-0.5">{tag}</span>
            ))}
            {diff.tags.added.map((tag) => (
              <span key={`a-${tag}`} className="text-[11px] bg-[#E3F5EA] border border-[#BFE6CD] text-[#177E48] rounded-full px-2 py-0.5">+ {tag}</span>
            ))}
            {diff.tags.removed.map((tag) => (
              <span key={`r-${tag}`} className="text-[11px] bg-[#FDE8E6] border border-[#F5C6C0] text-[#C0392B] line-through rounded-full px-2 py-0.5">− {tag}</span>
            ))}
          </div>
        </div>
      )}

      {!bodyChanged && !diff.title && !tagsChanged ? (
        <p className="text-[12.5px] text-[#94A3B8] italic">No differences — these two versions are identical.</p>
      ) : !bodyChanged ? (
        <p className="text-[12.5px] text-[#94A3B8] italic">Page body unchanged.</p>
      ) : layout === "inline" ? (
        <div className={cn(WIKI_PROSE_CLASS, DIFF_MARKS)}>
          {diff.rows.map((row, i) => (
            <div key={i} dangerouslySetInnerHTML={{ __html: row.inline }} />
          ))}
        </div>
      ) : (
        <div className={cn(WIKI_PROSE_CLASS, DIFF_MARKS, "grid grid-cols-2 gap-x-6")}>
          <div className="text-[10.5px] font-bold tracking-[0.03em] text-[#5F6A88] pb-1 border-b border-[#E2E7F2]">{oldLabel.toUpperCase()}</div>
          <div className="text-[10.5px] font-bold tracking-[0.03em] text-[#5F6A88] pb-1 border-b border-[#E2E7F2]">{newLabel.toUpperCase()}</div>
          {diff.rows.map((row, i) => (
            <SplitRow key={i} left={row.left} right={row.right} />
          ))}
        </div>
      )}
    </div>
  );
}

function SplitRow({ left, right }: { left: string | null; right: string | null }) {
  return (
    <>
      {left === null ? <div className="bg-[#FAFBFE] rounded-[6px] my-1.5" /> : <div className="min-w-0" dangerouslySetInnerHTML={{ __html: left }} />}
      {right === null ? <div className="bg-[#FAFBFE] rounded-[6px] my-1.5" /> : <div className="min-w-0" dangerouslySetInnerHTML={{ __html: right }} />}
    </>
  );
}
