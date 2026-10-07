"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { DriveFile, DriveFolder, DriveView } from "@/lib/drive/types";

// Task 436 — URL state for /drive: ?view=mine|shared&folder=<uuid>&file=<uuid>. Mirrors task 359's
// Project Files scheme: `replaceState` (not router.replace, which would re-run the server page on
// every folder click), `?file=` carries no companion `?folder=` (the folder is derived from the
// file, so a moved file keeps working), unresolvable ids fall back to the section root, and copy
// URLs are built from window.location so they never depend on a prop.
export function useDriveDeeplink({
  initialView, initialFolderId, initialFileId, loading, folders, files,
}: {
  initialView: DriveView; initialFolderId: string | null; initialFileId: string | null;
  loading: boolean; folders: DriveFolder[]; files: DriveFile[];
}) {
  // `nav` stays null until the user navigates; until then the URL's own ids decide where we are.
  // Derived during render (no effect + setState): `?file=` wins and opens the file's own folder,
  // `?folder=` is honoured only if it resolves, anything else falls back to the section root.
  const [nav, setNav] = useState<{ folderId: string | null } | null>(null);
  const initialFile = !loading && initialFileId ? files.find((f) => f.id === initialFileId) ?? null : null;
  const initialFolderOk = !!initialFolderId && folders.some((f) => f.id === initialFolderId);
  const openFolderId = nav ? nav.folderId : loading ? initialFolderId : initialFile ? initialFile.folder_id : initialFolderOk ? initialFolderId : null;
  const previewFileId = nav ? null : initialFile?.id ?? null;

  const write = useCallback((view: DriveView, folderId: string | null) => {
    const sp = new URLSearchParams({ view });
    if (folderId) sp.set("folder", folderId);
    window.history.replaceState(null, "", `${window.location.pathname}?${sp.toString()}`);
  }, []);

  // Clean a dead `?folder=` out of the address bar once the data says it doesn't resolve.
  useEffect(() => {
    if (!loading && !nav && initialFolderId && !initialFile && !initialFolderOk) write(initialView, null);
  }, [loading, nav, initialFolderId, initialFile, initialFolderOk, initialView, write]);

  const navigate = useCallback((folderId: string | null, view: DriveView) => {
    setNav({ folderId });
    write(view, folderId);
  }, [write]);

  const copyLink = useCallback(async (view: DriveView, target: { folderId?: string; fileId?: string }) => {
    const sp = new URLSearchParams({ view });
    if (target.fileId) sp.set("file", target.fileId);
    else if (target.folderId) sp.set("folder", target.folderId);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?${sp.toString()}`);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy the link — copy it from the address bar instead.");
    }
  }, []);

  return { openFolderId, previewFileId, navigate, copyLink };
}
