"use client";

import { useEffect, useState } from "react";
import { Folder, FileText, Trash2, ExternalLink, MoreVertical, Pencil, FolderInput, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssetRow, AssetFolder, StaffPerson } from "./_wizard-v2-types";
import { textPrimary, textMuted, formatFileSize, IconTip } from "./_shared-ui";
import { InlinePermissionsPanel, permissionSummary } from "./_permission-picker";
import { FileTypeTile, HtmlPreview, MarkdownPreview, CsvPreview } from "./_file-previews";

// Lazy-loaded real preview — image gets an actual <img>; html/markdown/csv get a real rendered
// preview (task 198 parity); everything else (PDF, Office formats) gets the color-coded fallback
// tile, same reasoning task 198 already used for those. Signed URL fetched once per card.
function FileThumbnail({ asset, customerId }: { asset: AssetRow; customerId: string }) {
  const mime = asset.file_mime_type ?? "";
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const needsUrl = mime.startsWith("image/") || mime === "text/html" || mime === "text/markdown" || mime === "text/csv";

  useEffect(() => {
    if (!needsUrl) return;
    let cancelled = false;
    fetch(`/api/customers/${customerId}/assets/${asset.id}/file-url`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { url: string }) => { if (!cancelled) setUrl(data.url); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [asset.id, customerId, needsUrl]);

  if (failed || !needsUrl) return <FileTypeTile mime={mime} />;
  if (!url) return <FileTypeTile mime={mime} />;
  if (mime.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived Supabase Storage URL; next/image can't optimize an opaque signed URL usefully here.
    return <img src={url} alt={asset.file_name ?? "Preview"} className="w-full h-full object-cover" onError={() => setFailed(true)} />;
  }
  if (mime === "text/html") return <HtmlPreview url={url} />;
  if (mime === "text/markdown") return <MarkdownPreview url={url} />;
  return <CsvPreview url={url} />;
}

export type ItemAction = { label: string; icon: typeof Pencil; onClick: () => void; danger?: boolean; disabled?: boolean };

// Shared kebab dropdown — plain items, no per-item tooltips (matches
// ../_onboarding-wizard.tsx's renderFileMenuItems/renderFolderMenuItems exactly; only the kebab
// trigger button itself carries a tooltip, "Actions"). Right-click on the tile opens the same
// `actions` array in a floating menu at the cursor (wired via `onContextMenu` up in
// _files-tab.tsx) — one action list feeds both triggers so they can't drift out of sync.
function ActionsMenu({ actions }: { actions: ItemAction[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <IconTip label="Actions">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          aria-label="Actions"
          className="p-1.5 rounded-md border-none bg-transparent cursor-pointer text-[#5F6A88] hover:bg-[#EDF0F7]"
        >
          <MoreVertical size={13} />
        </button>
      </IconTip>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute right-0 top-full mt-1 z-40 w-40 rounded-lg border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,.10)] py-1 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <ActionsMenuItems actions={actions} onDone={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}

export function ActionsMenuItems({ actions, onDone }: { actions: ItemAction[]; onDone: () => void }) {
  return (
    <>
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          disabled={a.disabled}
          onClick={() => { onDone(); a.onClick(); }}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 text-[12px] text-left cursor-pointer border-none bg-transparent w-full disabled:opacity-40 disabled:cursor-not-allowed",
            a.danger ? "text-[#C0392B] hover:bg-[#FDE8E6]" : cn(textPrimary, "hover:bg-[#EDF0F7]")
          )}
        >
          <a.icon size={13} /> {a.label}
        </button>
      ))}
    </>
  );
}

function PermissionBadge({ allowedRoles, allowedUserIds }: { allowedRoles: string[] | null; allowedUserIds: string[] | null }) {
  const restricted = (!!allowedRoles && allowedRoles.length > 0) || (!!allowedUserIds && allowedUserIds.length > 0);
  return (
    <span className={cn("text-[9.5px] rounded-full px-1.5 py-0.5 whitespace-nowrap", restricted ? "bg-[#FFF3D6] text-[#8A5A00]" : "bg-[#EDF0F7] text-[#5F6A88]")}>
      {permissionSummary(allowedRoles, allowedUserIds)}
    </span>
  );
}

export function FolderTile({
  folder, fileCount, canEdit, onOpen, onPermissionChange, staffDirectory, onRename, onDelete,
  isDropTarget, onDragOverTile, onDragLeaveTile, onDropTile, onContextMenu,
}: {
  folder: AssetFolder; fileCount: number; canEdit: boolean; onOpen: () => void;
  onPermissionChange: (updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => void;
  staffDirectory: StaffPerson[];
  onRename: () => void;
  onDelete: () => void;
  isDropTarget: boolean;
  onDragOverTile: (e: React.DragEvent) => void;
  onDragLeaveTile: (e: React.DragEvent) => void;
  onDropTile: (e: React.DragEvent) => void;
  onContextMenu: (e: React.MouseEvent, actions: ItemAction[]) => void;
}) {
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const actions: ItemAction[] = [
    { label: "Permissions", icon: Lock, onClick: () => setPermissionsOpen((v) => !v), disabled: !canEdit },
    ...(folder.is_system ? [] : [
      { label: "Rename", icon: Pencil, onClick: onRename },
      { label: "Delete", icon: Trash2, onClick: onDelete, danger: true },
    ]),
  ];

  return (
    <div>
      <div
        onDragOver={onDragOverTile}
        onDragLeave={onDragLeaveTile}
        onDrop={onDropTile}
        className="relative"
      >
        <button
          type="button"
          onClick={onOpen}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, actions); }}
          className={cn(
            "w-full flex flex-col items-start gap-3 p-5 text-left rounded-[14px] border cursor-pointer transition-colors duration-150",
            isDropTarget ? "border-[#007BFF] bg-[#EAF2FF]" : "border-[#E2E7F2] bg-white hover:bg-[#F4F8FF] hover:border-[#C7D2E8]"
          )}
        >
          <div className="w-12 h-12 rounded-[10px] bg-[#E5F1FF] flex items-center justify-center">
            <Folder size={22} className="text-[#007BFF]" />
          </div>
          <div className="min-w-0 w-full">
            <p className={cn("text-[13.5px] font-semibold truncate", textPrimary)} title={folder.name}>{folder.name}</p>
            <p className={cn("text-[11px]", textMuted)}>{fileCount} {fileCount === 1 ? "file" : "files"}</p>
          </div>
        </button>
        <div className="absolute top-2 right-2"><ActionsMenu actions={actions} /></div>
      </div>
      {permissionsOpen && (
        <InlinePermissionsPanel
          allowedRoles={folder.allowed_roles}
          allowedUserIds={folder.allowed_user_ids}
          staffDirectory={staffDirectory}
          onChange={onPermissionChange}
          onClose={() => setPermissionsOpen(false)}
        />
      )}
    </div>
  );
}

export function FileTile({
  asset, customerId, canEdit, onDelete, onPermissionChange, onRename, onMove, staffDirectory, viewMode,
  selected, onToggleSelect, onContextMenu,
}: {
  asset: AssetRow; customerId: string; canEdit: boolean; onDelete: () => void;
  onPermissionChange: (updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => void;
  onRename: () => void; onMove: () => void;
  staffDirectory: StaffPerson[];
  viewMode: "grid" | "list";
  selected: boolean;
  onToggleSelect: () => void;
  onContextMenu: (e: React.MouseEvent, actions: ItemAction[]) => void;
}) {
  const [permissionsOpen, setPermissionsOpen] = useState(false);

  const handleView = async () => {
    try {
      const res = await fetch(`/api/customers/${customerId}/assets/${asset.id}/file-url`);
      if (!res.ok) throw new Error();
      const data: { url: string } = await res.json();
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch {
      // Non-fatal — no dedicated error UI for a sandbox preview action.
    }
  };

  const actions: ItemAction[] = [
    { label: "View", icon: ExternalLink, onClick: handleView },
    { label: "Permissions", icon: Lock, onClick: () => setPermissionsOpen((v) => !v), disabled: !canEdit },
    ...(canEdit ? [
      { label: "Rename", icon: Pencil, onClick: onRename },
      { label: "Move to folder", icon: FolderInput, onClick: onMove },
      { label: "Remove", icon: Trash2, onClick: onDelete, danger: true },
    ] : []),
  ];

  // Clicking the tile itself toggles selection, not View — View only lives in the kebab/context
  // menu, matching ../_onboarding-wizard.tsx's file cards exactly (`onClick={() => toggleSelect(f.id)}`,
  // `aria-pressed={isSelected}`, whole-card blue fill on select — no separate checkbox element).
  if (viewMode === "list") {
    return (
      <div>
        <div className="relative">
          <button
            type="button"
            onClick={onToggleSelect}
            onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, actions); }}
            aria-pressed={selected}
            aria-label={`Select ${asset.file_name ?? asset.label}`}
            className={cn(
              "w-full flex items-center gap-3 pl-3.5 pr-9 py-2.5 rounded-[10px] text-left cursor-pointer border transition-colors duration-150",
              selected ? "bg-[#EAF2FF] border-[#007BFF]" : "bg-white border-[#E2E7F2] hover:bg-[#F4F8FF] hover:border-[#C7D2E8]"
            )}
          >
            <div className="w-9 h-9 rounded-[8px] overflow-hidden shrink-0">
              <FileThumbnail asset={asset} customerId={customerId} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[12.5px] font-medium truncate", textPrimary)} title={asset.file_name ?? asset.label}>{asset.file_name ?? asset.label}</p>
              <p className={cn("text-[10.5px]", textMuted)}>{formatFileSize(asset.file_size)}</p>
            </div>
            <PermissionBadge allowedRoles={asset.allowed_roles} allowedUserIds={asset.allowed_user_ids} />
          </button>
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2"><ActionsMenu actions={actions} /></div>
        </div>
        {permissionsOpen && (
          <InlinePermissionsPanel
            allowedRoles={asset.allowed_roles}
            allowedUserIds={asset.allowed_user_ids}
            staffDirectory={staffDirectory}
            onChange={onPermissionChange}
            onClose={() => setPermissionsOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <button
          type="button"
          onClick={onToggleSelect}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, actions); }}
          aria-pressed={selected}
          aria-label={`Select ${asset.file_name ?? asset.label}`}
          className={cn(
            "w-full aspect-square flex flex-col text-left rounded-[14px] overflow-hidden cursor-pointer border transition-colors duration-150",
            selected ? "bg-[#EAF2FF] border-[#007BFF]" : "bg-white border-[#E2E7F2] hover:bg-[#F4F8FF] hover:border-[#C7D2E8]"
          )}
        >
          <div className="flex items-center gap-2 pl-2.5 pr-8 py-2 shrink-0">
            <FileText size={13} className="text-[#007BFF] shrink-0" />
            <span title={asset.file_name ?? asset.label} className={cn("text-[11px] font-medium truncate flex-1", textPrimary)}>{asset.file_name ?? asset.label}</span>
          </div>
          <div className="flex-1 min-h-0 mx-2 mb-2 rounded-md overflow-hidden bg-[#F4F6FB]">
            <FileThumbnail asset={asset} customerId={customerId} />
          </div>
          <div className="flex items-center justify-between px-2 pb-2 shrink-0">
            <span className={cn("text-[9.5px]", textMuted)}>{formatFileSize(asset.file_size)}</span>
            <PermissionBadge allowedRoles={asset.allowed_roles} allowedUserIds={asset.allowed_user_ids} />
          </div>
        </button>
        <div className="absolute top-2 right-2"><ActionsMenu actions={actions} /></div>
      </div>
      {permissionsOpen && (
        <InlinePermissionsPanel
          allowedRoles={asset.allowed_roles}
          allowedUserIds={asset.allowed_user_ids}
          staffDirectory={staffDirectory}
          onChange={onPermissionChange}
          onClose={() => setPermissionsOpen(false)}
        />
      )}
    </div>
  );
}
