import { NextRequest, NextResponse } from "next/server";
import { assertContactValidationSecret } from "./_secret";
import { validateRequestSchema } from "@/lib/validation/schema";
import { decideEmail, decidePhone } from "@/lib/validation/decision";
import type { FieldVerdict } from "@/lib/validation/types";

// Task 353 — shared contact-validation endpoint. Token-gated, server-to-server only
// (never called from a browser — the secret would leak). Returns ONLY
// { email?: FieldVerdict, phone?: FieldVerdict } — never raw Abstract payloads.
export async function POST(req: NextRequest) {
  const secretErr = assertContactValidationSecret(req);
  if (secretErr) return secretErr;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = validateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { email, phone } = parsed.data;
  const source =
    (req.headers.get("x-validation-source") ?? parsed.data.source)?.slice(0, 120) ?? null;
  const ctx = { source };

  const [emailVerdict, phoneVerdict] = await Promise.all([
    email ? decideEmail(email, ctx) : Promise.resolve(null),
    phone ? decidePhone(phone, ctx) : Promise.resolve(null),
  ]);

  const out: { email?: FieldVerdict; phone?: FieldVerdict } = {};
  if (emailVerdict) out.email = emailVerdict;
  if (phoneVerdict) out.phone = phoneVerdict;

  return NextResponse.json(out);
}

export function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
