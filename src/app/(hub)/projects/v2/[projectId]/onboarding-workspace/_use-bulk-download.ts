"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatFileSize } from "./_shared-ui";

export type DownloadTarget = { assetIds: string[]; folderIds: string[]; label?: string };
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

// Task 419 — Files tab bulk download. The server only plans the download (permission-filtered
// paths + short-lived signed URLs, see api/.../assets/download-manifest); the browser fetches each
// file and streams it into a zip with client-zip (dynamic import — only paid for on first use).
// One download at a time: the zip is assembled in memory, so parallel runs would stack.
export function useBulkDownload(customerId: string) {
  const [downloading, setDownloading] = useState(false);

  const downloadSingleFile = async (assetId: string) => {
    const res = await fetch(`/api/customers/${customerId}/assets/${assetId}/file-url?download=1`);
    if (!res.ok) throw new Error("Couldn't prepare the download.");
    const { url }: { url: string } = await res.json();
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const download = async (target: DownloadTarget) => {
    if (downloading) return;
    setDownloading(true);
    const controller = new AbortController();
    const id = toast.loading("Preparing download…", { action: { label: "Cancel", onClick: () => controller.abort() } });
    try {
      if (target.assetIds.length === 1 && target.folderIds.length === 0) {
        await downloadSingleFile(target.assetIds[0]);
        toast.dismiss(id);
        return;
      }
      const res = await fetch(`/api/customers/${customerId}/assets/download-manifest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetIds: target.assetIds, folderIds: target.folderIds }),
        signal: controller.signal,
      });
      if (res.status === 404) {
        toast.info(`Nothing to download${target.label ? ` in ${target.label}` : ""}.`, { id });
        return;
      }
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
      if (failed.length === total) {
        toast.error("Couldn't download any of the selected files.", { id });
        return;
      }
      saveBlob(blob, manifest.zipName);
      const okCount = total - failed.length;
      const notes = [
        failed.length ? `${failed.length} failed` : "",
        manifest.skipped ? `${plural(manifest.skipped, "file")} skipped — no access` : "",
      ].filter(Boolean);
      const summary = `Downloaded ${plural(okCount, "file")} · ${formatFileSize(blob.size)}`;
      if (notes.length) toast.warning(`${summary} (${notes.join(", ")})`, { id });
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
