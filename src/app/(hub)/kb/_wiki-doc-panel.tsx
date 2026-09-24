"use client";

import { useState, type ReactNode } from "react";
import { History, Loader2, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { WikiPageDetail, WikiStatus } from "@/types/wiki";
import { WikiRte } from "./_wiki-rte";
import { WikiAvatar } from "./_wiki-avatar";
import { WikiExportMenu } from "./_wiki-export-menu";
import { WikiTagInput } from "./_wiki-tag-input";
import { WIKI_PROSE_CLASS } from "./_wiki-prose";
import type { WikiDraftStatus } from "./_use-wiki-draft";
import type { WikiTagCount } from "@/lib/wiki/tags";

// Task 395 — Panel 2: document canvas. Structure from the mockup's `.panel-doc`, restyled to
// the real design tokens. Export ▾ lives in `_wiki-export-menu.tsx` (task 400 — HTML / PDF /
// Word / Markdown, all client-side).

const STATUS_STYLE: Record<WikiStatus, string> = {
  draft: "bg-[#FFF3D6] text-[#8A5A00]",
  published: "bg-[#E3F5EA] text-[#177E48]",
  archived: "bg-[#EDF0F7] text-[#5F6A88]",
};

// Task 402 — autosave indicator beside Cancel/Save. Text, not just color, carries the state.
function DraftStatusLabel({ status, savedAt }: { status: WikiDraftStatus; savedAt: string | null }) {
  if (status === "idle") return null;
  const text =
    status === "pending"
      ? "Unsaved changes"
      : status === "saving"
        ? "Saving draft…"
        : status === "error"
          ? "Draft not saved"
          : `Draft saved ${savedAt ? new Date(savedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}`;
  return (
    <span className={cn("text-[11px]", status === "error" ? "text-[#C0392B] font-semibold" : "text-[#94A3B8]")} aria-live="polite">
      {text}
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Shared pill-button look for Cancel / Edit / Delete / Export (hover accents vary per button).
const PILL_BUTTON =
  "flex items-center gap-1.5 text-[12px] font-semibold text-[#5F6A88] border border-[#E2E7F2] bg-white rounded-full px-3.5 py-1.5 cursor-pointer transition-colors";

export function WikiDocPanel({
  detail,
  renderedHtml,
  canWrite,
  editMode,
  draftTitle,
  draftContentHtml,
  draftTags,
  tagCatalog,
  saving,
  entering,
  deleting,
  childCount,
  onDraftTitleChange,
  onDraftContentChange,
  onDraftTagsChange,
  onEnterEdit,
  onCancelEdit,
  onSave,
  onStatusChange,
  onDelete,
  onOpenHistory,
  presenceBar,
  draftStatus,
  draftSavedAt,
}: {
  detail: WikiPageDetail;
  renderedHtml: string;
  canWrite: boolean;
  editMode: boolean;
  draftTitle: string;
  draftContentHtml: string;
  draftTags: string[];
  tagCatalog: WikiTagCount[];
  saving: boolean;
  entering: boolean;
  deleting: boolean;
  childCount: number;
  onDraftTitleChange: (value: string) => void;
  onDraftContentChange: (value: string) => void;
  onDraftTagsChange: (value: string[]) => void;
  onEnterEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onStatusChange: (status: WikiStatus) => void;
  onDelete: () => Promise<boolean>;
  onOpenHistory: () => void;
  presenceBar: ReactNode;
  draftStatus: WikiDraftStatus;
  draftSavedAt: string | null;
}) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  async function handleConfirmDelete() {
    const ok = await onDelete();
    if (ok) setDeleteConfirmOpen(false);
  }

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div className="max-w-[760px] mx-auto px-10 py-8">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2 text-[12px] text-[#5F6A88] min-w-0">
            {canWrite && !editMode ? (
              <select
                value={detail.status}
                onChange={(e) => onStatusChange(e.target.value as WikiStatus)}
                className={cn(
                  "text-[11px] font-semibold px-2.5 py-0.5 rounded-full border-none outline-none cursor-pointer appearance-none",
                  STATUS_STYLE[detail.status]
                )}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            ) : (
              <span className={cn("text-[11px] font-semibold px-2.5 py-0.5 rounded-full shrink-0", STATUS_STYLE[detail.status])}>
                {detail.status[0].toUpperCase() + detail.status.slice(1)}
              </span>
            )}
            <span className="truncate">{detail.product} / {detail.title}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {editMode ? (
              <>
                <DraftStatusLabel status={draftStatus} savedAt={draftSavedAt} />
                <button
                  type="button"
                  onClick={onCancelEdit}
                  disabled={saving}
                  className={cn(PILL_BUTTON, "hover:border-[#A8C6F5] disabled:opacity-45")}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving || !draftTitle.trim()}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#007BFF] rounded-full px-3.5 py-1.5 cursor-pointer transition-colors hover:bg-[#0063D6] disabled:opacity-45"
                >
                  {saving && <Loader2 size={12} className="animate-spin" />}
                  Save
                </button>
              </>
            ) : (
              <>
                {canWrite && (
                  <>
                    <button
                      type="button"
                      onClick={onEnterEdit}
                      disabled={entering}
                      className={cn(PILL_BUTTON, "hover:border-[#A8C6F5] disabled:opacity-45")}
                    >
                      {entering ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={12} />} Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmOpen(true)}
                      className={cn(PILL_BUTTON, "hover:border-[#F5A8A8] hover:bg-[#FDE8E6] hover:text-[#C0392B]")}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={onOpenHistory}
                  className={cn(PILL_BUTTON, "hover:border-[#A8C6F5]")}
                >
                  <History size={12} /> History
                </button>
                <WikiExportMenu detail={detail} triggerClassName={cn(PILL_BUTTON, "hover:border-[#A8C6F5]")} />
              </>
            )}
          </div>
        </div>

        {presenceBar}

        {editMode ? (
          <>
            <input
              value={draftTitle}
              onChange={(e) => onDraftTitleChange(e.target.value)}
              className="w-full font-heading text-[22px] font-bold tracking-[-0.015em] text-[#0B1533] outline-none border-b border-transparent focus:border-[#E2E7F2] mb-3 pb-1"
              placeholder="Page title"
            />
            <label htmlFor="wiki-doc-tags" className="block text-[11px] font-semibold text-[#0B1533] mb-1.5">
              Tags
            </label>
            <WikiTagInput
              id="wiki-doc-tags"
              value={draftTags}
              onChange={onDraftTagsChange}
              catalog={tagCatalog}
              contextTitle={draftTitle}
              className="mb-4"
            />
          </>
        ) : (
          <h1 className="font-heading text-[22px] font-bold tracking-[-0.015em] text-[#0B1533] mb-3 leading-[1.2]">{detail.title}</h1>
        )}

        <div className="flex items-center gap-4 flex-wrap text-[12px] text-[#5F6A88] border-b border-[#E2E7F2] pb-4 mb-5">
          {detail.updatedBy && (
            <span className="flex items-center gap-1.5">
              <WikiAvatar contributor={detail.updatedBy} size="sm" />
              Edited by {detail.updatedBy.name}
            </span>
          )}
          <span>Updated {formatDate(detail.updatedAt)}</span>
          <span className="font-mono text-[11px]">v{detail.version}</span>
        </div>

        {editMode ? (
          <WikiRte pageId={detail.id} value={draftContentHtml} onChange={onDraftContentChange} />
        ) : detail.contentHtml.trim() ? (
          <div
            className={WIKI_PROSE_CLASS}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        ) : (
          <p className="text-[13px] text-[#94A3B8] italic">This page has no content yet.{canWrite && " Click Edit to write it."}</p>
        )}
      </div>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete page?"
        body={
          childCount > 0
            ? `This will permanently delete "${detail.title}" and its ${childCount} sub-page${childCount === 1 ? "" : "s"}.`
            : `This will permanently delete "${detail.title}".`
        }
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        confirmDisabled={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </div>
  );
}
