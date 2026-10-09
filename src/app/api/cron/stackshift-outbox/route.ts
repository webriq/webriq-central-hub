import { NextRequest, NextResponse } from "next/server";
import { dispatchDue } from "@/lib/stackshift-support/dispatch";
import { authorizeCronOrStaff } from "@/lib/stackshift-support/cron-auth";

// Task 446 — StackShift outbox dispatcher. pg_cron hits this every minute (migration 171) with x-cron-secret; a
// signed-in STAFF user may also trigger a run (a client-role session may not — see cron-auth.ts).
export const maxDuration = 60;
const RUN_BUDGET_MS = 50_000;

export async function POST(req: NextRequest) {
  const auth = await authorizeCronOrStaff(req);
  if ("denied" in auth) return auth.denied;

  try {
    const summary = await dispatchDue({ budgetMs: RUN_BUDGET_MS });
    if (summary.sent || summary.failed || summary.dead) console.log("[cron/stackshift-outbox]", summary);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[cron/stackshift-outbox] run failed:", err);
    return NextResponse.json({ error: "Dispatch failed" }, { status: 500 });
  }
}
