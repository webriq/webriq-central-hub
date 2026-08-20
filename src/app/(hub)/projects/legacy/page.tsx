import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import { loadLegacyProjectsList } from "../_legacy-listing/_load-list-data";
import ProjectsIndex from "../_legacy-listing/_projects-index";
import ListingShell from "../_listing-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projects" };

// Task 279 — split out of the old combined `/projects-v2?tab=legacy` branch (task 276) into its
// own route now that the tab strip drives real paths instead of a query param. `?customer=` is
// kept (task 279 repoints the Customers page's "view projects for customer" link here). Auth
// guard mirrors projects-old/page.tsx (default-allow via role-access.ts fallthrough; only the
// client-role redirect is enforced here, matching the source page).

type SearchParams = {
  search?: string;
  status?: string;
  classification?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
  customer?: string;
  view?: string;
};

export default async function ProjectsLegacyListingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = data.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;

  if (role === "client") redirect(V2_ROUTES.DASHBOARD);

  const params = await searchParams;

  // Same absent="All"/""=explicitly-none/csv convention as the source page.
  const statusValues = params.status === undefined ? null : params.status === "" ? [] : params.status.split(",");
  const classificationValues = params.classification === undefined ? null : params.classification === "" ? [] : params.classification.split(",");
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const pageSize = Math.max(1, parseInt(params.pageSize ?? "15", 10));

  const { projects, customers, paginationMeta, canManageTags, canCreateProject, canDeleteProjects } = await loadLegacyProjectsList({
    customer: params.customer ?? "",
    page,
    pageSize,
    search: params.search?.trim() ?? "",
    statusValues,
    classificationValues,
    sort: params.sort ?? "newest",
  });

  return (
    <ListingShell activeTab="legacy">
      <ProjectsIndex
        projects={projects}
        customers={customers}
        paginationMeta={paginationMeta}
        initialView={(params.view === "list" ? "list" : "grid") as "grid" | "list"}
        canManageTags={canManageTags}
        canDeleteProjects={canDeleteProjects}
        canCreateProject={canCreateProject}
      />
    </ListingShell>
  );
}
