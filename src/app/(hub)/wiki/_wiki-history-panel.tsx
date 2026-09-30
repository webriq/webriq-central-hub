"use client";

import { useEffect, useMemo, useState } from "react";
import { History, Loader2, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { WikiPageDetail, WikiRevisionDetail, WikiRevisionSummary } from "@/types/wiki";
import { WikiAvatar } from "./_wiki-avatar";
import { WikiDiffView, type WikiDiffSide } from "./_wiki-diff-view";
import { WikiChoiceDialog } from "./_wiki-conflict-modal";

// Task 402 — page history: every Save / Publish / Restore snapshot (migration 151), newest
// first, with author + a full diff of the selected revision against either its predecessor or
// the page as it is now. Writers can restore any revision; a restore is itself a new revision,
// so it can be undone from this same list.

type Compare = "previous" | "current";

const KIND_STYLE: Record<WikiRevisionSummary["kind"], string> = {
  save: "bg-[#EDF0F7] text-[#5F6A88]",
  publish: "bg-[#E3F5EA] text-[#177E48]",
  restore: "bg-[#EEF3FF] text-[#0063D6]",
};

function kindLabel(rev: WikiRevisionSummary): string {
  if (rev.kind === "publish") return `Published v${rev.version}`;
  if (rev.kind === "restore") return rev.restoredFromRevision !== null ? `Restored #${rev.restoredFromRevision}` : "Restored";
  return "Saved";
}

function revisionLabel(rev: { revision: number | null }): string {
  return rev.revision !== null ? `#${rev.revision}` : "Legacy";
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const EMPTY_SIDE: WikiDiffSide = { title: "", contentHtml: "", tags: [] };

export function WikiHistoryPanel({
  detail,
  canWrite,
  editing,
  onClose,
  onRestored,
}: {
  detail: WikiPageDetail;
  canWrite: boolean;
  // Task 403 follow-up — history can be opened mid-edit (edits live in the shell's editor hook
  // and survive this panel). Restore is blocked meanwhile: it goes through wiki_save_page(),
  // which deletes the caller's own autosaved draft — the only backup of the unsaved edits.
  editing: boolean;
  onClose: () => void;
  // Called with the RPC outcome; the shell reloads the page either way (409 = someone saved
  // in the meantime, so the current content shown here was already stale).
  onRestored: (result: { revision: number } | { conflict: true }) => void;
}) {
  const [revisions, setRevisions] = useState<WikiRevisionSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<WikiRevisionDetail | null>(null);
  const [compare, setCompare] = useState<Compare>("previous");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/wiki/pages/${detail.id}/revisions`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: WikiRevisionSummary[]) => {
        if (cancelled) return;
        setRevisions(rows);
        setSelectedId((prev) => prev ?? rows[0]?.id ?? null);
      });
    return () => { cancelled = true; };
  }, [detail.id, detail.revision]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    fetch(`/api/wiki/pages/${detail.id}/revisions/${selectedId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: WikiRevisionDetail | null) => { if (!cancelled) setSelected(body); });
    return () => { cancelled = true; };
  }, [detail.id, selectedId]);

  const contributors = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number }>();
    for (const rev of revisions ?? []) {
      if (!rev.editor) continue;
      const entry = counts.get(rev.editor.id) ?? { ...rev.editor, count: 0 };
      entry.count++;
      counts.set(rev.editor.id, entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }, [revisions]);

  const selectedSummary = revisions?.find((r) => r.id === selectedId) ?? null;
  const isCurrent = selectedSummary?.revision === detail.revision;
  const loadingDiff = selectedId !== null && selected?.revision.id !== selectedId;

  const sides = useMemo(() => {
    if (!selected) return null;
    const rev: WikiDiffSide = selected.revision;
    if (compare === "current") {
      return {
        oldSide: rev,
        newSide: { title: detail.title, contentHtml: detail.contentHtml, tags: detail.tags },
        oldLabel: revisionLabel(selected.revision),
        newLabel: "Current page",
      };
    }
    return {
      oldSide: selected.previous ?? EMPTY_SIDE,
      newSide: rev,
      oldLabel: selected.previous ? revisionLabel(selected.previous) : "Empty",
      newLabel: revisionLabel(selected.revision),
    };
  }, [selected, compare, detail.title, detail.contentHtml, detail.tags]);

  async function restore() {
    if (!selectedId || restoring) return;
    setRestoring(true);
    try {
      const res = await fetch(`/api/wiki/pages/${detail.id}/revisions/${selectedId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseRevision: detail.revision }),
      });
      if (res.status === 409) {
        toast.error("Someone saved this page while you were looking. Reloaded the latest version — try again.");
        onRestored({ conflict: true });
        return;
      }
      if (!res.ok) {
        toast.error("Couldn't restore this revision.");
        return;
      }
      const body = (await res.json()) as { revision: number };
      toast.success(`Restored ${selectedSummary ? revisionLabel(selectedSummary) : "revision"} as #${body.revision}`);
      setSelectedId(null);
      onRestored({ revision: body.revision });
    } finally {
      setRestoring(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="flex-1 min-w-0 flex overflow-hidden">
      <div className="w-[280px] shrink-0 border-r border-[#E2E7F2] flex flex-col">
        <div className="flex items-center justify-between px-4 pt-5 pb-3">
          <div className="flex items-center gap-2 font-heading text-[15px] font-bold text-[#0B1533]">
            <History size={15} /> History
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close history"
            className="p-1 rounded-full text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#F4F6FB] cursor-pointer transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {contributors.length > 0 && (
          <div className="px-4 pb-3 border-b border-[#EDF0F7]">
            <div className="text-[10.5px] font-bold tracking-[0.03em] text-[#5F6A88] mb-2">CONTRIBUTORS</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {contributors.map((c) => (
                <span key={c.id} className="flex items-center gap-1.5 text-[11.5px] text-[#3A4565]">
                  <WikiAvatar contributor={c} size="sm" />
                  {c.name} <span className="text-[#94A3B8]">· {c.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {revisions === null ? (
            <div className="flex items-center gap-2 px-2 py-3 text-[12px] text-[#94A3B8]">
              <Loader2 size={12} className="animate-spin" /> Loading history…
            </div>
          ) : revisions.length === 0 ? (
            <div className="flex flex-col items-center text-center gap-2 px-4 py-10 text-[#94A3B8]">
              <History size={20} />
              <p className="text-[12px]">No saved revisions yet. History starts with the next save.</p>
            </div>
          ) : (
            revisions.map((rev) => (
              <button
                key={rev.id}
                type="button"
                onClick={() => setSelectedId(rev.id)}
                className={cn(
                  "w-full text-left rounded-[8px] px-2.5 py-2 mb-0.5 cursor-pointer transition-colors",
                  rev.id === selectedId ? "bg-[#FDEEE6]" : "hover:bg-[#F4F6FB]"
                )}
              >
                <div className="flex items-center gap-1.5">
                  {rev.editor && <WikiAvatar contributor={rev.editor} size="sm" />}
                  <span className="flex-1 truncate text-[12px] font-semibold text-[#0B1533]">{rev.editor?.name ?? "Unknown"}</span>
                  <span className="font-mono text-[10px] text-[#94A3B8]">{revisionLabel(rev)}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 pl-[22px]">
                  <span className={cn("text-[10px] font-semibold rounded-full px-1.5 py-px", KIND_STYLE[rev.kind])}>{kindLabel(rev)}</span>
                  <span className="text-[11px] text-[#5F6A88]">{formatDateTime(rev.createdAt)}</span>
                  {rev.revision === detail.revision && <span className="text-[10px] font-semibold text-[#B85512]">Current</span>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-[900px] mx-auto px-8 py-6">
          {selectedSummary && (
            <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
              <div className="flex items-center rounded-full border border-[#E2E7F2] bg-white p-0.5" role="group" aria-label="Compare with">
                {(["previous", "current"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCompare(value)}
                    aria-pressed={compare === value}
                    className={cn(
                      "text-[11px] font-semibold rounded-full px-2.5 py-1 cursor-pointer transition-colors",
                      compare === value ? "bg-[#0B1533] text-white" : "text-[#5F6A88] hover:text-[#0B1533]"
                    )}
                  >
                    {value === "previous" ? "Changes in this revision" : "Compare with current"}
                  </button>
                ))}
              </div>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={isCurrent || restoring || editing}
                  title={
                    editing
                      ? "Save or cancel your edits before restoring a revision"
                      : isCurrent
                        ? "This is already the current version"
                        : undefined
                  }
                  className="flex items-center gap-1.5 text-[12px] font-semibold bg-[#FB914E] text-[#471F02] rounded-full px-3.5 py-1.5 cursor-pointer transition-colors hover:bg-[#E2762F] hover:text-white disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <RotateCcw size={12} /> Restore this revision
                </button>
              )}
            </div>
          )}

          {!selectedSummary ? (
            revisions && revisions.length > 0 && <p className="text-[12.5px] text-[#94A3B8]">Select a revision to see what changed.</p>
          ) : loadingDiff || !sides ? (
            <div className="flex items-center gap-2 text-[12px] text-[#94A3B8]">
              <Loader2 size={12} className="animate-spin" /> Loading changes…
            </div>
          ) : (
            <WikiDiffView {...sides} />
          )}
        </div>
      </div>

      {confirmOpen && selectedSummary && (
        <WikiChoiceDialog
          title={`Restore ${revisionLabel(selectedSummary)}?`}
          body={`The page's title, content and tags will be replaced with this revision from ${formatDateTime(selectedSummary.createdAt)}. The current version stays in history, so this can be undone.`}
          onClose={() => setConfirmOpen(false)}
          actions={[
            { label: "Cancel", onClick: () => setConfirmOpen(false) },
            { label: "Restore", onClick: () => void restore(), variant: "primary", busy: restoring },
          ]}
        />
      )}
    </div>
  );
}
