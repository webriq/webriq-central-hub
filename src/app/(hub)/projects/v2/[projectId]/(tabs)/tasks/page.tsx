import { notFound } from "next/navigation";
import { getProjectDetailData } from "../../../../_shared/_get-project-detail-data";
import ProjectDetail from "../../../../_shared/_project-detail";

export const dynamic = "force-dynamic";

// Task 276 (Phase 3) — adapted from `/projects/legacy/[projectId]/tasks/page.tsx`: same
// `ProjectDetail` shared component, just a V2 basePath. The header (which used to also need a
// `variant` prop here) is now rendered once by `(tabs)/layout.tsx`, task 283.
export default async function ProjectTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  // Task 241 — `?tasklist=<id>` deep-link from the StackShift Timeline's Phase 2-5 swimlane cards.
  searchParams: Promise<{ tasklist?: string }>;
}) {
  const { projectId } = await params;
  const { tasklist } = await searchParams;
  const data = await getProjectDetailData(projectId);
  if (!data) notFound();

  return (
    <ProjectDetail
      {...data}
      activeTab="tasks"
      initialScrollTasklistId={tasklist}
      basePath={`/projects/v2/${projectId}`}
    />
  );
}
