import { redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";

// Portfolio Tracker is retired (task 280) — this content now lives at
// /projects/v2/[projectId]/onboarding-workspace (byte-identical port from task 276). Forwards every
// string-valued search param (tab, parent_folder, sub_folder_l1, sub_folder_l2, ...) rather than
// hand-enumerating keys, since _workspace-url-params.ts treats them as an open-ended set.
interface PageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PortfolioTrackerWorkspaceRedirect({ params, searchParams }: PageProps) {
  const { projectId } = await params;
  const rawSearchParams = await searchParams;

  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(rawSearchParams)) {
    if (typeof value === "string") qs.set(key, value);
  }
  const query = qs.toString();

  redirect(`${V2_ROUTES.PROJECTS_V2}/${projectId}/onboarding-workspace${query ? `?${query}` : ""}`);
}
