"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ManageCollaboratorsModal } from "@/components/projects/manage-collaborators-modal";
import { canManageProjectMembers } from "@/lib/programme/membership-rules";

// Header-level action on the Projects detail page, mirroring Portfolio Tracker's Settings-menu
// "Manage Collaborators" item (see _generic-phase-view.tsx) — see _delete-project-action.tsx for
// the sibling action this is placed beside.
export function ManageCollaboratorsAction({
  projectDbId, projectName, currentUserRole, isCreator,
}: {
  projectDbId: string | null;
  projectName: string;
  currentUserRole: string | null;
  isCreator: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!projectDbId || !canManageProjectMembers(currentUserRole, isCreator)) return null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger render={
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Manage Collaborators"
            className="inline-flex cursor-pointer items-center justify-center rounded-full border border-[#E2E7F2] bg-white p-2.5 text-[#5F6A88] transition-colors hover:border-[#A8C6F5] hover:bg-[#E5F1FF] hover:text-[#007BFF]"
          >
            <Users size={13} />
          </button>
        } />
        <TooltipContent side="top">Manage Collaborators</TooltipContent>
      </Tooltip>

      <ManageCollaboratorsModal
        open={open}
        onClose={() => setOpen(false)}
        projectDbId={projectDbId}
        projectName={projectName}
      />
    </>
  );
}
