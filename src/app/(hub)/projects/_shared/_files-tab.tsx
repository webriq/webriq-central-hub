"use client";

import { Loader2 } from "lucide-react";
import { FilesTab as FilesTabPresentational } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_files-tab";
import { useCustomerAssets } from "./_use-customer-assets";
import { useFilesDeepLink } from "./_use-files-deeplink";

// Task 276 — Files tab, shared by both the legacy and v2 project-detail routes. Thin
// data-wrapping component around the existing, pure presentational `FilesTab` from the
// Onboarding Workspace (imported directly, not duplicated — prop-driven).
//
// Task 359 — the load/mutate logic moved to `useCustomerAssets` and the URL handling to
// `useFilesDeepLink`, leaving this file as wiring only. `onCopyFolderUrl`/`onCopyFileUrl`/
// `autoPreviewAssetId` are passed ONLY from here, which is why the Onboarding Workspace's own
// Files tab shows no Copy URL actions — it has a separate name-path URL scheme.
const WRITE_ROLES = ["admin", "super_admin", "marketing"];

export function FilesTab({
  projectId, customerId, currentUserRole,
}: {
  projectId: string;
  customerId: string;
  currentUserRole: string | null;
}) {
  const {
    loading, assets, folders, staffDirectory,
    handleUpload, handleDeleteAsset, handleAssetPermissionChange, handleFolderPermissionChange,
    handleCreateFolder, handleRenameAsset, handleRenameFolder, handleDeleteFolder, handleMoveAsset,
  } = useCustomerAssets(customerId, projectId);

  const { openFolderId, navigate, autoPreviewAssetId, copyFolderUrl, copyFileUrl } =
    useFilesDeepLink({ loading, assets, folders });

  const canEdit = currentUserRole === "pm" || (!!currentUserRole && WRITE_ROLES.includes(currentUserRole));

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
        onOpenFolder={navigate}
        onUpload={handleUpload}
        onDeleteAsset={handleDeleteAsset}
        onAssetPermissionChange={handleAssetPermissionChange}
        onFolderPermissionChange={handleFolderPermissionChange}
        onCreateFolder={handleCreateFolder}
        onRenameAsset={handleRenameAsset}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onMoveAsset={handleMoveAsset}
        onCopyFolderUrl={copyFolderUrl}
        onCopyFileUrl={copyFileUrl}
        autoPreviewAssetId={autoPreviewAssetId}
      />
    </div>
  );
}
