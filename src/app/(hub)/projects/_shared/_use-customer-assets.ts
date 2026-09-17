"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { uploadViaSignedUrl } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_upload-queue";
import type { AssetRow, AssetFolder, StaffPerson } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_wizard-v2-types";

// Task 359 — the data half of _shared/_files-tab.tsx, extracted so that file stays a thin render
// component (nextjs-file-length-best-practices.md). Behavior is unchanged from task 276.
//
// Data model note (confirmed against the source): `customer_assets` is CUSTOMER-scoped, not
// project-scoped. Per the task brief this is intentional — the same files show up on every
// project belonging to that customer, mirroring how a client's documents/credentials naturally
// carry across their projects. Folders, however, require a `projectId` + `phaseNumber` (the
// `/assets/folders` route 400s without both — `phaseNumber` is NOT optional despite the ask to
// check) — this always requests `phaseNumber=1`, the only folder scope that exists anywhere in
// this codebase today (matches the wizard's own Phase 1-only folder tree).
export function useCustomerAssets(customerId: string, projectId: string) {
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [staffDirectory, setStaffDirectory] = useState<StaffPerson[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const [foldersRes, assetsRes, staffRes] = await Promise.all([
          fetch(`/api/customers/${customerId}/assets/folders?projectId=${projectId}&phaseNumber=1`, { signal: controller.signal }),
          fetch(`/api/customers/${customerId}/assets`, { signal: controller.signal }),
          fetch("/api/staff-directory", { signal: controller.signal }),
        ]);
        if (foldersRes.ok) setFolders(await foldersRes.json());
        if (assetsRes.ok) setAssets(await assetsRes.json());
        if (staffRes.ok) setStaffDirectory(await staffRes.json());
        setLoading(false);
      } catch {
        // Aborted (unmount / customer switch) or network failure — the tab keeps its spinner
        // rather than rendering a misleading empty state, matching the prior behavior.
      }
    })();
    return () => controller.abort();
  }, [customerId, projectId]);

  const handleUpload = useCallback(async (file: File, folderId: string, onProgress?: (pct: number) => void) => {
    const uploaded = await uploadViaSignedUrl(`/api/customers/${customerId}/assets/upload/sign`, file, projectId, onProgress);
    const assetRes = await fetch(`/api/customers/${customerId}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "file", label: uploaded.filename, file_path: uploaded.path, file_name: uploaded.filename,
        file_size: uploaded.size, file_mime_type: uploaded.mimeType, phase_number: 1, project_id: projectId, folder_id: folderId,
      }),
    });
    if (!assetRes.ok) return;
    const newAsset: AssetRow = await assetRes.json();
    setAssets((prev) => [...prev, newAsset]);
  }, [customerId, projectId]);

  const handleDeleteAsset = useCallback(async (id: string): Promise<boolean> => {
    const res = await fetch(`/api/customers/${customerId}/assets?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Couldn't delete file — try again");
      return false;
    }
    setAssets((prev) => prev.filter((a) => a.id !== id));
    return true;
  }, [customerId]);

  const handleAssetPermissionChange = useCallback(async (assetId: string, updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => {
    const res = await fetch(`/api/customers/${customerId}/assets/${assetId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    if (!res.ok) return;
    const updated: AssetRow = await res.json();
    setAssets((prev) => prev.map((a) => (a.id === assetId ? updated : a)));
  }, [customerId]);

  const handleFolderPermissionChange = useCallback(async (folderId: string, updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => {
    const res = await fetch(`/api/customers/${customerId}/assets/folders/${folderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    if (!res.ok) return;
    const updated: AssetFolder = await res.json();
    setFolders((prev) => prev.map((f) => (f.id === folderId ? updated : f)));
  }, [customerId]);

  const handleCreateFolder = useCallback(async (name: string, parentFolderId: string | null): Promise<AssetFolder | undefined> => {
    const res = await fetch(`/api/customers/${customerId}/assets/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, phaseNumber: 1, name, parent_folder_id: parentFolderId }),
    });
    if (!res.ok) return undefined;
    const created: AssetFolder = await res.json();
    setFolders((prev) => [...prev, created]);
    return created;
  }, [customerId, projectId]);

  const handleRenameAsset = useCallback(async (assetId: string, fileName: string): Promise<boolean> => {
    const res = await fetch(`/api/customers/${customerId}/assets/${assetId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_name: fileName }) });
    if (!res.ok) return false;
    const updated: AssetRow = await res.json();
    setAssets((prev) => prev.map((a) => (a.id === assetId ? updated : a)));
    return true;
  }, [customerId]);

  const handleRenameFolder = useCallback(async (folderId: string, name: string): Promise<boolean> => {
    const res = await fetch(`/api/customers/${customerId}/assets/folders/${folderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (!res.ok) return false;
    const updated: AssetFolder = await res.json();
    setFolders((prev) => prev.map((f) => (f.id === folderId ? updated : f)));
    return true;
  }, [customerId]);

  const handleDeleteFolder = useCallback(async (folderId: string): Promise<boolean> => {
    const res = await fetch(`/api/customers/${customerId}/assets/folders/${folderId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      toast.error(body?.error || "Couldn't delete folder — try again");
      return false;
    }
    // A recursive folder delete may have removed nested sub-folders (cascade) and files
    // (explicit delete) the client doesn't know the ids of individually — refetch both
    // rather than trying to compute the removed subtree client-side.
    const [foldersRes, assetsRes] = await Promise.all([
      fetch(`/api/customers/${customerId}/assets/folders?projectId=${projectId}&phaseNumber=1`),
      fetch(`/api/customers/${customerId}/assets`),
    ]);
    if (foldersRes.ok) setFolders(await foldersRes.json());
    if (assetsRes.ok) setAssets(await assetsRes.json());
    return true;
  }, [customerId, projectId]);

  const handleMoveAsset = useCallback(async (assetId: string, folderId: string) => {
    const res = await fetch(`/api/customers/${customerId}/assets/${assetId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_id: folderId }) });
    if (!res.ok) return;
    const updated: AssetRow = await res.json();
    setAssets((prev) => prev.map((a) => (a.id === assetId ? updated : a)));
  }, [customerId]);

  return {
    loading, assets, folders, staffDirectory,
    handleUpload, handleDeleteAsset, handleAssetPermissionChange, handleFolderPermissionChange,
    handleCreateFolder, handleRenameAsset, handleRenameFolder, handleDeleteFolder, handleMoveAsset,
  };
}
