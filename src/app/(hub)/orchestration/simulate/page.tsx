import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import SimulateContent from "./_simulate-content";

// Orchestration pipeline simulator (task 343) — dev/QA tool that runs the full
// classify → assess → plan → approve → execute chain end-to-end against a real
// customer. Same role guard as the parent orchestration page.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Orchestration · Simulate" };

export default async function OrchestrationSimulatePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = claims.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;

  if (role !== "admin" && role !== "super_admin" && role !== "pm") redirect(V2_ROUTES.DASHBOARD);

  return <SimulateContent />;
}
