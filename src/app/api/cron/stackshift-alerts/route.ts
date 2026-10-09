import { NextRequest, NextResponse } from "next/server";
import { runAlertChecks } from "@/lib/stackshift-support/alerts";
import { authorizeCronOrStaff } from "@/lib/stackshift-support/cron-auth";

// Task 449 — StackShift API alerts. pg_cron hits this every 10 minutes (migration 173) with x-cron-secret; a
// signed-in STAFF user may also trigger a run (a client-role session may not — see cron-auth.ts).
export async function POST(req: NextRequest) {
  const auth = await authorizeCronOrStaff(req);
  if ("denied" in auth) return auth.denied;

  try {
    const result = await runAlertChecks();
    if (result.authSpikes || result.deadEvents) console.log("[cron/stackshift-alerts]", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/stackshift-alerts] run failed:", err);
    return NextResponse.json({ error: "Alert check failed" }, { status: 500 });
  }
}
