import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import { isClassificationTabId } from "../../_classification-tabs";
import StatusReportClient from "../../_status-report/_status-report-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Status Report" };

// Task 473 — one status report per classification, scoped by the URL slug (replaces the old
// all-classifications /projects/v2/status-report with its Classification filter).
export default async function ClassificationStatusReportPage({
  params,
}: {
  params: Promise<{ classification: string }>;
}) {
  const { classification: tabId } = await params;
  if (!isClassificationTabId(tabId)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = data.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;

  if (role === "client") redirect(V2_ROUTES.DASHBOARD);

  return <StatusReportClient role={role} tabId={tabId} />;
}
