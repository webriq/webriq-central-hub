import { notFound, redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";
import {
  DEFAULT_CLASSIFICATION_TAB,
  classificationStatusReportHref,
  classificationTabHref,
  parseClassificationTab,
  projectHref,
} from "../../_classification-tabs";
import { allowedProjectSlugs, getProjectShell } from "../../[classification]/[projectId]/_project-shell";

// Task 474 — /projects/v2 holds no pages anymore. This catch-all resolves old and
// classification-less links (saved notification/mention URLs, dashboards, timer, …):
//   /projects/v2[?tab=<slug>&…]          → /projects/<slug>[?…]          (task 473)
//   /projects/v2/status-report           → /projects/<default>/status-report
//   /projects/v2/new | /import           → /projects/new | /projects/import
//   /projects/v2/<projectId>/<rest>[?q]  → /projects/<project's slug>/<projectId>/<rest>[?q]
export default async function ProjectsV2Resolver({
  params,
  searchParams,
}: {
  params: Promise<{ rest?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ rest = [] }, sp] = await Promise.all([params, searchParams]);
  const query = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) => (v === undefined ? [] : (Array.isArray(v) ? v : [v]).map((x) => [k, x])))
  );
  const withQuery = (path: string) => `${path}${query.size ? `?${query}` : ""}`;

  const [first, ...sub] = rest;
  if (!first) {
    // On the bare listing, ?tab= was the classification (task 361); elsewhere it's a real sub-page param.
    const tab = query.get("tab");
    query.delete("tab");
    redirect(withQuery(classificationTabHref(parseClassificationTab(tab))));
  }
  if (first === "status-report") redirect(classificationStatusReportHref(DEFAULT_CLASSIFICATION_TAB));
  if (first === "new") redirect(withQuery(V2_ROUTES.PROJECTS_NEW));
  if (first === "import") redirect(withQuery(V2_ROUTES.PROJECTS_IMPORT));

  const { project, tabs } = await getProjectShell(first);
  if (!project) notFound();
  redirect(withQuery(projectHref(allowedProjectSlugs(tabs)[0], first, sub.map(encodeURIComponent).join("/"))));
}
