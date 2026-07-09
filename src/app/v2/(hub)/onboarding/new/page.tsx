import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import NewProjectWizard from "./_content";

export const dynamic = "force-dynamic";

const CREATE_ROLES = ["admin", "super_admin", "marketing"];

export default async function NewProjectPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = data.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;

  if (!role || !CREATE_ROLES.includes(role)) redirect(V2_ROUTES.ONBOARDING);

  return <NewProjectWizard />;
}
