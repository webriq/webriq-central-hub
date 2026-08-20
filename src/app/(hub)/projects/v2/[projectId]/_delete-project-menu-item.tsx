"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDeleteProject } from "@/hooks/use-delete-project";

export const DELETE_PROJECT_ROLES = ["admin", "pm", "super_admin"];

// Soft-deletes a project (status → "deleted", row never removed — task 231). Lives inside the
// Settings gear dropdown, mirroring "Set Project Owner"/"Manage Collaborators" but danger-styled.
// Deliberately does NOT close the parent dropdown on click — the ConfirmDialog's full-screen
// overlay (z-[60]) sits above the dropdown (z-30) either way, and closing the dropdown here would
// unmount this component (and the just-opened dialog with it), since the dropdown only renders
// while `settingsMenuOpen` is true.
export function DeleteProjectMenuItem({
  projectUrlKey, projectName, variant = "v2",
}: {
  projectUrlKey: string;
  projectName: string;
  // Task 282 — `_shared/_project-detail.tsx`'s settings gear reuses this component for both
  // variants (mirrors `_delete-project-action.tsx`'s own `variant` prop); defaults to "v2" so
  // Timeline/GenericPhaseView's existing v2-only call sites don't need updating.
  variant?: "legacy" | "v2";
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { deleteProject, deleting, error } = useDeleteProject();

  async function handleConfirm() {
    const ok = await deleteProject(projectUrlKey);
    if (ok) {
      setConfirmOpen(false);
      // Task 276 (Phase 3) — was `V2_ROUTES.PORTFOLIO_TRACKER`.
      router.push(variant === "legacy" ? "/projects/legacy" : "/projects/v2");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 text-left text-[12.5px] text-[#C0392B] transition-colors hover:bg-[#FDE8E6]"
      >
        <Trash2 size={13} /> Delete Project
      </button>

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
        <p className="px-3 pb-1.5 text-[11px] text-[#C0392B]">{error}</p>
      )}
    </>
  );
}
