"use client";

import { TestPill } from "@/components/test-pill";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { OnboardingStatusPill } from "../../dashboard/_components/dashboard-shared";
import { AvatarStack } from "./_avatar-stack";
import { PortfolioCardMenu } from "./_portfolio-card-menu";
import { EditableProjectTitle, type EditableProjectTitleHandle } from "@/components/projects/editable-project-title";
import {
  ProjectOpenWrapper, ProjectPhaseLine, ProjectProgress, showProjectMenu, type ProjectListEntryProps,
} from "./_project-card-parts";

// Fixed 4-slot layout — header / company / progress-or-status row / phase row / footer — always
// rendered (never conditionally omitted) so every card in a grid row is the same height
// regardless of project state. See task 167. Shared pieces live in _project-card-parts.tsx
// (task 480, also used by the list view's ProjectRow).
export function ProjectCard(props: ProjectListEntryProps) {
  const { item, editable, canDelete, canManageCollaborators, canSetOwner, onDeleted, onSearchName } = props;
  const router = useRouter();
  const showMenu = showProjectMenu(props);
  const titleRef = useRef<EditableProjectTitleHandle>(null);

  return (
    <ProjectOpenWrapper
      item={item}
      editable={editable}
      className="h-full"
      menuClassName="top-4 right-4"
      menu={showMenu ? (
        <PortfolioCardMenu
          projectId={item.project_id}
          projectDbId={item.id}
          projectName={item.project_name}
          canDelete={canDelete && !!item.project_id}
          canManageCollaborators={canManageCollaborators}
          canSetOwner={canSetOwner}
          hasProduct={item.hasProduct}
          currentClassifications={item.classifications}
          onDeleted={onDeleted}
          onRename={() => titleRef.current?.startEditing()}
        />
      ) : null}
    >
      <div
        className={cn(
          "h-full flex flex-col rounded-[14px] border bg-white p-4 transition-colors",
          editable ? "border-[#E2E7F2] hover:border-[#A8C6F5] cursor-pointer" : "border-[#EDF0F7]"
        )}
      >
        {/* Header: title + status */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="min-w-0 flex-1">
            <EditableProjectTitle
              ref={titleRef}
              name={item.project_name}
              projectId={item.project_id}
              canRename={canManageCollaborators}
              onRenamed={() => router.refresh()}
              onSearchName={onSearchName}
              className="text-[13px] font-semibold text-[#0B1533] truncate block"
            />
            <div className="inline-flex items-center gap-1 text-[12px] text-[#5F6A88] truncate">
              <Building2 size={11} /> {item.company_name}
              {item.is_test && <TestPill />}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <OnboardingStatusPill status={item.status} />
            {/* Reserves room for the overlaid PortfolioCardMenu so the status pill shifts left
                instead of being covered. */}
            {showMenu && <div className="w-6 h-6" />}
          </div>
        </div>

        {/* Progress row — always present */}
        <ProjectProgress item={item} className="mb-1.5" />

        {/* Phase / status line — always present, one line */}
        <ProjectPhaseLine item={item} className="mb-3" />

        {/* Footer — always present */}
        {/* Task 481 — no classification chip: the active tab already is the classification. */}
        <div className="mt-auto pt-2.5 border-t border-[#EDF0F7] flex items-center justify-end gap-2">
          <AvatarStack members={item.members} />
        </div>
      </div>
    </ProjectOpenWrapper>
  );
}
