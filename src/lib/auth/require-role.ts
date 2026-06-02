import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isRouteAllowed } from "./role-access";

export async function requireRole(pathname: string): Promise<string> {
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

  if (!isRouteAllowed(pathname, role)) {
    redirect("/dashboard");
  }

  return role ?? "pm";
}
