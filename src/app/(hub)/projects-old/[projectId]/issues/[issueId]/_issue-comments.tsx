"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Loader2, FileText, Image as ImageIcon, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime, formatDate, cn } from "@/lib/utils";
import { formatClockTime } from "@/lib/timer/format";
import { OwnerChip, normalizeZohoDescriptionHtml } from "../../../_pm-shared";
import { IssueCommentEditor } from "./_issue-comment-editor";
import { TaskAttachmentPicker } from "../../_task-attachment-picker";
import { TaskAttachmentViewerModal } from "../../tasks/[taskId]/_task-attachment-viewer-modal";
import { ImageLightboxModal } from "../../_image-lightbox-modal";

// Live comment thread for Issue Detail (task 236) — copy-adapted from
// ../../tasks/[taskId]/_task-comments.tsx: rich-text body + optional file attachments, built on
// `issue_comments` (RLS: staff read/pm-write already shipped migration 052; staff-insert/
// own-or-admin-delete new in migration 101) and the generic `attachments` table (entity_type:
// "comment"). Unlike the task version, this one *does* ship delete (task 236 Requirement 4) — a
// commenter can delete their own comment; admin/super_admin can delete any (mirrors
// task_comments_delete's live role set, migration 048).
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"];

// Matches the comment attachments POST route's own allow-list exactly (src/app/api/v2/projects/
// [projectId]/issues/[issueId]/comments/[commentId]/attachments/route.ts).
const COMMENT_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/html",
  "text/markdown",
  "text/plain",
  "video/mp4",
];

type CommentAttachment = { id: string; filename: string; size: number | null };
// Task 257, Requirement E — Zoho-imported comments carry attachment *metadata* only
// (`issue_comments.source_meta.attachments`, populated by zoho-import/issue-comments/route.ts)
// with no download URL and no matching `attachments` table row — the actual files were never
// migrated. Rendered as a separate, non-interactive list; never merged with real `attachments`.
type LegacyAttachment = { name: string; size: number | null; type: string | null };
type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  author_name: string;
  attachments: CommentAttachment[];
  legacyAttachments: LegacyAttachment[];
};

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function IssueComments({
  projectId,
  issueId,
  currentUserId,
  currentUserRole,
  onCountChange,
}: {
  projectId: string;
  issueId: string;
  currentUserId: string;
  currentUserRole: string | null;
  onCountChange?: (n: number) => void;
}) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftHtml, setDraftHtml] = useState("");
  const [draftEmpty, setDraftEmpty] = useState(true);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [posting, setPosting] = useState(false);
  const [attachmentWarning, setAttachmentWarning] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [viewing, setViewing] = useState<{ commentId: string; attachment: CommentAttachment } | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const commentsRef = useRef<CommentRow[]>([]);
  useEffect(() => { commentsRef.current = comments; }, [comments]);

  const canDelete = useCallback(
    (comment: CommentRow) =>
      comment.author_id === currentUserId || currentUserRole === "admin" || currentUserRole === "super_admin",
    [currentUserId, currentUserRole]
  );

  const fetchComments = useCallback((signal?: AbortSignal) => {
    return fetch(`/api/v2/projects/${projectId}/issues/${issueId}/comments`, { signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CommentRow[]) => {
        setComments(data);
        onCountChange?.(data.length);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCountChange is a stable useCallback from the panel; including it would redefine fetchComments (and refire effects depending on it) on every parent render
  }, [projectId, issueId]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchComments(ctrl.signal).finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [fetchComments]);

  // Realtime sync — mirrors _task-comments.tsx's identical pattern.
  useEffect(() => {
    const supabase = createClient();
    const commentsChannel = supabase
      .channel(`issue_comments_${issueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "issue_comments", filter: `issue_id=eq.${issueId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as { id: string };
            if (commentsRef.current.some((c) => c.id === row.id)) return;
          }
          void fetchComments();
        }
      )
      .subscribe();

    const attachmentsChannel = supabase
      .channel(`issue_comment_attachments_${issueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attachments", filter: `entity_type=eq.comment` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { entity_id: string };
          if (commentsRef.current.some((c) => c.id === row.entity_id)) void fetchComments();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(commentsChannel);
      void supabase.removeChannel(attachmentsChannel);
    };
  }, [issueId, fetchComments]);

  async function postComment() {
    if (draftEmpty) return;
    setPosting(true);
    setAttachmentWarning(null);
    const res = await fetch(`/api/v2/projects/${projectId}/issues/${issueId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draftHtml }),
    });
    if (res.ok) {
      // POST returns only id/body/created_at/author_id/author_name — never legacyAttachments
      // (that only ever comes from a Zoho import, never a Hub-native comment).
      const created: Omit<CommentRow, "attachments" | "legacyAttachments"> = await res.json();
      let attachments: CommentAttachment[] = [];

      if (attachmentFiles.length > 0) {
        const results = await Promise.allSettled(attachmentFiles.map((file) => {
          const fd = new FormData();
          fd.append("file", file);
          return fetch(`/api/v2/projects/${projectId}/issues/${issueId}/comments/${created.id}/attachments`, { method: "POST", body: fd })
            .then((r) => (r.ok ? r.json() : Promise.reject()));
        }));
        attachments = results
          .filter((r): r is PromiseFulfilledResult<CommentAttachment> => r.status === "fulfilled")
          .map((r) => r.value);
        const failed = results.length - attachments.length;
        if (failed > 0) {
          setAttachmentWarning(`Comment posted — ${failed} of ${attachmentFiles.length} attachment(s) failed to upload.`);
        }
      }

      setComments((prev) => {
        const next = [...prev, { ...created, attachments, legacyAttachments: [] }];
        onCountChange?.(next.length);
        return next;
      });
      setAttachmentFiles([]);
      setResetKey((k) => k + 1);
    }
    setPosting(false);
  }

  async function deleteComment(commentId: string) {
    if (!confirm("Delete this comment? This cannot be undone.")) return;
    setDeletingId(commentId);
    const res = await fetch(`/api/v2/projects/${projectId}/issues/${issueId}/comments/${commentId}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) {
      setComments((prev) => {
        const next = prev.filter((c) => c.id !== commentId);
        onCountChange?.(next.length);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <div className="flex flex-col gap-3">
          <div className="h-10 animate-pulse bg-[#F4F6FB] rounded-[8px]" />
          <div className="h-10 animate-pulse bg-[#F4F6FB] rounded-[8px]" />
        </div>
      ) : comments.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-4 text-center">
          <MessageSquare size={18} className="text-[#C7CEDD]" />
          <p className="text-[12px] text-[#5F6A88]">No comments yet</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-dashed divide-[#E2E7F2]">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5 group pt-1.75 pb-1.75 first:pt-0 last:pb-0">
              <OwnerChip name={c.author_name} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[12px] font-semibold text-[#0B1533]">{c.author_name}</span>
                  <span className="text-[10px] font-mono text-[#5F6A88] whitespace-nowrap">
                    {formatRelativeTime(c.created_at)}
                    {/* Task 257, Requirement D — `inline-block` + `overflow-hidden` makes the browser fall
                        back to the box's bottom margin edge as its baseline (CSS2.1 §10.8.1: an
                        inline-block's baseline is its last line box's baseline *unless* overflow is not
                        visible, in which case it's the bottom margin edge) — that fallback baseline
                        differs from the surrounding text's real baseline, so the whole `items-baseline`
                        row above visibly jumps on hover. `inline-flex` doesn't have that overflow-triggered
                        special case, so it keeps a stable, text-anchored baseline at both max-w-0 and
                        max-w-[200px]. */}
                    <span className="inline-flex items-baseline max-w-0 group-hover:max-w-[200px] overflow-hidden whitespace-nowrap text-[#8A93AC] transition-[max-width] duration-200 ease-out">
                      {" · "}{formatDate(c.created_at)} {formatClockTime(c.created_at)}
                    </span>
                  </span>
                  {canDelete(c) && (
                    <button
                      type="button"
                      onClick={() => void deleteComment(c.id)}
                      disabled={deletingId === c.id}
                      aria-label="Delete comment"
                      title="Delete comment"
                      className="ml-auto p-1 rounded-full text-[#C7CEDD] hover:text-[#C0392B] hover:bg-[#FDE8E6] cursor-pointer transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-45 shrink-0"
                    >
                      {deletingId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  )}
                </div>
                <div
                  className={cn(
                    "text-[13px] text-[#3A4565] leading-relaxed mt-0.5",
                    // `<div>`-per-line spacing (Zoho-imported comment bodies use the same raw
                    // `<div>text<br/></div>` line shape the Description field normalizes — but
                    // Description gets converted to `<p>` for free by Tiptap's HTML parser, while
                    // this is a raw dangerouslySetInnerHTML render, so `<div>` needs its own
                    // margin rule mirroring `<p>`'s or every line renders flush against the next).
                    "[&_div]:my-1 [&_div:first-child]:mt-0 [&_div:last-child]:mb-0",
                    "[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_li]:my-0.5",
                    "[&_a]:text-[#0063D6] [&_a]:underline [&_img]:max-w-full [&_img]:rounded-[8px] [&_img]:my-1.5 [&_img]:cursor-zoom-in"
                  )}
                  // Staff-authored comment HTML — same trust boundary as the Description field's rendered content (task 234).
                  // normalizeZohoDescriptionHtml absolutizes Zoho's portal-relative inline image
                  // srcs and strips Zoho's own per-line trailing <br/> — same treatment Description
                  // gets, needed here for the same reason (task 257 follow-up: comment bodies come
                  // from the same Zoho export shape, confirmed against real imported comment rows).
                  dangerouslySetInnerHTML={{ __html: normalizeZohoDescriptionHtml(c.body) }}
                  // Task 257, Requirement B — not a Tiptap instance, so plain event delegation:
                  // catch a click on any embedded <img>, open the lightbox.
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    const img = target.tagName === "IMG" ? (target as HTMLImageElement) : null;
                    if (img) setLightboxSrc(img.src);
                  }}
                />
                {c.legacyAttachments.length > 0 && (
                  <ul className="flex flex-col gap-1 mt-1.5">
                    {c.legacyAttachments.map((file, idx) => {
                      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
                      const isImage = IMAGE_EXTENSIONS.includes(ext);
                      return (
                        <li
                          key={`${c.id}-legacy-${idx}`}
                          className="flex items-center gap-2 rounded-[8px] border border-dashed border-[#E2E7F2] bg-[#F9FAFD] px-2.5 py-1.5"
                          title="Imported from Zoho — original file unavailable"
                        >
                          {isImage
                            ? <ImageIcon size={13} className="text-[#C7CEDD] shrink-0" />
                            : <FileText size={13} className="text-[#C7CEDD] shrink-0" />}
                          <span className="flex-1 truncate text-[12px] text-[#8A93AC]">{file.name}</span>
                          <span className="text-[10px] text-[#8A93AC] shrink-0">{formatFileSize(file.size)}</span>
                          <span className="text-[10px] text-[#8A93AC] shrink-0">Unavailable</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {c.attachments.length > 0 && (
                  <ul className="flex flex-col gap-1 mt-1.5">
                    {c.attachments.map((file) => {
                      const ext = file.filename.split(".").pop()?.toLowerCase() ?? "";
                      const isImage = IMAGE_EXTENSIONS.includes(ext);
                      return (
                        <li
                          key={file.id}
                          className="flex items-center gap-2 rounded-[8px] border border-[#E2E7F2] bg-white px-2.5 py-1.5"
                        >
                          {isImage
                            ? <ImageIcon size={13} className="text-[#5F6A88] shrink-0" />
                            : <FileText size={13} className="text-[#5F6A88] shrink-0" />}
                          <span className="flex-1 truncate text-[12px] text-[#3A4565]">{file.filename}</span>
                          <span className="text-[10px] text-[#5F6A88] shrink-0">{formatFileSize(file.size)}</span>
                          <button
                            type="button"
                            onClick={() => setViewing({ commentId: c.id, attachment: file })}
                            className="text-[11px] font-semibold text-[#0063D6] hover:underline cursor-pointer shrink-0"
                          >
                            View
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 pt-1 border-t border-[#EDF0F7]">
        <IssueCommentEditor
          key={resetKey}
          projectId={projectId}
          issueId={issueId}
          onChange={setDraftHtml}
          onEmptyChange={setDraftEmpty}
        />
        <TaskAttachmentPicker
          files={attachmentFiles}
          onFilesChange={setAttachmentFiles}
          allowedMimeTypes={COMMENT_ATTACHMENT_MIME_TYPES}
        />
        {attachmentWarning && <p className="text-[11px] text-[#8A5A00]">{attachmentWarning}</p>}
        <button
          type="button"
          onClick={() => void postComment()}
          disabled={draftEmpty || posting}
          className="self-end inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#007BFF] text-white text-[12px] font-semibold hover:bg-[#0063D6] disabled:opacity-45 cursor-pointer transition-colors"
        >
          {posting ? <Loader2 size={13} className="animate-spin" /> : null}
          Post comment
        </button>
      </div>

      {viewing && (
        <TaskAttachmentViewerModal
          attachment={viewing.attachment}
          fetchUrl={`/api/v2/projects/${projectId}/issues/${issueId}/comments/${viewing.commentId}/attachments/${viewing.attachment.id}/file-url`}
          onClose={() => setViewing(null)}
        />
      )}
      {lightboxSrc && (
        <ImageLightboxModal src={lightboxSrc} alt="Comment image" onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}
