import type { Metadata } from "next";
import OnboardingDetail from "./_onboarding-detail";
import { loadOnboardingDetailData, getCompanyNameForMetadata } from "./_load-detail-data";
import { wizardParamsToStepKey } from "./_wizard-step-params";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ phase?: string; deliverable?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectId } = await params;
  const companyName = await getCompanyNameForMetadata(projectId);
  return { title: `${companyName} — Portfolio Tracker` };
}

export default async function OnboardingProjectPage({ params, searchParams }: PageProps) {
  const { projectId } = await params;
  const { phase, deliverable } = await searchParams;
  const { project, role, userId, phase1Members, projectMembers } = await loadOnboardingDetailData(projectId);

  // Task 150 follow-up: the Wizard's open/step state is addressed via ?phase=&deliverable=
  // (1-based index into that phase's deliverables) instead of a nested /wizard/[stepKey] route —
  // see _wizard-step-params.ts for why an index instead of the deliverable's string key.
  const initialWizardStepKey = wizardParamsToStepKey(
    phase !== undefined ? Number(phase) : undefined,
    deliverable !== undefined ? Number(deliverable) : undefined
  );

  return (
    <OnboardingDetail
      project={project}
      initialWizardStepKey={initialWizardStepKey}
      role={role}
      currentUserId={userId}
      phase1Members={phase1Members}
      projectMembers={projectMembers}
    />
  );
}
