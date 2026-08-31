"use client";

import { useMemo, useState } from "react";
import { Globe, Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const [search, setSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedRoles, setSelectedRoles] = useState<Set<NoteFolderShareRole>>(new Set());
  const [batchPermission, setBatchPermission] = useState<"view" | "edit">("view");

  const sharedUserIds = useMemo(() => new Set(shares.filter((s) => s.user_id).map((s) => s.user_id!)), [shares]);
  const sharedRoles = useMemo(() => new Set(shares.filter((s) => s.role).map((s) => s.role!)), [shares]);

  const candidates = allMembers
    .filter((m) => m.id !== currentUserId && !sharedUserIds.has(m.id))
    .filter((m) => (m.full_name ?? "").toLowerCase().includes(search.toLowerCase()));

  const hasSelection = selectedUserIds.size > 0 || selectedRoles.size > 0;

  function toggleUser(id: string) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleRole(role: NoteFolderShareRole) {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  function handleShare() {
    if (!hasSelection) return;
    onShare(
      folder.id,
      { userIds: Array.from(selectedUserIds), roles: Array.from(selectedRoles) },
      batchPermission
    );
    setSelectedUserIds(new Set());
    setSelectedRoles(new Set());
    setSearch("");
  }

  function shareTargetLabel(share: NoteFolderShare) {
    if (share.role) return ROLE_LABEL[share.role] ?? share.role;
    return share.user?.full_name ?? "Unnamed";
  }

  const segBtn = "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-[10px] text-[12px] font-semibold transition-colors cursor-pointer";

  return (
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
              onClick={() => onSetVisibility(folder.id, "public")}
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

              <p className="text-[11px] font-semibold text-[#0B1533] mb-1.5">Add roles</p>
              <div className="grid grid-cols-2 gap-1 mb-3">
                {ROLE_OPTIONS.map((role) => {
                  const already = sharedRoles.has(role.value);
                  return (
                    <label
                      key={role.value}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-[10px] text-[12px] text-[#3A4565] cursor-pointer transition-colors hover:bg-[#F0F7FF]",
                        already && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      <input
                        type="checkbox"
                        disabled={already}
                        checked={already || selectedRoles.has(role.value)}
                        onChange={() => toggleRole(role.value)}
                        className="cursor-pointer accent-[#007BFF] shrink-0"
                      />
                      <span className="truncate">{role.label}</span>
                    </label>
                  );
                })}
              </div>

              <p className="text-[11px] font-semibold text-[#0B1533] mb-1.5">Add people</p>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people…"
                className="w-full px-2.5 py-1.5 rounded-[10px] border border-[#E2E7F2] bg-[#F4F6FB] text-[13px] outline-none transition-colors text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] placeholder:text-[#5F6A88] mb-1.5"
              />
              <div className="flex flex-col max-h-40 overflow-y-auto mb-2">
                {candidates.length === 0 && (
                  <p className="text-[11px] text-[#5F6A88] px-1 py-1">No matching people</p>
                )}
                {candidates.map((person) => (
                  <label
                    key={person.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-[10px] cursor-pointer transition-colors hover:bg-[#F0F7FF]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(person.id)}
                      onChange={() => toggleUser(person.id)}
                      className="cursor-pointer accent-[#007BFF] shrink-0"
                    />
                    <span className="flex-1 min-w-0 text-[13px] text-[#3A4565] truncate">{person.full_name ?? "Unnamed"}</span>
                    <span className="text-[10px] font-semibold text-[#5F6A88] uppercase shrink-0">{person.role}</span>
                  </label>
                ))}
              </div>

              {hasSelection && (
                <div className="flex items-center gap-1.5 pt-2 border-t border-[#E2E7F2]">
                  <select
                    value={batchPermission}
                    onChange={(e) => setBatchPermission(e.target.value as "view" | "edit")}
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
                    Share ({selectedUserIds.size + selectedRoles.size})
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
