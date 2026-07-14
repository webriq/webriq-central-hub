import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import OnboardingDetail from "./_onboarding-detail";

export const dynamic = "force-dynamic";

const DETAIL_ROLES = ["marketing", "admin", "super_admin"];

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function OnboardingProjectPage({ params }: PageProps) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = data.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;

  if (!role || !DETAIL_ROLES.includes(role)) {
    redirect(V2_ROUTES.ONBOARDING);
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, name, customer_id, project_id, customers(company_name)")
    .eq("id", projectId)
    .single();

  if (error || !project) {
    notFound();
  }

  const companyName = (project.customers as unknown as { company_name: string } | null)?.company_name ?? "Customer";

  return (
    <OnboardingDetail
      project={{ id: project.id, name: project.name, customer_id: project.customer_id, project_id: project.project_id, company_name: companyName }}
    />
  );
}
