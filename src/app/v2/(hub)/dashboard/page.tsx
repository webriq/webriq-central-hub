import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardView from "./_components/dashboard-view";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/v2/auth/login");
  }

  const userId      = data.claims.sub as string;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", userId)
    .single();

  const role        = (profile?.role as string | null) ?? null;
  const displayName = (profile?.full_name as string | null) ?? null;

  return <DashboardView role={role} displayName={displayName} userId={userId} />;
}
