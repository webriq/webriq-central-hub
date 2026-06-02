import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  if (role === "developer") {
    return <DevTasksContent />;
  }

  return <PMTasksContent />;
}
