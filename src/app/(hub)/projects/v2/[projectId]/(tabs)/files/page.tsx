import { notFound } from "next/navigation";
import { getProjectDetailData } from "../../../../_shared/_get-project-detail-data";
import ProjectDetail from "../../../../_shared/_project-detail";

export const dynamic = "force-dynamic";

// Task 276 (Phase 3) — one of the 5 new shared tabs (`_shared/_files-tab.tsx`, built in Phase 2)
// wired up here as a real V2 subroute. `ProjectDetail`'s PRIMARY_TABS entry id is "files", so the
// folder name matches what its tab-strip `router.push(\`${basePath}/${tab.id}\`)` navigates to.
export default async function ProjectFilesPage({
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
      activeTab="files"
      basePath={`/projects/v2/${projectId}`}
    />
  );
}
