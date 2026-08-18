"use client";

import { useRef, useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared, generically-named `[projectId]/`-level upload dropzone (task 270) — same allowlist/size
// cap the task and issue attachments POST routes themselves enforce, duplicated here for a fast
// client-side reject before the network round-trip (matches the existing duplication already
// present between those two routes, not a new pattern). Callers don't need an onUploaded callback:
// the target Attachments tab (e.g. `_task-attachments.tsx`) already holds a live Supabase Realtime
// subscription on the `attachments` table scoped to its own entity id, so a successful POST here
// shows up there without any extra wiring.
const ALLOWED_MIME_TYPES = [
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

export function AttachmentUploadZone({
  uploadUrl,
  disabled = false,
}: {
  uploadUrl: string;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadOne(file: File): Promise<string | null> {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return `${file.name}: unsupported file type. Only images, PDF, Word, and Excel files are supported.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `${file.name}: exceeds the 25MB size limit.`;
    }
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(uploadUrl, { method: "POST", body: fd });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return `${file.name}: ${body.error ?? "failed to upload."}`;
    }
    return null;
  }

  async function uploadFiles(files: FileList | File[]) {
    if (disabled) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    setError(null);
    setUploading(true);
    // Sequential, not parallel — avoids two same-tick uploads colliding on the server's
    // Date.now()-derived storage path (upsert:false there would reject the second write).
    for (const file of list) {
      const err = await uploadOne(file);
      if (err) setError((prev) => (prev ? `${prev}\n${err}` : err));
    }
    setUploading(false);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        void uploadFiles(e.dataTransfer.files);
      }}
      className={cn(
        "rounded-[14px] border border-dashed transition-colors overflow-hidden",
        disabled
          ? "border-[#E2E7F2] bg-[#F4F6FB] cursor-not-allowed"
          : dragging
            ? "border-[#007BFF] bg-[#E5F1FF]"
            : "border-[#C7CEDD] bg-white hover:border-[#007BFF] hover:bg-[#F8FAFF] cursor-pointer"
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          if (e.target.files) void uploadFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => !disabled && fileInputRef.current?.click()}
        disabled={disabled}
        className="w-full flex flex-col items-center justify-center gap-1.5 px-[18px] py-6 cursor-pointer disabled:cursor-not-allowed"
      >
        {uploading ? (
          <Loader2 size={18} className="text-[#007BFF] animate-spin" />
        ) : (
          <UploadCloud size={18} className={disabled ? "text-[#C7CEDD]" : "text-[#5F6A88]"} />
        )}
        <p className={cn("text-[12.5px] font-medium", disabled ? "text-[#8A93AC]" : "text-[#3A4565]")}>
          {uploading ? "Uploading…" : "Drag and drop files here, or click to browse"}
        </p>
        {!disabled && (
          <p className="text-[11px] text-[#8A93AC]">Images, PDF, Word, Excel — up to 25MB each</p>
        )}
      </button>
      {error && (
        <p className="px-[18px] pb-3.5 text-[11.5px] text-[#C0392B] whitespace-pre-line">{error}</p>
      )}
    </div>
  );
}
