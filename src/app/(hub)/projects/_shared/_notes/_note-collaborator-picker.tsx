"use client";

import { useEffect, useRef, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTip } from "./_icon-tip";
import type { NoteCollaborator } from "./_notes-types";

// Task 311 — "add collaborator" control from image 3's toolbar. Search-to-add shape mirrors
// `onboarding-workspace/_permission-picker.tsx`'s `PermissionFields`, sourced from `allMembers`
// (already fetched by `getProjectDetailData()`, no separate staff-directory call) instead of a
// role-toggle row — here each added person gets a view/edit permission toggle instead.
export function NoteCollaboratorPicker({
  collaborators,
  allMembers,
  authorId,
  currentUserId,
  onShareMany,
  onChangePermission,
  onUnshare,
}: {
  collaborators: NoteCollaborator[];
  allMembers: { id: string; full_name: string | null; avatar_url: string | null; role: string }[];
  authorId: string;
  currentUserId: string;
  // Task 315 — one call for the whole batch (not one call per selected person) so the caller
  // can auto-create an unsaved note exactly once before sharing, instead of racing N creates.
  onShareMany: (userIds: string[], permission: "view" | "edit") => void;
  onChangePermission: (userId: string, permission: "view" | "edit") => void;
  onUnshare: (userId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Task 313 — multi-select share: checked candidate ids + one permission applied to the whole
  // batch when "Share" is clicked, instead of the old single-click-shares-immediately-at-"view"
  // interaction.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchPermission, setBatchPermission] = useState<"view" | "edit">("view");
  const ref = useRef<HTMLDivElement>(null);

  // Reset the pending selection whenever the popover closes, so reopening it always starts
  // clean — called directly at each place that closes it (not from an effect keyed on `open`,
  // which would fire a synchronous cascading setState).
  function closePopover() {
    setOpen(false);
    setSearch("");
    setSelectedIds(new Set());
    setBatchPermission("view");
  }

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) closePopover();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const sharedIds = new Set(collaborators.map((c) => c.user_id));
  const candidates = allMembers
    .filter((m) => m.id !== authorId && !sharedIds.has(m.id))
    .filter((m) => (m.full_name ?? "").toLowerCase().includes(search.toLowerCase()));

  const allFilteredSelected = candidates.length > 0 && candidates.every((c) => selectedIds.has(c.id));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) candidates.forEach((c) => next.delete(c.id));
      else candidates.forEach((c) => next.add(c.id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleShare() {
    onShareMany(Array.from(selectedIds), batchPermission);
    setSelectedIds(new Set());
    setSearch("");
  }

  return (
    <div className="relative" ref={ref}>
      <IconTip label="Add collaborator">
        <button
          type="button"
          onClick={() => (open ? closePopover() : setOpen(true))}
          aria-label="Add collaborator"
          className="p-1.5 rounded-full text-[#5F6A88] hover:bg-[#F4F6FB] hover:text-[#0B1533] transition-colors cursor-pointer"
        >
          <UserPlus size={16} />
        </button>
      </IconTip>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-40 w-72 rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,.10)] p-3">
          <p className="text-[11px] font-semibold text-[#0B1533] mb-2">Share this note</p>

          {collaborators.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-2 max-h-40 overflow-y-auto">
              {collaborators.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-[10px] bg-[#F4F6FB]">
                  <span className="text-[13px] text-[#3A4565] truncate">{c.user?.full_name ?? "Unnamed"}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <select
                      value={c.permission}
                      onChange={(e) => onChangePermission(c.user_id, e.target.value as "view" | "edit")}
                      className="text-[11px] font-medium text-[#3A4565] bg-white border border-[#E2E7F2] rounded-full px-2 py-0.5 outline-none cursor-pointer"
                    >
                      <option value="view">Can view</option>
                      <option value="edit">Can edit</option>
                    </select>
                    <IconTip label={`Remove ${c.user?.full_name ?? "collaborator"}`}>
                      <button
                        type="button"
                        onClick={() => onUnshare(c.user_id)}
                        aria-label={`Remove ${c.user?.full_name ?? "collaborator"}`}
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

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people…"
            className="w-full px-2.5 py-1.5 rounded-[10px] border border-[#E2E7F2] bg-[#F4F6FB] text-[13px] outline-none transition-colors text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] placeholder:text-[#5F6A88] mb-1.5"
          />
          {candidates.length > 0 && (
            <label className="flex items-center gap-2 px-2 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                className="cursor-pointer accent-[#007BFF]"
              />
              <span className="text-[11px] font-semibold text-[#5F6A88]">
                Select all{search ? " (matching)" : ""}
              </span>
            </label>
          )}
          <div className="flex flex-col max-h-32 overflow-y-auto">
            {candidates.length === 0 && (
              <p className="text-[11px] text-[#5F6A88] px-1 py-1">No matching people</p>
            )}
            {candidates.map((person) => (
              <label
                key={person.id}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-[10px] cursor-pointer transition-colors hover:bg-[#F0F7FF]",
                  person.id === currentUserId && "opacity-60"
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(person.id)}
                  onChange={() => toggleOne(person.id)}
                  className="cursor-pointer accent-[#007BFF] shrink-0"
                />
                <span className="flex-1 min-w-0 text-[13px] text-[#3A4565] truncate">{person.full_name ?? "Unnamed"}</span>
                <span className="text-[10px] font-semibold text-[#5F6A88] uppercase shrink-0">{person.role}</span>
              </label>
            ))}
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-[#E2E7F2]">
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
                Share ({selectedIds.size})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
