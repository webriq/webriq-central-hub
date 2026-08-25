"use client";

import { useState } from "react";
import { Paperclip, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/app/(hub)/dashboard/_components/dashboard-shared";
import { TaskAttachmentPicker } from "./_task-attachment-picker";

// Shared comment-composer chrome (task 301) — avatar + editor slot + collapsible attachment
// picker + footer row (Attach Files toggle left, Clear/Post right), used by all four
// comments composers (legacy/v2 x task/issue). The four rich-text editor components stay
// separate per-tree files (task 301 explicitly leaves them unmerged); this wraps whichever one
// the caller passes in as `editor`.
function initialsFromName(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function CommentComposer({
  editor,
  currentUserName,
  currentUserAvatarUrl,
  files,
  onFilesChange,
  allowedMimeTypes,
  warning,
  posting,
  isEmpty,
  onPost,
  onClear,
  postLabel = "Post comment",
}: {
  editor: React.ReactNode;
  currentUserName: string | null;
  currentUserAvatarUrl: string | null;
  files: File[];
  onFilesChange: (files: File[]) => void;
  allowedMimeTypes?: string[];
  warning?: string | null;
  posting: boolean;
  // Task 301 — true when there's neither draft text nor a staged attachment. Gates both
  // Clear and Post: nothing to clear or post when both the RTE and the attachment picker
  // are empty; either one alone is enough to enable both buttons.
  isEmpty: boolean;
  onPost: () => void;
  onClear: () => void;
  postLabel?: string;
}) {
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(false);

  return (
    <div className="flex items-start gap-2.5 pt-1 border-t border-[#EDF0F7]">
      <Avatar initials={initialsFromName(currentUserName)} avatarUrl={currentUserAvatarUrl} size={8} />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {editor}

        {attachmentsExpanded && (
          <TaskAttachmentPicker files={files} onFilesChange={onFilesChange} allowedMimeTypes={allowedMimeTypes} disabled={posting} />
        )}
        {warning && <p className="text-[11px] text-[#8A5A00]">{warning}</p>}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setAttachmentsExpanded((v) => !v)}
            aria-expanded={attachmentsExpanded}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#5F6A88] hover:text-[#0B1533] cursor-pointer transition-colors"
          >
            <Paperclip size={13} />
            Attach Files{files.length > 0 ? ` (${files.length})` : ""}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClear}
              disabled={isEmpty || posting}
              className="px-3.5 py-1.5 rounded-full border border-[#E2E7F2] text-[#5F6A88] text-[12px] font-semibold hover:bg-[#F4F6FB] disabled:opacity-45 cursor-pointer transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onPost}
              disabled={isEmpty || posting}
              className={cn(
                // DESIGN.md's brand-orange CTA (§5 Buttons: "CTA (orange) — one per screen,
                // maximum") — Post comment is the main action on the Task/Issue Detail page,
                // and no other orange CTA exists there, so this doesn't create a second one.
                "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#FB914E] text-[#471F02] text-[12px] font-semibold",
                "hover:bg-[#E2762F] hover:text-white disabled:opacity-45 cursor-pointer transition-colors"
              )}
            >
              {posting ? <Loader2 size={13} className="animate-spin" /> : null}
              {postLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
