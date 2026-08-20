import type { Metadata } from "next";
import OnboardingDetail from "../../_onboarding-detail";
import { loadOnboardingDetailData, getCompanyNameForMetadata } from "../../_load-detail-data";
import { wizardParamsToStepKey } from "../../_wizard-step-params";

export const dynamic = "force-dynamic";

// Task 277 — moved here verbatim from the bare `[projectId]/page.tsx` (which used to render this
// same swimlane/programme content as the "Overview" tab). Overview is now a lightweight "coming
// soon" placeholder (`../page.tsx`); everything OnboardingDetail renders — StackShift swimlane,
// generic-engine GenericPhaseView, Wizard, restricted/not-started/scheduled screens — lives here
// under Timeline instead, same data loading, same DETAIL_ROLES access gate.
interface PageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ phase?: string; deliverable?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectId } = await params;
  const companyName = await getCompanyNameForMetadata(projectId);
  return { title: `${companyName} — Timeline — Projects V2` };
}

export default async function ProjectTimelinePage({ params, searchParams }: PageProps) {
  const { projectId } = await params;
  const { phase, deliverable } = await searchParams;
  const { project, role, userId, phase1Members, projectMembers, milestones, tasklists, genericTasks } = await loadOnboardingDetailData(projectId);

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
      milestones={milestones}
      tasklists={tasklists}
      genericTasks={genericTasks}
    />
  );
}
