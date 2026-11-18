"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { TagChip, businessDaysRemaining } from "@/app/(hub)/projects-old/_pm-shared";
import { ProjectCardMenu } from "./_project-card-menu";
import { AvatarStack, ProjectStatusChip, ProjectTypeChip, ProgressStat } from "./_project-card-shared";
import { EditableProjectTitle, type EditableProjectTitleHandle } from "@/components/projects/editable-project-title";
import type { ProjectListItem } from "./_projects-index";

// Task 485 — List view: one full-width row card per project (replaces the old <table>, which had
// no kebab and no prefetch). Same "stretched link" structure as ProjectGridCard — read its comment
// in _project-grid-view.tsx for why the Link is empty and content is pointer-events-none.
export function ListView({
  projects, canManageTags, canDeleteProjects, getTagsFor, removeTag, onSearchName,
}: {
  projects: ProjectListItem[];
  canManageTags: boolean;
  canDeleteProjects: boolean;
  getTagsFor: (p: ProjectListItem) => string[];
  removeTag: (id: string, projectId: string | null, currentTags: string[], tag: string) => void;
  onSearchName: (name: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {projects.map((p) => (
        <ProjectListRow
          key={p.id}
          project={p}
          canManageTags={canManageTags}
          canDeleteProjects={canDeleteProjects}
          tags={getTagsFor(p)}
          removeTag={removeTag}
          onSearchName={onSearchName}
        />
      ))}
    </div>
  );
}

function ProjectListRow({
  project: p, canManageTags, canDeleteProjects, tags, removeTag, onSearchName,
}: {
  project: ProjectListItem;
  canManageTags: boolean;
  canDeleteProjects: boolean;
  tags: string[];
  removeTag: (id: string, projectId: string | null, currentTags: string[], tag: string) => void;
  onSearchName: (name: string) => void;
}) {
  const router = useRouter();
  const pct = p.task_total > 0 ? Math.round((p.task_done / p.task_total) * 100) : 0;
  const daysLeft = businessDaysRemaining(p.end_date);
  const titleRef = useRef<EditableProjectTitleHandle>(null);
  const projectHref = p.project_id ? `${V2_ROUTES.PROJECTS_LEGACY}/${p.project_id}` : null;
  const showMenu = (canDeleteProjects && !!p.project_id) || p.canManageCollaborators || p.canSetOwner;

  return (
    // No z-index / transform here: either would trap the kebab's fixed dropdown under later rows (task 453 / 481).
    <div className="group relative">
      <Link
        // Straight to /tasks — [projectId]/page.tsx would only redirect there.
        href={projectHref ? `${projectHref}/tasks` : V2_ROUTES.PROJECTS_LEGACY}
        aria-label={`View ${p.name}`}
        className="absolute inset-0 rounded-[14px] outline-none focus-visible:ring-[3px] focus-visible:ring-[#007BFF]/30"
      />
      <div className="pointer-events-none relative flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-2 rounded-[14px] border border-[#E2E7F2] bg-white px-4 py-3 transition-colors group-hover:border-[#A8C6F5]">
        {/* Identity */}
        <div className="min-w-0 flex-1 basis-48">
          <EditableProjectTitle
            ref={titleRef}
            name={p.name}
            projectId={p.project_id}
            canRename={p.canManageCollaborators}
            onRenamed={() => router.refresh()}
            onSearchName={onSearchName}
            className="text-[13px] font-semibold text-[#0B1533] truncate block"
          />
          <div className="flex items-center gap-1 text-[12px] text-[#5F6A88] min-w-0">
            <Building2 size={11} className="shrink-0" />
            <span className="truncate">{p.company_name}</span>
          </div>
        </div>

        {/* Status + kebab — top line on mobile, far right on md+ */}
        <div className="pointer-events-auto shrink-0 md:order-last flex items-center justify-end gap-1 md:w-32">
          <ProjectStatusChip status={p.status} pct={pct} />
          {showMenu && (
            <ProjectCardMenu
              projectId={p.project_id}
              projectDbId={p.id}
              projectName={p.name}
              canDelete={canDeleteProjects && !!p.project_id}
              canManageCollaborators={p.canManageCollaborators}
              canSetOwner={p.canSetOwner}
              hasProduct={p.hasProduct}
              currentClassifications={p.productClassifications}
              onRename={() => titleRef.current?.startEditing()}
            />
          )}
        </div>

        {/* Line break on mobile */}
        <div className="basis-full h-0 md:hidden" />

        {/* Type + days left */}
        <div className="shrink-0 md:w-44 flex items-center gap-2">
          <ProjectTypeChip type={p.project_type} />
          {daysLeft !== null && (
            <span className={cn(
              "text-[10px] font-mono shrink-0",
              daysLeft < 0 ? "text-[#C0392B]" : daysLeft <= 3 ? "text-[#8A5A00]" : "text-[#5F6A88]"
            )}>
              {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Due today" : `${daysLeft}d left`}
            </span>
          )}
        </div>

        {/* Tags */}
        <div className="min-w-0 md:w-48">
          {tags.length > 0 ? (
            <div className="pointer-events-auto flex flex-wrap gap-1">
              {tags.slice(0, 2).map((tag) => (
                <TagChip key={tag} tag={tag} canRemove={canManageTags} onRemove={() => removeTag(p.id, p.project_id, tags, tag)} />
              ))}
              {tags.length > 2 && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] text-[#5F6A88] bg-[#EDF0F7]">
                  +{tags.length - 2}
                </span>
              )}
            </div>
          ) : (
            <span className="hidden md:inline text-[12px] text-[#A8B0C6]">—</span>
          )}
        </div>

        {/* Tasks / tickets (each its own click target — task 268) */}
        <div className="pointer-events-auto shrink-0 md:w-40 flex items-center gap-3">
          <ProgressStat label="tasks" done={p.task_done} total={p.task_total} href={projectHref ? `${projectHref}/tasks` : undefined} tooltipLabel="View tasks" />
          <ProgressStat label="tickets" done={p.issue_done} total={p.issue_total} href={projectHref ? `${projectHref}/tickets` : undefined} tooltipLabel="View tickets" />
        </div>

        <div className="pointer-events-auto shrink-0 md:w-28 flex md:justify-end">
          <AvatarStack members={p.members} fallbackName={p.owner_name} fallbackAvatarUrl={p.owner_avatar_url} />
        </div>
      </div>
    </div>
  );
}
