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
  return { title: `${await getProjectNameForMetadata(projectId)} - Tasks` };
}

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
      basePath={`/projects/legacy/${projectId}`}
    />
  );
}
