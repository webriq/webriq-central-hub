"use client";

import { useEffect, useState } from "react";
import type { DriveFile, DriveFolder, DrivePayload, DriveView } from "@/lib/drive/types";

// Task 436 — loads one Drive section. The shell keys the browser by `view`, so a section switch
// remounts this hook and refetches (skeleton, never a stale list from the other section).
export function useDriveData(view: DriveView) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [me, setMe] = useState<DrivePayload["me"] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/drive?view=${view}`, { signal: controller.signal });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError((body as { error?: string }).error ?? "Couldn't load your files — try again.");
          setLoading(false);
          return;
        }
        const data = (await res.json()) as DrivePayload;
        setFolders(data.folders);
        setFiles(data.files);
        setMe(data.me);
        setLoading(false);
      } catch {
        if (controller.signal.aborted) return;
        setError("Couldn't load your files — check your connection and try again.");
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [view]);

  return { loading, error, folders, files, me, setFolders, setFiles };
}
