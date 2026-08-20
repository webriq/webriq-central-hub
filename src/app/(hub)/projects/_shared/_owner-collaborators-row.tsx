"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { mapMembers, type MemberRow, type RawMemberRow } from "@/components/projects/member-types";
import { AvatarCircle, CollaboratorAvatars } from "@/app/(hub)/projects/v2/[projectId]/_onboarding-detail";

// Task 282 (item C) — the header's Owner/Collaborators secondary row, shared by every V2/Legacy
// tab (`_project-detail.tsx`'s 8 shared tabs, `_coming-soon-overview.tsx`, the new Legacy
// Overview page). Previously only Timeline (`_onboarding-detail.tsx`) showed this. Fetches the
// same `GET /api/projects/[projectId]/members` endpoint `_members-tab.tsx`/
// `manage-collaborators-modal.tsx` already use, rather than adding a server-side query to every
// caller's own loader. No "Manually tagged" indicator here — that's a customer-phases-engine-
// only concept that only ever applied to Timeline.
export function OwnerCollaboratorsRow({ projectDbId }: { projectDbId: string }) {
  const [members, setMembers] = useState<MemberRow[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${projectDbId}/members`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: RawMemberRow[]) => setMembers(mapMembers(Array.isArray(data) ? data : [])))
      .catch(() => {});
  }, [projectDbId]);

  const owner = members.find((m) => m.is_owner) ?? null;
  const collaborators = members.filter((m) => !m.is_owner);
  const ownerDisplayName = owner?.full_name ?? null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#5F6A88]">
      <span className="inline-flex items-center gap-1.5">
        Owner: {ownerDisplayName ? <AvatarCircle name={ownerDisplayName} size={18} /> : <Users size={12} />}
        <span className="font-medium text-[#3A4565]">{ownerDisplayName ?? "Unassigned"}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        Collaborators: <CollaboratorAvatars members={collaborators} />
      </span>
    </div>
  );
}
