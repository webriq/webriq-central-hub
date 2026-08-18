"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Trash2, Users, Eye, Pencil, Crown, Tag } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ManageCollaboratorsModal } from "@/components/projects/manage-collaborators-modal";
import { SetProjectOwnerModal } from "@/components/projects/set-project-owner-modal";
import { UpdateClassificationModal } from "@/components/projects/update-classification-modal";
import { useDeleteProject } from "@/hooks/use-delete-project";
import { V2_ROUTES } from "@/config/constants";

const MENU_WIDTH = 192;
const MENU_HEIGHT = 280;

// Listing-card kebab menu (task 233; extended by task 264 with Manage Collaborators, and task 268
// with View Project / Rename Project / Set Project Owner / Update Classification) — soft-deletes
// a project from the Portfolio Tracker listing without opening it, reusing task 231's DELETE
// endpoint/hook/dialog verbatim (same pattern as task 232's Projects Grid card menu). Fixed-
// position dropdown anchored to the trigger's own rect, escaping the card's z-index stacking (see
// _projects-index.tsx's _project-card-menu.tsx / the original onboarding-workspace/_file-tile.tsx
// ActionsMenu this technique comes from).
//
// Unlike task 232's version, no `preventDefault`/`stopPropagation` calls are needed here: this
// component is rendered as a sibling *outside* the card's own clickable button/div (never nested
// inside it — see _onboarding-list.tsx's ProjectCard), so its clicks structurally can't reach the
// card's own onClick regardless.
export function PortfolioCardMenu({
  projectId, projectDbId, projectName, canDelete, canManageCollaborators, canSetOwner,
  hasProduct, currentClassification, onDeleted, onRename,
}: {
  projectId: string | null;
  projectDbId: string;
  projectName: string;
  canDelete: boolean;
  canManageCollaborators: boolean;
  canSetOwner: boolean;
  hasProduct: boolean;
  currentClassification: string | null;
  onDeleted: () => void;
  onRename: () => void;
}) {
  const router = useRouter();
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [classificationOpen, setClassificationOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { deleteProject, deleting, error } = useDeleteProject();

  function toggleMenu() {
    if (menuPos) { setMenuPos(null); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({
      x: Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8),
      y: Math.min(rect.bottom + 4, window.innerHeight - MENU_HEIGHT - 8),
    });
  }

  function openView() {
    setMenuPos(null);
    if (projectId) router.push(`${V2_ROUTES.PORTFOLIO_TRACKER}/${projectId}`);
  }

  function handleRename() {
    setMenuPos(null);
    onRename();
  }

  function openConfirm() {
    setMenuPos(null);
    setConfirmOpen(true);
  }

  function openCollaborators() {
    setMenuPos(null);
    setCollaboratorsOpen(true);
  }

  function openOwner() {
    setMenuPos(null);
    setOwnerOpen(true);
  }

  function openClassification() {
    setMenuPos(null);
    setClassificationOpen(true);
  }

  async function handleConfirm() {
    if (!projectId) return;
    const ok = await deleteProject(projectId);
    if (ok) {
      setConfirmOpen(false);
      // Task 263: this listing is now server-rendered (page.tsx -> _load-list-data.ts), matching
      // task 232's Grid card — onDeleted() calls router.refresh() to re-run the Server Component
      // and get fresh props, same as the Projects module.
      onDeleted();
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
          <div className="fixed inset-0 z-40" onClick={() => setMenuPos(null)} />
          <div
            className="fixed z-50 w-48 rounded-lg border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,.10)] py-1"
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            {projectId && (
              <button
                type="button"
                onClick={openView}
                className="flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-[12px] text-[#3A4565] cursor-pointer transition-colors hover:bg-[#F4F6FB]"
              >
                <Eye size={13} className="text-[#5F6A88]" /> View Project
              </button>
            )}
            {canManageCollaborators && (
              <button
                type="button"
                onClick={handleRename}
                className="flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-[12px] text-[#3A4565] cursor-pointer transition-colors hover:bg-[#F4F6FB]"
              >
                <Pencil size={13} className="text-[#5F6A88]" /> Rename Project
              </button>
            )}
            {canSetOwner && (
              <button
                type="button"
                onClick={openOwner}
                className="flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-[12px] text-[#3A4565] cursor-pointer transition-colors hover:bg-[#F4F6FB]"
              >
                <Crown size={13} className="text-[#5F6A88]" /> Set Project Owner
              </button>
            )}
            {canManageCollaborators && hasProduct && (
              <button
                type="button"
                onClick={openClassification}
                className="flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-[12px] text-[#3A4565] cursor-pointer transition-colors hover:bg-[#F4F6FB]"
              >
                <Tag size={13} className="text-[#5F6A88]" /> Update Classification
              </button>
            )}
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
              <>
                <div className="my-1 border-t border-[#EDF0F7]" />
                <button
                  type="button"
                  onClick={openConfirm}
                  className="flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-[12px] text-[#C0392B] cursor-pointer transition-colors hover:bg-[#FDE8E6]"
                >
                  <Trash2 size={13} /> Delete Project
                </button>
              </>
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
      <SetProjectOwnerModal
        open={ownerOpen}
        onClose={() => setOwnerOpen(false)}
        projectDbId={projectDbId}
        projectName={projectName}
      />
      {projectId && (
        <UpdateClassificationModal
          open={classificationOpen}
          onClose={() => setClassificationOpen(false)}
          projectId={projectId}
          projectName={projectName}
          currentClassification={currentClassification}
          onUpdated={() => router.refresh()}
        />
      )}
      {error && (
        <p className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md bg-white px-2 py-1 text-right text-[11px] text-[#C0392B] shadow-[0_4px_12px_rgba(7,17,51,.08)]">
          {error}
        </p>
      )}
    </div>
  );
}
