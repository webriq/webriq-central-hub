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
  return { title: `${await getProjectNameForMetadata(projectId)} - Access` };
}

// Task 276 (Phase 3) — one of the 5 new shared tabs (`_shared/_access-tab.tsx`, built in Phase 2).
export default async function ProjectAccessPage({
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
      activeTab="access"
      basePath={`/projects/v2/${projectId}`}
    />
  );
}
