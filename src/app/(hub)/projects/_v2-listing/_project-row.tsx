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

// Task 480 — List view entry: one full-width row card per project, the grid card's data laid out
// horizontally. On md+ everything sits on one line; below md it wraps into an identity/status top
// line and a progress/phase/members second line.
export function ProjectRow(props: ProjectListEntryProps) {
  const { item, editable, canDelete, canManageCollaborators, canSetOwner, onDeleted, onSearchName } = props;
  const router = useRouter();
  const showMenu = showProjectMenu(props);
  const titleRef = useRef<EditableProjectTitleHandle>(null);

  return (
    <ProjectOpenWrapper
      item={item}
      editable={editable}
      // No transform for centring: a transformed ancestor re-anchors the menu's position:fixed dropdown (task 481).
      menuClassName="top-3 right-3 md:top-0 md:bottom-0 md:flex md:items-center"
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
          "flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-2 rounded-[14px] border bg-white px-4 py-3 transition-colors",
          showMenu && "pr-11",
          editable ? "border-[#E2E7F2] hover:border-[#A8C6F5] cursor-pointer" : "border-[#EDF0F7]"
        )}
      >
        {/* Identity */}
        <div className="min-w-0 flex-1 basis-48">
          <EditableProjectTitle
            ref={titleRef}
            name={item.project_name}
            projectId={item.project_id}
            canRename={canManageCollaborators}
            onRenamed={() => router.refresh()}
            onSearchName={onSearchName}
            className="text-[13px] font-semibold text-[#0B1533] truncate block"
          />
          <div className="flex items-center gap-1 text-[12px] text-[#5F6A88] min-w-0">
            <Building2 size={11} className="shrink-0" />
            <span className="truncate">{item.company_name}</span>
            {item.is_test && <TestPill />}
          </div>
        </div>

        {/* Every column after the identity has a fixed width on md+, so columns line up across
            rows like a table even though each row is its own card. */}

        {/* Status — top line on mobile (next to identity), far right on md+ */}
        <div className="shrink-0 md:order-last md:w-24 md:flex md:justify-end">
          <OnboardingStatusPill status={item.status} />
        </div>

        {/* Line break on mobile */}
        <div className="basis-full h-0 md:hidden" />

        <ProjectPhaseLine item={item} className="shrink-0 md:w-52" />

        {/* Fixed-width Day label → every bar is the same length. */}
        <ProjectProgress item={item} className="flex-1 md:flex-none md:w-72 min-w-0" barClassName="flex-1" labelClassName="md:w-36" />

        <div className="shrink-0 md:w-36 flex md:justify-end">
          <AvatarStack members={item.members} />
        </div>
      </div>
    </ProjectOpenWrapper>
  );
}
