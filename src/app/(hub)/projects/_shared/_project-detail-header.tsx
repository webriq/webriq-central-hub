"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft, CheckCircle2, Settings, Crown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { ProjectStatusBadge } from "@/app/(hub)/projects-old/_pm-shared";
import type { Project } from "@/app/(hub)/projects-old/_pm-shared";
import { Chip } from "@/app/(hub)/dashboard/_components/dashboard-shared";
import { canManageProjectMembers, canSetProjectOwner } from "@/lib/programme/membership-rules";
import { OwnerCollaboratorsRow } from "./_owner-collaborators-row";
import { CopyLinkButton } from "./_copy-link-button";
import { ProjectDetailTabStrip, type DetailTabId } from "./_project-detail-tab-strip";
import { DeleteProjectMenuItem, DELETE_PROJECT_ROLES } from "../v2/[projectId]/_delete-project-menu-item";
import { useActivePhase } from "./_use-active-phase";

// Task 277 — uniform page-level header (back link, title, badge, subtitle, action icons, tab
// strip) shared by every V2 tab AND every Legacy tab.
//
// Task 283 — self-sufficient: this used to take badge/secondaryRow/actions as props computed
// separately by each page (`_project-detail.tsx`, `_coming-soon-overview.tsx`,
// `_onboarding-detail.tsx`'s backLink/mainBackLink, `_generic-phase-view.tsx`'s own gear).
// Since none of those routes shared a layout, every tab click fully unmounted and remounted
// this component — visibly "reloading" the header (skeleton badge flash, "Owner: Unassigned"
// flash before the members fetch resolved, and for Tasks/Issues/Milestones specifically, each
// tab's own `loading.tsx` Suspense fallback replaced the *entire* page — header included — with
// a full skeleton on every navigation). Now rendered once by `(tabs)/layout.tsx` (both variants)
// so it persists across tab navigation; only `{children}` (the page content) swaps. Computing
// badge/secondaryRow/gear internally here means every caller passes the same handful of
// project-level props instead of pre-computing per-page state that's identical on every tab.
const PHASE_BADGE_STYLE: Record<number, { iconBg: string; iconText: string }> = {
  1: { iconBg: "bg-[#E2762F]/15", iconText: "text-[#E2762F]" },
  2: { iconBg: "bg-[#0063D6]/15", iconText: "text-[#0063D6]" },
  3: { iconBg: "bg-[#6A48E0]/15", iconText: "text-[#6A48E0]" },
  4: { iconBg: "bg-[#0B8A93]/15", iconText: "text-[#0B8A93]" },
  5: { iconBg: "bg-[#177E48]/15", iconText: "text-[#177E48]" },
};

export function ProjectDetailHeader({
  project,
  companyName,
  classification,
  currentUserId,
  currentUserRole,
  basePath,
  variant,
}: {
  project: Project;
  companyName: string;
  // Task 277 — real classification (e.g. "StackShift I") for v2; null for legacy-imported v2
  // projects with no customer_product_id (falls back to project.project_type then) and always
  // null-ish for variant="legacy" (Legacy has no classification concept, uses project_type).
  classification: string | null;
  currentUserId: string;
  currentUserRole: string | null;
  basePath: string;
  variant: "legacy" | "v2";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);

  const activeTab = (pathname.split("/").filter(Boolean).pop() ?? "overview") as DetailTabId;
  const listingHref = variant === "legacy" ? V2_ROUTES.PROJECTS_LEGACY : V2_ROUTES.PROJECTS_V2;
  const typeLabel = variant === "v2" ? (classification ?? project.project_type) : project.project_type;

  const { activePhaseNumber, activePhaseName, isComplete, loading: phaseLoading } = useActivePhase(
    project.id,
    variant === "v2" && project.uses_customer_phases_engine
  );

  // Task 283 (full-fix decision, superseding task 281/282's "gear only on Timeline's main
  // render branch") — role/isCreator don't depend on Timeline's internal load state (project and
  // currentUserId are always available regardless of which branch Timeline is in), so gating the
  // gear per-branch was preserving an incidental historical constraint, not a real permission
  // rule. Now uniform across every tab, including Timeline, matching the 8 shared tabs.
  const isCreator = project.created_by === currentUserId;
  const canManageProjMembers = canManageProjectMembers(currentUserRole, isCreator);
  const canSetOwner = canSetProjectOwner(currentUserRole, isCreator);
  const canDeleteProject = !!currentUserRole && DELETE_PROJECT_ROLES.includes(currentUserRole);

  let badge: React.ReactNode;
  if (variant === "v2" && phaseLoading) {
    badge = <span className="inline-block h-[19px] w-[104px] animate-pulse rounded-full bg-[#EDF0F7]" />;
  } else if (variant === "v2" && isComplete) {
    badge = (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#E3F5EA] px-2.5 py-0.5 text-[11px] font-semibold text-[#177E48]">
        <CheckCircle2 size={11} /> Complete
      </span>
    );
  } else if (variant === "v2" && activePhaseNumber !== undefined && activePhaseName) {
    const style = PHASE_BADGE_STYLE[activePhaseNumber] ?? PHASE_BADGE_STYLE[1];
    badge = (
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", style.iconBg, style.iconText)}>
        <span className="h-1.5 w-1.5 animate-pulse motion-reduce:animate-none rounded-full bg-current" />
        Phase {activePhaseNumber}: {activePhaseName}
      </span>
    );
  } else {
    badge = <ProjectStatusBadge status={project.status} />;
  }

  // Set Project Owner/Manage Collaborators both route to the Members tab (which already has
  // "Make owner"/"Add collaborator"/"Remove" actions) rather than opening an inline panel —
  // Timeline used to have its own OwnerPanel/CollaboratorsPanel for this, but those lived inside
  // page content, not the header, so a shared header can't reach into whichever page happens to
  // be mounted below it. Matches the pattern already used by the 8 previously-shared tabs.
  const settingsMenu = (canManageProjMembers || canSetOwner || canDeleteProject) && (
    <div className="relative">
      <button
        type="button"
        onClick={() => setSettingsMenuOpen((v) => !v)}
        aria-label="Project Settings"
        title="Project Settings"
        className={cn(
          "inline-flex cursor-pointer items-center justify-center rounded-full border p-2.5 transition-colors",
          settingsMenuOpen ? "border-[#007BFF] bg-[#E5F1FF] text-[#007BFF]" : "border-[#E2E7F2] bg-white text-[#3A4565] hover:border-[#A8C6F5]"
        )}
      >
        <Settings size={13} />
      </button>
      {settingsMenuOpen && (
        <div className="absolute right-0 z-30 mt-1.5 w-48 overflow-hidden rounded-lg border border-[#E2E7F2] bg-white py-1 shadow-lg">
          {canSetOwner && (
            <button
              type="button"
              onClick={() => { setSettingsMenuOpen(false); router.push(`${basePath}/members`); }}
              className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 text-left text-[12.5px] text-[#3A4565] transition-colors hover:bg-[#F4F6FB]"
            >
              <Crown size={13} className="text-[#5F6A88]" /> Set Project Owner
            </button>
          )}
          {canManageProjMembers && (
            <button
              type="button"
              onClick={() => { setSettingsMenuOpen(false); router.push(`${basePath}/members`); }}
              className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 text-left text-[12.5px] text-[#3A4565] transition-colors hover:bg-[#F4F6FB]"
            >
              <Users size={13} className="text-[#5F6A88]" /> Manage Collaborators
            </button>
          )}
          {canDeleteProject && (
            <>
              {(canManageProjMembers || canSetOwner) && <div className="my-1 border-t border-[#EDF0F7]" />}
              <DeleteProjectMenuItem projectUrlKey={project.project_id ?? project.id} projectName={project.name} variant={variant} />
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="px-8 pt-6 pb-4 bg-white shrink-0">
      <button
        onClick={() => router.push(listingHref)}
        className="inline-flex items-center gap-1.5 text-[12px] text-[#5F6A88] hover:text-[#0B1533] mb-3 cursor-pointer transition-colors"
        suppressHydrationWarning
      >
        <ArrowLeft size={14} /> All projects
      </button>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-[22px] font-bold text-[#0B1533] tracking-[-0.02em] truncate">
              {project.name}
            </h1>
            {badge}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[13px] text-[#5F6A88]">{companyName}</span>
            <Chip tone="neutral">{typeLabel}</Chip>
          </div>
          <div className="mt-1.5">
            <OwnerCollaboratorsRow projectDbId={project.id} />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <CopyLinkButton className="inline-flex cursor-pointer items-center justify-center rounded-full border border-[#E2E7F2] bg-white p-2.5 text-[#3A4565] transition-colors hover:border-[#A8C6F5] hover:text-[#0B1533]" />
          {settingsMenu}
        </div>
      </div>

      <ProjectDetailTabStrip basePath={basePath} activeTab={activeTab} variant={variant} role={currentUserRole} />
    </div>
  );
}
