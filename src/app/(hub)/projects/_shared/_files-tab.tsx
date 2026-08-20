"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { FilesTab as FilesTabPresentational } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_files-tab";
import { uploadFileWithProgress } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_upload-queue";
import type { AssetRow, AssetFolder, StaffPerson } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_wizard-v2-types";

// Task 276 — Files tab, shared by both the legacy and v2 project-detail routes. Thin
// data-wrapping component around the existing, pure presentational `FilesTab` from the
// Onboarding Workspace (imported directly, not duplicated — 537 lines, prop-driven) — this file
// replicates the load/mutate logic `_onboarding-wizard-v2.tsx` uses for its own Files tab
// (lines ~59-255), adapted to the fields this presentational component actually consumes.
//
// Data model note (confirmed against the source): `customer_assets` is CUSTOMER-scoped, not
// project-scoped. Per the task brief this is intentional — the same files show up on every
// project belonging to that customer, mirroring how a client's documents/credentials naturally
// carry across their projects. Folders, however, require a `projectId` + `phaseNumber` (the
// `/assets/folders` route 400s without both — `phaseNumber` is NOT optional despite the ask to
// check) — this always requests `phaseNumber=1`, the only folder scope that exists anywhere in
// this codebase today (matches the wizard's own Phase 1-only folder tree).
const WRITE_ROLES = ["admin", "super_admin", "marketing"];

export function FilesTab({
  projectId, customerId, currentUserRole,
}: {
  projectId: string;
  customerId: string;
  currentUserRole: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [folders, setFolders] = useState<AssetFolder[]>([]);
  const [staffDirectory, setStaffDirectory] = useState<StaffPerson[]>([]);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);

  const canEdit = currentUserRole === "pm" || (!!currentUserRole && WRITE_ROLES.includes(currentUserRole));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [foldersRes, assetsRes, staffRes] = await Promise.all([
        fetch(`/api/customers/${customerId}/assets/folders?projectId=${projectId}&phaseNumber=1`),
        fetch(`/api/customers/${customerId}/assets`),
        fetch("/api/staff-directory"),
      ]);
      if (cancelled) return;
      if (foldersRes.ok) setFolders(await foldersRes.json());
      if (assetsRes.ok) setAssets(await assetsRes.json());
      if (staffRes.ok) setStaffDirectory(await staffRes.json());
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [customerId, projectId]);

  async function handleUpload(file: File, folderId: string, onProgress?: (pct: number) => void) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("project_id", projectId);
    const uploaded = await uploadFileWithProgress(`/api/customers/${customerId}/assets/upload`, formData, onProgress);
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
  }

  async function handleDeleteAsset(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/customers/${customerId}/assets?id=${id}`, { method: "DELETE" });
  }

  async function handleAssetPermissionChange(assetId: string, updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) {
    const res = await fetch(`/api/customers/${customerId}/assets/${assetId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    if (!res.ok) return;
    const updated: AssetRow = await res.json();
    setAssets((prev) => prev.map((a) => (a.id === assetId ? updated : a)));
  }

  async function handleFolderPermissionChange(folderId: string, updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) {
    const res = await fetch(`/api/customers/${customerId}/assets/folders/${folderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    if (!res.ok) return;
    const updated: AssetFolder = await res.json();
    setFolders((prev) => prev.map((f) => (f.id === folderId ? updated : f)));
  }

  async function handleCreateFolder(name: string, parentFolderId: string | null) {
    const res = await fetch(`/api/customers/${customerId}/assets/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, phaseNumber: 1, name, parent_folder_id: parentFolderId }),
    });
    if (!res.ok) return;
    const created: AssetFolder = await res.json();
    setFolders((prev) => [...prev, created]);
  }

  async function handleRenameAsset(assetId: string, fileName: string): Promise<boolean> {
    const res = await fetch(`/api/customers/${customerId}/assets/${assetId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_name: fileName }) });
    if (!res.ok) return false;
    const updated: AssetRow = await res.json();
    setAssets((prev) => prev.map((a) => (a.id === assetId ? updated : a)));
    return true;
  }

  async function handleRenameFolder(folderId: string, name: string): Promise<boolean> {
    const res = await fetch(`/api/customers/${customerId}/assets/folders/${folderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (!res.ok) return false;
    const updated: AssetFolder = await res.json();
    setFolders((prev) => prev.map((f) => (f.id === folderId ? updated : f)));
    return true;
  }

  async function handleDeleteFolder(folderId: string) {
    const res = await fetch(`/api/customers/${customerId}/assets/folders/${folderId}`, { method: "DELETE" });
    if (!res.ok) return;
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
  }

  async function handleMoveAsset(assetId: string, folderId: string) {
    const res = await fetch(`/api/customers/${customerId}/assets/${assetId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder_id: folderId }) });
    if (!res.ok) return;
    const updated: AssetRow = await res.json();
    setAssets((prev) => prev.map((a) => (a.id === assetId ? updated : a)));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[#5F6A88]">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-8 py-5 overflow-y-auto h-full">
      <FilesTabPresentational
        customerId={customerId}
        assets={assets}
        folders={folders}
        staffDirectory={staffDirectory}
        canEdit={canEdit}
        openFolderId={openFolderId}
        onOpenFolder={setOpenFolderId}
        onUpload={handleUpload}
        onDeleteAsset={handleDeleteAsset}
        onAssetPermissionChange={handleAssetPermissionChange}
        onFolderPermissionChange={handleFolderPermissionChange}
        onCreateFolder={handleCreateFolder}
        onRenameAsset={handleRenameAsset}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onMoveAsset={handleMoveAsset}
      />
    </div>
  );
}
