import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectDetailData } from "../../../../_shared/_get-project-detail-data";
import { getProjectNameForMetadata } from "../../../../_shared/_get-metadata-titles";
import { ComingSoonOverview } from "../../_coming-soon-overview";

export const dynamic = "force-dynamic";

// Task 282 (items D8/E) — moved verbatim from the bare `[projectId]/page.tsx`, which now
// redirects to `./timeline` instead (V2's new default landing tab). Overview needed its own
// stable route once the bare path stopped rendering it, otherwise the tab strip's "Overview"
// pill (which still points at this segment) would immediately bounce to Timeline.
//
// Task 277 — Overview is a lightweight "coming soon" placeholder; the swimlane/programme
// content it used to render lives at `../timeline/page.tsx` now. Uses the same
// `getProjectDetailData` + `isProjectVisibleToCurrentUser` access model every other V2 tab
// already uses — there is no sensitive content here to justify a stricter gate.
//
// Task 283 — the header (title/badge/subtitle/tab strip) is now rendered once by
// `(tabs)/layout.tsx`; this page only supplies its own content.
interface PageProps {
  params: Promise<{ projectId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectId } = await params;
  return { title: await getProjectNameForMetadata(projectId) };
}

export default async function ProjectOverviewPage({ params }: PageProps) {
  const { projectId } = await params;
  const data = await getProjectDetailData(projectId);
  if (!data) notFound();

  return <ComingSoonOverview project={data.project} />;
}
