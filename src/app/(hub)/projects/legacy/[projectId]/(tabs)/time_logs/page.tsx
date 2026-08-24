import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectDetailData } from "../../../../_shared/_get-project-detail-data";
import { getProjectNameForMetadata } from "../../../../_shared/_get-metadata-titles";
import ProjectDetail from "../../../../_shared/_project-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  return { title: `${await getProjectNameForMetadata(projectId)} - Time Logs` };
}

// Task 276 (Phase 2 gap, fixed post-Phase-3) — one of the 5 new shared tabs
// (`_shared/_time-logs-tab.tsx`, built in Phase 2) wired up here as a real Legacy subroute.
// Folder name is `time_logs` (underscore) to match PRIMARY_TABS's "time_logs" id — see
// `status_report/page.tsx`'s comment for why. Mirrors the V2 equivalent at
// `v2/[projectId]/time_logs/page.tsx`.
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
      basePath={`/projects/legacy/${projectId}`}
    />
  );
}
