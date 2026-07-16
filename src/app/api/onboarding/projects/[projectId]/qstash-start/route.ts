import { NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { adminClient } from "@/lib/supabase/admin";
import { seedAndStartProgramme } from "@/lib/programme/seed";

// QStash callback for a scheduled onboarding start (chat follow-up to task 157) — fires once,
// at the exact scheduled_onboarding_start_at instant, instead of waiting for the next cron poll
// tick (migration 079). Verified via verifySignatureAppRouter (QSTASH_CURRENT_SIGNING_KEY /
// QSTASH_NEXT_SIGNING_KEY env vars) so only genuine QStash deliveries can trigger a start.
//
// Idempotent by design: checks programme_started_at before doing anything, so a manual override
// that beat the schedule to it (or a QStash retry after a transient failure) is a harmless no-op,
// not a duplicate start.
async function handler(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const phaseNumber = ([1, 2, 3, 4, 5].includes(Number(body?.phase_number)) ? Number(body.phase_number) : 1) as 1 | 2 | 3 | 4 | 5;

  const { data: project, error } = await adminClient
    .from("projects")
    .select("id, customer_id, programme_started_at, customers(company_name)")
    .eq("id", projectId)
    .maybeSingle();

  if (error || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  if (project.programme_started_at) {
    return NextResponse.json({ skipped: true, reason: "already started" });
  }

  const companyName = (project.customers as unknown as { company_name: string } | null)?.company_name ?? "Customer";
  const result = await seedAndStartProgramme({ id: project.id, customer_id: project.customer_id }, companyName, undefined, phaseNumber);

  await adminClient.from("projects").update({ qstash_message_id: null }).eq("id", projectId);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ started: true });
}

// verifySignatureAppRouter throws synchronously at module-load time if the signing key env vars
// are absent — that would break the build/dev server everywhere, not just this route, until
// QStash is configured. Only wrap when both keys are present; without them the route just
// reports its own misconfiguration instead of taking the whole app down (real requests can't
// reach here without QSTASH_TOKEN/NEXT_PUBLIC_APP_URL configured in scheduleProjectAutostart
// either, so this only matters for local dev / CI before Upstash setup is complete).
export const POST =
  process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
    ? verifySignatureAppRouter(handler)
    : async () => NextResponse.json({ error: "QStash is not configured (missing signing keys)" }, { status: 501 });
