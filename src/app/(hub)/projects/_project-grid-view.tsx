"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { TagChip, businessDaysRemaining } from "./_pm-shared";
import { ProjectCardMenu } from "./_project-card-menu";
import { AvatarStack, ProjectStatusChip, ProjectTypeChip, ProgressStat } from "./_project-card-shared";
import type { ProjectListItem } from "./_projects-index";

export function GridView({
  projects, canManageTags, canDeleteProjects, getTagsFor, removeTag,
}: {
  projects: ProjectListItem[];
  canManageTags: boolean;
  canDeleteProjects: boolean;
  getTagsFor: (p: ProjectListItem) => string[];
  removeTag: (id: string, projectId: string | null, currentTags: string[], tag: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
      {projects.map((p) => {
        const pct = p.task_total > 0 ? Math.round((p.task_done / p.task_total) * 100) : 0;
        const daysLeft = businessDaysRemaining(p.end_date);
        const tags = getTagsFor(p);
        return (
          <Link
            key={p.id}
            href={p.project_id ? `${V2_ROUTES.PROJECTS}/${p.project_id}/tasks` : V2_ROUTES.PROJECTS}
            className="h-full flex flex-col gap-3 p-4 rounded-[14px] border border-[#E2E7F2] bg-white hover:border-[#A8C6F5] transition-colors"
          >
            {/* Title + status */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-[#0B1533] truncate">{p.name}</div>
                <div className="inline-flex items-center gap-1 text-[12px] text-[#5F6A88] truncate">
                  <Building2 size={11} /> {p.company_name}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <ProjectStatusChip status={p.status} pct={pct} />
                {((canDeleteProjects && p.project_id) || p.canManageCollaborators) && (
                  <ProjectCardMenu
                    projectId={p.project_id}
                    projectDbId={p.id}
                    projectName={p.name}
                    canDelete={canDeleteProjects && !!p.project_id}
                    canManageCollaborators={p.canManageCollaborators}
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

            {/* Footer: avatar stack + tasks/issues progress */}
            <div className="mt-auto pt-3 border-t border-[#EDF0F7] flex items-center justify-between gap-2">
              <AvatarStack members={p.members} fallbackName={p.owner_name} />
              <div className="flex items-center gap-3 shrink-0">
                <ProgressStat label="tasks" done={p.task_done} total={p.task_total} />
                <ProgressStat label="issues" done={p.issue_done} total={p.issue_total} />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
