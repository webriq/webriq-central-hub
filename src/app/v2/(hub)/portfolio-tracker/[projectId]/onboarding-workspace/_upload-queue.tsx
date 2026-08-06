"use client";

import { useCallback, useRef, useState } from "react";
import { CloudUpload, AlertCircle, Check, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { textPrimary, textMuted, formatFileSize } from "./_shared-ui";

export type QueueItem = { id: string; file: File; folderId: string; status: "uploading" | "done" | "error"; progress: number; error?: string };

// XHR, not fetch — fetch has no upload-progress event, and mockup 04 needs a real per-file
// progress bar. Same endpoint/contract as the prior fetch-based call, just a different transport
// for the one leg that actually streams bytes (the storage upload; the DB-row POST stays fetch).
export function uploadFileWithProgress(
  url: string,
  formData: FormData,
  onProgress?: (pct: number) => void
): Promise<{ path: string; filename: string; size: number; mimeType: string }> {
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

// Queue-item state as a hook (not baked into a single component) so _files-tab.tsx can enqueue
// from multiple entry points — the drag zone, a folder-tile drop, the file-input picker — without
// duplicating progress/retry bookkeeping at each call site.
export function useUploadQueue(
  uploadFile: (file: File, folderId: string, onProgress: (pct: number) => void) => Promise<void>
) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const counter = useRef(0);

  const runUpload = useCallback(
    (id: string, file: File, folderId: string) => {
      uploadFile(file, folderId, (pct) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, progress: pct } : it))))
        .then(() => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "done", progress: 100 } : it))))
        .catch((err: Error) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "error", error: err.message } : it))));
    },
    [uploadFile]
  );

  const enqueue = useCallback(
    (files: File[], folderId: string) => {
      const newItems: QueueItem[] = files.map((file) => ({ id: `${Date.now()}-${counter.current++}`, file, folderId, status: "uploading", progress: 0 }));
      setItems((prev) => [...prev, ...newItems]);
      newItems.forEach((item) => runUpload(item.id, item.file, item.folderId));
    },
    [runUpload]
  );

  const retry = useCallback(
    (id: string) => {
      setItems((prev) => {
        const target = prev.find((it) => it.id === id);
        if (target) runUpload(id, target.file, target.folderId);
        return prev.map((it) => (it.id === id ? { ...it, status: "uploading", progress: 0, error: undefined } : it));
      });
    },
    [runUpload]
  );

  const dismiss = useCallback((id: string) => setItems((prev) => prev.filter((it) => it.id !== id)), []);

  return { items, enqueue, retry, dismiss };
}

export function UploadQueuePanel({ items, onRetry, onDismiss }: { items: QueueItem[]; onRetry: (id: string) => void; onDismiss: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-[10px] border border-[#E2E7F2] bg-white mb-3 divide-y divide-[#EDF0F7]">
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
            <p className={cn("text-[12px] font-semibold truncate", textPrimary)}>{item.file.name}</p>
            {item.status === "uploading" && (
              <div className="h-1.5 rounded-full bg-[#EDF0F7] overflow-hidden mt-1.5">
                <div className="h-full rounded-full bg-[#007BFF] transition-[width]" style={{ width: `${item.progress}%` }} />
              </div>
            )}
            {item.status === "done" && <p className={cn("text-[10.5px]", textMuted)}>{formatFileSize(item.file.size)} · Uploaded</p>}
            {item.status === "error" && <p className="text-[10.5px] text-[#C0392B]">{item.error ?? "Upload failed"}</p>}
          </div>
          {item.status === "uploading" && <span className="font-mono text-[10.5px] text-[#5F6A88] w-8 text-right shrink-0">{item.progress}%</span>}
          {item.status === "error" && (
            <button type="button" onClick={() => onRetry(item.id)} className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-[#007BFF] bg-transparent border-none cursor-pointer hover:underline">
              <RotateCw size={11} /> Retry
            </button>
          )}
          {item.status === "done" && (
            <button type="button" onClick={() => onDismiss(item.id)} aria-label="Dismiss" className="shrink-0 text-[#5F6A88] bg-transparent border-none cursor-pointer hover:text-[#0B1533]">
              <X size={13} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function UploadDropzone({
  uploading, isDragOver, onBrowse, rejected, maxSizeLabel, allowedTypesLabel,
}: {
  uploading: boolean;
  isDragOver: boolean;
  onBrowse: () => void;
  rejected: { name: string; reason: string } | null;
  maxSizeLabel: string;
  allowedTypesLabel: string;
}) {
  if (rejected) {
    return (
      <div className="w-full min-h-[168px] flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-[#C0392B] bg-[#FDE8E6] py-8 text-center px-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white border border-[#E2E7F2] text-[#C0392B]">
          <AlertCircle size={22} strokeWidth={1.75} />
        </div>
        <div className="text-[13px] font-semibold text-[#0B1533]">{rejected.name} can&apos;t be uploaded</div>
        <div className="text-[11.5px] text-[#5F6A88] max-w-xs">{rejected.reason}</div>
        <button type="button" onClick={onBrowse} className="text-[12px] font-semibold text-[#007BFF] bg-transparent border-none cursor-pointer hover:underline">
          Try another file
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onBrowse}
      disabled={uploading}
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
      <div className={cn("text-[13px] font-medium", textPrimary)}>
        {uploading ? "Uploading…" : isDragOver ? "Drop to upload" : <>Drag &amp; drop a file, or <span className="text-[#007BFF]">browse</span></>}
      </div>
      {!uploading && <div className={cn("text-[11px]", textMuted)}>Any document, spreadsheet, or image</div>}
      {!uploading && <div className="font-mono text-[9.5px] text-[#5F6A88] mt-1">UP TO {maxSizeLabel} PER FILE · {allowedTypesLabel}</div>}
    </button>
  );
}
