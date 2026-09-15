import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardView from "./_components/dashboard-view";
import DevDashboardLoader from "./_dev/_dev-dashboard-loader";
import DevDashboardSkeleton from "./_dev/_skeleton";

export const metadata: Metadata = { title: "Dashboard" };

// Task 360 — the developer dashboard is per-user and time-sensitive (due today, logged today),
// so this page must never be statically cached.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/auth/login");
  }

  const userId = data.claims.sub as string;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", userId)
    .single();

  const role        = (profile?.role as string | null) ?? null;
  const displayName = (profile?.full_name as string | null) ?? null;

  // Task 360 — the developer dashboard reads the developer's own assigned tasks/tickets, live
  // timer and time logs. `displayName` is forwarded rather than re-queried inside the loader so
  // the legacy `issues.assignee_name` lookup doesn't add a second round trip; the Suspense
  // boundary lets the hub shell paint before those queries resolve.
  if (role === "developer") {
    return (
      <Suspense fallback={<DevDashboardSkeleton />}>
        <DevDashboardLoader userId={userId} displayName={displayName} />
      </Suspense>
    );
  }

  return <DashboardView role={role} displayName={displayName} userId={userId} />;
}
