"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { EMPTY_SELECTION, NESTED_MENU, SharePicker, type ShareSelection } from "@/components/share-picker";
import { IconTip } from "./_icon-tip";
import type { NoteCollaborator } from "./_notes-types";

// Task 311 — "add collaborator" control from image 3's toolbar. Task 313 — multi-select share: pick
// several people, then ONE permission applied to the whole batch when "Share" is clicked. Task 438 —
// the person list is now the shared SharePicker (searchable chips, people only — notes have no role
// shares), sourced from `allMembers` (already fetched by `getProjectDetailData()`).
export function NoteCollaboratorPicker({
  collaborators,
  allMembers,
  authorId,
  onShareMany,
  onChangePermission,
  onUnshare,
}: {
  collaborators: NoteCollaborator[];
  allMembers: { id: string; full_name: string | null; avatar_url: string | null; role: string }[];
  authorId: string;
  // Task 315 — one call for the whole batch (not one call per selected person) so the caller
  // can auto-create an unsaved note exactly once before sharing, instead of racing N creates.
  onShareMany: (userIds: string[], permission: "view" | "edit") => void;
  onChangePermission: (userId: string, permission: "view" | "edit") => void;
  onUnshare: (userId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<ShareSelection>(EMPTY_SELECTION);
  const [batchPermission, setBatchPermission] = useState<"view" | "edit">("view");
  const ref = useRef<HTMLDivElement>(null);

  // Reset the pending selection whenever the popover closes, so reopening it always starts
  // clean — called directly at each place that closes it (not from an effect keyed on `open`,
  // which would fire a synchronous cascading setState).
  function closePopover() {
    setOpen(false);
    setSelection(EMPTY_SELECTION);
    setBatchPermission("view");
  }

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Element;
      // The SharePicker's menu is portaled outside `ref`; clicks in it are still "inside".
      if (ref.current && !ref.current.contains(target) && !target.closest(NESTED_MENU)) closePopover();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const people = useMemo(() => allMembers.map((m) => ({ id: m.id, name: m.full_name ?? "Unnamed", role: m.role, avatarUrl: m.avatar_url })), [allMembers]);
  const excludeUserIds = useMemo(() => [authorId, ...collaborators.map((c) => c.user_id)], [authorId, collaborators]);

  function handleShare() {
    onShareMany(selection.userIds, batchPermission);
    setSelection(EMPTY_SELECTION);
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

          <SharePicker
            aria-label="People to share this note with" roles={[]} people={people} value={selection} onChange={setSelection}
            excludeUserIds={excludeUserIds} placeholder="Add people…"
          />

          {selection.userIds.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-[#E2E7F2]">
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
                Share ({selection.userIds.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
