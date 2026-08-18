"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { TagChip, businessDaysRemaining } from "./_pm-shared";
import { ProjectCardMenu } from "./_project-card-menu";
import { AvatarStack, ProjectStatusChip, ProjectTypeChip, ProgressStat } from "./_project-card-shared";
import { EditableProjectTitle, type EditableProjectTitleHandle } from "@/components/projects/editable-project-title";
import type { ProjectListItem } from "./_projects-index";

export function GridView({
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
      {projects.map((p) => (
        <ProjectGridCard
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

// Task 268 — extracted from GridView's .map() body so `titleRef` (holding the hover-to-rename
// title's imperative handle, shared by the "Rename Project" kebab item) can be a real per-card
// hook. Card wrapper now links to the project's detail page ("View Project") instead of always
// jumping straight to /tasks — the tasks/issues stat regions below carry their own distinct
// destinations via ProgressStat's clickable variant.
function ProjectGridCard({
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

  return (
    <Link
      href={p.project_id ? `${V2_ROUTES.PROJECTS}/${p.project_id}` : V2_ROUTES.PROJECTS}
      className="h-full flex flex-col gap-3 p-4 rounded-[14px] border border-[#E2E7F2] bg-white hover:border-[#A8C6F5] transition-colors"
    >
      {/* Title + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <EditableProjectTitle
            ref={titleRef}
            name={p.name}
            projectId={p.project_id}
            canRename={p.canManageCollaborators}
            onRenamed={() => router.refresh()}
            onSearchName={onSearchName}
            className="text-[13px] font-semibold text-[#0B1533] truncate block"
          />
          <div className="inline-flex items-center gap-1 text-[12px] text-[#5F6A88] truncate">
            <Building2 size={11} /> {p.company_name}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ProjectStatusChip status={p.status} pct={pct} />
          {((canDeleteProjects && p.project_id) || p.canManageCollaborators || p.canSetOwner) && (
            <ProjectCardMenu
              projectId={p.project_id}
              projectDbId={p.id}
              projectName={p.name}
              canDelete={canDeleteProjects && !!p.project_id}
              canManageCollaborators={p.canManageCollaborators}
              canSetOwner={p.canSetOwner}
              hasProduct={p.hasProduct}
              currentClassification={p.productClassification}
              onRename={() => titleRef.current?.startEditing()}
            />
          )}
        </div>
      </div>

      {/* Project type + days left */}
      <div className="flex items-center justify-between gap-2">
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

      {/* Tags — pill chips with gap */}
      {tags.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5"
          onClick={(e) => e.preventDefault()}
        >
          {tags.slice(0, 4).map((tag) => (
            <TagChip
              key={tag}
              tag={tag}
              canRemove={canManageTags}
              onRemove={() => removeTag(p.id, p.project_id, tags, tag)}
            />
          ))}
          {tags.length > 4 && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] text-[#5F6A88] bg-[#EDF0F7]">
              +{tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Footer: avatar stack + tasks/issues progress (each its own click target — task 268) */}
      <div className="mt-auto pt-3 border-t border-[#EDF0F7] flex items-center justify-between gap-2">
        <AvatarStack members={p.members} fallbackName={p.owner_name} />
        <div className="flex items-center gap-3 shrink-0">
          <ProgressStat
            label="tasks"
            done={p.task_done}
            total={p.task_total}
            href={p.project_id ? `${V2_ROUTES.PROJECTS}/${p.project_id}/tasks` : undefined}
            tooltipLabel="View tasks"
          />
          <ProgressStat
            label="issues"
            done={p.issue_done}
            total={p.issue_total}
            href={p.project_id ? `${V2_ROUTES.PROJECTS}/${p.project_id}/issues` : undefined}
            tooltipLabel="View issues"
          />
        </div>
      </div>
    </Link>
  );
}
