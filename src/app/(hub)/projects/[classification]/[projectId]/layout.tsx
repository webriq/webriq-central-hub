import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";
import { DEFAULT_CLASSIFICATION_TAB, classificationTabHref, labelForTab } from "@/app/(hub)/projects/_classification-tabs";
import { getDeletedProjectSummary } from "@/app/(hub)/projects/_shared/_get-deleted-project-summary";
import DeletedProjectView from "@/app/(hub)/projects/_shared/_deleted-project-view";
import RecordProjectView from "@/app/(hub)/projects/_shared/_record-project-view";
import { allowedProjectSlugs, getProjectShell } from "./_project-shell";

// Task 474 — project pages live at /projects/<slug>/<projectId>/…. <slug> must be one of the
// project's own classification tabs ("unclassified" when it has none); any other slug redirects to
// the same sub-path and query under the first one. Lives at [projectId] level, not (tabs), so
// onboarding-workspace and the task/ticket/milestone detail routes are covered too.
//
// Task 415 — a soft-deleted project (that the viewer could previously see) renders the
// deleted-project landing view instead of `children`, so the tab layouts' notFound() never fires.
// Unknown / hidden projects fall through to the normal 404.
export default async function ProjectLayout({
  params,
  children,
}: {
  params: Promise<{ classification: string; projectId: string }>;
  children: React.ReactNode;
}) {
  const { classification, projectId } = await params;
  const { project, tabs } = await getProjectShell(projectId);

  if (project) {
    const allowed = allowedProjectSlugs(tabs);
    if (!(allowed as string[]).includes(classification)) {
      const path = (await headers()).get("x-pathname") ?? "";
      const prefix = `${V2_ROUTES.PROJECTS}/${classification}/`;
      // x-pathname is "<path><?query>"; fall back to the project root if it's missing.
      const rest = path.startsWith(prefix) ? path.slice(prefix.length) : projectId;
      redirect(`${V2_ROUTES.PROJECTS}/${allowed[0]}/${rest}`);
    }
  }

  const deleted = project ? await getDeletedProjectSummary(project) : null;

  return deleted ? (
    <DeletedProjectView
      summary={deleted}
      classifications={tabs.map(labelForTab)}
      backHref={classificationTabHref(tabs[0] ?? DEFAULT_CLASSIFICATION_TAB)}
    />
  ) : (
    <>
      {/* Task 416 — only a live (non-deleted) project counts as "opened". */}
      {project && <RecordProjectView projectId={projectId} />}
      {children}
    </>
  );
}
