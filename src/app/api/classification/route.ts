import { NextResponse } from "next/server";

// Classification API — implemented in Sprint 2 (M2)
export async function POST() {
  return NextResponse.json({ message: "Classification engine — Sprint 2" }, { status: 501 });
}
