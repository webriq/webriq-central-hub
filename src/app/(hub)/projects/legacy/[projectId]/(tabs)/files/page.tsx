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
  return { title: `${await getProjectNameForMetadata(projectId)} - Files` };
}

// Task 276 (Phase 2 gap, fixed post-Phase-3) — one of the 5 new shared tabs
// (`_shared/_files-tab.tsx`, built in Phase 2) wired up here as a real Legacy subroute, mirroring
// the V2 equivalent at `v2/[projectId]/files/page.tsx`.
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
      basePath={`/projects/legacy/${projectId}`}
    />
  );
}
