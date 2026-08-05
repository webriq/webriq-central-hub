"use client";

import { useRef, useState } from "react";
import { Upload, FileText, Image as ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Compact drag-and-drop/browse picker for the New Task modal's "Attachments" section (task
// 205) — staged client-side as File objects, uploaded by the parent modal only after the task
// itself is created (see CreateTaskModal.submit). Deliberately smaller than the 168px
// UploadDropzone in portfolio-tracker/v2's _files-tab.tsx, which is sized for a full-page
// file explorer, not a max-w-md modal.
const DEFAULT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_FILES = 10;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaskAttachmentPicker({
  files,
  onFilesChange,
  allowedMimeTypes = DEFAULT_ALLOWED_MIME_TYPES,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  allowedMimeTypes?: string[];
}) {
  const [dragOver, setDragOver] = useState(false);
  const [rejectionError, setRejectionError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(incoming: FileList | File[]) {
    setRejectionError(null);
    const next = [...files];
    for (const file of Array.from(incoming)) {
      if (next.length >= MAX_FILES) {
        setRejectionError(`Only up to ${MAX_FILES} files can be attached.`);
        break;
      }
      if (!allowedMimeTypes.includes(file.type)) {
        setRejectionError(`${file.name}: unsupported file type`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setRejectionError(`${file.name}: exceeds 25MB limit`);
        continue;
      }
      next.push(file);
    }
    onFilesChange(next);
  }

  function removeFile(idx: number) {
    onFilesChange(files.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
        }}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-[10px] border border-dashed py-3 text-[12px] transition-colors cursor-pointer",
            dragOver ? "border-[#007BFF] bg-[#F0F7FF] text-[#007BFF]" : "border-[#C7D2E8] bg-[#F9FAFD] text-[#5F6A88] hover:border-[#007BFF] hover:bg-[#F0F7FF]"
          )}
        >
          <Upload size={14} />
          Drag files here, or <span className="text-[#007BFF] font-medium">browse</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {rejectionError && <p className="text-[11px] text-[#C0392B]">{rejectionError}</p>}

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((file, idx) => (
            <li
              key={`${file.name}-${idx}`}
              className="flex items-center gap-2 rounded-[8px] border border-[#E2E7F2] bg-white px-2.5 py-1.5"
            >
              {file.type.startsWith("image/")
                ? <ImageIcon size={13} className="text-[#5F6A88] shrink-0" />
                : <FileText size={13} className="text-[#5F6A88] shrink-0" />}
              <span className="flex-1 truncate text-[12px] text-[#3A4565]">{file.name}</span>
              <span className="text-[10px] text-[#5F6A88] shrink-0">{formatFileSize(file.size)}</span>
              <button
                type="button"
                onClick={() => removeFile(idx)}
                aria-label={`Remove ${file.name}`}
                className="p-0.5 rounded text-[#5F6A88] hover:text-[#C0392B] cursor-pointer transition-colors shrink-0"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
