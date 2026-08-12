import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import { TimeLogsContent } from "./_time-logs-content";

// Dedicated Time Logs page (task 226) — replaces the Sprint 1A stub. Mirrors
// `portfolio-tracker/page.tsx`'s exact server-guard pattern: resolve role from `profiles`,
// redirect roles with no `time_logs` RLS access away rather than rendering an empty page for
// them (client/marketing have no `time_logs_manager_read`/`time_logs_developer_own` policy).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Time Logs" };

export default async function TimelogsPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = data.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;

  if (role === "client" || role === "marketing") redirect(V2_ROUTES.DASHBOARD);

  return <TimeLogsContent role={role} currentUserId={userId} />;
}
