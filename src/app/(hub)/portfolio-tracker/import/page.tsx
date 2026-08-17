import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import ImportProjectWizard from "./_content";

export const dynamic = "force-dynamic";

// Mirrors ../new/page.tsx's CREATE_ROLES exactly (task 153: pm can also create projects).
const CREATE_ROLES = ["admin", "super_admin", "marketing", "pm"];

export default async function ImportProjectPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = data.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;

  if (!role || !CREATE_ROLES.includes(role)) redirect(V2_ROUTES.PORTFOLIO_TRACKER);

  return <ImportProjectWizard />;
}
