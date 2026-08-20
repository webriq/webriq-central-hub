import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import { loadOnboardingProjectsList } from "../_v2-listing/_load-list-data";
import V2ProjectsListing from "../_v2-listing/_onboarding-list";
import ListingShell from "../_listing-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projects" };

// Task 279 — split out of the old combined `/projects-v2?tab=v2` branch (task 276) into its own
// route now that the tab strip drives real paths instead of a query param. Auth guard mirrors
// portfolio-tracker/page.tsx (default-allow via role-access.ts fallthrough; only the client-role
// redirect is enforced here, matching the source page).

type SearchParams = {
  search?: string;
  status?: string;
  classification?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
};

export default async function ProjectsV2ListingPage({
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
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const pageSize = Math.max(1, parseInt(params.pageSize ?? "15", 10) || 15);

  const { projects, paginationMeta, canCreate } = await loadOnboardingProjectsList(userId, role, {
    search: params.search?.trim() ?? "",
    statusValues,
    classificationValues,
    sort: params.sort ?? "newest",
    page,
    pageSize,
  });

  return (
    <ListingShell activeTab="v2">
      <V2ProjectsListing
        role={role}
        currentUserId={userId}
        projects={projects}
        paginationMeta={paginationMeta}
        canCreate={canCreate}
      />
    </ListingShell>
  );
}
