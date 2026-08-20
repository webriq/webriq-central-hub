import { notFound } from "next/navigation";
import { getProjectDetailData } from "../../../../_shared/_get-project-detail-data";
import ProjectDetail from "../../../../_shared/_project-detail";

export const dynamic = "force-dynamic";

// Task 276 (Phase 3) — one of the 5 new shared tabs (`_shared/_time-logs-tab.tsx`, built in
// Phase 2). Folder name is `time_logs` (underscore) to match PRIMARY_TABS's "time_logs" id —
// see `status_report/page.tsx`'s comment for why.
export default async function ProjectTimeLogsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const data = await getProjectDetailData(projectId);
  if (!data) notFound();

  return (
    <ProjectDetail
      {...data}
      activeTab="time_logs"
      basePath={`/projects/v2/${projectId}`}
    />
  );
}
