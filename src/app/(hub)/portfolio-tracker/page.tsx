import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import { loadOnboardingProjectsList } from "./_load-list-data";
import OnboardingList from "./_onboarding-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Portfolio Tracker" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; classification?: string; sort?: string; page?: string; pageSize?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = data.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;

  if (role === "client") redirect(V2_ROUTES.DASHBOARD);

  const params = await searchParams;

  // Same absent="All"/""=explicitly-none/csv convention as /projects/page.tsx.
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
    <OnboardingList
      role={role}
      currentUserId={userId}
      projects={projects}
      paginationMeta={paginationMeta}
      canCreate={canCreate}
    />
  );
}
