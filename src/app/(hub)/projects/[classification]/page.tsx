import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import { loadOnboardingProjectsList } from "../_v2-listing/_load-list-data";
import { RECENT_SORT } from "../_shared/_recent-sort";
import V2ProjectsListing from "../_v2-listing/_onboarding-list";
import ListingShell from "../_listing-shell";
import { classificationForTab, isClassificationTabId } from "../_classification-tabs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projects" };

// Task 473 — the classification listing lives at /projects/<slug> (was /projects/v2?tab=<slug>,
// which now redirects here). Only the client-role redirect is enforced, as before; an unknown
// slug 404s (static `legacy` / `v2` segments are matched before this dynamic one).

type SearchParams = {
  search?: string;
  status?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
};

export default async function ProjectsClassificationListingPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ classification: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { classification: tabId } = await routeParams;
  if (!isClassificationTabId(tabId)) notFound();

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
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const pageSize = Math.max(1, parseInt(params.pageSize ?? "15", 10) || 15);

  const { projects, paginationMeta, canCreate } = await loadOnboardingProjectsList(userId, role, {
    search: params.search?.trim() ?? "",
    statusValues,
    classification: classificationForTab(tabId),
    sort: params.sort ?? RECENT_SORT,
    page,
    pageSize,
  });

  return (
    <ListingShell activeTab={tabId}>
      <V2ProjectsListing
        role={role}
        currentUserId={userId}
        projects={projects}
        paginationMeta={paginationMeta}
        canCreate={canCreate}
        activeTabId={tabId}
      />
    </ListingShell>
  );
}
