import { notFound } from "next/navigation";
import { getProjectDetailData } from "../_get-project-detail-data";
import ProjectDetail from "../_project-detail";

export const dynamic = "force-dynamic";

export default async function ProjectIssuesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const data = await getProjectDetailData(projectId);
  if (!data) notFound();

  return <ProjectDetail {...data} activeTab="issues" />;
}
