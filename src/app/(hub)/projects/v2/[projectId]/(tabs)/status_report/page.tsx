import { notFound, redirect } from "next/navigation";
import { getProjectDetailData } from "../../../../_shared/_get-project-detail-data";
import ProjectDetail from "../../../../_shared/_project-detail";

export const dynamic = "force-dynamic";

// Task 276 (Phase 3) — one of the 5 new shared tabs (`_shared/_status-report-tab.tsx`, built in
// Phase 2). Folder name is `status_report` (underscore), not `status-report`, to match
// `ProjectDetail`'s PRIMARY_TABS entry id ("status_report") — the tab strip's
// `router.push(\`${basePath}/${tab.id}\`)` navigates to that exact underscored segment.
export default async function ProjectStatusReportPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const data = await getProjectDetailData(projectId);
  if (!data) notFound();
  // Task 282 (item B) — the tab pill is hidden from `developer` in the tab strip, but the route
  // itself had no gate at all before this; block direct navigation too.
  if (data.currentUserRole === "developer") redirect(`/projects/v2/${projectId}/timeline`);

  return (
    <ProjectDetail
      {...data}
      activeTab="status_report"
      basePath={`/projects/v2/${projectId}`}
    />
  );
}
