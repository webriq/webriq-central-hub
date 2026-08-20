"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Crown, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { canManageProjectMembers, canSetProjectOwner } from "@/lib/programme/membership-rules";
import { ManageCollaboratorsModal } from "@/components/projects/manage-collaborators-modal";
import { mapMembers, type MemberRow, type RawMemberRow } from "@/components/projects/member-types";

// Task 276 — persistent Members tab, shared by both `/projects/legacy/[projectId]` and
// `/projects/v2/[projectId]`. Wraps the existing `GET/POST/PATCH/DELETE
// /api/projects/[projectId]/members` endpoint (no API changes) and promotes
// `_manage-collaborators-action.tsx`'s modal (already generic — `@/components/projects/
// manage-collaborators-modal`) from a header icon-button trigger into a full tab view: the modal
// still owns the "search + stage + add" flow, this tab additionally lists every current member in
// a table (avatar / name / role / owner) with inline remove + "Make owner" actions.

const AVATAR_COLORS = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"];
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin", super_admin: "Super Admin", pm: "PM", developer: "Developer", hr: "HR", marketing: "Marketing", client: "Client",
};

function initialsFor(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
function colorFor(name: string | null): string {
  if (!name) return "#5F6A88";
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

export function MembersTab({
  projectDbId, projectName, currentUserRole, isCreator,
}: {
  projectDbId: string;
  projectName: string;
  currentUserRole: string | null;
  isCreator: boolean;
}) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // Task 276 — `isPending` (not a manual `loading` state) avoids the react-hooks/set-state-in-
  // effect cascading-render lint rule, same wrapped-async-transition pattern this codebase already
  // uses for fetch-on-mount effects (e.g. `manage-collaborators-modal.tsx`).
  const [loading, startTransition] = useTransition();

  const canManage = canManageProjectMembers(currentUserRole, isCreator);
  const canSetOwner = canSetProjectOwner(currentUserRole, isCreator);

  const load = useCallback(() => {
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch(`/api/projects/${projectDbId}/members`);
        if (!res.ok) throw new Error();
        const data: RawMemberRow[] = await res.json();
        setMembers(mapMembers(Array.isArray(data) ? data : []));
      } catch {
        setError("Failed to load project members.");
      }
    });
  }, [projectDbId]);

  useEffect(() => { load(); }, [load]);

  async function handleRemove(userId: string) {
    setBusyId(userId);
    try {
      const res = await fetch(`/api/projects/${projectDbId}/members?user_id=${userId}`, { method: "DELETE" });
      if (res.ok) setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSetOwner(userId: string) {
    setBusyId(userId);
    try {
      const res = await fetch(`/api/projects/${projectDbId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (res.ok) {
        setMembers((prev) => prev.map((m) => ({ ...m, is_owner: m.user_id === userId })));
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="px-8 py-5 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] text-[#5F6A88]">
          {members.length} collaborator{members.length === 1 ? "" : "s"} on this project.
        </p>
        {canManage && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-[6.5px] rounded-full bg-[#FB914E] text-[#471F02] text-[11px] font-semibold hover:bg-[#E2762F] hover:text-white cursor-pointer transition-colors"
          >
            <Users size={13} /> Add collaborator
          </button>
        )}
      </div>

      {error && <p className="text-[12px] text-[#C0392B] mb-3">{error}</p>}

      <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[560px]">
          <thead>
            <tr className="bg-[#FAFBFE] border-b border-[#EDF0F7]">
              <th className="pl-[18px] px-3 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Member</th>
              <th className="px-3 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Role</th>
              <th className="px-3 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]">Status</th>
              {canManage && <th className="px-3 py-2.5 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] text-right pr-[18px]">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-[18px] py-8 text-center text-[12px] text-[#5F6A88]">Loading members…</td></tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-[18px] py-12">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Users size={24} className="text-[#B7BFD6]" />
                    <p className="text-[13px] font-medium text-[#0B1533]">No collaborators yet</p>
                    <p className="text-[12px] text-[#5F6A88]">
                      {canManage ? "Add teammates to give them access to this project." : "No one has been added to this project yet."}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.id} className="border-b border-[#EDF0F7] last:border-b-0 hover:bg-[#F0F7FF] transition-colors">
                  <td className="pl-[18px] px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                        style={{ background: colorFor(m.full_name) }}
                      >
                        {initialsFor(m.full_name)}
                      </div>
                      <span className="text-[13px] font-medium text-[#0B1533]">{m.full_name ?? "Unnamed"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[12px] text-[#3A4565]">{ROLE_LABEL[m.role ?? ""] ?? (m.role ?? "—")}</td>
                  <td className="px-3 py-3">
                    {m.is_owner ? (
                      <span className="inline-flex items-center gap-1 rounded-[5px] bg-[#FFF3E5] px-2 py-0.5 text-[10px] font-bold text-[#B85512]">
                        <Crown size={10} /> Owner
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#5F6A88]">Collaborator</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-3 py-3 pr-[18px]">
                      <div className="flex items-center justify-end gap-2">
                        {canSetOwner && !m.is_owner && (
                          <button
                            type="button"
                            onClick={() => handleSetOwner(m.user_id)}
                            disabled={busyId === m.user_id}
                            className="text-[11px] font-medium text-[#007BFF] hover:text-[#0063D6] cursor-pointer transition-colors disabled:opacity-45"
                          >
                            {busyId === m.user_id ? <Loader2 size={12} className="animate-spin" /> : "Make owner"}
                          </button>
                        )}
                        {!m.is_owner && (
                          <button
                            type="button"
                            onClick={() => handleRemove(m.user_id)}
                            disabled={busyId === m.user_id}
                            className={cn(
                              "text-[11px] font-medium text-[#C0392B] hover:text-[#96271E] cursor-pointer transition-colors disabled:opacity-45"
                            )}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ManageCollaboratorsModal
        open={addOpen}
        onClose={() => { setAddOpen(false); void load(); }}
        projectDbId={projectDbId}
        projectName={projectName}
      />
    </div>
  );
}
