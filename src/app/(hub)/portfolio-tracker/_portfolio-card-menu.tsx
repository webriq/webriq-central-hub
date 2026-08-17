"use client";

import { useRef, useState } from "react";
import { MoreVertical, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDeleteProject } from "@/hooks/use-delete-project";

const MENU_WIDTH = 160;
const MENU_HEIGHT = 44;

// Listing-card kebab menu (task 233) — soft-deletes a project from the Portfolio Tracker listing
// without opening it, reusing task 231's DELETE endpoint/hook/dialog verbatim (same pattern as
// task 232's Projects Grid card menu). Fixed-position dropdown anchored to the trigger's own rect,
// escaping the card's z-index stacking (see _projects-index.tsx's _project-card-menu.tsx / the
// original onboarding-workspace/_file-tile.tsx ActionsMenu this technique comes from).
//
// Unlike task 232's version, no `preventDefault`/`stopPropagation` calls are needed here: this
// component is rendered as a sibling *outside* the card's own clickable button/div (never nested
// inside it — see _onboarding-list.tsx's ProjectCard), so its clicks structurally can't reach the
// card's own onClick regardless.
export function PortfolioCardMenu({
  projectId, projectName, onDeleted,
}: {
  projectId: string;
  projectName: string;
  onDeleted: () => void;
}) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
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

  function openConfirm() {
    setMenuPos(null);
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    const ok = await deleteProject(projectId);
    if (ok) {
      setConfirmOpen(false);
      // Unlike task 232's Grid card (server-rendered list, where router.refresh() re-runs the
      // Server Component and yields fresh props), this listing fetches its own data client-side
      // (`useEffect(..., [retryKey])` in _onboarding-list.tsx) — router.refresh() would be a no-op
      // here. onDeleted() bumps that retryKey instead, reusing the same refetch mechanism the
      // listing's own "Try again" button already triggers.
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
            className="fixed z-50 w-40 rounded-lg border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,.10)] py-1"
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            <button
              type="button"
              onClick={openConfirm}
              className="flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-[12px] text-[#C0392B] cursor-pointer transition-colors hover:bg-[#FDE8E6]"
            >
              <Trash2 size={13} /> Delete Project
            </button>
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
      {error && (
        <p className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md bg-white px-2 py-1 text-right text-[11px] text-[#C0392B] shadow-[0_4px_12px_rgba(7,17,51,.08)]">
          {error}
        </p>
      )}
    </div>
  );
}
