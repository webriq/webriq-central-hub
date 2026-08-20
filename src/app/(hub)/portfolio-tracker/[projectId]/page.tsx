import { redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";

// Portfolio Tracker is retired (task 280) — this content now lives at /projects/v2/[projectId]/timeline
// (task 277 moved the swimlane/programme view there; the bare [projectId] page in /projects/v2 is now
// a "coming soon" placeholder). Preserve ?phase=&deliverable= so in-flight Wizard deep links still land
// on the right step.
interface PageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ phase?: string; deliverable?: string }>;
}

export default async function PortfolioTrackerProjectRedirect({ params, searchParams }: PageProps) {
  const { projectId } = await params;
  const { phase, deliverable } = await searchParams;

  const qs = new URLSearchParams();
  if (phase !== undefined) qs.set("phase", phase);
  if (deliverable !== undefined) qs.set("deliverable", deliverable);
  const query = qs.toString();

  redirect(`${V2_ROUTES.PROJECTS_V2}/${projectId}/timeline${query ? `?${query}` : ""}`);
}
