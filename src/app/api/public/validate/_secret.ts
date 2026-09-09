import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

// Task 353 — the contact-validation endpoint is called server-to-server by the webriq.com
// form proxy (and later other WebriQ properties). Auth is a shared secret in the
// `x-contact-validation-secret` header, timing-safe compared. Mirrors task 347's
// stackshift-order/_secret.ts. Returns real 4xx/5xx — the callers are ours.
export function assertContactValidationSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.CONTACT_VALIDATION_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[contact-validation] CONTACT_VALIDATION_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Validation endpoint not configured" }, { status: 503 });
  }

  const provided = req.headers.get("x-contact-validation-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
