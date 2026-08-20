"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Loader2, FileText, Image as ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime, formatDate, cn } from "@/lib/utils";
import { formatClockTime } from "@/lib/timer/format";
import { OwnerChip, normalizeZohoDescriptionHtml } from "../../../_pm-shared";
import { CommentEditor } from "./_comment-editor";
import { TaskAttachmentPicker } from "../../_task-attachment-picker";
import { TaskAttachmentViewerModal } from "./_task-attachment-viewer-modal";

// Comment thread for the task detail page (task 206). Rich-text body + optional file
// attachments (task 212) — built on the existing `task_comments` table (RLS: staff
// read/insert/own-delete already shipped, migration 048) and the generic `attachments` table
// (entity_type: "comment", already a legal value since migration 049). No edit/delete UI yet —
// see task 206 Decision #6, a deliberate fast-follow boundary, not an oversight.
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"];

// Wider than the New Task modal's attachment picker (image/pdf/office only) — comment
// attachments also allow HTML, Markdown, plain text, and MP4, matching the comment
// attachments POST route's own allow-list exactly (src/app/api/v2/tasks/[taskId]/comments/
// [commentId]/attachments/route.ts). Passed explicitly so the shared TaskAttachmentPicker's
// default (used by the New Task modal, whose server route is unchanged) stays untouched.
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
type CommentRow = { id: string; body: string; created_at: string; author_name: string; attachments: CommentAttachment[] };

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaskComments({
  taskId,
  onCountChange,
}: {
  taskId: string;
  // Task 270 — lifted up to the panel so its tab label can show a live count, mirroring
  // `_issue-comments.tsx`'s identical `onCountChange` prop (task 257, Requirement G).
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
  const commentsRef = useRef<CommentRow[]>([]);
  useEffect(() => { commentsRef.current = comments; }, [comments]);

  const fetchComments = useCallback((signal?: AbortSignal) => {
    return fetch(`/api/v2/tasks/${taskId}/comments`, { signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CommentRow[]) => {
        setComments(data);
        onCountChange?.(data.length);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onCountChange is a stable useCallback from the panel; including it would redefine fetchComments (and refire effects depending on it) on every parent render
  }, [taskId]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchComments(ctrl.signal).finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [fetchComments]);

  // Realtime sync (task 213) — a bare postgres_changes payload only carries the raw row
  // (no resolved author_name / no comment's attachments array), so unlike the Attachments
  // tab's direct-patch approach, this re-fetches the already-batched comments list. That's
  // a materially different trigger (a genuine data change) than the tab-switch bug this task
  // fixes, so it doesn't reintroduce the refetch-on-every-switch problem.
  useEffect(() => {
    const supabase = createClient();
    const commentsChannel = supabase
      .channel(`task_comments_${taskId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_comments", filter: `task_id=eq.${taskId}` },
        (payload) => {
          // Skip the current user's own optimistic INSERT — already applied locally by postComment().
          if (payload.eventType === "INSERT") {
            const row = payload.new as { id: string };
            if (commentsRef.current.some((c) => c.id === row.id)) return;
          }
          void fetchComments();
        }
      )
      .subscribe();

    const attachmentsChannel = supabase
      .channel(`task_comment_attachments_${taskId}`)
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
  }, [taskId, fetchComments]);

  async function postComment() {
    if (draftEmpty) return;
    setPosting(true);
    setAttachmentWarning(null);
    const res = await fetch(`/api/v2/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draftHtml }),
    });
    if (res.ok) {
      const created: Omit<CommentRow, "attachments"> = await res.json();
      let attachments: CommentAttachment[] = [];

      if (attachmentFiles.length > 0) {
        const results = await Promise.allSettled(attachmentFiles.map((file) => {
          const fd = new FormData();
          fd.append("file", file);
          return fetch(`/api/v2/tasks/${taskId}/comments/${created.id}/attachments`, { method: "POST", body: fd })
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
        const next = [...prev, { ...created, attachments }];
        onCountChange?.(next.length);
        return next;
      });
      setAttachmentFiles([]);
      setResetKey((k) => k + 1);
    }
    setPosting(false);
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
                    {/* Task 257, Requirement D — same fix as _issue-comments.tsx: `inline-block` +
                        `overflow-hidden` falls back to the bottom margin edge as the baseline
                        (CSS2.1 §10.8.1), which differs from the surrounding text baseline and makes
                        this `items-baseline` row jump on hover. `inline-flex` doesn't have that
                        overflow-triggered special case. */}
                    <span className="inline-flex items-baseline max-w-0 group-hover:max-w-[200px] overflow-hidden whitespace-nowrap text-[#8A93AC] transition-[max-width] duration-200 ease-out">
                      {" · "}{formatDate(c.created_at)} {formatClockTime(c.created_at)}
                    </span>
                  </span>
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
                    "[&_a]:text-[#0063D6] [&_a]:underline [&_img]:max-w-full [&_img]:rounded-[8px] [&_img]:my-1.5"
                  )}
                  // Staff-authored comment HTML — same trust boundary as the Description field's rendered content (task 206).
                  // normalizeZohoDescriptionHtml absolutizes Zoho's portal-relative inline image
                  // srcs and strips Zoho's own per-line trailing <br/> — same treatment Description
                  // gets, needed here for the same reason (task 257 follow-up).
                  dangerouslySetInnerHTML={{ __html: normalizeZohoDescriptionHtml(c.body) }}
                />
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
        <CommentEditor
          key={resetKey}
          taskId={taskId}
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
          fetchUrl={`/api/v2/tasks/${taskId}/comments/${viewing.commentId}/attachments/${viewing.attachment.id}/file-url`}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
