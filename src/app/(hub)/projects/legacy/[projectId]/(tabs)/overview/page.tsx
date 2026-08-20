import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProjectDetailData } from "../../../../_shared/_get-project-detail-data";
import { ComingSoonPanel } from "../../../../_shared/_coming-soon-panel";

export const dynamic = "force-dynamic";

// Task 282 (item D8) — Legacy's Overview tab. Legacy has no classification/
// uses_customer_phases_engine concept (always false for Legacy rows), so this is always the
// static Coming Soon panel — no useActivePhase/useProgrammeProgress calls (those are v2-only
// hooks). The header (back link, title, badge, subtitle, secondary row, settings gear, tab
// strip) is now rendered once by `(tabs)/layout.tsx` — task 283 — not per-page.
interface PageProps {
  params: Promise<{ projectId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectId } = await params;
  const data = await getProjectDetailData(projectId);
  return { title: data ? `${data.companyName} — Projects` : "Projects" };
}

export default async function LegacyProjectOverviewPage({ params }: PageProps) {
  const { projectId } = await params;
  const data = await getProjectDetailData(projectId);
  if (!data) notFound();

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#F4F6FB] px-8 py-8">
      <ComingSoonPanel body="This tab is being redesigned. Head over to the Tasks tab for the full project workspace." />
    </div>
  );
}
