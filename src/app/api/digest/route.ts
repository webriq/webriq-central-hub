import { NextResponse } from "next/server";

// Daily digest engine — implemented in Sprint 3 (M4)
export async function POST() {
  return NextResponse.json({ message: "Daily digest — Sprint 3" }, { status: 501 });
}
