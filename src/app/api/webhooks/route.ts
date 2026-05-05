import { NextRequest, NextResponse } from "next/server";

// Zoho webhook listener — implemented in Sprint 2 (M2)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  console.log("[webhook] received payload", body);
  return NextResponse.json({ received: true });
}
