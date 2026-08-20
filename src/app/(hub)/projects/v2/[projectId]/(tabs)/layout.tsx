import { notFound } from "next/navigation";
import { getProjectDetailData } from "../../../_shared/_get-project-detail-data";
import { ProjectDetailHeader } from "../../../_shared/_project-detail-header";

export const dynamic = "force-dynamic";

// Task 283 — shared layout for every V2 tab that uses the uniform tab-strip chrome (Overview,
// Timeline, Tasks, Issues, Milestones, Files, Access, Members, Status Report, Time Logs).
// Route-group folder (`(tabs)`, invisible in the URL) so this layout does NOT wrap
// `onboarding-workspace` (its own full-screen UI, no tab strip) or the bare `[projectId]/page.tsx`
// redirect. Task/issue/milestone *detail* routes (`tasks/[taskId]`, `issues/[issueId]`,
// `milestones/[milestoneId]`) deliberately stay outside this group too — they live at the plain
// (non-grouped) `tasks/[taskId]` etc. paths, siblings of `(tabs)/tasks`, so they keep their own
// dedicated detail-page header instead of inheriting the project tab strip.
//
// Fetches once per project (only re-runs when `projectId` changes or on a hard refresh) instead
// of once per tab — previously every tab's own `page.tsx` re-fetched and re-rendered
// `ProjectDetailHeader` from scratch, which fully unmounted/remounted it on every tab click
// (visible as a badge-skeleton/owner-name flash, and for Tasks/Issues/Milestones specifically, a
// full-page skeleton via their own `loading.tsx` Suspense fallback). Now the header persists
// across tab navigation; only `{children}` (the page content) is subject to its own loading.tsx.
export default async function ProjectTabsLayout({
  params,
  children,
}: {
  params: Promise<{ projectId: string }>;
  children: React.ReactNode;
}) {
  const { projectId } = await params;
  const data = await getProjectDetailData(projectId);
  if (!data) notFound();

  return (
    <div className="flex flex-col h-full min-h-0">
      <ProjectDetailHeader
        project={data.project}
        companyName={data.companyName}
        classification={data.classification}
        currentUserId={data.currentUserId}
        currentUserRole={data.currentUserRole}
        basePath={`/projects/v2/${projectId}`}
        variant="v2"
      />
      {/* Task 283 — deliberately unopinionated (no bg/overflow/padding): different tabs need
          different content-area treatment (Tasks/Issues manage their own internal scroll
          regions with `overflow-hidden`; Timeline/Overview are `overflow-y-auto` with padding).
          Each page's own content keeps its own wrapper for that, matching what it had before
          this layout existed. */}
      <div className="flex-1 min-h-0 flex flex-col">
        {children}
      </div>
    </div>
  );
}
