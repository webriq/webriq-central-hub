import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { tabIdForClassification, type ClassificationTabId, type ProjectSlug } from "@/app/(hub)/projects/_classification-tabs";
import type { DeletedProjectRow } from "@/app/(hub)/projects/_shared/_get-deleted-project-summary";

// The project row plus its classification tabs (customer_products.classifications[] ∪
// customer_products.classification, same union the listing uses — task 414). Shared by the project
// layout (slug validation, task 474) and the /projects/v2 resolver.
//
// Task 415 — the same row tells the layout whether the project was soft-deleted.
export const getProjectShell = cache(async (projectId: string) => {
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

// Task 474 — the slugs a project's pages may be served under; the first is canonical.
export function allowedProjectSlugs(tabs: ClassificationTabId[]): ProjectSlug[] {
  return tabs.length > 0 ? tabs : ["unclassified"];
}
