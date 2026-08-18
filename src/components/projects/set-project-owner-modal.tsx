"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Crown, X } from "lucide-react";
import { mapMembers, type MemberRow, type RawMemberRow } from "./member-types";

// Task 268 — modal version of the Portfolio Tracker detail page's inline "Set Project Owner"
// panel (_onboarding-detail.tsx's OwnerPanel), same transform task 264 already did for
// CollaboratorsPanel → ManageCollaboratorsModal. Transfer target must already be a collaborator —
// this mirrors that constraint (no "add and immediately set as owner" shortcut). `projectDbId`
// is the project's UUID `id`, PATCHes the already-generic /api/projects/[projectId]/members
// route (no API changes needed). Rendered via createPortal(document.body) — same reasoning as
// ManageCollaboratorsModal (avoids being a DOM descendant of the card's own <Link>).
export function SetProjectOwnerModal({
  open, onClose, projectDbId, projectName,
}: {
  open: boolean;
  onClose: () => void;
  projectDbId: string;
  projectName: string;
}) {
  const [loading, startFetchTransition] = useTransition();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    startFetchTransition(async () => {
      setError(null);
      try {
        const data: RawMemberRow[] = await fetch(`/api/projects/${projectDbId}/members`, { signal: ctrl.signal }).then((res) => (res.ok ? res.json() : []));
        setMembers(mapMembers(Array.isArray(data) ? data : []));
      } catch {
        setError("Failed to load project members.");
      }
    });
    return () => ctrl.abort();
  }, [open, projectDbId]);

  if (!open) return null;

  function handleClose() {
    setError(null);
    onClose();
  }

  const owner = members.find((m) => m.is_owner) ?? null;
  const candidates = members.filter((m) => !m.is_owner);

  async function handleTransfer(userId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectDbId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to transfer ownership");
      }
      const refreshed: RawMemberRow[] = await fetch(`/api/projects/${projectDbId}/members`).then((r) => (r.ok ? r.json() : []));
      setMembers(mapMembers(Array.isArray(refreshed) ? refreshed : []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to transfer ownership");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#071133]/40 p-4"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleClose(); }}
    >
      <div
        className="w-full max-w-md rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] p-5 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center shrink-0 w-9 h-9 rounded-full bg-[#FFF1E0] text-[#B85512]">
              <Crown size={16} />
            </div>
            <div className="flex flex-col gap-0.5 pt-0.5">
              <h2 className="text-[14px] font-semibold text-[#0B1533]">Set project owner</h2>
              <p className="text-[12px] text-[#5F6A88] truncate max-w-[260px]">{projectName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            title="Close"
            className="shrink-0 cursor-pointer rounded-md border-none bg-transparent p-1 text-[#5F6A88] transition-colors hover:bg-[#F4F6FB] hover:text-[#3A4565]"
          >
            <X size={15} />
          </button>
        </div>

        {error && <p className="text-[11.5px] text-[#C0392B]">{error}</p>}

        {loading ? (
          <p className="text-[12px] text-[#5F6A88] py-2">Loading members…</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {owner ? (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E7F2] bg-white py-1 pl-1 pr-2.5 text-[11.5px]">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#007BFF]/10 text-[9px] font-bold text-[#007BFF]">
                    {(owner.full_name ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                  <span className="font-medium text-[#3A4565]">{owner.full_name ?? "Unnamed"}</span>
                  <Crown size={11} className="text-[#B85512]" aria-label="Current owner" />
                </div>
              ) : (
                <span className="text-[11.5px] text-[#5F6A88]">No owner set yet.</span>
              )}
              <select
                value=""
                disabled={busy || candidates.length === 0}
                onChange={(e) => { if (e.target.value) handleTransfer(e.target.value); e.target.value = ""; }}
                className="rounded-full border border-dashed border-[#A8C6F5] bg-white px-2.5 py-1 text-[11px] text-[#5F6A88] disabled:opacity-50"
              >
                <option value="">{candidates.length === 0 ? "No other collaborators yet" : "Transfer to…"}</option>
                {candidates.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.full_name ?? "Unnamed"} ({m.role})</option>
                ))}
              </select>
            </div>
            <p className="text-[10.5px] text-[#5F6A88]">
              The new owner must already be a collaborator — add them via Manage Collaborators first
              if they aren&apos;t listed.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
