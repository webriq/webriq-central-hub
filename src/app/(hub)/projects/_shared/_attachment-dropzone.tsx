"use client";

import { useRef, useState } from "react";
import { CloudUpload, AlertCircle, Check, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALLOWED_TYPES_LABEL, MAX_SIZE_LABEL, MAX_FILES } from "@/config/attachment-types";
import { clientPreCheckFile, type ClientCheckResult } from "@/lib/uploads/client-signature-check";

// Shared Onboarding-Workspace-style drag-and-drop zone for task/issue attachments (task 273,
// Requirement D) — ports the visual/interaction pattern from
// ../../portfolio-tracker/[projectId]/onboarding-workspace/_upload-queue.tsx's
// UploadDropzone/useUploadQueue/UploadQueuePanel, generalized (no folderId concept, since task/
// issue attachments aren't foldered) and used by all four task/issue attachment entry points:
// the New Task and New Issue modal pickers (staging mode — pass `onFiles`, files are appended to
// local File[] state and uploaded later by the parent's submit()) and the Task/Issue Detail
// Attachments tabs (upload mode — pass a `queue` from useUploadQueue() for immediate upload with
// live per-file progress). The onboarding workspace's own file is left untouched — out of scope.

export type QueueItem = { id: string; file: File; status: "uploading" | "done" | "error"; progress: number; error?: string };

// XHR, not fetch — fetch has no upload-progress event and these zones need a real per-file
// progress bar for the "upload mode" (detail-tab) callers.
export function uploadFileWithProgress(url: string, formData: FormData, onProgress?: (pct: number) => void): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Unexpected response from server"));
        }
      } else {
        let message = `Upload failed (${xhr.status})`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body?.error) message = body.error;
        } catch {
          /* non-JSON error body — keep the generic message */
        }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("Connection lost — check your network and retry"));
    xhr.send(formData);
  });
}

export function useUploadQueue(uploadFile: (file: File, onProgress: (pct: number) => void) => Promise<void>) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const counter = useRef(0);

  function runUpload(id: string, file: File) {
    uploadFile(file, (pct) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, progress: pct } : it))))
      .then(() => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "done", progress: 100 } : it))))
      .catch((err: Error) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "error", error: err.message } : it))));
  }

  function enqueue(files: File[]) {
    const newItems: QueueItem[] = files.map((file) => ({ id: `${Date.now()}-${counter.current++}`, file, status: "uploading", progress: 0 }));
    setItems((prev) => [...prev, ...newItems]);
    newItems.forEach((item) => runUpload(item.id, item.file));
  }

  function retry(id: string) {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target) runUpload(id, target.file);
      return prev.map((it) => (it.id === id ? { ...it, status: "uploading", progress: 0, error: undefined } : it));
    });
  }

  function dismiss(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  return { items, enqueue, retry, dismiss };
}

export function UploadQueuePanel({
  items, onRetry, onDismiss,
}: { items: QueueItem[]; onRetry: (id: string) => void; onDismiss: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-[10px] border border-[#E2E7F2] bg-white divide-y divide-[#EDF0F7]">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-3 px-3.5 py-2.5">
          <span
            className={cn(
              "w-7.5 h-7.5 rounded-[7px] shrink-0 flex items-center justify-center",
              item.status === "error" ? "bg-[#FDE8E6] text-[#C0392B]" : item.status === "done" ? "bg-[#E3F5EA] text-[#177E48]" : "bg-[#E5F1FF] text-[#007BFF]"
            )}
          >
            {item.status === "error" ? <AlertCircle size={15} /> : item.status === "done" ? <Check size={15} /> : <CloudUpload size={15} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold truncate text-[#3A4565]">{item.file.name}</p>
            {item.status === "uploading" && (
              <div className="h-1.5 rounded-full bg-[#EDF0F7] overflow-hidden mt-1.5">
                <div className="h-full rounded-full bg-[#007BFF] transition-[width]" style={{ width: `${item.progress}%` }} />
              </div>
            )}
            {item.status === "error" && <p className="text-[10.5px] text-[#C0392B]">{item.error ?? "Upload failed"}</p>}
          </div>
          {item.status === "uploading" && <span className="font-mono text-[10.5px] text-[#5F6A88] w-8 text-right shrink-0">{item.progress}%</span>}
          {item.status === "error" && (
            <button
              type="button"
              onClick={() => onRetry(item.id)}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-[#007BFF] bg-transparent border-none cursor-pointer hover:underline"
            >
              <RotateCw size={11} /> Retry
            </button>
          )}
          {item.status === "done" && (
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              aria-label="Dismiss"
              className="shrink-0 text-[#5F6A88] bg-transparent border-none cursor-pointer hover:text-[#0B1533]"
            >
              <X size={13} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

type UploadQueueHandle = ReturnType<typeof useUploadQueue>;

export function AttachmentDropzone({
  onFiles,
  queue,
  disabled = false,
  currentCount = 0,
  maxFiles = MAX_FILES,
  checkFile = clientPreCheckFile,
  allowedTypesLabel = ALLOWED_TYPES_LABEL,
  maxSizeLabel = MAX_SIZE_LABEL,
}: {
  // Staging mode (New Task/New Issue modals): receives accepted files, caller owns the list.
  onFiles?: (files: File[]) => void;
  // Upload mode (Task/Issue Detail Attachments tabs): files are enqueued and uploaded immediately.
  queue?: UploadQueueHandle;
  disabled?: boolean;
  currentCount?: number;
  maxFiles?: number;
  // Override for callers with their own allowlist (e.g. comment attachments, which deliberately
  // keep a different, narrower list including video/mp4 — task 273 explicitly left that surface
  // untouched). Defaults to the shared task/issue attachment-types config.
  checkFile?: (file: File) => Promise<ClientCheckResult>;
  allowedTypesLabel?: string;
  maxSizeLabel?: string;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [rejected, setRejected] = useState<{ name: string; reason: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function processFiles(fileList: FileList | File[]) {
    setRejected(null);
    setChecking(true);
    const accepted: File[] = [];
    let slotsLeft = maxFiles - currentCount - (queue?.items.length ?? 0);
    for (const file of Array.from(fileList)) {
      if (slotsLeft <= 0) {
        setRejected({ name: file.name, reason: `Only up to ${maxFiles} files can be attached.` });
        break;
      }
      const check = await checkFile(file);
      if (!check.ok) {
        setRejected({ name: file.name, reason: check.reason });
        continue;
      }
      accepted.push(file);
      slotsLeft--;
    }
    setChecking(false);
    if (accepted.length === 0) return;
    if (queue) queue.enqueue(accepted);
    else onFiles?.(accepted);
  }

  const uploading = checking || (queue?.items.some((it) => it.status === "uploading") ?? false);

  return (
    <div className="flex flex-col gap-2.5">
      {queue && <UploadQueuePanel items={queue.items} onRetry={queue.retry} onDismiss={queue.dismiss} />}
      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          if (disabled) return;
          if (e.dataTransfer.files.length > 0) void processFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(e) => { if (e.target.files) void processFiles(e.target.files); e.target.value = ""; }}
        />
        {rejected ? (
          <div className="w-full min-h-[168px] flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-[#C0392B] bg-[#FDE8E6] py-8 text-center px-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white border border-[#E2E7F2] text-[#C0392B]">
              <AlertCircle size={22} strokeWidth={1.75} />
            </div>
            <div className="text-[13px] font-semibold text-[#0B1533]">{rejected.name} can&apos;t be uploaded</div>
            <div className="text-[11.5px] text-[#5F6A88] max-w-xs">{rejected.reason}</div>
            <button
              type="button"
              onClick={() => { setRejected(null); inputRef.current?.click(); }}
              className="text-[12px] font-semibold text-[#007BFF] bg-transparent border-none cursor-pointer hover:underline"
            >
              Try another file
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            className={cn(
              "group w-full min-h-[168px] flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed py-8 text-center cursor-pointer transition-colors duration-150 disabled:opacity-60",
              isDragOver ? "border-[#007BFF] bg-[#F0F7FF]" : "border-[#C7D2E8] bg-[#F9FAFD] hover:border-[#007BFF] hover:bg-[#F0F7FF]"
            )}
          >
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full transition-all duration-150 group-hover:scale-105 bg-white border",
                isDragOver ? "border-[#007BFF] text-[#007BFF]" : "border-[#E2E7F2] text-[#0063D6]"
              )}
            >
              <CloudUpload size={22} strokeWidth={1.75} />
            </div>
            <div className="text-[13px] font-medium text-[#3A4565]">
              {uploading ? "Uploading…" : isDragOver ? "Drop to upload" : <>Drag &amp; drop a file, or <span className="text-[#007BFF]">browse</span></>}
            </div>
            {!uploading && <div className="text-[11px] text-[#5F6A88]">Documents, spreadsheets, images, code, and archives</div>}
            {!uploading && <div className="font-mono text-[9.5px] text-[#5F6A88] mt-1">UP TO {maxSizeLabel} PER FILE · {allowedTypesLabel}</div>}
          </button>
        )}
      </div>
    </div>
  );
}
