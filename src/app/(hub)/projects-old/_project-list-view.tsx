"use client";

import { useRouter } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";
import { TagChip } from "./_pm-shared";
import { AvatarStack, ProjectStatusChip, ProjectTypeChip } from "./_project-card-shared";
import type { ProjectListItem } from "./_projects-index";

export function ListView({
  projects, canManageTags, getTagsFor, removeTag,
}: {
  projects: ProjectListItem[];
  canManageTags: boolean;
  getTagsFor: (p: ProjectListItem) => string[];
  removeTag: (id: string, projectId: string | null, currentTags: string[], tag: string) => void;
}) {
  const router = useRouter();
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px]">
          <thead>
            <tr className="border-b border-[#EDF0F7] bg-[#FAFBFE]">
              <th className="text-left pl-[18px] pr-3 py-3 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] min-w-[200px]">Project Name</th>
              <th className="text-left px-3 py-3 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] w-14">%</th>
              <th className="text-left px-3 py-3 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] w-28">Status</th>
              <th className="text-left px-3 py-3 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] min-w-[140px]">Tasks</th>
              <th className="text-left px-3 py-3 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] min-w-[140px]">Issues</th>
              <th className="text-left px-3 py-3 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] w-36">Type</th>
              <th className="text-left px-3 py-3 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] min-w-[160px]">Tags</th>
              <th className="text-left px-3 py-3 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] w-36">Members</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDF0F7]">
            {projects.map((p) => {
              const pct = p.task_total > 0 ? Math.round((p.task_done / p.task_total) * 100) : 0;
              const issuePct = p.issue_total > 0 ? Math.round((p.issue_done / p.issue_total) * 100) : 0;
              const tags = getTagsFor(p);
              return (
                <tr
                  key={p.id}
                  onClick={() => p.project_id && router.push(`${V2_ROUTES.PROJECTS_OLD}/${p.project_id}/tasks`)}
                  className="hover:bg-[#F0F7FF] transition-colors cursor-pointer"
                >
                  {/* Project Name + Customer below */}
                  <td className="pl-[18px] pr-3 py-3">
                    <div className="text-[13px] font-semibold text-[#0B1533] leading-tight">{p.name}</div>
                    <div className="text-[11px] text-[#5F6A88] mt-0.5">{p.company_name}</div>
                  </td>

                  {/* % */}
                  <td className="px-3 py-3 text-[13px] font-bold text-[#3A4565]">{pct}%</td>

                  {/* Status */}
                  <td className="px-3 py-3">
                    <ProjectStatusChip status={p.status} pct={pct} />
                  </td>

                  {/* Tasks with progress bar */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 text-[12px] text-[#5F6A88]">
                      <span className="font-mono shrink-0">{p.task_done}</span>
                      <div className="w-10 h-1.5 bg-[#EDF0F7] rounded-full overflow-hidden shrink-0">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? "#177E48" : "#007BFF" }} />
                      </div>
                      <span className="font-mono text-[#5F6A88]">{pct}%</span>
                      <span className="text-[#A8B0C6]">{p.task_total}</span>
                    </div>
                  </td>

                  {/* Issues with progress bar — real data (task 185) */}
                  <td className="px-3 py-3">
                    {p.issue_total > 0 ? (
                      <div className="flex items-center gap-2 text-[12px] text-[#5F6A88]">
                        <span className="font-mono shrink-0">{p.issue_done}</span>
                        <div className="w-10 h-1.5 bg-[#EDF0F7] rounded-full overflow-hidden shrink-0">
                          <div className="h-full rounded-full" style={{ width: `${issuePct}%`, background: issuePct === 100 ? "#177E48" : "#007BFF" }} />
                        </div>
                        <span className="font-mono text-[#5F6A88]">{issuePct}%</span>
                        <span className="text-[#A8B0C6]">{p.issue_total}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-[#A8B0C6] bg-[#F4F6FB] border border-[#EDF0F7] rounded-full px-2 py-0.5 whitespace-nowrap">
                        No issues
                      </span>
                    )}
                  </td>

                  {/* Type */}
                  <td className="px-3 py-3">
                    <ProjectTypeChip type={p.project_type} />
                  </td>

                  {/* Tags */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    {tags.length > 0 ? (
                      <div className="flex flex-wrap gap-y-1">
                        {tags.slice(0, 3).map((tag) => (
                          <TagChip
                            key={tag}
                            tag={tag}
                            canRemove={canManageTags}
                            onRemove={() => removeTag(p.id, p.project_id, tags, tag)}
                          />
                        ))}
                        {tags.length > 3 && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] text-[#5F6A88] bg-[#EDF0F7]">
                            +{tags.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[12px] text-[#A8B0C6]">—</span>
                    )}
                  </td>

                  {/* Members */}
                  <td className="px-3 py-3">
                    <AvatarStack members={p.members} fallbackName={p.owner_name} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
