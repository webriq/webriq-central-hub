import { NextResponse } from "next/server";

// Reply generation — implemented in Sprint 5 (M8)
export async function POST() {
  return NextResponse.json({ message: "Reply generation — Sprint 5" }, { status: 501 });
}
