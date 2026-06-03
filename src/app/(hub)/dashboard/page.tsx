import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PMDashboard from "./_components/pm-dashboard";
import DevDashboard from "./_components/dev-dashboard";

export default async function DashboardPage() {
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
    return <DevDashboard />;
  }

  return <PMDashboard />;
}
