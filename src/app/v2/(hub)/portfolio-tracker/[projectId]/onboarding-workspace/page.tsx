import type { Metadata } from "next";
import { loadOnboardingDetailData, getCompanyNameForMetadata } from "../_load-detail-data";
import OnboardingWizardV2 from "./_onboarding-wizard-v2";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectId } = await params;
  const companyName = await getCompanyNameForMetadata(projectId);
  return { title: `${companyName} — Onboarding v2 (sandbox)` };
}

// Task 202 sandbox entry point — reuses ../_load-detail-data.ts (unmodified, shared
// infrastructure) for the same auth/role guard and project fetch the shipping route uses.
// No `?phase=&deliverable=` deep-link handling here: out of scope for this pass (see task doc).
export default async function OnboardingProjectV2Page({ params }: PageProps) {
  const { projectId } = await params;
  const { project, role } = await loadOnboardingDetailData(projectId);

  return <OnboardingWizardV2 project={project} role={role} />;
}
