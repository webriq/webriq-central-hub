// Task 436 — the generic, already-prop-driven Project Files modules the Drive reuses by import.
// Project Files itself is untouched; the pieces that hard-code customer URLs or customer-asset
// permission semantics (_file-tile, _folder-tile, _use-bulk-download, _permission-picker,
// _files-toolbar, _use-folder-upload) have Drive-specific replacements in this folder.
export { useUploadQueue, UploadQueuePanel } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_upload-queue";
export { ActionsMenu, ActionsMenuItems, clampMenuPosition, selectionDownloadAction } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_file-actions-menu";
export type { ItemAction } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_file-actions-menu";
export { RenameModal, DuplicateFolderModal } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_rename-move-modals";
export { NewFolderTile } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_files-tab-parts";
export { useFilesSelection } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_use-files-selection";
export { FileTypeTile, FilePreviewModal } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_file-previews";
export { buildTreeFromRelativePaths, hasDirectoryEntry, readDataTransferEntries, countFiles } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_folder-upload-tree";
export type { FolderNode } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_folder-upload-tree";
export { ALLOWED_UPLOAD_TYPES, ALLOWED_TYPES_LABEL } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_file-upload-constants";
export { textPrimary, textMuted, formatFileSize, IconTip } from "@/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_shared-ui";
export { ConfirmDialog } from "@/components/ui/confirm-dialog";
