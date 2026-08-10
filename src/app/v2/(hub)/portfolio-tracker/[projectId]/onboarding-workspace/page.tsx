import type { Metadata } from "next";
import { loadOnboardingDetailData, getCompanyNameForMetadata } from "../_load-detail-data";
import OnboardingWizardV2 from "./_onboarding-wizard-v2";
import { parseWorkspaceSearchParams, type WorkspaceSearchParams } from "./_workspace-url-params";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<WorkspaceSearchParams>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectId } = await params;
  const companyName = await getCompanyNameForMetadata(projectId);
  return { title: `${companyName} — Onboarding v2 (sandbox)` };
}

// Task 202 sandbox entry point — reuses ../_load-detail-data.ts (unmodified, shared
// infrastructure) for the same auth/role guard and project fetch the shipping route uses.
// Task 222 — `?tab=&parent_folder=&sub_folder_l1=...` deep-links a specific tab/folder (see
// _workspace-url-params.ts); the swimlane's deliverable cards generate these links now.
export default async function OnboardingProjectV2Page({ params, searchParams }: PageProps) {
  const { projectId } = await params;
  const rawSearchParams = await searchParams;
  const { tab: initialTab, folderPath: initialFolderPath } = parseWorkspaceSearchParams(rawSearchParams);
  const { project, role } = await loadOnboardingDetailData(projectId);

  return <OnboardingWizardV2 project={project} role={role} initialTab={initialTab} initialFolderPath={initialFolderPath} />;
}
