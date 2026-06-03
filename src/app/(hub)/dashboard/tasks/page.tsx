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

  const role = profile?.role ?? "pm";

  if (role === "dev") {
    return <DevTasksContent />;
  }

  // adminClient bypasses RLS — needed to read other users' rows (RLS restricts to own row)
  const [{ data: devUsers }, { data: customers }] = await Promise.all([
    adminClient
      .from("hub_users")
      .select("id, display_name, email")
      .eq("role", "dev"),
    adminClient
      .from("customers")
      .select("customer_id, company_name")
      .eq("status", "active")
      .order("company_name"),
  ]);

  return <PMTasksContent developers={devUsers ?? []} customers={customers ?? []} />;
}
