import { notFound } from "next/navigation";
import { getProjectDetailData } from "../_get-project-detail-data";
import ProjectDetail from "../_project-detail";

export const dynamic = "force-dynamic";

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

  return <ProjectDetail {...data} activeTab="tasks" initialScrollTasklistId={tasklist} />;
}
