import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import PMTasksContent from "./_pm-tasks";
import DevTasksContent from "./_dev-tasks";

export default async function DashboardTasksPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("hub_users")
    .select("role")
    .eq("id", claims.claims.sub)
    .single();

  const role = profile?.role ?? null;

  if (!role || role === "pending") {
    redirect("/auth/pending");
  }

  if (role === "dev") {
    return <DevTasksContent />;
  }

  // adminClient bypasses RLS — needed to read other users' rows (RLS restricts to own row)
  const [{ data: devUsers }, { data: customers }, { data: allUsers }] = await Promise.all([
    adminClient
      .from("hub_users")
      .select("id, first_name, last_name, email")
      .eq("role", "Developer"),
    adminClient
      .from("customers")
      .select("customer_id, company_name")
      .eq("status", "active")
      .order("company_name"),
    adminClient
      .from("hub_users")
      .select("id, first_name, last_name"),
  ]);

  const reviewerMap: Record<string, string> = {};
  for (const u of allUsers ?? []) {
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
    if (u.id && name) reviewerMap[u.id] = name;
  }

  return <PMTasksContent developers={devUsers ?? []} customers={customers ?? []} reviewerMap={reviewerMap} />;
}
