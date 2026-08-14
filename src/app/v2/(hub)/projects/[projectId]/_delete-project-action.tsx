"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDeleteProject } from "@/hooks/use-delete-project";
import { V2_ROUTES } from "@/config/constants";

const DELETE_ROLES = ["admin", "pm", "super_admin"];

// Soft-deletes a project (status → "deleted", row never removed — task 231). Header-level
// action on the Projects detail page, mirroring Portfolio Tracker's Settings-menu placement
// of the same action (see _delete-project-menu-item.tsx).
export function DeleteProjectAction({
  projectId, projectName, currentUserRole,
}: {
  projectId: string | null;
  projectName: string;
  currentUserRole: string | null;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { deleteProject, deleting, error } = useDeleteProject();

  if (!currentUserRole || !DELETE_ROLES.includes(currentUserRole) || !projectId) return null;

  async function handleConfirm() {
    const ok = await deleteProject(projectId!);
    if (ok) {
      setConfirmOpen(false);
      router.push(V2_ROUTES.PROJECTS);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        aria-label="Delete Project"
        title="Delete Project"
        className="inline-flex cursor-pointer items-center justify-center rounded-full border border-[#E2E7F2] bg-white p-2.5 text-[#5F6A88] transition-colors hover:border-[#F5B8B1] hover:bg-[#FDE8E6] hover:text-[#C0392B]"
      >
        <Trash2 size={13} />
      </button>

      {error && (
        <p className="absolute right-0 top-full mt-1 w-56 text-right text-[11px] text-[#C0392B]">
          {error}
        </p>
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
    </div>
  );
}
