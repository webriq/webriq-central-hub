import { NextResponse } from "next/server";

// Plan generation — implemented in Sprint 4 (M5)
export async function POST() {
  return NextResponse.json({ message: "Plan generation — Sprint 4" }, { status: 501 });
}
