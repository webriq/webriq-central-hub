import { NextResponse } from "next/server";
import { requireOrderReviewer } from "../_auth";

// Task 504 — the public StackShift Order Form's password, for the Orders page's Copy password
// button. Server-only env var, fetched on click so it never sits in page HTML, the RSC payload or a
// client chunk. Every Orders viewer may read it (requireOrderReviewer: admin/super_admin/pm, Finance
// included — it's read-only, not a mutation). Never logged.
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const auth = await requireOrderReviewer();
  if (auth instanceof NextResponse) return auth;

  const password = process.env.STACKSHIFT_ORDER_FORM_PASSWORD?.trim();
  if (!password) {
    return NextResponse.json({ error: "Order form password is not configured" }, { status: 503, headers: NO_STORE });
  }
  return NextResponse.json({ password }, { headers: NO_STORE });
}
