import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

// Task 347 — the StackShift order intake endpoints are called server-to-server by the
// webriq.com proxy only. Auth is a shared secret in the `x-stackshift-webhook-secret` header
// (timing-safe compare). Unlike the Zoho webhook (which 200s on failure so Zoho stops
// retrying), these return real 4xx/5xx — the proxy is ours and should surface failures.
export function assertOrderWebhookSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.STACKSHIFT_ORDER_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stackshift-order] STACKSHIFT_ORDER_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Intake endpoint not configured" }, { status: 503 });
  }

  const provided = req.headers.get("x-stackshift-webhook-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
