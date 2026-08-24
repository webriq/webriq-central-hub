import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDeveloperAccessibleProjectIds } from "../projects-old/_project-access";
import DashboardView from "./_components/dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/auth/login");
  }

  const userId      = data.claims.sub as string;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", userId)
    .single();

  const role        = (profile?.role as string | null) ?? null;
  const displayName = (profile?.full_name as string | null) ?? null;

  // Dev dashboard scopes "My Tasks"/"Your workspace" to the developer's own projects — the
  // same project_members-or-assigned-task definition `_project-access.ts` already uses to gate
  // developer project visibility elsewhere, so "my projects" means the same thing everywhere.
  let devProjectsCount = 0;
  let devCustomerIds: string[] = [];
  if (role === "developer") {
    const projectIds = await getDeveloperAccessibleProjectIds(userId);
    devProjectsCount = projectIds.length;
    if (projectIds.length > 0) {
      const { data: projectRows } = await supabase.from("projects").select("customer_id").in("id", projectIds);
      devCustomerIds = Array.from(new Set((projectRows ?? []).map(p => p.customer_id)));
    }
  }

  return (
    <DashboardView
      role={role}
      displayName={displayName}
      userId={userId}
      devProjectsCount={devProjectsCount}
      devCustomerIds={devCustomerIds}
    />
  );
}
