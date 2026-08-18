"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Crown, Users, X } from "lucide-react";
import { mapMembers, type MemberRow, type RawMemberRow } from "./member-types";

type StaffPerson = { id: string; full_name: string | null; role: string };

// Task 264 — modal version of the Portfolio Tracker detail page's inline "Manage Collaborators"
// panel (_onboarding-detail.tsx's CollaboratorsPanel), reused across 3 surfaces (Projects listing,
// Portfolio Tracker listing, Projects detail page) that don't have that page's layout to host an
// inline panel. Deliberately not imported from that route-group's page file (cross-route-group
// import) — this is a fresh, minimal implementation against the same already-generic
// GET/POST/DELETE /api/projects/[projectId]/members + GET /api/staff-directory endpoints.
// `projectDbId` is the project's UUID `id` (not the display `project_id`) — matches the only other
// caller of the members route (_onboarding-detail.tsx:1280).
// Rendered via createPortal(document.body) — same pattern as this codebase's other overlay
// dropdowns (_project-detail.tsx's filter dropdown, _onboarding-detail.tsx's wizard popovers).
// Not optional here: the Projects module's grid-card trigger (_project-card-menu.tsx) is nested
// inside that card's own `<Link>`, so without a portal this modal's backdrop/content would be a
// DOM descendant of the Link and any click reaching it (even after stopPropagation on the modal's
// own elements) risks the click event's remaining native bubble/default-action path still
// resolving against the surrounding anchor. Portaling out of the Link's subtree entirely removes
// that risk regardless of propagation-order specifics.
export function ManageCollaboratorsModal({
  open, onClose, projectDbId, projectName,
}: {
  open: boolean;
  onClose: () => void;
  projectDbId: string;
  projectName: string;
}) {
  const [loading, startFetchTransition] = useTransition();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [staffDirectory, setStaffDirectory] = useState<StaffPerson[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [staged, setStaged] = useState<string[]>([]);

  // Wrapped in startTransition (not bare setState calls in the effect body) — this codebase's
  // established workaround for the `react-hooks/set-state-in-effect` rule, mirrored from
  // `_task-issue-picker.tsx`'s own fetch effect (tasks 226/228).
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    startFetchTransition(async () => {
      setError(null);
      try {
        const [membersData, staffData]: [RawMemberRow[], StaffPerson[]] = await Promise.all([
          fetch(`/api/projects/${projectDbId}/members`, { signal: ctrl.signal }).then((res) => (res.ok ? res.json() : [])),
          fetch("/api/staff-directory", { signal: ctrl.signal }).then((res) => (res.ok ? res.json() : [])),
        ]);
        setMembers(mapMembers(Array.isArray(membersData) ? membersData : []));
        setStaffDirectory(Array.isArray(staffData) ? staffData : []);
      } catch {
        setError("Failed to load collaborators.");
      }
    });
    return () => ctrl.abort();
  }, [open, projectDbId]);

  if (!open) return null;

  function handleClose() {
    setSearch("");
    setDropdownOpen(false);
    setStaged([]);
    setError(null);
    onClose();
  }

  const memberIds = new Set(members.map((m) => m.user_id));
  const stagedIds = new Set(staged);
  const candidates = staffDirectory
    .filter((p) => !memberIds.has(p.id) && !stagedIds.has(p.id))
    .filter((p) => (p.full_name ?? "").toLowerCase().includes(search.toLowerCase()));
  const stagedPeople = staged
    .map((id) => staffDirectory.find((p) => p.id === id))
    .filter((p): p is StaffPerson => !!p);

  async function handleAdd() {
    if (staged.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectDbId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: staged }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to add collaborators");
      }
      setStaged([]);
      const refreshed: RawMemberRow[] = await fetch(`/api/projects/${projectDbId}/members`).then((r) => (r.ok ? r.json() : []));
      setMembers(mapMembers(Array.isArray(refreshed) ? refreshed : []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add collaborators");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(userId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectDbId}/members?user_id=${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to remove collaborator");
      }
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove collaborator");
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
            <div className="flex items-center justify-center shrink-0 w-9 h-9 rounded-full bg-[#E5F1FF] text-[#007BFF]">
              <Users size={16} />
            </div>
            <div className="flex flex-col gap-0.5 pt-0.5">
              <h2 className="text-[14px] font-semibold text-[#0B1533]">Manage collaborators</h2>
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
          <p className="text-[12px] text-[#5F6A88] py-2">Loading collaborators…</p>
        ) : (
          <>
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setDropdownOpen(true); }}
                onFocus={() => setDropdownOpen(true)}
                onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                disabled={busy}
                placeholder="Search people to add…"
                className="w-full rounded-md border border-[#E2E7F2] bg-white px-2.5 py-1.5 text-[12px] text-[#0B1533] outline-none transition-colors placeholder:text-[#5F6A88] focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] disabled:opacity-50"
              />
              {dropdownOpen && (
                <div className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-[#E2E7F2] bg-white shadow-lg">
                  {candidates.length === 0 ? (
                    <div className="px-2.5 py-1.5 text-[11.5px] text-[#5F6A88]">
                      {staffDirectory.length === 0 ? "No staff directory entries found." : "No matches."}
                    </div>
                  ) : (
                    candidates.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setStaged((prev) => [...prev, person.id]); setSearch(""); }}
                        className="block w-full cursor-pointer border-none bg-transparent px-2.5 py-1.5 text-left text-[11.5px] text-[#3A4565] transition-colors hover:bg-[#F4F6FB]"
                      >
                        {person.full_name ?? "Unnamed"} <span className="text-[#5F6A88]">({person.role})</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {stagedPeople.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg border border-dashed border-[#A8C6F5] bg-[#F4F6FB] p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {stagedPeople.map((p) => (
                    <PersonChip
                      key={p.id}
                      label={p.full_name ?? "Unnamed"}
                      sublabel={p.role}
                      onRemove={() => setStaged((prev) => prev.filter((id) => id !== p.id))}
                      disabled={busy}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={busy}
                    className="cursor-pointer rounded-full border-none bg-[#007BFF] px-3 py-1 text-[11.5px] font-semibold text-white transition-colors hover:bg-[#0063D6] disabled:opacity-50"
                  >
                    Add {stagedPeople.length}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStaged([])}
                    disabled={busy}
                    className="cursor-pointer border-none bg-transparent text-[11.5px] font-medium text-[#5F6A88] transition-colors hover:text-[#3A4565] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5 max-h-48 overflow-y-auto">
              {members.length === 0 && <span className="text-[11.5px] text-[#5F6A88]">No collaborators added yet.</span>}
              {members.map((m) => (
                <PersonChip
                  key={m.user_id}
                  label={m.full_name ?? "Unnamed"}
                  sublabel={m.role ?? ""}
                  isOwner={m.is_owner}
                  onRemove={!m.is_owner ? () => handleRemove(m.user_id) : undefined}
                  disabled={busy}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

function PersonChip({ label, sublabel, isOwner, onRemove, disabled }: {
  label: string; sublabel: string; isOwner?: boolean; onRemove?: () => void; disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E2E7F2] bg-white py-1 pl-1 pr-2 text-[11.5px]">
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#007BFF]/10 text-[9px] font-bold text-[#007BFF]">
        {(label || "?").slice(0, 1).toUpperCase()}
      </div>
      <span className="font-medium text-[#3A4565]">{label}</span>
      {sublabel && <span className="text-[10px] text-[#5F6A88]">{sublabel}</span>}
      {isOwner && <Crown size={11} className="text-[#B85512]" aria-label="Owner" />}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          title="Remove"
          aria-label={`Remove ${label}`}
          className="cursor-pointer rounded-full border-none bg-transparent p-0.5 text-[#5F6A88] transition-colors hover:text-[#C0392B] disabled:opacity-50"
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}
