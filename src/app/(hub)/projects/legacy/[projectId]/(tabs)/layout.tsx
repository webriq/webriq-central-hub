import { notFound } from "next/navigation";
import { getProjectDetailData } from "../../../_shared/_get-project-detail-data";
import { ProjectDetailHeader } from "../../../_shared/_project-detail-header";

export const dynamic = "force-dynamic";

// Task 283 — Legacy equivalent of `v2/[projectId]/(tabs)/layout.tsx`. Wraps Overview, Tasks,
// Issues, Milestones, Files, Access, Members, Status Report, Time Logs. Detail sub-routes
// (`tasks/[taskId]`, `issues/[issueId]`, `milestones/[milestoneId]`) stay outside this group,
// as siblings of `(tabs)/tasks` etc. — see the V2 layout's comment for why.
export default async function LegacyProjectTabsLayout({
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
        basePath={`/projects/legacy/${projectId}`}
        variant="legacy"
      />
      <div className="flex-1 min-h-0 flex flex-col">
        {children}
      </div>
    </div>
  );
}
