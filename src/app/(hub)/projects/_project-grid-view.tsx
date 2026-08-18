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

// Task 268 — extracted from GridView's .map() body so `titleRef` (holding the rename title's
// imperative handle, wired to the "Rename Project" kebab item) can be a real per-card hook.
//
// "Stretched link" structure (Post-QA Round 4): the clickable card is no longer a single <Link>
// wrapping every element — a native <a> forbids interactive-content descendants per the HTML
// spec, and this codebase already hit the real-world consequences of that once (task 264's
// ManageCollaboratorsModal needed createPortal to escape being a DOM descendant of this same
// Link). This task's rename `<input>` and the tasks/issues `ProgressStat` buttons reintroduced
// that exact nesting, and it surfaced as a live bug: pressing Enter inside the rename input (or,
// on the sibling Portfolio Tracker card, Space) triggered the ancestor element's native keyboard
// activation independent of this component's own `stopPropagation()` calls — that native
// "activate the nearest interactive ancestor when a nested focusable descendant receives a
// keyboard activation key" behavior is baked into the browser, not mediated by JS event
// propagation, so no amount of `stopPropagation()`/`preventDefault()` inside the nested elements
// can intercept it. The only real fix is to not nest them at all.
//
// Structure now: an absolutely-positioned, empty <Link> spans the whole card (`inset-0`, behind
// everything, z-0) and is the only thing that actually navigates on click — it has zero children,
// so there is nothing for the "no nested interactive content" rule to violate. The real, visible
// content renders as a normal sibling on top (z-10) with `pointer-events-none`, so clicks on
// non-interactive areas (padding, gaps, plain text) fall through to the Link underneath exactly
// like before; each genuinely interactive piece (the rename input, the kebab menu, the tasks/
// issues buttons, tag-remove buttons, avatar tooltips) opts back in with `pointer-events-auto` so
// it keeps capturing its own clicks/focus/keyboard input directly, with no shared DOM ancestor
// that has its own competing default action. The card's hover-border styling moves from the
// (now invisible) Link to `group-hover` on the outer wrapper, since CSS `:hover` still reaches
// every ancestor of whatever element is actually under the cursor regardless of pointer-events.
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
    <div className="group relative h-full">
      <Link
        href={p.project_id ? `${V2_ROUTES.PROJECTS}/${p.project_id}` : V2_ROUTES.PROJECTS}
        aria-label={`View ${p.name}`}
        className="absolute inset-0 z-0 rounded-[14px]"
      />
      <div className="pointer-events-none relative z-10 h-full flex flex-col gap-3 p-4 rounded-[14px] border border-[#E2E7F2] bg-white transition-colors group-hover:border-[#A8C6F5]">
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
          <div className="pointer-events-auto flex items-center gap-1 shrink-0">
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
          <div className="pointer-events-auto flex flex-wrap gap-1.5">
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
          <div className="pointer-events-auto">
            <AvatarStack members={p.members} fallbackName={p.owner_name} />
          </div>
          <div className="pointer-events-auto flex items-center gap-3 shrink-0">
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
      </div>
    </div>
  );
}
