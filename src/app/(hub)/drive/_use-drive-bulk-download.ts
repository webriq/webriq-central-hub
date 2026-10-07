"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatFileSize } from "./_reuse";
import { fetchDriveFileUrl } from "./_drive-upload";

export type DriveDownloadTarget = { fileIds: string[]; folderIds: string[]; label?: string };
type Manifest = { zipName: string; entries: { path: string; url: string; size: number }[]; skipped: number; totalBytes: number };

function saveBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Task 436 — Drive bulk download: the server only plans it (/api/drive/download-manifest returns
// zip paths + short-lived signed URLs); the browser fetches each file and streams it into a zip with
// client-zip (dynamic import). Drive-specific twin of Project Files' `useBulkDownload`.
export function useDriveBulkDownload() {
  const [downloading, setDownloading] = useState(false);

  const downloadOne = async (fileId: string) => {
    const url = await fetchDriveFileUrl(fileId, true);
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const download = async (target: DriveDownloadTarget) => {
    if (downloading) return;
    setDownloading(true);
    const controller = new AbortController();
    const id = toast.loading("Preparing download…", { action: { label: "Cancel", onClick: () => controller.abort() } });
    try {
      if (target.fileIds.length === 1 && target.folderIds.length === 0) {
        await downloadOne(target.fileIds[0]);
        toast.dismiss(id);
        return;
      }
      const res = await fetch("/api/drive/download-manifest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: target.fileIds, folderIds: target.folderIds }), signal: controller.signal,
      });
      if (res.status === 404) { toast.info(`Nothing to download${target.label ? ` in ${target.label}` : ""}.`, { id }); return; }
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(error ?? "Couldn't prepare the download.", { id });
        return;
      }
      const manifest: Manifest = await res.json();
      const total = manifest.entries.length;
      const failed: string[] = [];
      let done = 0;
      const { downloadZip } = await import("client-zip");
      async function* files() {
        for (const entry of manifest.entries) {
          try {
            const file = await fetch(entry.url, { signal: controller.signal });
            if (!file.ok) throw new Error(String(file.status));
            yield { name: entry.path, input: file, lastModified: new Date() };
          } catch (err) {
            if (controller.signal.aborted) throw err;
            failed.push(entry.path);
          }
          done += 1;
          toast.loading(`Zipping ${done} of ${total}…`, { id, action: { label: "Cancel", onClick: () => controller.abort() } });
        }
      }
      const blob = await downloadZip(files()).blob();
      if (failed.length === total) { toast.error("Couldn't download any of the selected files.", { id }); return; }
      saveBlob(blob, manifest.zipName);
      const summary = `Downloaded ${plural(total - failed.length, "file")} · ${formatFileSize(blob.size)}`;
      if (failed.length) toast.warning(`${summary} (${failed.length} failed)`, { id });
      else toast.success(summary, { id });
    } catch (err) {
      if (controller.signal.aborted) toast.info("Download cancelled.", { id });
      else toast.error(err instanceof Error ? err.message : "Download failed.", { id });
    } finally {
      setDownloading(false);
    }
  };

  return { downloading, download };
}
