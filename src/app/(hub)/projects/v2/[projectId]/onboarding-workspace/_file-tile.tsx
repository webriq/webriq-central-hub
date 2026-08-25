"use client";

import { useEffect, useRef, useState } from "react";
import { Folder, FileText, Trash2, ExternalLink, MoreVertical, Pencil, FolderInput, Lock, AlertTriangle, History, Download } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { AssetRow, AssetFolder, StaffPerson } from "./_wizard-v2-types";
import { textPrimary, textMuted, formatFileSize, IconTip } from "./_shared-ui";
import { InlinePermissionsPanel, permissionSummary } from "./_permission-picker";
import { FileTypeTile, HtmlPreview, MarkdownPreview, CsvPreview, FilePreviewModal } from "./_file-previews";

// Lazy-loaded real preview — image gets an actual <img>; html/markdown/csv get a real rendered
// preview (task 198 parity) in grid view only; everything else (PDF, Office formats), and
// html/markdown/csv when `simple` is set, gets the color-coded fallback tile. `simple` (list
// view — task 220 follow-up) skips the rich mini-previews entirely: a 36px-tall list row has no
// room to render a legible mini table/page, so list view always shows the plain type icon except
// for images, which still get their real thumbnail. Signed URL fetched once per card.
function FileThumbnail({ asset, customerId, simple }: { asset: AssetRow; customerId: string; simple?: boolean }) {
  const mime = asset.file_mime_type ?? "";
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isImage = mime.startsWith("image/");
  const needsUrl = isImage || (!simple && (mime === "text/html" || mime === "text/markdown" || mime === "text/csv"));

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
  if (isImage) {
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
//
// Positioned via `position: fixed` computed from the trigger button's own rect (same technique
// as _files-tab.tsx's right-click context menu) instead of `absolute` anchored to the row —
// anchoring to the row let a later list row (plain z-index:auto, later in DOM order) paint over
// the menu in some browsers/layouts. Fixed positioning escapes that entirely. Rect is read from
// a ref, not `e.currentTarget` — IconTip's Tooltip wrapper can null out the synthetic event's
// currentTarget by the time this handler runs (native DOM behavior once an event finishes
// dispatching), which silently threw and left only the hover tooltip visible, never opening
// the menu.
function ActionsMenu({ actions }: { actions: ItemAction[] }) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (menuPos) { setMenuPos(null); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 160;
    const menuHeight = actions.length * 32 + 8;
    setMenuPos({
      x: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
      y: Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 8),
    });
  };

  return (
    <div className="relative">
      <IconTip label="Actions">
        <button
          ref={triggerRef}
          type="button"
          onClick={toggle}
          aria-label="Actions"
          className="p-1.5 rounded-md border-none bg-transparent cursor-pointer text-[#5F6A88] hover:bg-[#EDF0F7]"
        >
          <MoreVertical size={13} />
        </button>
      </IconTip>
      {menuPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuPos(null); }} />
          <div
            className="fixed z-50 w-40 rounded-lg border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,.10)] py-1 flex flex-col"
            style={{ left: menuPos.x, top: menuPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <ActionsMenuItems actions={actions} onDone={() => setMenuPos(null)} />
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
  isDropTarget, onDragOverTile, onDragLeaveTile, onDropTile, onContextMenu, duplicateWarning,
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
  // Mockup 03 — case-insensitive sibling name collision (display-only; the create-folder API
  // already blocks new duplicates, so this only ever surfaces legacy/raced data).
  duplicateWarning?: boolean;
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
            isDropTarget ? "border-[#007BFF] bg-[#EAF2FF]" : duplicateWarning ? "border-[#8A5A00] bg-white hover:bg-[#F4F8FF]" : "border-[#E2E7F2] bg-white hover:bg-[#F4F8FF] hover:border-[#C7D2E8]"
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
        {/* Task 220 — warning moved from an inline pill (which made duplicate-name tiles taller
            than their siblings) to a tooltip icon beside the kebab, so every tile stays the same height. */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {duplicateWarning && (
            <IconTip label="Same name as another folder">
              <span className="inline-flex text-[#8A5A00] cursor-help p-1"><AlertTriangle size={12} /></span>
            </IconTip>
          )}
          <ActionsMenu actions={actions} />
        </div>
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

// Mockup 03's "v4 · latest" badge — client-side version grouping only (no schema change): a
// click reveals the older same-named uploads' dates, computed/passed down by _files-tab.tsx.
// No rollback/diff, just a dated list — see task 217 doc's gap table for why.
// A <span role="button"> here, not a real <button> — this badge is always rendered inside
// FileTile's own outer selection <button>, and a nested <button> is invalid HTML that Next.js
// hydration flags as a "cannot be a descendant of/contain a nested <button>" error (task 220).
function VersionBadge({ versionCount, olderVersions }: { versionCount: number; olderVersions: AssetRow[] }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((v) => !v); } }}
        className="font-mono text-[9px] font-semibold text-[#5F6A88] bg-[#EDF0F7] px-1.5 py-0.5 rounded-[4px] cursor-pointer inline-flex items-center gap-1"
      >
        <History size={9} /> v{versionCount} · latest
      </span>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 w-44 rounded-lg border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,.10)] p-2">
            <p className="text-[9.5px] font-bold uppercase tracking-wide text-[#5F6A88] px-1 pb-1">Earlier uploads</p>
            {olderVersions.map((v) => (
              <p key={v.id} className="text-[11px] text-[#3A4565] px-1 py-1">{formatRelativeTime(v.created_at)}</p>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

export function FileTile({
  asset, customerId, canEdit, onDelete, onPermissionChange, onRename, onMove, staffDirectory, viewMode,
  selected, onToggleSelect, onContextMenu, versionCount, olderVersions,
}: {
  asset: AssetRow; customerId: string; canEdit: boolean; onDelete: () => void;
  onPermissionChange: (updates: { allowed_roles?: string[]; allowed_user_ids?: string[] }) => void;
  onRename: () => void; onMove: () => void;
  staffDirectory: StaffPerson[];
  viewMode: "grid" | "list";
  selected: boolean;
  onToggleSelect: () => void;
  onContextMenu: (e: React.MouseEvent, actions: ItemAction[]) => void;
  versionCount?: number;
  olderVersions?: AssetRow[];
}) {
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const hasVersions = !!versionCount && versionCount > 1;

  // In-app preview modal (task 220) — same open-before-fetch pattern as _business-info-tab.tsx's
  // NoteFileCard.handlePreview: open the modal immediately with a loading state, fetch the
  // signed URL after, instead of window.open()'ing to a new tab.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const handleView = () => {
    setPreviewOpen(true);
    setPreviewUrl(null);
    setPreviewError(null);
    setPreviewLoading(true);
    fetch(`/api/customers/${customerId}/assets/${asset.id}/file-url`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { url: string }) => setPreviewUrl(data.url))
      .catch(() => setPreviewError("Failed to load file preview."))
      .finally(() => setPreviewLoading(false));
  };

  // Same pattern as NoteFileCard.handleDownload in _business-info-tab.tsx — the `?download=1`
  // param makes the signed URL carry Content-Disposition: attachment so the browser saves the
  // file under its real name instead of navigating to it. No local loading state needed: the
  // menu closes (onDone) before this fires (see ActionsMenuItems), so there's nothing left in
  // the menu to show a loading state on.
  const handleDownload = async () => {
    try {
      const res = await fetch(`/api/customers/${customerId}/assets/${asset.id}/file-url?download=1`);
      if (!res.ok) return;
      const data: { url: string } = await res.json();
      const a = document.createElement("a");
      a.href = data.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      // Non-fatal — no dedicated error UI for a menu-triggered download action.
    }
  };

  const actions: ItemAction[] = [
    { label: "View", icon: ExternalLink, onClick: handleView },
    { label: "Download", icon: Download, onClick: handleDownload },
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
              <FileThumbnail asset={asset} customerId={customerId} simple />
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[12.5px] font-medium truncate", textPrimary)} title={asset.file_name ?? asset.label}>{asset.file_name ?? asset.label}</p>
              <p className={cn("text-[10.5px]", textMuted)}>{formatFileSize(asset.file_size)} · Uploaded {formatRelativeTime(asset.created_at)}</p>
            </div>
            {hasVersions && <VersionBadge versionCount={versionCount!} olderVersions={olderVersions ?? []} />}
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
        {previewOpen && (
          <FilePreviewModal
            fileName={asset.file_name ?? asset.label}
            mimeType={asset.file_mime_type ?? ""}
            url={previewUrl}
            loading={previewLoading}
            error={previewError}
            onClose={() => setPreviewOpen(false)}
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
          <div className="flex items-center justify-between gap-1 px-2 pb-2 shrink-0">
            <span className={cn("text-[9.5px] truncate", textMuted)}>{formatFileSize(asset.file_size)}</span>
            <span className="flex items-center gap-1 shrink-0">
              {hasVersions && <VersionBadge versionCount={versionCount!} olderVersions={olderVersions ?? []} />}
              <PermissionBadge allowedRoles={asset.allowed_roles} allowedUserIds={asset.allowed_user_ids} />
            </span>
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
      {previewOpen && (
        <FilePreviewModal
          fileName={asset.file_name ?? asset.label}
          mimeType={asset.file_mime_type ?? ""}
          url={previewUrl}
          loading={previewLoading}
          error={previewError}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
