import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import { SidebarClassificationSync } from "@/app/(hub)/_components/sidebar-project-context";
import {
  classificationTabHref,
  labelForTab,
  tabIdForClassification,
  type ClassificationTabId,
} from "@/app/(hub)/projects/_classification-tabs";
import { getDeletedProjectSummary, type DeletedProjectRow } from "@/app/(hub)/projects/_shared/_get-deleted-project-summary";
import DeletedProjectView from "@/app/(hub)/projects/_shared/_deleted-project-view";
import RecordProjectView from "@/app/(hub)/projects/_shared/_record-project-view";

// Task 414 — publishes the open project's classification tab(s) to the sidebar so its Projects
// links highlight the project's real classification(s) (detail URLs carry no `?tab=`). Lives at
// [projectId] level, not (tabs), so onboarding-workspace and the task/ticket/milestone detail
// routes are covered too. Membership is the same union the listing uses:
// customer_products.classifications[] ∪ customer_products.classification.
//
// Task 415 — the same project row also tells us whether it was soft-deleted. If so (and the viewer
// could previously see it), render the deleted-project landing view instead of `children`, so the
// tab layouts' notFound() never fires. Unknown / hidden projects fall through to the normal 404.
const getProjectShell = cache(async (projectId: string) => {
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, project_id, status, customer_id, project_type, updated_at, customer_product_id")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!project) return { project: null, tabs: [] as ClassificationTabId[] };

  let tabs: ClassificationTabId[] = [];
  if (project.customer_product_id) {
    const { data: product } = await supabase
      .from("customer_products")
      .select("classification, classifications")
      .eq("id", project.customer_product_id)
      .maybeSingle();
    if (product) {
      const values = [product.classification, ...(product.classifications ?? [])];
      const found = values.flatMap((v) => (v ? [tabIdForClassification(v)] : []));
      tabs = [...new Set(found.filter((t): t is ClassificationTabId => t !== null))];
    }
  }
  return { project: project as DeletedProjectRow, tabs };
});

export default async function ProjectLayout({
  params,
  children,
}: {
  params: Promise<{ projectId: string }>;
  children: React.ReactNode;
}) {
  const { projectId } = await params;
  const { project, tabs } = await getProjectShell(projectId);
  const deleted = project ? await getDeletedProjectSummary(project) : null;

  return (
    <>
      <SidebarClassificationSync tabs={tabs} />
      {deleted ? (
        <DeletedProjectView
          summary={deleted}
          classifications={tabs.map(labelForTab)}
          backHref={tabs[0] ? classificationTabHref(tabs[0]) : V2_ROUTES.PROJECTS_V2}
        />
      ) : (
        <>
          {/* Task 416 — only a live (non-deleted) project counts as "opened". */}
          {project && <RecordProjectView projectId={projectId} />}
          {children}
        </>
      )}
    </>
  );
}
