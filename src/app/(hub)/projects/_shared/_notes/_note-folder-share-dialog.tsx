"use client";

import { useMemo, useState } from "react";
import { Globe, Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EMPTY_SELECTION, SharePicker, selectionCount, type ShareSelection } from "@/components/share-picker";
import { IconTip } from "./_icon-tip";
import type { NoteFolder, NoteFolderShare, NoteFolderShareRole, NoteVisibility } from "./_notes-types";

// Task 337 — folder-level sharing dialog. Overlay shape matches `_note-editor-modal.tsx`
// (fixed inset-0, click-backdrop-to-close). Private folders carry an explicit user/role share
// list; public folders are visible (view-only) to every staff user, so the share list is hidden.

const ROLE_OPTIONS: { value: NoteFolderShareRole; label: string }[] = [
  { value: "pm", label: "Project Managers" },
  { value: "developer", label: "Developers" },
  { value: "admin", label: "Admins" },
  { value: "super_admin", label: "Super Admins" },
];

const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]));

export function NoteFolderShareDialog({
  folder,
  allMembers,
  currentUserId,
  onClose,
  onSetVisibility,
  onShare,
  onChangeSharePermission,
  onUnshare,
}: {
  folder: NoteFolder;
  allMembers: { id: string; full_name: string | null; avatar_url: string | null; role: string }[];
  currentUserId: string;
  onClose: () => void;
  onSetVisibility: (folderId: string, visibility: NoteVisibility) => void;
  onShare: (
    folderId: string,
    targets: { userIds: string[]; roles: NoteFolderShareRole[] },
    permission: "view" | "edit"
  ) => void;
  onChangeSharePermission: (folderId: string, shareId: string, permission: "view" | "edit") => void;
  onUnshare: (folderId: string, shareId: string) => void;
}) {
  const shares = useMemo(() => folder.shares ?? [], [folder.shares]);
  const [selection, setSelection] = useState<ShareSelection>(EMPTY_SELECTION);
  const [batchPermission, setBatchPermission] = useState<"view" | "edit">("view");
  // Making a folder public exposes every author's public notes in it to all staff — confirm
  // first (parallel to the note-level confirm-to-public in `_note-editor-modal.tsx`). Switching
  // back to Private is immediate.
  const [confirmPublicOpen, setConfirmPublicOpen] = useState(false);

  const sharedUserIds = useMemo(() => new Set(shares.filter((s) => s.user_id).map((s) => s.user_id!)), [shares]);
  const sharedRoles = useMemo(() => new Set(shares.filter((s) => s.role).map((s) => s.role!)), [shares]);

  // Task 438 — recipients are picked with the shared SharePicker (search, multi-select, role chips;
  // a selected role hides its members). The people exclude the viewer and anyone already shared.
  const pickerPeople = useMemo(
    () => allMembers.map((m) => ({ id: m.id, name: m.full_name ?? "Unnamed", role: m.role, roleLabel: ROLE_LABEL[m.role], avatarUrl: m.avatar_url })),
    [allMembers],
  );
  const excludeUserIds = useMemo(() => [currentUserId, ...sharedUserIds], [currentUserId, sharedUserIds]);
  const excludeRoles = useMemo(() => Array.from(sharedRoles), [sharedRoles]);
  const count = selectionCount(selection);

  function handleShare() {
    if (count === 0) return;
    onShare(folder.id, { userIds: selection.userIds, roles: selection.roles as NoteFolderShareRole[] }, batchPermission);
    setSelection(EMPTY_SELECTION);
  }

  function shareTargetLabel(share: NoteFolderShare) {
    if (share.role) return ROLE_LABEL[share.role] ?? share.role;
    return share.user?.full_name ?? "Unnamed";
  }

  const segBtn = "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-[10px] text-[12px] font-semibold transition-colors cursor-pointer";

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1533]/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,.10)] flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <p className="text-[13px] font-semibold text-[#0B1533] truncate">Share “{folder.name}”</p>
          <IconTip label="Close">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1 rounded-full text-[#5F6A88] hover:bg-[#F4F6FB] hover:text-[#0B1533] cursor-pointer transition-colors"
            >
              <X size={15} />
            </button>
          </IconTip>
        </div>

        <div className="px-4 pb-4 overflow-y-auto">
          <div className="flex items-center gap-1.5 mb-1.5">
            <button
              type="button"
              onClick={() => onSetVisibility(folder.id, "private")}
              className={cn(segBtn, folder.visibility === "private"
                ? "bg-[#E5F1FF] text-[#007BFF]"
                : "bg-[#F4F6FB] text-[#3A4565] hover:bg-[#EDF1F9]")}
            >
              <Lock size={13} /> Private
            </button>
            <button
              type="button"
              onClick={() => { if (folder.visibility !== "public") setConfirmPublicOpen(true); }}
              className={cn(segBtn, folder.visibility === "public"
                ? "bg-[#E5F1FF] text-[#007BFF]"
                : "bg-[#F4F6FB] text-[#3A4565] hover:bg-[#EDF1F9]")}
            >
              <Globe size={13} /> Public
            </button>
          </div>
          <p className="text-[11px] text-[#5F6A88] mb-3">
            {folder.visibility === "public"
              ? "Any staff member can view public notes in this folder. Notes stay private until each author makes their own note public."
              : "Only people and roles you add below can reach this folder’s public notes."}
          </p>

          {folder.visibility === "private" && (
            <>
              {shares.length > 0 && (
                <div className="flex flex-col gap-1.5 mb-3">
                  {shares.map((share) => (
                    <div key={share.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-[10px] bg-[#F4F6FB]">
                      <span className="text-[13px] text-[#3A4565] truncate">
                        {shareTargetLabel(share)}
                        {share.role && <span className="ml-1 text-[10px] font-semibold text-[#5F6A88] uppercase">role</span>}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <select
                          value={share.permission}
                          onChange={(e) => onChangeSharePermission(folder.id, share.id, e.target.value as "view" | "edit")}
                          className="text-[11px] font-medium text-[#3A4565] bg-white border border-[#E2E7F2] rounded-full px-2 py-0.5 outline-none cursor-pointer"
                        >
                          <option value="view">Can view</option>
                          <option value="edit">Can edit</option>
                        </select>
                        <IconTip label={`Remove ${shareTargetLabel(share)}`}>
                          <button
                            type="button"
                            onClick={() => onUnshare(folder.id, share.id)}
                            aria-label={`Remove ${shareTargetLabel(share)}`}
                            className="p-1 rounded-full text-[#5F6A88] hover:bg-white hover:text-[#C0392B] transition-colors cursor-pointer"
                          >
                            <X size={11} />
                          </button>
                        </IconTip>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[11px] font-semibold text-[#0B1533] mb-1.5">Add people or roles</p>
              <SharePicker
                aria-label="People and roles to share with" roles={ROLE_OPTIONS} people={pickerPeople} value={selection} onChange={setSelection}
                excludeRoles={excludeRoles} excludeUserIds={excludeUserIds}
              />

              {count > 0 && (
                <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-[#E2E7F2]">
                  <select
                    value={batchPermission}
                    onChange={(e) => setBatchPermission(e.target.value as "view" | "edit")}
                    aria-label="Access level for new people"
                    className="flex-1 min-w-0 text-[11px] font-medium text-[#3A4565] bg-white border border-[#E2E7F2] rounded-full px-2 py-1 outline-none cursor-pointer"
                  >
                    <option value="view">Can view</option>
                    <option value="edit">Can edit</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleShare}
                    className="text-[11px] font-semibold text-white bg-[#007BFF] hover:bg-[#0063D6] rounded-full px-3 py-1 cursor-pointer transition-colors shrink-0"
                  >
                    Share ({count})
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>

    {/* Task 337 — confirm before exposing the folder's public notes to all staff. */}
    <ConfirmDialog
      open={confirmPublicOpen}
      title="Make this folder public?"
      body="Any staff member will be able to view notes in this folder that their authors have made public. Notes stay private until each author opts in."
      confirmLabel="Proceed anyway"
      onConfirm={() => { setConfirmPublicOpen(false); onSetVisibility(folder.id, "public"); }}
      onCancel={() => setConfirmPublicOpen(false)}
    />
    </>
  );
}
