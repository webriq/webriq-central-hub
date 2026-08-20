import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Task 282 (item E) — V2's default landing tab is now Timeline (was Overview). Overview's
// content moved to `./overview/page.tsx` verbatim; matches Legacy's existing
// `legacy/[projectId]/page.tsx` redirect-to-default-tab pattern.
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/v2/${projectId}/timeline`);
}
