"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Trash2, Users } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ManageCollaboratorsModal } from "@/components/projects/manage-collaborators-modal";
import { useDeleteProject } from "@/hooks/use-delete-project";

const MENU_WIDTH = 192;
const MENU_HEIGHT = 44;

// Grid-card kebab menu (task 232) — soft-deletes a project from the listing without opening it,
// reusing task 231's DELETE endpoint/hook/dialog verbatim. Fixed-position dropdown anchored to the
// trigger's own rect, not `absolute`-anchored to the card, so adjacent grid cards (plain z-index:auto,
// later in DOM order) can't paint over it — same technique and reasoning as
// onboarding-workspace/_file-tile.tsx's ActionsMenu. Every handler here calls `preventDefault` (the
// whole card is a Next.js `<Link>` — matching this file's own `onClick={(e) => e.preventDefault()}`
// tags-row pattern) and `stopPropagation`.
export function ProjectCardMenu({
  projectId, projectDbId, projectName, canDelete, canManageCollaborators,
}: {
  projectId: string | null;
  projectDbId: string;
  projectName: string;
  canDelete: boolean;
  canManageCollaborators: boolean;
}) {
  const router = useRouter();
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { deleteProject, deleting, error } = useDeleteProject();

  function toggleMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (menuPos) { setMenuPos(null); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({
      x: Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8),
      y: Math.min(rect.bottom + 4, window.innerHeight - MENU_HEIGHT - 8),
    });
  }

  function closeMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos(null);
  }

  function openConfirm(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos(null);
    setConfirmOpen(true);
  }

  function openCollaborators(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos(null);
    setCollaboratorsOpen(true);
  }

  async function handleConfirm() {
    if (!projectId) return;
    const ok = await deleteProject(projectId);
    if (ok) {
      setConfirmOpen(false);
      // Stay on the listing (unlike the detail-page trigger, which redirects) — the deleted
      // card just needs the server query to re-run; page.tsx already excludes status="deleted".
      router.refresh();
    }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleMenu}
        aria-label="Project actions"
        title="Project actions"
        className="flex items-center justify-center w-6 h-6 rounded-md border-none bg-transparent text-[#5F6A88] hover:bg-[#EDF0F7] cursor-pointer transition-colors"
      >
        <MoreVertical size={14} />
      </button>

      {menuPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} />
          <div
            className="fixed z-50 w-48 rounded-lg border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,.10)] py-1"
            style={{ left: menuPos.x, top: menuPos.y }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            {canManageCollaborators && (
              <button
                type="button"
                onClick={openCollaborators}
                className="flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-[12px] text-[#3A4565] cursor-pointer transition-colors hover:bg-[#F4F6FB]"
              >
                <Users size={13} className="text-[#5F6A88]" /> Manage Collaborators
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={openConfirm}
                className="flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-[12px] text-[#C0392B] cursor-pointer transition-colors hover:bg-[#FDE8E6]"
              >
                <Trash2 size={13} /> Delete Project
              </button>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Delete "${projectName}"?`}
        body="This will remove the project from all views. This action is irreversible."
        confirmLabel={deleting ? "Deleting…" : "Delete Project"}
        confirmDisabled={deleting}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
      <ManageCollaboratorsModal
        open={collaboratorsOpen}
        onClose={() => setCollaboratorsOpen(false)}
        projectDbId={projectDbId}
        projectName={projectName}
      />
      {error && (
        <p className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md bg-white px-2 py-1 text-right text-[11px] text-[#C0392B] shadow-[0_4px_12px_rgba(7,17,51,.08)]">
          {error}
        </p>
      )}
    </div>
  );
}
