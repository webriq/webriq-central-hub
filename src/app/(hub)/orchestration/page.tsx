import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import OrchestrationContent from "./_content";

// Orchestration console (task 343) — Assess → Plan → Execute → Reply pipeline,
// transferred from the parked `_hub_(OLD)/orchestration/`. Gated to the roles with
// real RLS/API access to the orchestration tables (mirrors `desk/inbox/page.tsx`
// and the `/api/assessment|plan|execution|reply|zoho` route guards): admin,
// super_admin, pm. Replaces the old `requireRole()` path, which queried the
// deprecated `hub_users` table.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Orchestration" };

export default async function OrchestrationPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = claims.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;

  if (role !== "admin" && role !== "super_admin" && role !== "pm") redirect(V2_ROUTES.DASHBOARD);

  return <OrchestrationContent />;
}
