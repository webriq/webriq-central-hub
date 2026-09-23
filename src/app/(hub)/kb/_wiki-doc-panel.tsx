"use client";

import { useState } from "react";
import { ChevronDown, Download, FileDown, Loader2, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { WikiPageDetail, WikiStatus } from "@/types/wiki";
import { WikiRte } from "./_wiki-rte";
import { WikiAvatar } from "./_wiki-avatar";

// Task 395 — Panel 2: document canvas. Structure from the mockup's `.panel-doc`, restyled to
// the real design tokens. Export: HTML is a real client-side Blob download (the mockup's
// `claude.use("downloads")` call is an Artifact-sandbox-only API and can't ship here); PDF /
// Word / Markdown stay disabled — no doc-conversion library exists in this codebase.

const STATUS_STYLE: Record<WikiStatus, string> = {
  draft: "bg-[#FFF3D6] text-[#8A5A00]",
  published: "bg-[#E3F5EA] text-[#177E48]",
  archived: "bg-[#EDF0F7] text-[#5F6A88]",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function downloadHtml(detail: WikiPageDetail) {
  const page = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>${detail.title}</title>\n` +
    `<style>body{font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#0f172a;line-height:1.6;}` +
    `h2{font-size:18px;margin-top:28px;}h3{font-size:15px;}` +
    `blockquote{background:#eef3ff;border:1px solid #d7e3ff;border-radius:8px;padding:12px 14px;margin:0 0 16px;}` +
    `pre{background:#0f172a;color:#e2e8f0;padding:12px 14px;border-radius:6px;overflow-x:auto;}</style>\n</head>\n<body>\n` +
    `<h1>${detail.title}</h1>\n${detail.contentHtml}\n</body>\n</html>`;
  const blob = new Blob([page], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${detail.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "page"}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function WikiDocPanel({
  detail,
  renderedHtml,
  canWrite,
  editMode,
  draftTitle,
  draftContentHtml,
  draftTags,
  saving,
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
}: {
  detail: WikiPageDetail;
  renderedHtml: string;
  canWrite: boolean;
  editMode: boolean;
  draftTitle: string;
  draftContentHtml: string;
  draftTags: string;
  saving: boolean;
  deleting: boolean;
  childCount: number;
  onDraftTitleChange: (value: string) => void;
  onDraftContentChange: (value: string) => void;
  onDraftTagsChange: (value: string) => void;
  onEnterEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onStatusChange: (status: WikiStatus) => void;
  onDelete: () => Promise<boolean>;
}) {
  const [exportOpen, setExportOpen] = useState(false);
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
                <button
                  type="button"
                  onClick={onCancelEdit}
                  disabled={saving}
                  className="text-[12px] font-semibold text-[#5F6A88] border border-[#E2E7F2] bg-white rounded-full px-3.5 py-1.5 cursor-pointer transition-colors hover:border-[#A8C6F5] disabled:opacity-45"
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
                      className="flex items-center gap-1.5 text-[12px] font-semibold text-[#5F6A88] border border-[#E2E7F2] bg-white rounded-full px-3.5 py-1.5 cursor-pointer transition-colors hover:border-[#A8C6F5]"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmOpen(true)}
                      className="flex items-center gap-1.5 text-[12px] font-semibold text-[#5F6A88] border border-[#E2E7F2] bg-white rounded-full px-3.5 py-1.5 cursor-pointer transition-colors hover:border-[#F5A8A8] hover:bg-[#FDE8E6] hover:text-[#C0392B]"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </>
                )}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setExportOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-[12px] font-semibold text-[#5F6A88] border border-[#E2E7F2] bg-white rounded-full px-3.5 py-1.5 cursor-pointer transition-colors hover:border-[#A8C6F5]"
                  >
                    <Download size={12} /> Export <ChevronDown size={11} />
                  </button>
                  {exportOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                      <div className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[180px] bg-white border border-[#E2E7F2] rounded-[10px] shadow-[0_8px_24px_rgba(7,17,51,.10)] p-1.5">
                        <button
                          type="button"
                          onClick={() => { downloadHtml(detail); setExportOpen(false); }}
                          className="w-full flex items-center gap-2 text-left text-[12.5px] text-[#3A4565] rounded-[7px] px-2.5 py-2 cursor-pointer transition-colors hover:bg-[#F4F6FB]"
                        >
                          <FileDown size={13} /> Export as HTML
                        </button>
                        {["PDF", "Word (.docx)", "Markdown"].map((label) => (
                          <div key={label} className="flex items-center gap-2 text-[12.5px] text-[#94A3B8] rounded-[7px] px-2.5 py-2 cursor-not-allowed">
                            <FileDown size={13} /> Export as {label}
                            <span className="ml-auto text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-[#EDF0F7] text-[#5F6A88]">soon</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {editMode ? (
          <>
            <input
              value={draftTitle}
              onChange={(e) => onDraftTitleChange(e.target.value)}
              className="w-full font-heading text-[22px] font-bold tracking-[-0.015em] text-[#0B1533] outline-none border-b border-transparent focus:border-[#E2E7F2] mb-3 pb-1"
              placeholder="Page title"
            />
            <input
              value={draftTags}
              onChange={(e) => onDraftTagsChange(e.target.value)}
              className="w-full text-[12.5px] text-[#3A4565] outline-none border border-[#E2E7F2] bg-[#F4F6FB] rounded-[8px] px-3 py-1.5 mb-4 focus:border-[#007BFF] focus:bg-white"
              placeholder="Tags (comma-separated)"
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
            className={cn(
              "text-[13px] leading-[1.7] text-[#3A4565]",
              "[&_h2]:font-heading [&_h2]:text-[15px] [&_h2]:font-bold [&_h2]:tracking-[-0.01em] [&_h2]:text-[#0B1533] [&_h2]:mt-7 [&_h2]:mb-2.5",
              "[&_h3]:font-heading [&_h3]:text-[13px] [&_h3]:font-bold [&_h3]:text-[#0B1533] [&_h3]:mt-5 [&_h3]:mb-2",
              "[&_p+p]:mt-3.5",
              "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-1",
              "[&_blockquote]:bg-[#EEF3FF] [&_blockquote]:border [&_blockquote]:border-[#D7E3FF] [&_blockquote]:rounded-[10px] [&_blockquote]:px-3.5 [&_blockquote]:py-3 [&_blockquote]:my-3.5 [&_blockquote]:text-[13px] [&_blockquote]:text-[#243B6B] [&_blockquote]:not-italic",
              "[&_pre]:bg-[#0F172A] [&_pre]:text-[#D7E0F7] [&_pre]:rounded-[10px] [&_pre]:px-4 [&_pre]:py-3.5 [&_pre]:my-3.5 [&_pre]:text-[12.5px] [&_pre]:leading-[1.6] [&_pre]:overflow-x-auto [&_pre]:font-mono",
              "[&_code]:font-mono [&_code]:text-[12.5px]",
              "[&_img]:max-w-full [&_img]:rounded-[10px] [&_img]:my-3",
              // Task 397 — same Table spec as the RTE's editable view (central-hub-design-
              // system.md), so imported/edited tables look identical in read and edit mode.
              "[&_table]:block [&_table]:overflow-x-auto [&_table]:w-full [&_table]:my-3.5 [&_table]:border-collapse",
              "[&_th]:text-[9.5px] [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-[0.09em] [&_th]:text-[#5F6A88] [&_th]:bg-[#FAFBFE] [&_th]:text-left [&_th]:px-2.5 [&_th]:py-2 [&_th]:border-b [&_th]:border-[#EDF0F7]",
              "[&_td]:text-[13px] [&_td]:text-[#3A4565] [&_td]:px-2.5 [&_td]:py-2 [&_td]:border-b [&_td]:border-[#EDF0F7]",
              "[&_th:first-child]:pl-[18px] [&_td:first-child]:pl-[18px]",
              "[&_tr]:transition-colors [&_tr:hover]:bg-[#F0F7FF]"
            )}
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
