"use client";

import { FileText, Image as ImageIcon, Video, X } from "lucide-react";
import { AttachmentDropzone } from "./_attachment-dropzone";
import type { ClientCheckResult } from "@/lib/uploads/client-signature-check";

// Drag-and-drop/browse picker for the New Task modal's "Attachments" section (task 205) —
// staged client-side as File objects, uploaded by the parent modal only after the task itself
// is created (see CreateTaskModal.submit). Now shares its dropzone UI with every other
// task/issue attachment surface (task 273) instead of hand-rolling its own compact zone.
//
// `allowedMimeTypes` stays as an optional override for the comment-attachment callers
// (_task-comments.tsx/_issue-comments.tsx), which deliberately keep their own narrower,
// different allowlist (single-format `video/mp4` only, plus html/md/plain-text but no
// css/js/ts/json/zip/rar) — task 273's widened shared config (which now also includes
// mp4/mov/webm video) is scoped to task/issue creation-time and detail-tab attachments only,
// not comments. When provided, this bypasses the shared byte-sniffing pre-check (which only
// recognizes task/issue attachment types) in favor of a plain MIME-string check, matching this
// picker's pre-273 behavior exactly for that caller.
const COMMENT_OVERRIDE_MAX_FILE_SIZE = 25 * 1024 * 1024; // matches the comment-attachment routes' own untouched 25MB cap

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaskAttachmentPicker({
  files,
  onFilesChange,
  allowedMimeTypes,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  allowedMimeTypes?: string[];
}) {
  const overrideCheck = allowedMimeTypes
    ? async (file: File): Promise<ClientCheckResult> => {
        if (!allowedMimeTypes.includes(file.type)) return { ok: false, reason: `${file.name}: unsupported file type` };
        if (file.size > COMMENT_OVERRIDE_MAX_FILE_SIZE) return { ok: false, reason: `${file.name}: exceeds 25MB limit` };
        return { ok: true };
      }
    : undefined;

  return (
    <div className="flex flex-col gap-2">
      <AttachmentDropzone
        currentCount={files.length}
        onFiles={(accepted) => onFilesChange([...files, ...accepted])}
        checkFile={overrideCheck}
        allowedTypesLabel={allowedMimeTypes ? "Images, PDF, Word, Excel, HTML, Markdown, plain text, MP4 video" : undefined}
        maxSizeLabel={allowedMimeTypes ? "25 MB" : undefined}
      />

      {files.length > 0 && (
        <div className="rounded-[10px] border border-[#E2E7F2] bg-white divide-y divide-[#EDF0F7]">
          {files.map((file, idx) => (
            <div key={`${file.name}-${idx}`} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="w-7.5 h-7.5 rounded-[7px] shrink-0 flex items-center justify-center bg-[#E5F1FF] text-[#007BFF]">
                {file.type.startsWith("image/")
                  ? <ImageIcon size={15} />
                  : file.type.startsWith("video/")
                    ? <Video size={15} />
                    : <FileText size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold truncate text-[#3A4565]">{file.name}</p>
                <p className="text-[10.5px] text-[#5F6A88]">{formatFileSize(file.size)} · Ready to upload</p>
              </div>
              <button
                type="button"
                onClick={() => onFilesChange(files.filter((_, i) => i !== idx))}
                aria-label={`Remove ${file.name}`}
                className="shrink-0 text-[#5F6A88] bg-transparent border-none cursor-pointer hover:text-[#C0392B] transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
